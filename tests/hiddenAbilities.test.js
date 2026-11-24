// 숨겨진 특성 (2026-11-24): docs/superpowers/specs/2026-11-24-hidden-abilities-design.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../src/data/species.js';
import { ABILITIES } from '../src/data/abilities.js';

test('hidden data: one hidden ability per species, gen 5 at most, never a normal slot', () => {
  assert.equal(SPECIES.bulbasaur.hidden, 'chlorophyll');
  assert.equal(SPECIES.foongus.hidden, 'regenerator');
  let n = 0;
  for (const s of Object.values(SPECIES)) {
    assert.ok(s.hidden === null || ABILITIES[s.hidden], `${s.key} ${s.hidden}`);
    if (s.hidden === null) continue;
    n++;
    assert.ok(!s.abilities.includes(s.hidden), s.key);
    assert.ok(!['competitive', 'protean'].includes(s.hidden), s.key);
  }
  assert.ok(n > 560, `${n}`);
});

import { newMember, abilityOf, unlockHidden, setAbilitySlot, HIDDEN_UNLOCK_COST, hiddenPending, evolveMember } from '../src/core/progress.js';
import { newGame, loadGame, saveGame } from '../src/core/save.js';
const gameWith = (sp, shards) => ({ party: [newMember(sp, 10, () => 0)], shards: { [sp]: shards } });

test('unlockHidden spends 4 line shards, needs no normal unlock, and turns the hidden ability on', () => {
  assert.equal(HIDDEN_UNLOCK_COST, 4);
  const g = gameWith('bulbasaur', 5);
  assert.equal(g.party[0].abilityUnlocked, false);
  assert.deepEqual(unlockHidden(g, 'bulbasaur'), { ok: true });
  assert.equal(abilityOf(g.party[0]), 'chlorophyll');
  assert.equal(g.party[0].hiddenUnlocked, true);
  assert.equal(g.shards.bulbasaur, 1);
  assert.equal(unlockHidden(g, 'bulbasaur').reason, 'already');
});

test('unlockHidden refusals: not enough shards, no hidden ability, pending ability', () => {
  assert.equal(unlockHidden(gameWith('bulbasaur', 3), 'bulbasaur').reason, 'shards');
  const none = Object.values(SPECIES).find((s) => s.hidden === null && s.stage === 0 && !s.legendary && s.key !== 'ditto').key;
  assert.equal(unlockHidden(gameWith(none, 9), none).reason, 'none');
  const pend = Object.values(SPECIES).find((s) => s.hidden === 'unnerve' && s.stage === 0).key;
  assert.ok(hiddenPending(pend));
  const g = gameWith(pend, 9);
  assert.equal(unlockHidden(g, pend).reason, 'pending');
  assert.equal(g.shards[pend], 9);
  assert.ok(!hiddenPending('bulbasaur'));
});

test('switching: hidden only after unlock; back to its own normal slot is free; other normal slot still needs the normal unlock', () => {
  const g = gameWith('bulbasaur', 4), m = g.party[0];
  assert.equal(setAbilitySlot(g, 'bulbasaur', 'hidden').reason, 'locked');
  unlockHidden(g, 'bulbasaur');
  const own = m.abilitySlot;
  assert.deepEqual(setAbilitySlot(g, 'bulbasaur', own), { ok: true });
  assert.equal(abilityOf(m), SPECIES.bulbasaur.abilities[own]);
  assert.deepEqual(setAbilitySlot(g, 'bulbasaur', 'hidden'), { ok: true });
  assert.equal(abilityOf(m), 'chlorophyll');
  if (SPECIES.bulbasaur.abilities.length > 1) assert.equal(setAbilitySlot(g, 'bulbasaur', own === 0 ? 1 : 0).reason, 'locked');
});

test('the hidden ability follows evolution, and falls back to a normal ability when the evolution has none', () => {
  const g = gameWith('bulbasaur', 4), m = g.party[0];
  unlockHidden(g, 'bulbasaur');
  evolveMember(m, 'ivysaur');
  assert.equal(abilityOf(m), SPECIES.ivysaur.hidden);
  m.species = Object.values(SPECIES).find((s) => s.hidden === null).key; // 숨겨진 특성 없는 모습
  assert.equal(abilityOf(m), SPECIES[m.species].abilities[0]);
});

const memStore = () => { const data = {}; return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } }; };
test('save v11 keeps the hidden unlock; a v10 save loads with it off', () => {
  const st = memStore(), g = newGame();
  const m = g.party.find((x) => x.species === 'turtwig');
  m.hiddenUnlocked = true; m.hiddenOn = true;
  saveGame(st, g);
  const back = loadGame(st);
  assert.equal(back.version, 11);
  const bm = back.party.find((x) => x.species === 'turtwig');
  assert.equal(bm.hiddenUnlocked, true); assert.equal(bm.hiddenOn, true);
  const old = JSON.parse(st.data['pokemon-tactics-save']);
  old.version = 10; for (const p of old.party) { delete p.hiddenUnlocked; delete p.hiddenOn; }
  st.setItem('pokemon-tactics-save', JSON.stringify(old));
  const v10 = loadGame(st).party.find((x) => x.species === 'turtwig');
  assert.equal(v10.hiddenUnlocked, false); assert.equal(v10.hiddenOn, false);
  const bad = JSON.parse(st.data['pokemon-tactics-save']);
  bad.version = 11; bad.party.find((x) => x.species === 'turtwig').hiddenOn = true; // 해금 없이 켜짐 → 꺼짐
  st.setItem('pokemon-tactics-save', JSON.stringify(bad));
  assert.equal(loadGame(st).party.find((x) => x.species === 'turtwig').hiddenOn, false);
});

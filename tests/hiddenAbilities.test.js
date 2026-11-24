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
  assert.equal(back.version, 12);
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

import { createBattle, applyMove, endPhase, refreshAbilityFlags } from '../src/core/battle.js';
import { expectedDamage } from '../src/core/damage.js';
import { weightOf } from '../src/core/individual.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';
const hit = () => 0.01;
const duel = (allySp, foeSp, { ally = {}, foe = {}, allies = [], extra = [] } = {}) => {
  const map = { tiles: Array.from({ length: 6 }, () => '......'), allySlots: [{ x: 1, y: 1 }, ...allies.map((a) => a.at)], enemies: [{ species: foeSp, x: 2, y: 1, level: 40 }, { species: 'rattata', x: 5, y: 5, level: 40 }, ...extra] };
  const s = createBattle(map, [newMember(allySp, 40, createRng(1)), ...allies.map((a, i) => newMember(a.sp, 40, createRng(i + 2)))]);
  const a = s.units[0], f = s.units.find((u) => u.side === 'enemy');
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};
const ratio = (a, f, move, change) => { const base = expectedDamage(a, f, MOVES[move], '.'); change(); return expectedDamage(a, f, MOVES[move], '.') / base; };
const near = (x, y) => Math.abs(x - y) < 1e-6;

test('analytic: ×1.3 when the holder is the slowest on the field', () => {
  const { s, a, f } = duel('magnemite', 'rattata');
  refreshAbilityFlags(s);
  assert.ok(near(ratio(a, f, 'thunderbolt', () => { a.ability = 'analytic'; refreshAbilityFlags(s); }), 1.3));
  a.stats.spe = 999; refreshAbilityFlags(s);
  assert.equal(a.analyticActive, false);
});

test('flare boost ×1.5 special while burned; toxic boost ×1.5 physical while poisoned', () => {
  const { a, f } = duel('drifloon', 'snorlax', { ally: { status: 'burn' } });
  assert.ok(near(ratio(a, f, 'thunderbolt', () => { a.ability = 'flare-boost'; }), 1.5));
  assert.ok(near(ratio(a, f, 'tackle', () => { a.ability = 'flare-boost'; }), 1));
  const z = duel('zangoose', 'snorlax', { ally: { status: 'poison' } });
  assert.ok(near(ratio(z.a, z.f, 'tackle', () => { z.a.ability = 'toxic-boost'; }), 1.5));
});

test('heavy metal doubles weight, light metal halves it', () => {
  const { a } = duel('bronzor', 'rattata');
  const w = weightOf({ ...a, ability: null });
  assert.equal(weightOf({ ...a, ability: 'heavy-metal' }), w * 2);
  assert.equal(weightOf({ ...a, ability: 'light-metal' }), w / 2);
});

test('multiscale halves damage only at full HP', () => {
  const { a, f } = duel('rattata', 'dratini');
  assert.ok(near(ratio(a, f, 'tackle', () => { f.ability = 'multiscale'; }), 0.5));
  f.hp -= 1;
  assert.ok(near(expectedDamage(a, f, MOVES.tackle, '.') / expectedDamage(a, { ...f, ability: null }, MOVES.tackle, '.'), 1));
});

test('friend guard: 30% off for an ally next to one holder, 36% next to two, holder itself unguarded', () => {
  const { s, a, f } = duel('rattata', 'snorlax', { allies: [{ sp: 'clefairy', at: { x: 1, y: 2 } }, { sp: 'clefairy', at: { x: 0, y: 1 } }] });
  const [, h1, h2] = s.units;
  refreshAbilityFlags(s);
  const plain = expectedDamage(f, a, MOVES.tackle, '.');
  h1.ability = 'friend-guard'; refreshAbilityFlags(s);
  assert.ok(near(expectedDamage(f, a, MOVES.tackle, '.') / plain, 0.7));
  h2.ability = 'friend-guard'; refreshAbilityFlags(s);
  assert.ok(near(expectedDamage(f, a, MOVES.tackle, '.') / plain, 0.64));
  assert.equal(h1.friendGuards, 0);
});

test('rattled: a dark, bug or ghost hit raises speed by 1', () => {
  const { s, a, f } = duel('poochyena', 'snorlax', { foe: { ability: 'rattled' } });
  applyMove(s, a.id, 'bite', f.id, () => 0.5);
  assert.equal(f.stages.spe, 1);
  const n = duel('rattata', 'snorlax', { foe: { ability: 'rattled' } });
  applyMove(n.s, n.a.id, 'tackle', n.f.id, hit);
  assert.equal(n.f.stages.spe ?? 0, 0);
});

test('contrary flips stage changes, but not against a mold breaker', () => {
  const { s, a, f } = duel('rattata', 'snivy', { foe: { ability: 'contrary' } });
  applyMove(s, a.id, 'growl', f.id, hit);
  assert.equal(f.stages.atk, 1);
  const self = duel('snivy', 'rattata', { ally: { ability: 'contrary' } });
  applyMove(self.s, self.a.id, 'swords-dance', self.a.id, hit);
  assert.equal(self.a.stages.atk, -2);
  const mb = duel('rattata', 'snivy', { ally: { ability: 'mold-breaker' }, foe: { ability: 'contrary' } });
  applyMove(mb.s, mb.a.id, 'growl', mb.f.id, hit);
  assert.equal(mb.f.stages.atk, -1);
});

test('moody: at its phase end, one stat +2 and a different one −1, never accuracy or evasion', () => {
  const { s, a } = duel('remoraid', 'rattata', { ally: { ability: 'moody' } });
  const seq = [0.1, 0.9]; let k = 0;
  endPhase(s, () => seq[k++ % 2]);
  const ch = Object.entries(a.stages).filter(([, v]) => v !== 0);
  assert.deepEqual(ch.map(([, v]) => v).sort(), [-1, 2]);
  assert.ok(ch.every(([key]) => key !== 'acc' && key !== 'eva'));
  assert.notEqual(ch[0][0], ch[1][0]);
  const full = duel('remoraid', 'rattata', { ally: { ability: 'moody' } });
  for (const key of ['atk', 'def', 'spa', 'spd', 'spe']) full.a.stages[key] = 6;
  assert.doesNotThrow(() => endPhase(full.s, () => 0.5));
});

test('magic bounce: a status move on the holder or a foe next to it goes back to the caster, once', () => {
  const { s, a, f } = duel('pikachu', 'natu', { foe: { ability: 'magic-bounce' } });
  const r = applyMove(s, a.id, 'thunder-wave', f.id, hit);
  assert.equal(a.status, 'paralysis'); assert.equal(f.status, null);
  assert.ok(r.abilityEvents.some((e) => e.ability === 'magic-bounce'));
  // 보유자 옆 칸의 적에게 울음소리 → 시전자 공격 −1
  const n = duel('rattata', 'natu', { extra: [{ species: 'snorlax', x: 2, y: 2, level: 40 }] });
  const sn = n.s.units.find((u) => u.species === 'snorlax');
  n.f.ability = 'magic-bounce';
  applyMove(n.s, n.a.id, 'growl', sn.id, hit);
  assert.equal(n.a.stages.atk, -1); assert.equal(sn.stages.atk ?? 0, 0);
  // 두 칸 떨어진 적은 보호 안 됨
  const far = duel('rattata', 'natu', { extra: [{ species: 'snorlax', x: 1, y: 3, level: 40 }] });
  const sf = far.s.units.find((u) => u.species === 'snorlax');
  far.f.ability = 'magic-bounce';
  applyMove(far.s, far.a.id, 'growl', sf.id, hit);
  assert.equal(sf.stages.atk, -1);
});

test('magic bounce: a holder caster does not bounce it again; mold breaker is not bounced; own-side moves are not bounced', () => {
  const both = duel('natu', 'natu', { ally: { ability: 'magic-bounce' }, foe: { ability: 'magic-bounce' } });
  applyMove(both.s, both.a.id, 'thunder-wave', both.f.id, hit);
  assert.equal(both.a.status, 'paralysis');
  const mb = duel('pikachu', 'natu', { ally: { ability: 'mold-breaker' }, foe: { ability: 'magic-bounce' } });
  applyMove(mb.s, mb.a.id, 'thunder-wave', mb.f.id, hit);
  assert.equal(mb.f.status, 'paralysis');
  const own = duel('natu', 'rattata', { ally: { ability: 'magic-bounce' } });
  applyMove(own.s, own.a.id, 'swords-dance', own.a.id, hit);
  assert.equal(own.a.stages.atk, 2);
});

test('magic bounce: spikes aimed into the protected area land around the caster instead, as the holder side traps', () => {
  const { s, a, f } = duel('cloyster', 'natu', { foe: { ability: 'magic-bounce' } });
  f.x = 4; f.y = 1;
  const r = applyMove(s, a.id, 'spikes', { x: 3, y: 1 }, hit);
  assert.ok(r.trapsLaid.length > 0);
  for (const t of s.spikes) { assert.equal(t.side, 'enemy'); assert.ok(Math.abs(t.x - a.x) + Math.abs(t.y - a.y) <= 1); }
});

import { SRPG_ABILITY_TEXT } from '../src/data/abilities.js';
test('the 11 new gen 5 abilities carry their SRPG text and are active; item / form ones are pending', () => {
  for (const id of ['analytic', 'contrary', 'flare-boost', 'toxic-boost', 'friend-guard', 'heavy-metal', 'light-metal', 'multiscale', 'rattled', 'moody', 'magic-bounce']) {
    assert.equal(ABILITIES[id].desc, SRPG_ABILITY_TEXT[id], id);
    assert.ok(!ABILITIES[id].inactive, id);
  }
  for (const id of ['harvest', 'pickpocket', 'zen-mode', 'imposter']) assert.ok(ABILITIES[id].inactive, id);
});

test('magic bounce review: later protected targets are skipped quietly (not "protected"), memento is not bounced', () => {
  const { s, a, f } = duel('oddish', 'natu', { extra: [{ species: 'snorlax', x: 3, y: 1, level: 40 }] });
  f.ability = 'magic-bounce';
  const sn = s.units.find((u) => u.species === 'snorlax');
  const r = applyMove(s, a.id, 'growl', sn.id, hit);
  assert.deepEqual(r.protectedIds, []);
  const m = duel('rattata', 'natu', { foe: { ability: 'magic-bounce' } });
  applyMove(m.s, m.a.id, 'memento', m.f.id, hit);
  assert.ok(m.s.units.includes(m.f)); // 보유자는 쓰러지지 않음
  assert.equal(m.f.stages.atk, -2);
});

test('normal unlock while on the hidden ability moves the member off it', async () => {
  const { unlockAbility } = await import('../src/core/progress.js');
  const g = gameWith('geodude', 7), m = g.party[0];
  unlockHidden(g, 'geodude');
  unlockAbility(g, 'geodude');
  assert.equal(m.hiddenOn, false);
  assert.equal(abilityOf(m), SPECIES.geodude.abilities[m.abilitySlot]);
});

import { stageMessages } from '../src/render/mapAttack.js';
test('contrary at +6 hit by growl says the stat will not rise (not "will not fall")', () => {
  const { s, a, f } = duel('rattata', 'snivy', { foe: { ability: 'contrary' } });
  applyMove(s, a.id, 'growl', f.id, hit);
  for (let i = 0; i < 6; i++) applyMove(s, a.id, 'growl', f.id, hit);
  const r = applyMove(s, a.id, 'growl', f.id, hit);
  const c = r.stageChanges.find((x) => x.unitId === f.id);
  assert.equal(c.applied, 0);
  assert.match(stageMessages([c], (id) => s.units.find((u) => u.id === id))[0], /오르지 않는다/);
});

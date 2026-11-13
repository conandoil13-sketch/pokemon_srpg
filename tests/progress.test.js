import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newParty, newMember, applyExp, resolveChoice, evolveMember, stoneTargets } from '../src/core/progress.js';
import { expForLevel } from '../src/core/stats.js';
import { movesLearnedBetween } from '../src/core/learn.js';
import { SPECIES } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';

const need = (m, level) => expForLevel(SPECIES[m.species].growth, level) - m.exp;

test('level up without evolution', () => {
  const party = newParty();
  const m = party[1]; // chimchar Lv8
  const ev = applyExp(party, { chimchar: need(m, 13) });
  assert.equal(m.level, 13);
  assert.deepEqual(ev[0].type, 'level');
  assert.deepEqual([ev[0].from, ev[0].to], [8, 13]);
  assert.ok(ev[0].after.hp > ev[0].before.hp);
  assert.equal(ev.some((e) => e.type === 'evolve'), false);
  const expected = movesLearnedBetween(SPECIES.chimchar.learnset, 8, 13, MOVES);
  assert.deepEqual(ev.filter((e) => e.type === 'learned').map((e) => e.move), expected);
});

test('several levels crossing evolution: level → moves → evolve last', () => {
  const party = newParty();
  const m = party[1];
  const ev = applyExp(party, { chimchar: need(m, 15) });
  assert.equal(ev[0].type, 'level');
  assert.equal(ev.at(-1).type, 'evolve');
  assert.deepEqual(ev.at(-1).options, ['monferno']);
  assert.ok(ev.slice(1, -1).every((e) => ['learned', 'choose', 'skip'].includes(e.type)));
  // 진화 후: 새 종족의 현재 레벨(15)에서 배우는 기술만
  const after = evolveMember(m, 'monferno');
  assert.equal(m.species, 'monferno');
  const atLevel = SPECIES.monferno.learnset.filter(([lv, mv]) => lv === 15 && MOVES[mv].learnable).map(([, mv]) => mv);
  assert.deepEqual(after.map((e) => e.move), atLevel); // 같은 레벨 기술만, 순서대로 (learned/choose/skip 중 하나)
});

test('events follow party order', () => {
  const party = newParty();
  const ev = applyExp(party, { piplup: need(party[2], 10), chimchar: need(party[1], 10) });
  const levels = ev.filter((e) => e.type === 'level').map((e) => e.species);
  assert.deepEqual(levels, ['chimchar', 'piplup']);
});

test('full moveset → choose; resolveChoice replaces or keeps', () => {
  const m = newMember('chimchar', 8);
  m.moves = ['scratch', 'ember', 'tackle', 'peck'];
  const ev = applyExp([m], { chimchar: need(m, 15) });
  const c = ev.find((e) => e.type === 'choose');
  assert.ok(c, 'choose event');
  assert.deepEqual(m.moves, ['scratch', 'ember', 'tackle', 'peck']);
  resolveChoice(m, c.move, 0);
  assert.deepEqual(m.moves, [c.move, 'ember', 'tackle', 'peck']);
  resolveChoice(m, 'flamethrower', null);
  assert.equal(m.moves.includes('flamethrower'), false);
});

test('already known move → skip', () => {
  const m = newMember('chimchar', 8);
  const next = movesLearnedBetween(SPECIES.chimchar.learnset, 8, 15, MOVES)[0];
  m.moves = ['scratch', 'ember', next];
  const ev = applyExp([m], { chimchar: need(m, 15) });
  assert.ok(ev.some((e) => e.type === 'skip' && e.move === next));
  assert.equal(m.moves.filter((x) => x === next).length, 1);
});

test('level cap 100', () => {
  const m = newMember('chimchar', 8);
  applyExp([m], { chimchar: 1e12 });
  assert.equal(m.level, 100);
});

test('stoneTargets', () => {
  assert.deepEqual(stoneTargets(newParty()), []);
  const party = [...newParty(), newMember('roselia', 20)];
  assert.deepEqual(stoneTargets(party).map((m) => m.species), ['roselia']);
});

test('branching: eevee asks at 20 (2 options) and asks again on the next level-up if it did not evolve', () => {
  const m = newMember('eevee', 19);
  let ev = applyExp([m], { eevee: need(m, 20) });
  assert.deepEqual(ev.find((e) => e.type === 'evolve').options.sort(), ['espeon', 'umbreon']);
  ev = applyExp([m], { eevee: need(m, 21) });
  assert.deepEqual(ev.find((e) => e.type === 'evolve').options.sort(), ['espeon', 'umbreon']);
});

test('branching: tyrogue gets 3 options at 25', () => {
  const m = newMember('tyrogue', 24);
  const ev = applyExp([m], { tyrogue: need(m, 25) });
  assert.equal(ev.find((e) => e.type === 'evolve').options.length, 3);
});

test('random branches: wurmple picks one by rng', () => {
  const a = newMember('wurmple', 6);
  const ev = applyExp([a], { wurmple: need(a, 7) }, () => 0);
  const e = ev.find((x) => x.type === 'evolve');
  assert.equal(e.options.length, 1);
  assert.equal(e.random, true);
});

// ---- 특성 ----
import { abilityOf, swapAbility } from '../src/core/progress.js';
import { makeUnit as mkA } from '../src/core/battle.js';
import { encounterPool } from '../src/core/encounters.js';
import { DUNGEONS } from '../src/data/dungeons.js';
test('members get an ability slot; evolution keeps the slot', () => {
  const g = newMember('geodude', 5, () => 0.9);
  assert.equal(g.abilitySlot, 1);
  assert.equal(abilityOf(g), 'sturdy');
  evolveMember(g, 'graveler');
  assert.equal(abilityOf(g), 'sturdy');
  assert.equal(abilityOf(newMember('pikachu', 5, () => 0.9)), 'static'); // 특성 하나
});

test('swap ability with 3 shards of the line', () => {
  const game = { party: [newMember('geodude', 5, () => 0)], shards: { geodude: 3 } };
  assert.deepEqual(swapAbility(game, 'geodude'), { ok: true });
  assert.equal(abilityOf(game.party[0]), 'sturdy');
  assert.equal(game.shards.geodude, 0);
  assert.equal(swapAbility(game, 'geodude').reason, 'shards');
  const p = { party: [newMember('pikachu', 5)], shards: { pichu: 9, pikachu: 9 } };
  assert.equal(swapAbility(p, 'pikachu').reason, 'single');
});

test('units carry abilities; Shedinja never appears as an enemy', () => {
  const e = mkA({ species: 'geodude', side: 'enemy', x: 3, y: 4, level: 10 });
  assert.ok(['rock-head', 'sturdy'].includes(e.ability));
  const a = mkA({ species: 'geodude', side: 'ally', x: 0, y: 0, level: 10, ability: 'sturdy' });
  assert.equal(a.ability, 'sturdy');
  for (const d of DUNGEONS) for (let f = 1; f <= d.floors; f++) {
    assert.ok(!encounterPool(d, f).includes('shedinja'));
    assert.ok(!encounterPool(d, f, { boss: true }).includes('shedinja'));
  }
});

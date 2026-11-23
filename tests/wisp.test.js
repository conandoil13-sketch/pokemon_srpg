import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, endPhase } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { generateFloor } from '../src/core/floorgen.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';
import { wispNotices } from '../src/game/states.js';
import { josa } from '../src/data/text.js';

// 9x5: 묘비 (4,2), 아군 (1,2), 적 (8,0)
const MAP = (wisps, extra = {}) => ({
  tiles: ['.........', '.........', '....T....', '.........', '.........'],
  allySlots: [{ x: 1, y: 2 }], enemies: [{ species: 'rattata', level: 30, x: 8, y: 0 }], stairs: null, chests: [], wisps, ...extra,
});
const W = (round) => ({ x: 4, y: 2, round, species: 'gastly', level: 50 });
const battle = (map) => createBattle(map, [newMember('bidoof', 40, createRng(1))]);
const round = (s) => { endPhase(s, () => 0.5); endPhase(s, () => 0.5); }; // 아군 → 적 페이즈 끝

test('wisps: lit at the end of the enemy phase one round early, the ghost rises the round after beside the tombstone, nearest the allies', () => {
  const s = battle(MAP([W(3)]));
  round(s); // 1라운드 끝
  assert.equal(s.wisps[0].lit, false); assert.equal(s.log.wisps.length, 0);
  round(s); // 2라운드 끝 → 혼불
  assert.equal(s.wisps[0].lit, true); assert.deepEqual(s.log.wisps, [{ kind: 'lit', x: 4, y: 2 }]);
  assert.ok(!s.units.some((u) => u.species === 'gastly'));
  round(s); // 3라운드 끝 → 등장
  const g = s.units.find((u) => u.species === 'gastly');
  assert.ok(g); assert.equal(g.side, 'enemy'); assert.equal(g.level, 50);
  assert.deepEqual([g.x, g.y], [3, 2], 'nearest the ally');
  assert.equal(s.log.wisps[0].kind, 'spawn'); assert.equal(s.log.wisps[0].unitId, g.id);
  assert.ok(s.wisps[0].done); assert.equal(s.wisps[0].lit, false);
  round(s); assert.equal(s.units.filter((u) => u.species === 'gastly').length, 1);
});

test('wisps: no free side → the spawn waits a round; ids stay unique', () => {
  const s = battle(MAP([W(2)], { enemies: [{ species: 'rattata', level: 30, x: 3, y: 2 }, { species: 'rattata', level: 30, x: 5, y: 2 }, { species: 'rattata', level: 30, x: 4, y: 1 }, { species: 'rattata', level: 30, x: 4, y: 3 }] }));
  round(s); assert.ok(s.wisps[0].lit);
  round(s); assert.ok(!s.units.some((u) => u.species === 'gastly')); assert.ok(s.wisps[0].lit && !s.wisps[0].done);
  const r = s.units.find((u) => u.x === 3 && u.y === 2); s.units.splice(s.units.indexOf(r), 1);
  round(s); const g = s.units.find((u) => u.species === 'gastly'); assert.deepEqual([g.x, g.y], [3, 2]);
  assert.equal(new Set(s.units.map((u) => u.id)).size, s.units.length);
});

test('wisps: a floor already won spawns nothing', () => {
  const s = battle(MAP([W(2)]));
  round(s); assert.ok(s.wisps[0].lit);
  s.units = s.units.filter((u) => u.side !== 'enemy'); s.result = 'win';
  round(s); assert.ok(!s.units.some((u) => u.species === 'gastly'));
});

test('wisps: notices — lit line at the tombstone, then who rose', () => {
  const s = battle(MAP([W(2)]));
  round(s); assert.deepEqual(wispNotices(s.log.wisps, () => null), [{ lines: ['묘비에 혼불이 피어올랐다…'], at: { x: 4, y: 2 }, hp: null }]);
  round(s); const g = s.units.find((u) => u.species === 'gastly');
  assert.deepEqual(wispNotices(s.log.wisps, (id) => s.units.find((u) => u.id === id)), [{ lines: [`상대 ${SPECIES.gastly.name}${josa(SPECIES.gastly.name, '이/가').slice(-1)} 묘비에서 나타났다!`], at: { x: g.x, y: g.y }, hp: null }]);
});

test('graveyard floor wisps carry a ghost species from the pool and level = floor base - 2', () => {
  const GY = DUNGEONS.find((d) => d.id === 'graveyard');
  for (let seed = 1; seed <= 10; seed++) {
    const f = 1 + (seed % 9), m = generateFloor(GY, f, seed);
    for (const w of m.wisps) { assert.ok(SPECIES[w.species].types.includes('ghost'), w.species); assert.equal(w.level, GY.baseLevel[f - 1] - 2); }
  }
});

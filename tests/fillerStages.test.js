import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { stageSlots, FILLER_COUNT } from '../src/data/fillerStages.js';
import { generateFloor } from '../src/core/floorgen.js';
import { levelCapFor } from '../src/core/difficulty.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

test('eight filler stages follow the curve and alternate field and cave', () => {
  const t = DUNGEONS.slice(2);
  assert.equal(FILLER_COUNT, 8);
  assert.equal(t.length, 8);
  assert.deepEqual(t.map((d) => d.theme), ['field', 'cave', 'field', 'cave', 'field', 'cave', 'field', 'cave']);
  assert.deepEqual(t.map((d) => d.floors), [7, 7, 8, 8, 8, 9, 9, 9]);
  assert.deepEqual(t.map((d) => d.baseLevel[0]), [23, 30, 37, 44, 51, 58, 65, 72]);
  assert.deepEqual(t.map((d) => d.levelCap), [31, 38, 45, 52, 59, 66, 73, 80]);
  assert.equal(t[0].name, '시련의 들판 Ⅰ'); assert.equal(t[1].name, '시련의 동굴 Ⅰ'); assert.equal(t[7].name, '시련의 동굴 Ⅳ');
  assert.equal(t[0].unlock, 'sinnoh-cave'); assert.equal(t[1].unlock, 'trial-1');
});
test('a replaced slot keeps the unlock chain in order', () => {
  const fake = { id: 'real-map', name: '진짜 맵' };
  const slots = stageSlots({ 2: fake });
  assert.equal(slots[1].id, 'real-map');
  assert.equal(slots[1].unlock, 'trial-1');
  assert.equal(slots[2].unlock, 'real-map');
});
test('every filler floor generates enemies and a boss', () => {
  for (const d of DUNGEONS.slice(2)) for (let seed = 1; seed <= 3; seed++) for (let f = 1; f <= d.floors; f++) {
    const m = generateFloor(d, f, seed);
    assert.ok(m.enemies.length >= 1, `${d.id} f${f} s${seed}`);
    if (f === d.floors) assert.ok(m.enemies.some((e) => e.boss), `${d.id} boss`);
  }
});
test('loading a save that cleared the cave unlocks trial 1', () => {
  const store = (() => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; })();
  const g = newGame(); g.cleared = ['sinnoh-field', 'sinnoh-cave']; g.unlocked = ['sinnoh-field', 'sinnoh-cave'];
  saveGame(store, g);
  assert.ok(loadGame(store).unlocked.includes('trial-1'));
});
test('level cap continues into the trials', () => {
  assert.equal(levelCapFor({ cleared: ['sinnoh-field', 'sinnoh-cave'] }), 31);
  assert.equal(levelCapFor({ cleared: DUNGEONS.map((d) => d.id) }), 80);
});

import { encounterPool } from '../src/core/encounters.js';
test('trial floors 1-2 do not fall back to the early-route bugs and bats', () => {
  for (const d of DUNGEONS.slice(2)) {
    const pool = encounterPool(d, 1);
    assert.ok(pool.length >= 4, d.id);
    assert.ok(!['caterpie', 'weedle', 'zubat'].every((k) => pool.includes(k)) || pool.length > 18, `${d.id}: ${pool.join(',')}`);
    assert.deepEqual(d.early, [], d.id);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS, dungeonById } from '../src/data/dungeons.js';
import { fillerStage } from '../src/data/fillerStages.js';
import { generateFloor } from '../src/core/floorgen.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

const memStore = () => { const data = {}; return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };

test('autumn forest takes the first trial slot with the trial curve', () => {
  const d = DUNGEONS[2], t = fillerStage(1);
  assert.equal(d.id, 'autumn-forest'); assert.equal(d.name, '단풍 숲'); assert.equal(d.theme, 'autumn');
  assert.deepEqual(d.types, ['bug', 'poison', 'fire', 'grass']); assert.deepEqual(d.piles, [2, 4]);
  for (const k of ['floors', 'baseLevel', 'budget', 'levelCap', 'bstCap']) assert.deepEqual(d[k], t[k]);
  assert.equal(d.unlock, 'sinnoh-cave'); assert.equal(DUNGEONS[3].unlock, 'autumn-forest'); assert.ok(!d.filler);
});

test('old saves move trial-1 progress to the autumn forest', () => {
  const store = memStore();
  const g = newGame();
  saveGame(store, g);
  const raw = JSON.parse(store.data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'sinnoh-cave', 'trial-1', 'trial-2'];
  raw.cleared = ['sinnoh-field', 'sinnoh-cave', 'trial-1'];
  raw.best = { 'trial-1': 7 };
  raw.run = { ...(raw.run ?? {}), dungeonId: 'trial-1', floor: 3, seed: 5, faintedLast: [], loot: { evoStone: 0, candy: [], coins: 0, capsules: [] } };
  store.data['pokemon-tactics-save'] = JSON.stringify(raw);
  const l = loadGame(store);
  assert.ok(l.unlocked.includes('autumn-forest')); assert.ok(!l.unlocked.includes('trial-1'));
  assert.ok(l.cleared.includes('autumn-forest')); assert.ok(!l.cleared.includes('trial-1'));
  assert.equal(l.best['autumn-forest'], 7);
  assert.equal(l.run.dungeonId, 'autumn-forest'); assert.equal(l.run.floor, 3);
});

test('every autumn floor generates enemies of the forest types and a boss', () => {
  const d = dungeonById('autumn-forest');
  for (let seed = 1; seed <= 3; seed++) for (let f = 1; f <= d.floors; f++) {
    const m = generateFloor(d, f, seed);
    assert.ok(m.enemies.length >= 1, `f${f} s${seed}`);
    if (f === d.floors) assert.ok(m.enemies.some((e) => e.boss));
  }
});

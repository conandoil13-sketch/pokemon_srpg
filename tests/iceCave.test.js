import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';
import { SPECIES } from '../src/data/species.js';
import { generateFloor } from '../src/core/floorgen.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

const IC = DUNGEONS.find((d) => d.id === 'ice-cave');

test('ice cave is 8-1 next to the volcano; the power plant opens it', () => {
  const s8 = DUNGEONS.filter((d) => d.stage === 8);
  assert.deepEqual(s8.map((d) => [d.id, d.branch, d.unlock]), [['ice-cave', 1, 'power-plant'], ['volcano', 2, 'desert']]);
  assert.equal(IC.name, '얼음동굴'); assert.equal(IC.theme, 'ice'); assert.ok(IC.ice);
  assert.deepEqual(IC.baseLevel, s8[1].baseLevel); assert.equal(IC.floors, 9);
  assert.deepEqual(IC.weather, [{ id: 'hail', chance: 0.4 }]);
  assert.deepEqual(IC.piles, [2, 4]);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 9).unlock, ['ice-cave', 'volcano']);
});

test('ice cave: mostly ice types, water second', () => {
  const n = { ice: 0, water: 0, all: 0 };
  for (let seed = 1; seed <= 40; seed++) for (let f = 1; f < IC.floors; f++) for (const e of generateFloor(IC, f, seed).enemies) {
    const t = SPECIES[e.species].types; n.all++;
    if (t.includes('ice')) n.ice++; else if (t.includes('water')) n.water++;
  }
  assert.ok(n.ice / n.all >= 0.45, `ice ${n.ice}/${n.all}`);
  assert.ok(n.water > n.all - n.ice - n.water, `water ${n.water}`);
  assert.ok(encounterPool(IC, 1).includes('snorunt'));
});

test('ice cave: saves on the old 8-1 placeholder move to the ice cave', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'trial-6']; raw.cleared = ['trial-6']; raw.best = { 'trial-6': 5 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const g = loadGame(store);
  assert.ok(g.unlocked.includes('ice-cave') && g.cleared.includes('ice-cave')); assert.equal(g.best['ice-cave'], 5);
});

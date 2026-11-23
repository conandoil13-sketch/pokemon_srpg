import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';
import { generateFloor } from '../src/core/floorgen.js';
import { fillerStage } from '../src/data/fillerStages.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

const CY = DUNGEONS.find((d) => d.id === 'canyon');

test('canyon is 9-1 next to the graveyard; the ice cave opens it', () => {
  const s9 = DUNGEONS.filter((d) => d.stage === 9);
  assert.deepEqual(s9.map((d) => [d.id, d.branch, d.unlock]), [['canyon', 1, 'ice-cave'], ['graveyard', 2, 'volcano']]);
  assert.equal(CY.name, '협곡'); assert.equal(CY.theme, 'canyon'); assert.ok(CY.canyon);
  const c = fillerStage(7);
  assert.deepEqual(CY.baseLevel, c.baseLevel); assert.equal(CY.floors, 9); assert.equal(CY.levelCap, 73); assert.deepEqual(CY.size, [20, 14]);
  assert.equal(CY.weather ?? null, null);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 10).unlock, ['canyon', 'graveyard']);
  assert.ok(!DUNGEONS.some((d) => d.id === 'trial-7'));
});

test('canyon: flying and dragon lead, dragons are not drowned out', () => {
  const n = { fly: 0, dragon: 0, all: 0 };
  for (let seed = 1; seed <= 40; seed++) for (let f = 1; f < CY.floors; f++) for (const e of generateFloor(CY, f, seed).enemies) {
    const t = SPECIES[e.species].types; n.all++;
    if (t.includes('dragon')) n.dragon++; else if (t.includes('flying')) n.fly++;
  }
  assert.ok((n.fly + n.dragon) / n.all >= 0.6, `fly+dragon ${n.fly + n.dragon}/${n.all}`);
  assert.ok(n.dragon / n.all >= 0.2, `dragon ${n.dragon}/${n.all}`);
});

test('canyon: saves on the old 9-1 placeholder move to the canyon', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'trial-7']; raw.cleared = ['trial-7']; raw.best = { 'trial-7': 4 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const g = loadGame(store);
  assert.ok(g.unlocked.includes('canyon') && g.cleared.includes('canyon')); assert.equal(g.best.canyon, 4);
});

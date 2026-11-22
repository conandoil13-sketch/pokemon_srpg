import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_COST, canEnter, reachable } from '../src/core/pathfind.js';
import { makeUnit, terrainStart } from '../src/core/battle.js';
import { moveBudget } from '../src/core/status.js';

const u = (species, x = 0, y = 0, side = 'ally') => makeUnit({ species, side, x, y, level: 30, moves: ['tackle'] });

// ── Task 1: 얕은 물 ──
test('shallow water: anyone walks it at cost 1', () => {
  assert.equal(TILE_COST[','], 1);
  assert.equal(canEnter(',', 'pikachu'), true);
  const p = u('pikachu');
  assert.equal(reachable([',,,,'], [p], p).get('3,0'), 3);
});

test('shallow water counts as water for the water start bonus only', () => {
  const grid = [',,'];
  const w = u('buizel', 0, 0), g = u('turtwig', 1, 0);
  const bw = moveBudget(w), bg = moveBudget(g);
  terrainStart({ grid }, w); terrainStart({ grid }, g);
  assert.equal(moveBudget(w), bw + 1);
  assert.equal(moveBudget(g), bg);
});

// ── Task 2: 해변 데이터 · 자리 · 출현 규칙 ──
import { DUNGEONS, dungeonById } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';
import { rollEnemies } from '../src/core/difficulty.js';
import { SPECIES } from '../src/data/species.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

test('beach takes the second trial slot after the autumn forest', () => {
  const d = dungeonById('beach');
  assert.equal(d.name, '해변'); assert.equal(d.theme, 'beach'); assert.equal(d.unlock, 'autumn-forest');
  assert.equal(d.floors, 7); assert.equal(d.baseLevel[0], 30); // 시련 2번 곡선 그대로 assert.ok(!d.filler);
  assert.ok(!DUNGEONS.some((x) => x.id === 'trial-2'));
  assert.equal(DUNGEONS[DUNGEONS.indexOf(d) + 1].unlock, 'beach');
});

test('old saves move trial-2 progress to the beach', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'sinnoh-cave', 'trial-1', 'trial-2']; raw.cleared = ['trial-2']; raw.best = { 'trial-2': 4 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const l = loadGame(store);
  assert.ok(l.unlocked.includes('beach')); assert.ok(l.cleared.includes('beach')); assert.equal(l.best.beach, 4);
});

test('beach bosses are water or ice', () => {
  const d = dungeonById('beach');
  for (let f = 1; f <= d.floors; f++) for (const k of encounterPool(d, f, { boss: true })) assert.ok(SPECIES[k].types.some((t) => t === 'water' || t === 'ice'), k);
});

test('beach minor types (electric/ice/ground only) are rare', () => {
  const d = dungeonById('beach');
  const minorOnly = (k) => SPECIES[k].types.every((t) => d.minorTypes.includes(t));
  let minor = 0, main = 0;
  for (let s = 1; s <= 200; s++) for (const e of rollEnemies(d, 5, s)) (minorOnly(e.species) ? minor++ : main++);
  assert.ok(minor * 3 < main, `${minor} vs ${main}`);
});

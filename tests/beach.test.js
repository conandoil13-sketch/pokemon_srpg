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

// ── Task 3: 바다 띠 · 물때 등급 · 섬 ──
import { generateFloor, reachableFrom } from '../src/core/floorgen.js';
const withTide = (tiles, tide, level) => {
  const g = tiles.map((r) => r.split(''));
  const A = { '-1': '.', 0: ',', 1: '~' }, B = { '-1': ',', 0: '~', 1: '~' };
  for (const p of tide.a) g[p.y][p.x] = A[level];
  for (const p of tide.b) g[p.y][p.x] = B[level];
  return g.map((r) => r.join(''));
};
const beachFloors = () => {
  const d = dungeonById('beach'), out = [];
  for (const f of [1, 4, 7]) for (let s = 1; s <= 20; s++) out.push({ f, s, m: generateFloor(d, f, s * 7919) });
  return out;
};

test('beach floors: sea is 18-32% of the map, never in the start columns', () => {
  for (const { f, s, m } of beachFloors()) {
    const cells = m.tiles.join('');
    const sea = [...cells].filter((c) => c === ',' || c === '~').length / cells.length;
    assert.ok(sea >= 0.18 && sea <= 0.32, `f${f} s${s} ${sea}`);
    for (const row of m.tiles) assert.ok(!/[,~]/.test(row.slice(0, 3)));
  }
});

test('beach tide grades: A cells are shallow, B cells deep at tide 0', () => {
  for (const { m } of beachFloors()) {
    assert.ok(m.tide.a.length > 0 && m.tide.b.length > 0);
    for (const p of m.tide.a) assert.equal(m.tiles[p.y][p.x], ',');
    for (const p of m.tide.b) assert.equal(m.tiles[p.y][p.x], '~');
  }
});

test('beach: walkers reach the stairs or boss at high tide', () => {
  for (const { f, s, m } of beachFloors()) {
    const reach = reachableFrom(withTide(m.tiles, m.tide, 1), m.allySlots[0]);
    const goal = m.stairs ?? m.enemies.find((e) => e.boss);
    assert.ok([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has(`${goal.x + dx},${goal.y + dy}`)), `f${f} s${s}`);
  }
});

test('beach island: one guaranteed chest, unreachable on foot even at low tide', () => {
  let islands = 0;
  for (const { f, s, m } of beachFloors()) {
    const isl = m.chests.filter((c) => c.island);
    assert.ok(isl.length <= 1);
    assert.ok(m.chests.filter((c) => !c.island).length <= 2);
    if (!isl.length) continue;
    islands++;
    const reach = reachableFrom(withTide(m.tiles, m.tide, -1), m.allySlots[0]);
    assert.ok(!reach.has(`${isl[0].x},${isl[0].y}`), `f${f} s${s}`);
  }
  assert.ok(islands >= 0.45 * 60 && islands <= 0.75 * 60, `${islands}/60`);
});

test('beach sand piles hide only shore species', () => {
  const d = dungeonById('beach');
  for (const { m } of beachFloors()) for (const p of m.piles) if (p.kind === 'mon') assert.ok(d.pileSpecies.includes(p.species), p.species);
});

test('non-beach floors have no tide data', () => {
  assert.equal(generateFloor(dungeonById('autumn-forest'), 2, 99).tide, undefined);
});

// ── Task 4: 물때 (전투) ──
import { tideFor, tideTile, applyTide, tidePreview } from '../src/core/tide.js';
import { createBattle, endPhase } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const tideBattle = () => {
  const map = { tiles: ['......', '......', ',,,,,,', '~~~~~~'], allySlots: [{ x: 0, y: 0 }], enemies: [{ species: 'bidoof', x: 5, y: 0, level: 5 }],
    tide: { a: [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 2 })), b: [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 3 })) } };
  return createBattle(map, [newMember('pikachu', 30, createRng(1))]);
};
const round = (s) => { endPhase(s, () => 0.9); endPhase(s, () => 0.9); };

test('tide order: 0 for rounds 1-3, +1 for 4-6, 0 for 7-9, -1 for 10-12, then again', () => {
  assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 12, 13].map(tideFor), [0, 0, 1, 1, 0, 0, -1, -1, 0]);
  assert.deepEqual([-1, 0, 1].map((l) => tideTile('a', l)), ['.', ',', '~']);
  assert.deepEqual([-1, 0, 1].map((l) => tideTile('b', l)), [',', '~', '~']);
});

test('applyTide rewrites only A and B cells and keeps grid flags', () => {
  const s = tideBattle();
  s.grid.trees = true;
  applyTide(s, 1);
  assert.equal(s.grid[2], '~~~~~~'); assert.equal(s.tide, 1); assert.equal(s.grid.trees, true);
  applyTide(s, -1);
  assert.equal(s.grid[2], '......'); assert.equal(s.grid[3], ',,,,,,'); assert.equal(s.grid[0], '......');
});

test('rounds advance the tide and warn one round early', () => {
  const s = tideBattle();
  round(s); round(s); // turn 3
  assert.equal(s.turn, 3);
  const pv = tidePreview(s);
  assert.equal(pv.next, 1); assert.equal(pv.cells.length, 6);
  round(s); // turn 4 → 밀물
  assert.equal(s.tide, 1); assert.equal(s.grid[2], '~~~~~~');
  assert.equal(tidePreview(s), null);
});

test('a walker caught by the rising tide can still step out', () => {
  const s = tideBattle();
  const p = s.units.find((u) => u.side === 'ally');
  p.x = 2; p.y = 2;
  applyTide(s, 1);
  assert.ok(reachable(s.grid, s.units, p).has('2,1'));
});

test('battles without tide data never change the grid', () => {
  const s = createBattle({ tiles: ['....', '~~~~'], allySlots: [{ x: 0, y: 0 }], enemies: [{ species: 'bidoof', x: 3, y: 0, level: 5 }] }, [newMember('pikachu', 30, createRng(1))]);
  for (let i = 0; i < 5; i++) round(s);
  assert.deepEqual([...s.grid], ['....', '~~~~']); assert.equal(tidePreview(s), null);
});

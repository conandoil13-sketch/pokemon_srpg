import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_COST, canEnter, reachable, tilesInRange, manhattan } from '../src/core/pathfind.js';

const unit = (species, side, x, y) => ({ id: `${side}-${species}-${x}-${y}`, species, side, x, y, hp: 1, maxHp: 1, moved: false, acted: false });
const open = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));

test('tile costs', () => {
  assert.equal(TILE_COST['^'], 2);
  assert.equal(TILE_COST['#'], Infinity);
});

test('open field: diamond of radius = move', () => {
  // gible 이동력 3 (bronzor 는 2026-11-18 구간 변경으로 2), 7x7 중앙
  const u = unit('gible', 'ally', 3, 3);
  const r = reachable(open(7, 7), [u], u);
  assert.equal(r.size, 25); // 1+4+8+12
  assert.equal(r.get('3,3'), 0);
});

test('mountain costs 2', () => {
  const grid = ['.....', '.....', '..^..', '.....', '.....'];
  const u = unit('bronzor', 'ally', 2, 3);
  assert.equal(reachable(grid, [u], u).get('2,2'), 2);
});

test('water: only water/flying may enter', () => {
  const grid = ['.~.'];
  const t = unit('torterra', 'ally', 0, 0);
  const e = unit('empoleon', 'ally', 0, 0);
  const h = unit('honchkrow', 'enemy', 0, 0);
  assert.equal(reachable(grid, [t], t).has('1,0'), false);
  assert.equal(reachable(grid, [e], e).has('1,0'), true);
  assert.equal(reachable(grid, [h], h).has('1,0'), true);
  assert.equal(canEnter('#', 'honchkrow'), false);
});

test('enemy blocks passage in corridor', () => {
  const grid = ['#####', '.....', '#####'];
  const u = unit('luxray', 'ally', 0, 1);
  const foe = unit('lucario', 'enemy', 2, 1);
  const r = reachable(grid, [u, foe], u);
  assert.equal(r.has('2,1'), false);
  assert.equal(r.has('3,1'), false);
});

test('ally can be passed through but not stopped on', () => {
  const grid = ['#####', '.....', '#####'];
  const u = unit('luxray', 'ally', 0, 1);
  const friend = unit('torterra', 'ally', 2, 1);
  const r = reachable(grid, [u, friend], u);
  assert.equal(r.has('2,1'), false);
  assert.equal(r.has('3,1'), true);
});

test('surrounded unit still has its own tile', () => {
  const grid = ['.#.', '#..', '...'];
  const u = unit('luxray', 'ally', 0, 0);
  const foe = unit('lucario', 'enemy', 1, 1);
  const grid2 = ['...', '...', '...'];
  const blockers = [unit('lucario', 'enemy', 1, 0), unit('garchomp', 'enemy', 0, 1)];
  assert.equal(reachable(grid, [u, foe], u).size, 1);
  const r = reachable(grid2, [u, ...blockers], u);
  assert.equal(r.size, 1);
  assert.equal(r.get('0,0'), 0);
});

test('tilesInRange min/max', () => {
  const ks = tilesInRange(0, 0, [2, 3], 16, 12).map((p) => `${p.x},${p.y}`);
  for (const k of ['0,0', '1,0']) assert.ok(!ks.includes(k), k);
  for (const k of ['2,0', '1,2', '0,3']) assert.ok(ks.includes(k), k);
  assert.equal(manhattan({ x: 0, y: 0 }, { x: 2, y: 3 }), 5);
});

import { pathTo } from '../src/core/pathfind.js';

test('pathTo walks around walls, through allies, step by step', () => {
  const grid = ['.#...', '.#...', '.....'];
  const u = unit('pikachu', 'ally', 0, 0); // 이동력 6 (비행은 2026-11-20부터 벽을 넘으므로 땅 포켓몬)
  const friend = unit('torterra', 'ally', 1, 2);
  const path = pathTo(grid, [u, friend], u, 2, 0);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path.at(-1), { x: 2, y: 0 });
  for (let i = 1; i < path.length; i++) assert.equal(manhattan(path[i - 1], path[i]), 1);
  for (const p of path) assert.notEqual(grid[p.y][p.x], '#');
  assert.equal(path.length, 7); // 6 steps: down,down,right(ally),right,up,up
});

test('paralysis halves the movement budget', () => {
  const grid = Array.from({ length: 11 }, () => '.'.repeat(11));
  const u = { species: 'pikachu', side: 'ally', x: 5, y: 5, hp: 1 };
  const far = (m) => Math.max(...[...m.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return Math.abs(x - 5) + Math.abs(y - 5); }));
  assert.equal(far(reachable(grid, [u], u)), 6); // 피카츄 스피드 90 → 6 (2026-11-18)
  u.status = 'paralysis';
  assert.equal(far(reachable(grid, [u], u)), 3);
});

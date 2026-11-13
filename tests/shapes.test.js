import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRS, tilesOf, unitsHit, aimsOf, bestAim, coverage } from '../src/core/shapes.js';

const S = (units, grid) => ({ grid: grid ?? Array.from({ length: 9 }, () => '.'.repeat(9)), width: 9, height: 9, units });
const U = (id, side, x, y) => ({ id, side, x, y, hp: 10 });
const mv = (shape, extra = {}) => ({ category: 'special', shape, friendlyFire: false, aimRange: shape.range ?? null, ...extra });
const key = (ts) => ts.map((t) => `${t.x},${t.y}`).sort();
const me = U('me', 'ally', 4, 4);

test('line: 3 tiles, stops at a wall', () => {
  assert.deepEqual(key(tilesOf(S([me]), me, mv({ type: 'line', length: 3 }), { dir: 'right' })), ['5,4', '6,4', '7,4']);
  const g = Array.from({ length: 9 }, (_, y) => (y === 4 ? '......#..' : '.........'));
  assert.deepEqual(key(tilesOf(S([me], g), me, mv({ type: 'line', length: 3 }), { dir: 'right' })), ['5,4']);
});

test('cone, around, blast tiles', () => {
  assert.deepEqual(key(tilesOf(S([me]), me, mv({ type: 'cone' }), { dir: 'up' })), ['3,3', '4,2', '4,3', '5,3']);
  assert.equal(tilesOf(S([me]), me, mv({ type: 'around', radius: 1 }), { self: true }).length, 8);
  assert.deepEqual(key(tilesOf(S([me]), me, mv({ type: 'blast', range: [2, 3] }), { x: 4, y: 1 })), ['3,1', '4,0', '4,1', '4,2', '5,1']);
});

test('aims: no direction that only points off the map; blast only where an enemy is hit', () => {
  const corner = U('c', 'ally', 0, 0);
  const dirs = aimsOf(S([corner]), corner, mv({ type: 'line', length: 3 })).map((a) => a.dir).sort();
  assert.deepEqual(dirs, ['down', 'right']);
  assert.equal(DIRS.length, 4);
  const e = U('e', 'enemy', 4, 1);
  const aims = aimsOf(S([me, e]), me, mv({ type: 'blast', range: [2, 3] }));
  assert.ok(aims.length > 0);
  for (const a of aims) assert.ok(unitsHit(S([me, e]), me, mv({ type: 'blast', range: [2, 3] }), a).some((u) => u.side === 'enemy'));
});

test('unitsHit: friendly fire only when set; never the user', () => {
  const a = U('a', 'ally', 5, 5), e = U('e', 'enemy', 3, 3);
  const quake = mv({ type: 'around', radius: 1 }, { friendlyFire: true });
  assert.deepEqual(unitsHit(S([me, a, e]), me, quake, { self: true }).map((u) => u.id).sort(), ['a', 'e']);
  const wave = mv({ type: 'around', radius: 1 });
  assert.deepEqual(unitsHit(S([me, a, e]), me, wave, { self: true }).map((u) => u.id), ['e']);
});

test('single aims are foes in range; bestAim picks the line with two enemies', () => {
  const e1 = U('e1', 'enemy', 5, 4), e2 = U('e2', 'enemy', 6, 4), e3 = U('e3', 'enemy', 4, 3);
  assert.deepEqual(aimsOf(S([me, e1, e3]), me, mv({ type: 'single', range: [1, 1] })).map((a) => a.unitId).sort(), ['e1', 'e3']);
  assert.deepEqual(bestAim(S([me, e1, e2, e3]), me, mv({ type: 'line', length: 3 })), { dir: 'right' });
});

test('coverage', () => {
  assert.deepEqual(coverage(mv({ type: 'single', range: [2, 3] })), [2, 3]);
  assert.deepEqual(coverage(mv({ type: 'blast', range: [2, 3] })), [1, 4]);
  assert.deepEqual(coverage(mv({ type: 'line', length: 3 })), [1, 3]);
  assert.deepEqual(coverage(mv({ type: 'cone' })), [1, 2]);
  assert.deepEqual(coverage(mv({ type: 'around', radius: 1 })), [1, 2]);
});

test('line/cone aimed at a unit fall back to the direction of that unit', () => {
  const e = U('e', 'enemy', 4, 7);
  assert.deepEqual(key(tilesOf(S([me, e]), me, mv({ type: 'line', length: 3 }), { unitId: 'e' })), ['4,5', '4,6', '4,7']);
});

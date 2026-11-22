import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reachable, pathTo, pathCost, canEnter, slides } from '../src/core/pathfind.js';

const mon = (species, x, y, side = 'ally', extra = {}) => ({ id: `${species}${x}${y}`, species, x, y, side, hp: 10, ...extra });
const keys = (m) => [...m.keys()].sort();
const R = (grid, units, u, budget) => reachable(grid, units, u, budget);

test('stepping onto ice slides to the first ground cell; the slide is free', () => {
  const u = mon('bidoof', 0, 0);
  const r = R(['.___.'], [u], u, 1);
  assert.deepEqual(keys(r), ['0,0', '4,0']);
  assert.equal(r.get('4,0'), 1);
});

test('a wall, a pile, an icicle or water a unit cannot enter stops the slide on the last ice cell', () => {
  for (const end of ['#', '*', 'Y', '~']) {
    const u = mon('bidoof', 0, 0);
    assert.deepEqual(keys(R([`.___${end}`], [u], u, 1)), ['0,0', '3,0'], end);
  }
  const u = mon('bidoof', 0, 0); // 맵 끝
  assert.deepEqual(keys(R(['.___'], [u], u, 1)), ['0,0', '3,0']);
});

test('ice types and floating pokemon walk on ice and stop anywhere', () => {
  for (const sp of ['snorunt', 'starly']) {
    const u = mon(sp, 0, 0);
    assert.ok(!slides(u));
    assert.deepEqual(keys(R(['.___.'], [u], u, 2)), ['0,0', '1,0', '2,0'], sp);
  }
  assert.ok(slides(mon('bidoof', 0, 0)));
  assert.ok(!slides(mon('bidoof', 0, 0, 'ally', { ability: 'levitate' })));
});

test('sliding into a pokemon: it is pushed one cell if the cell behind is free, else the slider stops in front', () => {
  const u = mon('bidoof', 0, 0), e = mon('machop', 3, 0, 'enemy');
  assert.deepEqual(keys(R(['.____'], [u, e], u, 1)), ['0,0', '3,0']); // 뒤 (4,0) 비어 있음 → 그 칸까지
  assert.deepEqual(keys(R(['.___#'], [u, e], u, 1)), ['0,0', '2,0']); // 뒤가 벽
  const f = mon('bidoof', 4, 0, 'enemy');
  assert.deepEqual(keys(R(['.____'], [u, e, f], u, 1)), ['0,0', '2,0']); // 뒤에 다른 포켓몬 (연쇄 없음)
  for (const extra of [{ boss: true }, { rooted: true }, { ability: 'suction-cups' }]) {
    const b = mon('machop', 3, 0, 'enemy', extra);
    assert.deepEqual(keys(R(['.____'], [u, b], u, 1)), ['0,0', '2,0'], JSON.stringify(extra));
  }
  const a = mon('bidoof', 3, 0, 'ally'); // 아군도 같은 규칙
  assert.deepEqual(keys(R(['.____'], [u, a], u, 1)), ['0,0', '3,0']);
});

test('pathTo lists the cells slid over; pathCost charges the step onto the ice only', () => {
  const u = mon('bidoof', 0, 0);
  assert.deepEqual(pathTo(['.__..'], [u], u, 4, 0, 2).map((p) => p.x), [0, 1, 2, 3, 4]);
  assert.equal(pathCost(['.__..'], u, pathTo(['.__..'], [u], u, 4, 0, 2)), 2);
  assert.equal(pathCost(['.___.'], u, pathTo(['.___.'], [u], u, 4, 0, 1)), 1);
  const s = mon('snorunt', 0, 0);
  assert.equal(pathCost(['.___.'], s, pathTo(['.___.'], [s], s, 3, 0, 3)), 3);
  assert.equal(pathCost(['.^..'], u, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]), 3);
});

test('turning on a stopped ice cell starts a new paid slide', () => {
  const u = mon('bidoof', 0, 1);
  // (0,1) → 오른쪽 빙판 → (2,1) 에서 벽에 막혀 멈춤 → 아래로 빙판 → (2,3) 바닥
  const g = ['...#', '.__#', '#._#', '##.#'];
  const r = R(g, [u], u, 2);
  assert.ok(r.has('2,1')); assert.ok(r.has('2,3'));
  assert.equal(r.get('2,3'), 2);
});

test('ice types can step onto water (it freezes); others cannot', () => {
  assert.ok(canEnter('~', mon('snorunt', 0, 0)));
  assert.ok(canEnter('~', 'snorunt'));
  assert.ok(!canEnter('~', mon('bidoof', 0, 0)));
  assert.ok(!canEnter('Y', mon('starly', 0, 0)));
  assert.ok(canEnter('_', mon('bidoof', 0, 0)));
});

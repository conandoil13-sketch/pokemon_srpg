import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle } from '../src/core/battle.js';
import { reachable, canEnter } from '../src/core/pathfind.js';
import { hitChance, terrainCtx } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

// 건물 (4..6, 1..2) 3×2
const ROWS = ['..........', '....BBB...', '....BBB...', '..........'];
function setup(allies, foes = [['bidoof', 9, 3]], rows = ROWS) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 999; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}
const has = (r, x, y) => r.has(`${x},${y}`);

test('roof: walk freely on the building, step down to the road, never climb up on foot', () => {
  const { s, at } = setup([['bidoof', 5, 1]]);
  const r = reachable(s.grid, s.units, at(5, 1));
  assert.ok(has(r, 6, 2) && has(r, 4, 1)); // 옥상 안
  assert.ok(has(r, 5, 0) && has(r, 3, 2) && has(r, 5, 3)); // 내려오기
  const g = setup([['bidoof', 3, 0]]);
  const r2 = reachable(g.s.grid, g.s.units, g.at(3, 0));
  assert.ok(has(r2, 4, 0)); // 도로는 됨
  assert.ok(!has(r2, 4, 1)); // 옥상은 안 됨
});

test('roof: flying and dragon climb for 2 and may stop there; grounded flyers cannot', () => {
  const { s, at } = setup([['starly', 3, 1]]);
  const st = at(3, 1);
  const r = reachable(s.grid, s.units, st);
  assert.equal(r.get('4,1'), 2);
  assert.ok(has(r, 5, 2));
  const d = setup([['dratini', 3, 1]]);
  assert.equal(reachable(d.s.grid, d.s.units, d.at(3, 1)).get('4,1'), 2);
  st.grounded = true;
  assert.ok(!has(reachable(s.grid, s.units, st), 4, 1));
});

test('canEnter: a building only takes flyers (no shoving walkers onto roofs)', () => {
  const { s, at } = setup([['bidoof', 0, 0], ['starly', 1, 0]]);
  assert.equal(canEnter('B', at(0, 0)), false);
  assert.equal(canEnter('B', at(1, 0)), true);
});

test('height: roof to road +10 accuracy, road to roof −10', () => {
  const { s, at } = setup([['bidoof', 5, 2], ['bidoof', 5, 3]]);
  const top = at(5, 2), low = at(5, 3), mv = { ...MOVES['tackle'], accuracy: 80 };
  assert.equal(hitChance(top, low, mv, s.grid[3][5], null, terrainCtx(s, top, low)), 90);
  assert.equal(hitChance(low, top, mv, s.grid[2][5], null, terrainCtx(s, low, top)), 70);
});

import { warpTarget, useWarp } from '../src/core/warp.js';
const WARPS = [{ x: 1, y: 3, color: 'blue', to: { x: 5, y: 1 } }, { x: 5, y: 1, color: 'blue', to: { x: 1, y: 3 } }];
function warped(allies, foes) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: ROWS, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })), warps: WARPS };
  const s = createBattle(map, ms);
  return { s, at: (x, y) => s.units.find((u) => u.x === x && u.y === y) };
}

test('warp: ending a move on a pad sends an ally to its partner, still free to act', () => {
  const { s, at } = warped([['bidoof', 1, 3]], [['bidoof', 9, 0]]);
  const u = at(1, 3);
  assert.deepEqual(warpTarget(s, u), { x: 5, y: 1 });
  const r = useWarp(s, u);
  assert.deepEqual(r, { from: { x: 1, y: 3 }, to: { x: 5, y: 1 }, color: 'blue' });
  assert.deepEqual([u.x, u.y], [5, 1]);
  assert.equal(u.acted, false);
});

test('warp: blocked partner, flyers, and enemies do not warp; dragons do', () => {
  const a = warped([['bidoof', 1, 3], ['bidoof', 5, 1]], [['bidoof', 9, 0]]);
  assert.equal(warpTarget(a.s, a.at(1, 3)), null); // 짝 칸에 누가 있음
  const b = warped([['starly', 1, 3]], [['bidoof', 9, 0]]);
  assert.equal(warpTarget(b.s, b.at(1, 3)), null);
  const c = warped([['dratini', 1, 3]], [['bidoof', 9, 0]]);
  assert.deepEqual(warpTarget(c.s, c.at(1, 3)), { x: 5, y: 1 });
  const d = warped([['bidoof', 0, 0]], [['bidoof', 1, 3]]);
  assert.equal(warpTarget(d.s, d.at(1, 3)), null); // 적은 안 씀
});

test('walking onto a warp on screen: lands on the roof, notice, and the move cannot be undone', async () => {
  const { createGame } = await import('../src/game/states.js');
  const map = { tiles: ROWS, allySlots: [{ x: 0, y: 3 }], enemies: [{ species: 'bidoof', x: 9, y: 0, level: 5 }], warps: WARPS };
  const game = createGame({ rng: createRng(3), map, party: [newMember('bidoof', 40, createRng(1))], theme: 'city' });
  const s = game.state, p = s.units[0];
  for (let i = 0; i < 200; i++) { game.update(0.05); if (game.mode === 'idle') break; game.handle({ type: 'confirm' }); }
  game.handle({ type: 'confirm' });
  game.handle({ type: 'dir', dx: 1, dy: 0 });
  game.handle({ type: 'confirm' });
  for (let i = 0; i < 200 && game.mode !== 'notice'; i++) game.update(0.05);
  assert.equal(game.mode, 'notice');
  assert.deepEqual([p.x, p.y], [5, 1]);
  for (let i = 0; i < 50 && game.mode === 'notice'; i++) { game.handle({ type: 'confirm' }); game.update(0.5); }
  assert.equal(game.mode, 'action');
  game.handle({ type: 'cancel' });
  assert.deepEqual([p.x, p.y], [5, 1]);
});

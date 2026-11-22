import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, moveUnit, endPhase } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { reachable, tileCost } from '../src/core/pathfind.js';
import { hitChance } from '../src/core/damage.js';
import { sandShift, sandLanding, onSand } from '../src/core/sand.js';
import { MOVES } from '../src/data/moves.js';
import { moveBudget } from '../src/core/status.js';
import { planEnemyAction } from '../src/core/ai.js';

// 0123456789
const ROWS = [
  '..........', // 0
  '.====.....', // 1  흐르는 모래 (오른쪽)
  '......ooo.', // 2
  '..::..o@o.', // 3
  '......ooo.', // 4
  '..^.......', // 5
];
const FLOWS = { '1,1': 'right', '2,1': 'right', '3,1': 'right', '4,1': 'right' };
function setup(allies, foes = [['bidoof', 9, 5]], rows = ROWS) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, flows: FLOWS, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 120; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}

test('deep sand: entering costs 2 on foot, 1 when airborne; leaving is normal', () => {
  const { s, at } = setup([['bidoof', 0, 3], ['starly', 0, 0]]);
  assert.equal(tileCost(':', at(0, 3)), 2);
  assert.equal(tileCost(':', at(0, 0)), 1);
  assert.equal(tileCost('=', at(0, 3)), 1); assert.equal(tileCost('o', at(0, 3)), 1); assert.equal(tileCost('@', at(0, 3)), 1);
  assert.equal(s.flows['1,1'], 'right');
});

test('deep sand: +15 evasion on foot, none when airborne', () => {
  const { at } = setup([['bidoof', 2, 3], ['starly', 3, 3]], [['bidoof', 2, 2]]);
  const foe = at(2, 2), mv = { ...MOVES.tackle, accuracy: 100 };
  const flat = hitChance(foe, at(2, 3), mv, '.');
  assert.equal(hitChance(foe, at(2, 3), mv, ':'), flat - 15);
  assert.equal(hitChance(foe, at(3, 3), mv, ':'), hitChance(foe, at(3, 3), mv, '.'));
});

test('flowing sand: ending an action there pushes 1 cell along the strip', () => {
  const { s, at } = setup([['bidoof', 2, 1]]);
  const u = at(2, 1);
  const ev = sandShift(s, u);
  assert.deepEqual(ev, { kind: 'flow', from: { x: 2, y: 1 }, to: { x: 3, y: 1 } });
  assert.deepEqual([u.x, u.y], [3, 1]);
  assert.equal(sandShift(s, { ...u, x: 0, y: 0 }), null); // 평지
});

test('flowing sand: blocked by a unit, a rock or the map edge → stays; no chain', () => {
  const { s, at } = setup([['bidoof', 2, 1], ['bidoof', 3, 1]]);
  assert.equal(sandShift(s, at(2, 1)), null); // 앞에 아군
  const { s: s2, at: at2 } = setup([['bidoof', 4, 1]]);
  sandShift(s2, at2(4, 1)); // 4,1 → 5,1 (평지): 거기서 멈춤
  assert.ok(at2(5, 1));
  const edge = ['====', '....'];
  const { s: s3, at: at3 } = setup([['bidoof', 3, 0]], [['bidoof', 0, 1]], edge);
  s3.flows = { '3,0': 'right' };
  assert.equal(sandShift(s3, at3(3, 0)), null);
  const rock = ['=^..', '....'];
  const { s: s4, at: at4 } = setup([['bidoof', 0, 0]], [['bidoof', 3, 1]], rock);
  s4.flows = { '0,0': 'right' };
  assert.equal(sandShift(s4, at4(0, 0)), null);
  // 연쇄 없음: 밀린 칸이 또 흐르는 모래여도 1칸만
  const { s: s5, at: at5 } = setup([['bidoof', 1, 1]]);
  sandShift(s5, at5(1, 1));
  assert.ok(at5(2, 1));
});

test('pit: the ring pulls to the center (diagonal from corners); airborne and hidden units ignore sand', () => {
  for (const [x, y] of [[6, 2], [7, 2], [8, 4], [6, 3]]) {
    const { s, at } = setup([['bidoof', x, y]]);
    const ev = sandShift(s, at(x, y));
    assert.equal(ev.kind, 'pit'); assert.deepEqual(ev.to, { x: 7, y: 3 });
  }
  const { s, at } = setup([['starly', 6, 2], ['bidoof', 2, 1]]);
  assert.equal(sandShift(s, at(6, 2)), null);
  at(2, 1).burrow = { kind: 'ground' };
  assert.equal(sandShift(s, at(2, 1)), null);
  assert.equal(onSand(s, at(6, 2)), false);
});

test('pit center: the first step out costs the whole move; that turn the ring does not pull back', () => {
  const { s, at } = setup([['bidoof', 7, 3]]);
  const u = at(7, 3);
  const r = reachable(s.grid, s.units, u);
  const keys = [...r.keys()].sort();
  assert.deepEqual(keys, ['6,3', '7,2', '7,3', '7,4', '8,3']);
  moveUnit(s, u.id, 7, 2, 1);
  assert.equal(u.spent, moveBudget(u));
  assert.ok(u.pitEscaped);
  assert.equal(sandShift(s, u), null); // 탈출한 턴: 안 끌림
  endPhase(s, createRng(1)); endPhase(s, createRng(2)); // 다음 아군 차례
  assert.ok(!u.pitEscaped);
  assert.equal(sandShift(s, u).kind, 'pit');
});

test('sandLanding: where a unit would end up after the sand (AI preview), and whether it is stuck', () => {
  const { s, at } = setup([['bidoof', 0, 0]]);
  const u = at(0, 0);
  assert.deepEqual(sandLanding(s, u, { x: 2, y: 1 }), { x: 3, y: 1, stuck: false });
  assert.deepEqual(sandLanding(s, u, { x: 6, y: 2 }), { x: 7, y: 3, stuck: true });
  assert.deepEqual(sandLanding(s, u, { x: 0, y: 4 }), { x: 0, y: 4, stuck: false });
});

test('AI: an enemy does not end its move on a pit ring when a plain cell does the same job', () => {
  // 적(9,3)이 아군(4,3)에게 다가가지만 공격은 못 함: 모래지옥 바깥에 서면 가운데로 끌린다
  const rows = ['..........', '..........', '......ooo.', '......o@o.', '......ooo.', '..........'];
  const ms = [newMember('bidoof', 40, createRng(1))];
  const s = createBattle({ tiles: rows, flows: {}, allySlots: [{ x: 0, y: 3 }], enemies: [{ species: 'bidoof', x: 9, y: 3, level: 40 }] }, ms);
  for (const u of s.units) { u.hp = u.maxHp = 120; u.ability = null; u.moves = ['tackle']; }
  const foe = s.units.find((u) => u.side === 'enemy');
  const plan = planEnemyAction(s, foe);
  const t = s.grid[plan.moveTo.y][plan.moveTo.x];
  assert.ok(t !== 'o' && t !== '@', JSON.stringify(plan.moveTo));
});

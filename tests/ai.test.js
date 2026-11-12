import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyTurnOrder, planEnemyAction } from '../src/core/ai.js';
import { createBattle } from '../src/core/battle.js';
import { makeUnit } from '../src/core/battle.js';
import { manhattan } from '../src/core/pathfind.js';

const MOVESET = { garchomp: ['earthquake', 'dragon-claw', 'crunch'], bronzong: ['tackle'], torterra: ['razor-leaf'] };
const mk = (species, side, x, y, hp) => {
  const u = makeUnit({ species, side, x, y, level: 50, moves: MOVESET[species] ?? ['tackle'] });
  if (hp !== undefined) u.hp = hp;
  return u;
};
const state = (w, h, units) => ({
  grid: Array.from({ length: h }, () => '.'.repeat(w)), width: w, height: h, units, phase: 'enemy', turn: 1, result: null,
});

test('prefers the target it can KO', () => {
  const foe = mk('garchomp', 'enemy', 4, 2);
  const weak = mk('luxray', 'ally', 2, 2, 1);
  const full = mk('empoleon', 'ally', 6, 2);
  const s = state(9, 5, [foe, weak, full]);
  const plan = planEnemyAction(s, foe);
  assert.equal(plan.attack.targetId, 'ally-luxray');
});

test('never picks a zero-damage (immune) move', () => {
  const foe = mk('garchomp', 'enemy', 3, 2);
  const bird = mk('honchkrow', 'ally', 1, 2);
  const s = state(6, 5, [foe, bird]);
  const plan = planEnemyAction(s, foe);
  assert.ok(plan.attack);
  assert.ok(['crunch', 'dragon-claw'].includes(plan.attack.moveId), plan.attack.moveId);
});

test('approaches when nothing is in range', () => {
  const foe = mk('bronzong', 'enemy', 15, 5);
  const ally = mk('luxray', 'ally', 0, 5);
  const s = state(16, 12, [foe, ally]);
  const plan = planEnemyAction(s, foe);
  assert.equal(plan.attack, null);
  assert.ok(manhattan(plan.moveTo, ally) < manhattan(foe, ally));
});

test('turn order: fastest enemy first (by its own stats)', () => {
  const order = enemyTurnOrder(createBattle());
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1].stats.spe >= order[i].stats.spe);
  assert.equal(order[0].species, 'murkrow');
});

test('approach uses walking distance, not straight-line distance across water', () => {
  // 물 건너편 아군. 직선거리로는 물가가 가깝지만 다리(아래쪽)로 가야 실제로 가까워진다
  const grid = ['...~...', '...~...', '...~...', '...~...', '.......'];
  const foe = mk('torterra', 'enemy', 6, 0);  // 물 진입 불가, 이동력 3
  const ally = mk('luxray', 'ally', 0, 0);
  const s = { grid, width: 7, height: 5, units: [foe, ally], phase: 'enemy', turn: 1, result: null };
  const plan = planEnemyAction(s, foe);
  assert.equal(plan.attack, null);
  // 물가(4,0)이 아니라 아래쪽 우회로로 내려가야 한다
  assert.ok(plan.moveTo.y > 0, JSON.stringify(plan.moveTo));
});

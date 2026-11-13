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

// ---- 변화기 ----
const mkm = (species, side, x, y, moves) => makeUnit({ species, side, x, y, level: 30, moves });

test('buffs itself when no foe can be attacked this turn, still approaching', () => {
  const foe = mkm('scyther', 'enemy', 15, 5, ['swords-dance', 'slash']);
  const ally = mkm('luxray', 'ally', 0, 5, ['tackle']);
  const s = state(16, 12, [foe, ally]);
  const plan = planEnemyAction(s, foe);
  assert.deepEqual(plan.attack, { moveId: 'swords-dance', targetId: foe.id });
  assert.ok(manhattan(plan.moveTo, ally) < manhattan(foe, ally));
});

test('does not buff a stat already at +2 or with 2+ turns left', () => {
  const foe = mkm('scyther', 'enemy', 15, 5, ['swords-dance', 'slash']);
  const ally = mkm('luxray', 'ally', 0, 5, ['tackle']);
  foe.stages.atk = 2; foe.turns.atk = 1;
  assert.equal(planEnemyAction(state(16, 12, [foe, ally]), foe).attack, null);
  foe.stages.atk = 1; foe.turns.atk = 2;
  assert.equal(planEnemyAction(state(16, 12, [foe, ally]), foe).attack, null);
});

test('no area debuff when no foe ends up within range', () => {
  const foe = mkm('bidoof', 'enemy', 15, 5, ['growl']);
  const ally = mkm('luxray', 'ally', 0, 5, ['tackle']);
  assert.equal(planEnemyAction(state(16, 12, [foe, ally]), foe).attack, null);
});

test('uses an area debuff on foes in range when it has no attack', () => {
  const foe = mkm('bidoof', 'enemy', 4, 2, ['growl']);
  const ally = mkm('luxray', 'ally', 2, 2, ['tackle']);
  const plan = planEnemyAction(state(9, 5, [foe, ally]), foe);
  assert.equal(plan.attack?.moveId, 'growl');
  assert.ok(manhattan(plan.moveTo, ally) <= 2);
});

test('attacks instead of buffing when it can hit hard now', () => {
  const foe = mkm('scyther', 'enemy', 4, 2, ['swords-dance', 'slash']);
  const ally = mkm('luxray', 'ally', 2, 2, ['tackle']);
  ally.hp = 10;
  const plan = planEnemyAction(state(9, 5, [foe, ally]), foe);
  assert.equal(plan.attack.moveId, 'slash');
});

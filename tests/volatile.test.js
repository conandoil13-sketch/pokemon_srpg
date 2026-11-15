import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { critRate } from '../src/core/abilities.js';
import { moveBudget } from '../src/core/status.js';
import { moveBlock } from '../src/core/volatile.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.01; // 명중·성공
// 아군 하나(1,1) vs 적 하나(2,1). 거리 조정은 foe 위치로
const duel = (allySp, foeSp, { level = 40, foeLevel = 40, ally = {}, foe = {}, fx = 2, fy = 1 } = {}) => {
  const m = newMember(allySp, level, createRng(1));
  const map = { tiles: Array.from({ length: 10 }, () => '.'.repeat(10)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, x: fx, y: fy, level: foeLevel }] };
  const s = createBattle(map, [m]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f, m, map };
};
// 한 바퀴: 아군 페이즈 끝 → 적 페이즈 끝 (다시 아군 차례)
const round = (s) => { endPhase(s, () => 0.9); endPhase(s, () => 0.9); };

test('effect moves become learnable with an effect name', () => {
  for (const id of ['focus-energy', 'taunt', 'mean-look', 'block', 'spider-web']) {
    assert.equal(MOVES[id].learnable, true, id);
    assert.ok(MOVES[id].effect, id);
  }
  assert.equal(MOVES['heal-block'].kind, 'enemy');
  assert.deepEqual(MOVES['heal-block'].range, [1, 2]);
});

test('focus energy raises crit stage by 2 for the floor', () => {
  const { s, a, f } = duel('pikachu', 'snorlax');
  assert.equal(critRate(a, f, MOVES.tackle), 1 / 16);
  const r = applyMove(s, a.id, 'focus-energy', a.id, hit);
  assert.deepEqual(r.effects, [{ unitId: a.id, effect: 'focusEnergy', ok: true }]);
  assert.equal(critRate(a, f, MOVES.tackle), 1 / 4);
  a.acted = false;
  assert.deepEqual(applyMove(s, a.id, 'focus-energy', a.id, hit).effects[0], { unitId: a.id, effect: 'focusEnergy', ok: false, reason: 'already' });
});

test('taunt blocks status moves for 3 turns of the target side', () => {
  const { s, a, f } = duel('murkrow', 'pidgey');
  const r = applyMove(s, a.id, 'taunt', f.id, hit);
  assert.equal(r.effects[0].ok, true);
  assert.equal(moveBlock(f, 'growl'), 'taunt');
  assert.equal(moveBlock(f, 'tackle'), null);
  endPhase(s); // 아군 끝
  const r2 = applyMove(s, f.id, 'growl', a.id, hit);
  assert.equal(r2.blocked, 'taunt');
  assert.equal(f.acted, true);
  endPhase(s); // 적 끝 1
  round(s); // 적 끝 2
  assert.equal(moveBlock(f, 'growl'), 'taunt');
  round(s); // 적 끝 3
  assert.equal(moveBlock(f, 'growl'), null);
});

test('mean look stops movement for 2 turns but not moves', () => {
  const { s, a, f } = duel('gastly', 'pidgey');
  assert.ok(moveBudget(f) > 0);
  assert.equal(applyMove(s, a.id, 'mean-look', f.id, hit).effects[0].ok, true);
  assert.equal(moveBudget(f), 0);
  a.acted = false;
  assert.equal(applyMove(s, a.id, 'block', f.id, hit).effects[0].reason, 'already');
  endPhase(s);
  assert.ok(applyMove(s, f.id, 'tackle', a.id, hit).hits.length > 0); // 기술은 쓸 수 있음
  endPhase(s); // 적 끝 1
  assert.equal(moveBudget(f), 0);
  round(s); // 적 끝 2
  assert.ok(moveBudget(f) > 0);
});

test('new effects do not carry into the next floor', () => {
  const { s, a, m, map } = duel('pikachu', 'pidgey');
  applyMove(s, a.id, 'focus-energy', a.id, hit);
  const s2 = createBattle(map, [m]);
  assert.equal(s2.units[0].focusEnergy, false);
  assert.equal(s2.units[0].taunt, 0);
  assert.equal(m.focusEnergy, undefined);
});

test('lastMove records the move that was used', () => {
  const { s, a, f } = duel('pikachu', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  applyMove(s, a.id, 'tackle', f.id, hit);
  assert.equal(a.lastMove, 'tackle');
  a.acted = false; a.status = 'paralysis';
  const r = applyMove(s, a.id, 'growl', f.id, () => 0.1); // 마비 25% 실패
  assert.equal(r.blocked, 'paralysis');
  assert.equal(a.lastMove, 'tackle');
});

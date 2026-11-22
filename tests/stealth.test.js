import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, moveUnit } from '../src/core/battle.js';
import { darkHidden, hiddenFrom, DARK_SIGHT } from '../src/core/stealth.js';
import { guessAims } from '../src/core/shapes.js';
import { planEnemyAction } from '../src/core/ai.js';
import { MOVES } from '../src/data/moves.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.5;
// 아군 [종, x, y] · 적 [종, x, y]. 수풀은 (5..9, 2)
const ROWS = ['..........', '..........', '.....""""".', '..........'].map((r) => r.slice(0, 10));
function setup(allies, foes, rows = ROWS) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 999; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}

test('dark on grass hides from foes farther than 3 tiles', () => {
  const { s, at } = setup([['pikachu', 1, 2]], [['umbreon', 5, 2]]); // 거리 4
  const um = at(5, 2);
  assert.equal(DARK_SIGHT, 3);
  assert.equal(darkHidden(s, um), true);
  assert.deepEqual([...hiddenFrom(s, 'ally')], [um.id]);
  moveUnit(s, at(1, 2).id, 2, 2); // 거리 3
  assert.equal(darkHidden(s, um), false);
});

test('only dark types, only on grass', () => {
  const { s, at } = setup([['pikachu', 0, 0]], [['bidoof', 6, 2], ['umbreon', 8, 0]]);
  assert.equal(darkHidden(s, at(6, 2)), false); // 악 아님
  assert.equal(darkHidden(s, at(8, 0)), false); // 수풀 아님
});

test('attacking or taking damage reveals until the unit moves again', () => {
  const { s, at } = setup([['umbreon', 5, 2], ['pikachu', 9, 0]], [['bidoof', 1, 2], ['bidoof', 9, 1]]);
  const um = at(5, 2);
  assert.equal(darkHidden(s, um), true);
  applyMove(s, at(9, 0).id, 'thunder-shock', at(9, 1).id, hit); // 다른 아군 공격은 상관없음
  assert.equal(darkHidden(s, um), true);
  um.moves = ['bite']; um.acted = false;
  applyMove(s, um.id, 'bite', { x: 6, y: 2 }, hit); // 빈 칸이라도 공격기를 쓰면 드러남
  assert.equal(darkHidden(s, um), false);
  moveUnit(s, um.id, 6, 2);
  assert.equal(darkHidden(s, um), true);
  const foe = at(1, 2); foe.moves = ['ember']; foe.x = 4; // 가까이 와서 때림
  applyMove(s, foe.id, 'ember', um.id, hit);
  foe.x = 1; // 다시 멀어져도
  assert.equal(darkHidden(s, um), false); // 맞았으니 드러난 채
});

test('aiming at an empty tile whiffs but uses the turn', () => {
  const { s, at } = setup([['pikachu', 4, 2]], [['umbreon', 8, 2]]);
  const p = at(4, 2);
  const r = applyMove(s, p.id, 'thunder-shock', { x: 6, y: 2 }, hit);
  assert.equal(r.empty, true);
  assert.equal(r.hits.length, 0);
  assert.equal(p.acted, true);
});

test('aiming at the remembered tile hits the hidden foe', () => {
  const { s, at } = setup([['pikachu', 3, 2]], [['umbreon', 5, 2]]);
  const um = at(5, 2), p = at(3, 2);
  const r = applyMove(s, p.id, 'thunder-shock', { x: 5, y: 2 }, hit);
  assert.ok(r.hits.some((h) => h.unitId === um.id && h.damage > 0));
});

test('guess aims: none without a hidden foe, empty-looking grass in range with one', () => {
  const { s, at } = setup([['pikachu', 4, 1]], [['bidoof', 5, 2]]);
  const p = at(4, 1);
  assert.deepEqual(guessAims(s, p, MOVES['thunder-shock']), []);
  const h = setup([['pikachu', 5, 1]], [['bidoof', 5, 2], ['umbreon', 9, 2]]);
  const aims = guessAims(h.s, h.at(5, 1), MOVES['thunder-shock']).map((a) => `${a.x},${a.y}`).sort();
  assert.deepEqual(aims, ['6,2']); // 사거리 2 안의 수풀 (5,2) 는 보이는 적이 있어 제외
});

test('enemy AI ignores allies hidden in grass', () => {
  const { s, at } = setup([['umbreon', 5, 2]], [['pikachu', 1, 2]]);
  const foe = at(1, 2); foe.moves = ['thunder-shock'];
  const unseen = hiddenFrom(s, 'enemy');
  assert.ok(unseen.has(at(5, 2).id));
  const plan = planEnemyAction(s, foe, { unseen });
  assert.equal(plan.attack, null);
});

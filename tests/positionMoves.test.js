import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase, redirectTarget, teleportSpots } from '../src/core/battle.js';
import { MOVES } from '../src/data/moves.js';
import { canEnter, reachable } from '../src/core/pathfind.js';
import { moveBudget } from '../src/core/status.js';
import { typeEffect } from '../src/core/abilities.js';
import { newParty } from '../src/core/progress.js';

const rows = (r) => ({ tiles: r, allySlots: [{ x: 1, y: 1 }, { x: 2, y: 1 }], enemies: [{ species: 'geodude', level: 20, x: 6, y: 1 }], stairs: null, chests: [] });
const setup = (r = ['........', '........', '..~~....']) => {
  const s = createBattle(rows(r), newParty());
  const [a, b] = s.units.filter((u) => u.side === 'ally');
  const e = s.units.find((u) => u.side === 'enemy');
  for (const u of [a, b]) u.moves = ['teleport', 'baton-pass', 'follow-me', 'gravity', 'magnet-rise', 'tackle'];
  return { s, a, b, e };
};
const rng = () => 0;

test('the five position moves are learnable with their effects', () => {
  for (const [id, eff] of [['teleport', 'teleport'], ['baton-pass', 'batonPass'], ['follow-me', 'followMe'], ['gravity', 'gravity'], ['magnet-rise', 'magnetRise']]) {
    assert.ok(MOVES[id].learnable, id); assert.equal(MOVES[id].effect, eff);
  }
  assert.deepEqual(MOVES.teleport.range, [1, 4]); assert.ok(MOVES.teleport.aimTile);
});

test('teleport jumps to a free tile within 4 and refuses far or taken tiles', () => {
  const { s, a, b } = setup();
  assert.ok(!teleportSpots(s, a).some((p) => p.x === b.x && p.y === b.y));
  assert.ok(!teleportSpots(s, a).some((p) => Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 4));
  let r = applyMove(s, a.id, 'teleport', { x: 7, y: 1 }, rng);
  assert.equal(r.effects[0].ok, false); assert.deepEqual([a.x, a.y], [1, 1]);
  a.acted = a.moved = false;
  r = applyMove(s, a.id, 'teleport', { x: 4, y: 0 }, rng);
  assert.equal(r.effects[0].ok, true); assert.deepEqual([a.x, a.y], [4, 0]);
});

test('baton pass swaps places and hands over stat changes', () => {
  const { s, a, b } = setup();
  applyMove(s, a.id, 'swords-dance' in MOVES ? 'swords-dance' : 'tackle', a.id, rng);
  a.acted = a.moved = false;
  const atk = a.stages.atk;
  const r = applyMove(s, a.id, 'baton-pass', b.id, rng);
  assert.equal(r.effects[0].ok, true);
  assert.deepEqual([a.x, a.y, b.x, b.y], [2, 1, 1, 1]);
  assert.equal(b.stages.atk, atk); assert.equal(a.stages.atk, 0);
});

test('follow-me pulls single-target moves from foes within 3', () => {
  const { s, a, b, e } = setup();
  applyMove(s, a.id, 'follow-me', a.id, rng);
  assert.equal(redirectTarget(s, e.id, 'tackle', b.id), null); // 적이 5칸 밖이면 안 끌림
  e.x = 4; e.y = 1; // 날따름 쓴 쪽에서 3칸
  assert.equal(redirectTarget(s, e.id, 'tackle', b.id)?.id, a.id);
});

test('follow-me ends at the next own phase', () => {
  const { s, a } = setup();
  applyMove(s, a.id, 'follow-me', a.id, rng);
  endPhase(s, rng); endPhase(s, rng);
  assert.equal(a.followMe, false);
});

test('magnet rise floats over water and dodges ground moves for 3 turns', () => {
  const { s, a, e } = setup();
  assert.equal(canEnter('~', a), canEnter('~', a.species));
  applyMove(s, a.id, 'magnet-rise', a.id, rng);
  assert.equal(canEnter('~', a), true);
  assert.equal(typeEffect(e, a, MOVES.earthquake), 0);
  for (let i = 0; i < 6; i++) endPhase(s, rng);
  assert.equal(a.magnetRise, 0);
});

test('gravity grounds flyers for 3 turns: no water, ground moves hit, no flying bonus', () => {
  const { s, a, b, e } = setup();
  Object.assign(b, { species: 'starly', types: ['normal', 'flying'] });
  const before = moveBudget(b);
  assert.equal(typeEffect(e, b, MOVES.earthquake), 0);
  applyMove(s, a.id, 'gravity', a.id, rng);
  assert.equal(canEnter('~', b), false);
  assert.ok(typeEffect(e, b, MOVES.earthquake) > 0);
  assert.equal(moveBudget(b), before - 1);
  a.acted = a.moved = false;
  assert.equal(applyMove(s, a.id, 'magnet-rise', a.id, rng).effects[0].ok, false);
  for (let i = 0; i < 6; i++) endPhase(s, rng);
  assert.equal(s.gravity, null); assert.equal(b.grounded, false); assert.equal(canEnter('~', b), true);
});

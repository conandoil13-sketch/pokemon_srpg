import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { moveBudget } from '../src/core/status.js';
import { isHidden, FOG_SIGHT } from '../src/core/weather.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { ABILITIES } from '../src/data/abilities.js';

const hit = () => 0.01;
const duel = (allySp, foeSp, { ally = {}, foe = {}, fx = 2, fy = 1 } = {}) => {
  const m = newMember(allySp, 40, createRng(1));
  const map = { tiles: Array.from({ length: 10 }, () => '.'.repeat(10)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, x: fx, y: fy, level: 40 }] };
  const s = createBattle(map, [m]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};
const round = (s) => { endPhase(s, () => 0.9); endPhase(s, () => 0.9); };

test('run away ignores trapping, move locks and bind movement lock', () => {
  const { a } = duel('ponyta', 'geodude', { ally: { ability: 'run-away' } });
  const full = moveBudget(a);
  a.trapped = true; a.noMove = 2; a.bound = { by: 'x', moveId: 'wrap', turns: 3, reach: 1 };
  assert.equal(moveBudget(a), full);
});
test('illuminate sees farther in fog', () => {
  const t = { x: 0, y: FOG_SIGHT };
  assert.equal(isHidden(t, [{ x: 0, y: 0 }]), true);
  assert.equal(isHidden(t, [{ x: 0, y: 0, ability: 'illuminate' }]), false);
});
test('steadfast raises speed when flinched; stench can flinch', () => {
  const { s, a, f } = duel('machop', 'geodude', { ally: { ability: 'guts' }, foe: { ability: 'steadfast' } });
  applyMove(s, a.id, 'bite', f.id, () => 0.01);
  assert.equal(f.flinch, true);
  assert.equal(f.stages.spe, 1);
  const g = duel('grimer', 'geodude', { ally: { ability: 'stench' } });
  assert.deepEqual(applyMove(g.s, g.a.id, 'pound', g.f.id, () => 0.01).flinched, [g.f.id]);
});
test('reckless boosts recoil moves', () => {
  const p = duel('rattata', 'geodude', { foe: { hp: 999, maxHp: 999 } });
  const r = duel('rattata', 'geodude', { ally: { ability: 'reckless' }, foe: { hp: 999, maxHp: 999 } });
  const plain = applyMove(p.s, p.a.id, 'double-edge', p.f.id, () => 0.5).hits[0].damage;
  const boosted = applyMove(r.s, r.a.id, 'double-edge', r.f.id, () => 0.5).hits[0].damage;
  assert.ok(boosted > plain * 1.1, `${boosted} vs ${plain}`);
});
test('natural cure heals status after a quiet turn, not after attacking or being hit', () => {
  const { s, a, f } = duel('chansey', 'geodude', { ally: { ability: 'natural-cure', status: 'burn' } });
  f.x = 9; f.y = 9;
  endPhase(s, () => 0.9); // 아군 차례 끝 (조용함)
  assert.equal(a.status, null);
  const b = duel('chansey', 'geodude', { ally: { ability: 'natural-cure', status: 'poison' } });
  applyMove(b.s, b.a.id, 'pound', b.f.id, hit);
  endPhase(b.s, () => 0.9);
  assert.equal(b.a.status, 'poison');
});
test('pressure blocks the first two hits each floor but not poison', () => {
  const { s, a, f } = duel('pidgey', 'zapdos', { foe: { ability: 'pressure' } });
  const hp = f.hp;
  applyMove(s, a.id, 'tackle', f.id, hit); assert.equal(f.hp, hp);
  const r = applyMove(s, a.id, 'tackle', f.id, hit); assert.equal(f.hp, hp); assert.ok(r.hits[0].shielded);
  applyMove(s, a.id, 'tackle', f.id, hit); assert.ok(f.hp < hp);
});
test('suction cups cannot be pushed', () => {
  const { s, a, f } = duel('pidgey', 'octillery', { foe: { ability: 'suction-cups' } });
  const r = applyMove(s, a.id, 'whirlwind', f.id, hit);
  assert.equal(r.effects[0].ok, false);
});
test('these abilities are no longer marked as name only', () => {
  for (const id of ['run-away', 'illuminate', 'steadfast', 'stench', 'reckless', 'natural-cure', 'pressure', 'suction-cups']) assert.equal(ABILITIES[id].inactive, false, id);
  assert.equal(ABILITIES.stall.inactive, true);
});

// ---- 지형·사거리 특성 ----
import { reachable, canEnter } from '../src/core/pathfind.js';
import { aimsOf } from '../src/core/shapes.js';
import { MOVES } from '../src/data/moves.js';
test('levitate crosses water like a flier', () => {
  assert.equal(canEnter('~', { species: 'gastly', types: ['ghost', 'poison'] }), false);
  assert.equal(canEnter('~', { species: 'gastly', types: ['ghost', 'poison'], ability: 'levitate' }), true);
});
test('limber walks through trees but cannot stop in them; rock walls still block', () => {
  const grid = ['.#.', '...', '...']; grid.trees = true;
  const u = { id: 'u', species: 'ditto', side: 'ally', x: 0, y: 0, types: ['normal'], ability: 'limber', hp: 1 };
  const r = reachable(grid, [u], u, 2);
  assert.ok(r.has('2,0')); // 나무를 지나
  assert.ok(!r.has('1,0')); // 나무 위엔 못 섬
  const cave = ['.#.', '###', '...'];
  assert.ok(!reachable(cave, [u], u, 2).has('2,0'));
});
test('sniper adds a tile to moves that reach 2 or more', () => {
  const { s, a, f } = duel('pidgey', 'geodude', { fx: 1, fy: 5 }); // 거리 4
  const far = { ...MOVES['aura-sphere'] }; // 사거리 2~3
  assert.equal(aimsOf(s, a, far).some((x) => x.unitId === f.id), false);
  a.ability = 'sniper';
  assert.equal(aimsOf(s, a, far).some((x) => x.unitId === f.id), true);
  f.y = 2; // 거리 1: 사거리 1 기술은 그대로
  assert.equal(aimsOf(s, a, MOVES.tackle).length >= 1, true);
});

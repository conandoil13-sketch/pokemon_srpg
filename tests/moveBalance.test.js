// 기술 밸런스 조정 메모 (codex-reviews/2026-11-20-move-balance-decisions.md) — 1차: 조건부 위력
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { varPower, situationalMove } from '../src/core/damage.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.01;
const duel = (allySp, foeSp, { ally = {}, foe = {} } = {}) => {
  const map = { tiles: Array.from({ length: 6 }, () => '.'.repeat(6)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, x: 2, y: 1, level: 40 }, { species: 'rattata', x: 5, y: 5, level: 40 }] };
  const s = createBattle(map, [newMember(allySp, 40, createRng(1))]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};
const P = (a, d, id) => varPower(a, d, MOVES[id]);

test('brine doubles at half HP or less', () => {
  const { a, f } = duel('psyduck', 'geodude');
  assert.equal(P(a, f, 'brine'), 65);
  f.hp = Math.floor(f.maxHp / 2);
  assert.equal(P(a, f, 'brine'), 130);
});

test('facade doubles when the user is poisoned, badly poisoned, paralyzed or burned', () => {
  const { a, f } = duel('rattata', 'geodude');
  assert.equal(P(a, f, 'facade'), 70);
  for (const st of ['poison', 'toxic', 'paralysis', 'burn']) { a.status = st; assert.equal(P(a, f, 'facade'), 140, st); }
  a.status = 'sleep'; assert.equal(P(a, f, 'facade'), 70);
});

test('eruption and water spout: 150 × HP ratio, floored, at least 1', () => {
  const { a, f } = duel('magmar', 'geodude');
  assert.equal(P(a, f, 'eruption'), 150);
  a.hp = Math.floor(a.maxHp / 2); assert.equal(P(a, f, 'water-spout'), Math.floor(150 * a.hp / a.maxHp));
  a.hp = 1; assert.equal(P(a, f, 'eruption'), 1);
});

test('wake-up slap and smelling salts double on sleep / paralysis and cure it', () => {
  const { s, a, f } = duel('machop', 'geodude');
  assert.equal(P(a, f, 'wake-up-slap'), 60);
  f.status = 'sleep'; f.statusTurns = 3;
  assert.equal(P(a, f, 'wake-up-slap'), 120);
  applyMove(s, a.id, 'wake-up-slap', f.id, hit);
  assert.equal(f.status, null);
  const b = duel('rattata', 'onix');
  b.f.status = 'paralysis';
  assert.equal(P(b.a, b.f, 'smelling-salts'), 120);
  assert.equal(P(b.a, b.f, 'wake-up-slap'), 60, 'only its own status');
  applyMove(b.s, b.a.id, 'smelling-salts', b.f.id, hit);
  assert.equal(b.f.status, null);
});

test('assurance ×1.5 on a target already hurt this phase', () => {
  const { s, a, f } = duel('houndour', 'onix');
  assert.equal(P(a, f, 'assurance'), 50);
  applyMove(s, a.id, 'tackle', f.id, hit);
  assert.equal(P(a, f, 'assurance'), 75);
  endPhase(s, () => 0.9); endPhase(s, () => 0.9);
  assert.equal(P(a, f, 'assurance'), 50, 'next phase forgets');
});

test('revenge and avalanche ×1.5 against whoever last hit the user, across turns', () => {
  const { s, a, f } = duel('machop', 'onix');
  assert.equal(P(a, f, 'revenge'), 60);
  applyMove(s, f.id, 'tackle', a.id, hit);
  endPhase(s, () => 0.9); endPhase(s, () => 0.9);
  assert.equal(P(a, f, 'revenge'), 90);
  assert.equal(P(a, f, 'avalanche'), 90);
  assert.equal(P(a, s.units[2], 'revenge'), 60, 'someone else');
});

test('punishment: 60 + 20 per positive stage on the target, at most 200', () => {
  const { a, f } = duel('houndour', 'onix');
  assert.equal(P(a, f, 'punishment'), 60);
  f.stages.atk = 2; f.stages.spe = 1; f.stages.def = -2;
  assert.equal(P(a, f, 'punishment'), 120);
  f.stages.spa = 6; f.stages.eva = 6;
  assert.equal(P(a, f, 'punishment'), 200);
});

test('weather ball: normal 50; rain water, sun fire, sand rock, hail ice at 100', () => {
  const { a } = duel('castform', 'onix');
  const wb = MOVES['weather-ball'];
  assert.deepEqual([situationalMove(a, wb, null).type, situationalMove(a, wb, null).power], ['normal', 50]);
  for (const [w, t] of [['rain', 'water'], ['sun', 'fire'], ['sand', 'rock'], ['hail', 'ice']]) {
    const m = situationalMove(a, wb, w);
    assert.deepEqual([m.type, m.power], [t, 100], w);
  }
});

test('solar beam is halved in rain, sand and hail', () => {
  const { a } = duel('oddish', 'onix');
  const sb = MOVES['solar-beam'];
  assert.equal(situationalMove(a, sb, null).power, 120);
  assert.equal(situationalMove(a, sb, 'sun').power, 120);
  for (const w of ['rain', 'sand', 'hail']) assert.equal(situationalMove(a, sb, w).power, 60, w);
});

test('weather ball really hits as its weather type (rain water vs a rock/ground foe)', () => {
  const dry = duel('castform', 'geodude'); const wet = duel('castform', 'geodude');
  wet.s.weather = 'rain';
  const d0 = applyMove(dry.s, dry.a.id, 'weather-ball', dry.f.id, hit).hits[0];
  const d1 = applyMove(wet.s, wet.a.id, 'weather-ball', wet.f.id, hit).hits[0];
  assert.ok(d1.typeMult >= 4 && d1.damage > d0.damage * 4, `${d0.damage} → ${d1.damage}`);
});

test('wake-up slap reports who woke up (for the 잠에서 깨어났다 line)', () => {
  const { s, a, f } = duel('machop', 'geodude');
  f.status = 'sleep'; f.statusTurns = 3;
  assert.deepEqual(applyMove(s, a.id, 'wake-up-slap', f.id, hit).woken, [{ unitId: f.id, ailment: 'sleep' }]);
});

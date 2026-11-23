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

// ---- 2차: 발동 시점과 사용 조건 ----
import { moveBlock } from '../src/core/volatile.js';
import { moveBudget } from '../src/core/status.js';
const round2 = (s) => { endPhase(s, () => 0.9); endPhase(s, () => 0.9); };

test('snore fails while awake', () => {
  const { s, a, f } = duel('snorlax', 'onix');
  a.moves = ['snore', 'tackle'];
  assert.equal(moveBlock(a, 'snore'), 'awake');
  assert.equal(applyMove(s, a.id, 'snore', f.id, hit).blocked, 'awake');
});

test('asleep with snore: cannot move, may only snore', () => {
  const { s, a, f } = duel('snorlax', 'onix');
  a.moves = ['snore', 'tackle'];
  a.status = 'sleep'; a.statusTurns = 3;
  round2(s);
  assert.equal(a.status, 'sleep');
  assert.equal(a.acted, false); assert.equal(moveBudget(a), 0);
  assert.equal(moveBlock(a, 'tackle'), 'asleep'); assert.equal(moveBlock(a, 'snore'), null);
  const before = f.hp;
  applyMove(s, a.id, 'snore', f.id, hit);
  assert.ok(f.hp < before);
  const b = duel('snorlax', 'onix'); b.a.moves = ['tackle']; b.a.status = 'sleep'; b.a.statusTurns = 3;
  round2(b.s);
  assert.equal(b.a.acted, true, 'no snore = sleeps through');
});

test('charge: special defense +1 and the next electric attack hits twice as hard', () => {
  const plain = duel('pikachu', 'onix', { foe: { types: ['normal'] } }), charged = duel('pikachu', 'onix', { foe: { types: ['normal'] } });
  applyMove(charged.s, charged.a.id, 'charge', charged.a.id, hit);
  assert.equal(charged.a.stages.spd, 1);
  const r0 = applyMove(plain.s, plain.a.id, 'thunder-shock', plain.f.id, () => 0.5).hits[0];
  const r1 = applyMove(charged.s, charged.a.id, 'thunder-shock', charged.f.id, () => 0.5).hits[0];
  assert.ok(r1.damage >= r0.damage * 2 - 2 && r1.damage <= r0.damage * 2 + 2, `${r0.damage} → ${r1.damage}`);
  assert.ok(!charged.a.charged, 'used up');
});

test('charge wears off after the next own phase', () => {
  const { s, a } = duel('pikachu', 'onix');
  applyMove(s, a.id, 'charge', a.id, hit);
  round2(s); assert.ok(a.charged, 'still on in the next own phase');
  round2(s); assert.ok(!a.charged);
});

test('focus punch: focuses first, then strikes; a hit while focusing breaks it', () => {
  const { s, a, f } = duel('machop', 'onix');
  const r = applyMove(s, a.id, 'focus-punch', f.id, hit);
  assert.ok(r.charged); assert.equal(a.charging.moveId, 'focus-punch');
  const hitBack = applyMove(s, f.id, 'tackle', a.id, hit);
  assert.equal(a.charging, null);
  assert.deepEqual(hitBack.lostFocus, [a.id]);
  const b = duel('machop', 'onix');
  applyMove(b.s, b.a.id, 'focus-punch', b.f.id, hit);
  const before = b.f.hp;
  applyMove(b.s, b.a.id, 'focus-punch', b.f.id, hit);
  assert.ok(b.f.hp < before, 'strikes when undisturbed');
});

test('future sight lands two turns later on the chosen pokemon wherever it went', () => {
  const { s, a, f } = duel('abra', 'rattata');
  const before = f.hp;
  const r = applyMove(s, a.id, 'future-sight', f.id, hit);
  assert.equal(f.hp, before); assert.deepEqual(r.foreseen, { unitId: f.id, moveId: 'future-sight' });
  f.x = 4; f.y = 4;
  round2(s); assert.equal(f.hp, before, 'not yet after one turn');
  endPhase(s, () => 0.5); endPhase(s, () => 0.5);
  const ev = s.log.statusEvents.find((e) => e.kind === 'foresight');
  assert.ok(ev && ev.unitId === f.id && ev.damage > 0, JSON.stringify(s.log.statusEvents));
  assert.ok(!s.units.includes(f) || f.hp < before);
  assert.equal((s.delayed ?? []).length, 0);
});

test('doom desire knocks out and credits the user', () => {
  const { s, a, f } = duel('jirachi', 'rattata');
  applyMove(s, a.id, 'doom-desire', f.id, hit);
  f.hp = 1;
  round2(s); endPhase(s, () => 0.5); endPhase(s, () => 0.5);
  assert.ok(!s.units.includes(f));
  assert.ok(s.log.defeated.some((d) => d.species === 'rattata'));
});

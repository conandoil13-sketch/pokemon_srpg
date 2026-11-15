import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { critRate } from '../src/core/abilities.js';
import { moveBudget } from '../src/core/status.js';
import { moveBlock, moveFor } from '../src/core/volatile.js';
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

// ---- Task 2: 나에게 쓰는 기술 ----
const trio = (prot) => { // 아군 둘(1,1)(3,1) 사이 적(2,1) 지진
  const ms = [newMember('pikachu', 40, createRng(1)), newMember('chimchar', 40, createRng(2))];
  const map = { tiles: Array.from({ length: 6 }, () => '.'.repeat(6)), allySlots: [{ x: 1, y: 1 }, { x: 3, y: 1 }], enemies: [{ species: 'geodude', x: 2, y: 1, level: 40 }] };
  const s = createBattle(map, ms);
  const [a, b, f] = s.units;
  if (prot) applyMove(s, a.id, 'protect', a.id, hit);
  endPhase(s, () => 0.9);
  return { s, a, b, f, r: applyMove(s, f.id, 'earthquake', { self: true }, () => 0.3) };
};

test('protect blocks attacks and status moves until its side starts again', () => {
  const { s, a, f } = duel('pikachu', 'pidgey', { foe: { moves: ['tackle', 'taunt'] } });
  assert.deepEqual(applyMove(s, a.id, 'protect', a.id, hit).effects[0], { unitId: a.id, effect: 'protect', ok: true });
  endPhase(s);
  const hp = a.hp;
  const r = applyMove(s, f.id, 'tackle', a.id, hit);
  assert.equal(r.hits[0].protected, true);
  assert.equal(r.hits[0].damage, 0);
  assert.equal(a.hp, hp);
  f.acted = false;
  const r2 = applyMove(s, f.id, 'taunt', a.id, hit);
  assert.deepEqual(r2.protectedIds, [a.id]);
  assert.equal(a.taunt, 0);
  endPhase(s); // 아군 차례 시작
  assert.equal(a.guard, null);
});

test('protect area: only the guarded unit is spared', () => {
  const p = trio(true), n = trio(false);
  const ha = p.r.hits.find((h) => h.unitId === p.a.id), hb = p.r.hits.find((h) => h.unitId === p.b.id);
  assert.equal(ha.protected, true);
  assert.equal(ha.damage, 0);
  assert.ok(hb.damage > 0);
  assert.equal(hb.damage, n.r.hits.find((h) => h.unitId === n.b.id).damage); // ×0.75 그대로
});

test('protect or endure twice in a row fails', () => {
  const { s, a } = duel('pikachu', 'pidgey', { fx: 8, fy: 8 });
  applyMove(s, a.id, 'protect', a.id, hit);
  round(s);
  assert.deepEqual(applyMove(s, a.id, 'detect', a.id, hit).effects[0], { unitId: a.id, effect: 'protect', ok: false, reason: 'chain' });
  round(s);
  assert.equal(applyMove(s, a.id, 'protect', a.id, hit).effects[0].ok, true);
  round(s);
  assert.equal(applyMove(s, a.id, 'endure', a.id, hit).effects[0].reason, 'chain');
});

test('endure keeps 1 hp against attacks only', () => {
  const { s, a, f } = duel('pikachu', 'machamp', { foeLevel: 80 });
  applyMove(s, a.id, 'endure', a.id, hit);
  endPhase(s);
  const r = applyMove(s, f.id, 'cross-chop', a.id, hit);
  assert.equal(a.hp, 1);
  assert.equal(r.hits[0].endured, true);
  const m = duel('pikachu', 'beedrill', { foeLevel: 90 });
  applyMove(m.s, m.a.id, 'endure', m.a.id, hit);
  endPhase(m.s);
  applyMove(m.s, m.f.id, 'pin-missile', m.a.id, hit);
  assert.equal(m.a.hp, 1);
  const p = duel('pikachu', 'pidgey', { fx: 8, fy: 8 });
  applyMove(p.s, p.a.id, 'endure', p.a.id, hit);
  p.a.status = 'poison'; p.a.hp = 1;
  endPhase(p.s);
  assert.ok(!p.s.units.includes(p.a)); // 독으로는 쓰러진다
});

test('rest heals fully, cures, sleeps exactly 2 turns and uses a heal charge', () => {
  const { s, a } = duel('snorlax', 'pidgey', { fx: 8, fy: 8 });
  a.hp = Math.floor(a.maxHp / 2); a.status = 'burn';
  assert.equal(applyMove(s, a.id, 'rest', a.id, hit).effects[0].ok, true);
  assert.equal(a.hp, a.maxHp);
  assert.equal(a.status, 'sleep');
  assert.equal(a.statusTurns, 2);
  assert.equal(a.healUses, 1);
  round(s); assert.equal(a.acted, true);
  round(s); assert.equal(a.acted, true);
  round(s); assert.equal(a.acted, false);
  const full = duel('snorlax', 'pidgey', { fx: 8, fy: 8 });
  assert.equal(applyMove(full.s, full.a.id, 'rest', full.a.id, hit).effects[0].reason, 'full');
  const used = duel('snorlax', 'pidgey', { fx: 8, fy: 8, ally: { healUses: 0 } });
  used.a.hp = 1;
  assert.equal(applyMove(used.s, used.a.id, 'rest', used.a.id, hit).effects[0].reason, 'uses');
  const ins = duel('snorlax', 'pidgey', { fx: 8, fy: 8, ally: { ability: 'insomnia' } });
  ins.a.hp = 1;
  assert.equal(applyMove(ins.s, ins.a.id, 'rest', ins.a.id, hit).effects[0].reason, 'immune');
});

test('aqua ring and ingrain heal 1/16 each own phase end, ingrain roots', () => {
  const { s, a } = duel('squirtle', 'pidgey', { fx: 8, fy: 8 });
  a.hp = 10;
  applyMove(s, a.id, 'aqua-ring', a.id, hit);
  a.acted = false;
  applyMove(s, a.id, 'ingrain', a.id, hit);
  assert.equal(moveBudget(a), 0);
  endPhase(s);
  assert.equal(a.hp, 10 + 2 * Math.max(1, Math.floor(a.maxHp / 16)));
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'aquaRing'));
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'ingrain'));
});

test('curse: ghost pays half hp and curses, others boost', () => {
  const g = duel('haunter', 'snorlax', { foe: { hp: 400, maxHp: 400 } });
  const hp = g.a.hp;
  assert.equal(applyMove(g.s, g.a.id, 'curse', g.f.id, hit).effects[0].ok, true);
  assert.equal(g.a.hp, hp - Math.floor(g.a.maxHp / 2));
  assert.equal(g.f.cursed, true);
  round(g.s);
  assert.equal(g.f.hp, 400 - 100);
  const low = duel('haunter', 'snorlax');
  low.a.hp = Math.floor(low.a.maxHp / 2);
  applyMove(low.s, low.a.id, 'curse', low.f.id, hit);
  assert.ok(!low.s.units.includes(low.a));
  const n = duel('snorlax', 'pidgey', { fx: 8, fy: 8 });
  assert.equal(moveFor(n.a, 'curse').kind, 'self');
  assert.equal(moveFor(g.a, 'curse').kind, 'enemy');
  applyMove(n.s, n.a.id, 'curse', n.a.id, hit);
  assert.deepEqual([n.a.stages.spe, n.a.stages.atk, n.a.stages.def], [-1, 1, 1]);
});

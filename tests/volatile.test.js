import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { critRate, typeEffect, has } from '../src/core/abilities.js';
import { planEnemyAction } from '../src/core/ai.js';
import { accuracyShift } from '../src/core/stages.js';
import { typeMultiplier } from '../src/data/types.js';
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

// ---- Task 3: 상대·아군에게 ----
test('yawn sleeps the target at its next phase end if within 3 tiles', () => {
  const { s, a, f } = duel('slowpoke', 'pidgey', { fx: 3, fy: 1 }); // 사거리 2 에서 걸고
  assert.equal(applyMove(s, a.id, 'yawn', f.id, hit).effects[0].ok, true);
  endPhase(s, () => 0.9); // 아군 끝: 아직
  f.x = 4; // 거리 3 까지 물러나도 잠든다
  assert.equal(f.status, null);
  endPhase(s, () => 0.9); // 적 끝
  assert.equal(f.status, 'sleep');
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'yawnSleep' && e.unitId === f.id));
  const far = duel('slowpoke', 'pidgey', { fx: 3, fy: 1 });
  applyMove(far.s, far.a.id, 'yawn', far.f.id, hit);
  endPhase(far.s, () => 0.9);
  far.f.x = 5; // 거리 4
  endPhase(far.s, () => 0.9);
  assert.equal(far.f.status, null);
  assert.equal(far.f.yawnBy, null);
  assert.ok(far.s.log.statusEvents.some((e) => e.kind === 'yawnFizzle'));
});

test('yawn fizzles if the user faints first or the target gets another status', () => {
  const g = duel('slowpoke', 'pidgey', { fx: 3, fy: 1 });
  applyMove(g.s, g.a.id, 'yawn', g.f.id, hit);
  endPhase(g.s, () => 0.9);
  g.s.units = g.s.units.filter((u) => u !== g.a);
  endPhase(g.s, () => 0.9);
  assert.equal(g.f.status, null);
  assert.equal(g.f.yawnBy, null);
  const p = duel('slowpoke', 'pidgey', { fx: 3, fy: 1 });
  applyMove(p.s, p.a.id, 'yawn', p.f.id, hit);
  p.f.status = 'poison';
  endPhase(p.s, () => 0.9); endPhase(p.s, () => 0.9);
  assert.equal(p.f.status, 'poison');
  assert.equal(p.f.yawnBy, null);
  const im = duel('slowpoke', 'pidgey', { fx: 3, fy: 1, foe: { ability: 'insomnia' } });
  assert.equal(applyMove(im.s, im.a.id, 'yawn', im.f.id, hit).effects[0].reason, 'immune');
  const st = duel('slowpoke', 'pidgey', { fx: 3, fy: 1, foe: { status: 'burn' } });
  assert.equal(applyMove(st.s, st.a.id, 'yawn', st.f.id, hit).effects[0].ok, false);
});

test('leech seed drains 1/8 to the seeder, grass is immune', () => {
  const { s, a, f } = duel('bulbasaur', 'snorlax', { foe: { hp: 400, maxHp: 400 } });
  assert.equal(applyMove(s, a.id, 'leech-seed', f.id, hit).effects[0].ok, true);
  a.hp = 10;
  round(s);
  assert.equal(f.hp, 350);
  assert.equal(a.hp, Math.min(a.maxHp, 60));
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'leech' && e.damage === 50));
  a.acted = false;
  assert.equal(applyMove(s, a.id, 'leech-seed', f.id, hit).effects[0].reason, 'already');
  s.units = s.units.filter((u) => u !== a);
  endPhase(s); endPhase(s);
  assert.equal(f.hp, 300); // 쓴 쪽이 없어도 빼앗긴다
  const gr = duel('bulbasaur', 'oddish');
  assert.equal(applyMove(gr.s, gr.a.id, 'leech-seed', gr.f.id, hit).effects[0].reason, 'immune');
  const mg = duel('bulbasaur', 'clefairy', { foe: { ability: 'magic-guard' } });
  applyMove(mg.s, mg.a.id, 'leech-seed', mg.f.id, hit);
  const hp = mg.f.hp;
  round(mg.s);
  assert.equal(mg.f.hp, hp);
});

test('helping hand boosts the ally next attack once by 1.5x', () => {
  const ms = [newMember('pikachu', 40, createRng(1)), newMember('machop', 40, createRng(2))];
  const map = { tiles: Array.from({ length: 6 }, () => '.'.repeat(6)), allySlots: [{ x: 1, y: 1 }, { x: 1, y: 2 }], enemies: [{ species: 'snorlax', x: 2, y: 2, level: 60 }] };
  const make = () => { const s = createBattle(map, ms); const [a, b, f] = s.units; f.hp = f.maxHp = 9999; return { s, a, b, f }; };
  const base = make();
  const plain = applyMove(base.s, base.b.id, 'karate-chop', base.f.id, () => 0.5).damage;
  const t = make();
  assert.equal(applyMove(t.s, t.a.id, 'helping-hand', t.b.id, hit).effects[0].ok, true);
  const boosted = applyMove(t.s, t.b.id, 'karate-chop', t.f.id, () => 0.5).damage;
  assert.ok(Math.abs(boosted - Math.floor(plain * 1.5)) <= 1, `${plain} → ${boosted}`);
  t.b.acted = false;
  assert.equal(applyMove(t.s, t.b.id, 'karate-chop', t.f.id, () => 0.5).damage, plain);
  const late = make();
  late.b.acted = true;
  assert.equal(applyMove(late.s, late.a.id, 'helping-hand', late.b.id, hit).effects[0].reason, 'already');
  const clear = make();
  applyMove(clear.s, clear.a.id, 'helping-hand', clear.b.id, hit);
  endPhase(clear.s);
  assert.equal(clear.b.helped, false);
});

test('foresight lets normal and fighting hit ghosts and ignores evasion boosts', () => {
  const { s, a, f } = duel('meowth', 'gastly');
  assert.equal(typeEffect(a, f, MOVES.tackle), 0);
  applyMove(s, a.id, 'foresight', f.id, hit);
  assert.equal(typeEffect(a, f, MOVES.tackle), 1);
  assert.equal(typeEffect(a, f, MOVES['karate-chop']), typeMultiplier('fighting', ['poison']));
  f.stages.eva = 2;
  assert.equal(accuracyShift(a, f), 0);
  f.stages.eva = -1;
  assert.ok(accuracyShift(a, f) > 0);
  const m = duel('abra', 'murkrow');
  assert.equal(typeEffect(m.a, m.f, MOVES.confusion), 0);
  applyMove(m.s, m.a.id, 'miracle-eye', m.f.id, hit);
  assert.equal(typeEffect(m.a, m.f, MOVES.confusion), typeMultiplier('psychic', ['flying']));
});

// ---- Task 4: 방해·견제 나머지 ----
test('encore locks the last move for 3 turns, fails without one', () => {
  const { s, a, f } = duel('clefairy', 'pidgey');
  assert.equal(applyMove(s, a.id, 'encore', f.id, hit).effects[0].reason, 'noLast');
  f.lastMove = 'tackle'; a.acted = false;
  assert.equal(applyMove(s, a.id, 'encore', f.id, hit).effects[0].ok, true);
  assert.equal(moveBlock(f, 'growl'), 'encore');
  assert.equal(moveBlock(f, 'tackle'), null);
  round(s); round(s); round(s);
  assert.equal(moveBlock(f, 'growl'), null);
});

test('encored move that cannot be used leaves only waiting', () => {
  const { s, a, f } = duel('clefairy', 'chansey', { foe: { moves: ['pound', 'soft-boiled'], lastMove: 'soft-boiled', healUses: 0 } });
  applyMove(s, a.id, 'encore', f.id, hit);
  endPhase(s);
  f.hp = 1;
  const plan = planEnemyAction(s, f);
  assert.equal(plan.attack, null);
});

test('disable seals the last move 3 turns; torment forbids repeats 3 turns', () => {
  const { s, a, f } = duel('gastly', 'pidgey');
  f.lastMove = 'gust';
  applyMove(s, a.id, 'disable', f.id, hit);
  assert.equal(moveBlock(f, 'gust'), 'disable');
  assert.equal(moveBlock(f, 'tackle'), null);
  round(s); round(s); round(s);
  assert.equal(moveBlock(f, 'gust'), null);
  const t = duel('murkrow', 'pidgey');
  t.a.acted = false;
  applyMove(t.s, t.a.id, 'torment', t.f.id, hit);
  t.f.lastMove = 'tackle';
  assert.equal(moveBlock(t.f, 'tackle'), 'torment');
  assert.equal(moveBlock(t.f, 'gust'), null);
});

test('heal block stops every heal source for 3 turns', () => {
  const blockOn = (u) => { u.healBlock = 3; };
  const h = duel('chansey', 'pidgey', { fx: 8, fy: 8 });
  blockOn(h.a); h.a.hp = 10;
  assert.equal(moveBlock(h.a, 'soft-boiled'), 'healBlock');
  assert.equal(moveBlock(h.a, 'rest'), 'healBlock');
  assert.equal(applyMove(h.s, h.a.id, 'soft-boiled', h.a.id, hit).blocked, 'healBlock');
  const d = duel('bulbasaur', 'snorlax', { ally: { hp: 10 }, foe: { hp: 999, maxHp: 999 } });
  blockOn(d.a);
  assert.equal(applyMove(d.s, d.a.id, 'giga-drain', d.f.id, hit).drained, 0);
  assert.equal(d.a.hp, 10);
  const r = duel('squirtle', 'pidgey', { fx: 8, fy: 8, ally: { hp: 10, aquaRing: true, rooted: true } });
  blockOn(r.a);
  endPhase(r.s);
  assert.equal(r.a.hp, 10);
  const l = duel('bulbasaur', 'snorlax', { ally: { hp: 10 }, foe: { hp: 400, maxHp: 400 } });
  applyMove(l.s, l.a.id, 'leech-seed', l.f.id, hit);
  blockOn(l.a);
  round(l.s);
  assert.equal(l.f.hp, 350);
  assert.equal(l.a.hp, 10);
  const w = duel('lotad', 'pidgey', { fx: 8, fy: 8, ally: { hp: 10, ability: 'rain-dish' } });
  w.s.weather = 'rain'; blockOn(w.a);
  endPhase(w.s);
  assert.equal(w.a.hp, 10);
  const p = duel('shroomish', 'pidgey', { fx: 8, fy: 8, ally: { hp: 10, ability: 'poison-heal', status: 'poison' } });
  blockOn(p.a);
  endPhase(p.s);
  assert.equal(p.a.hp, 10);
  const t = duel('abra', 'pidgey');
  assert.equal(applyMove(t.s, t.a.id, 'heal-block', t.f.id, hit).effects[0].ok, true);
  assert.equal(t.f.healBlock, 3);
});

test('swagger and flatter confuse even at max stage', () => {
  const { s, a, f } = duel('murkrow', 'pidgey');
  assert.equal(MOVES.swagger.learnable, true);
  assert.equal(MOVES.flatter.learnable, true);
  f.stages.atk = 6;
  applyMove(s, a.id, 'swagger', f.id, hit);
  assert.ok(f.confusion > 0);
});

test('gastro acid turns the ability off; worry seed makes it insomnia', () => {
  const g = duel('grimer', 'geodude', { foe: { ability: 'sturdy' } });
  assert.equal(applyMove(g.s, g.a.id, 'gastro-acid', g.f.id, hit).effects[0].ok, true);
  assert.equal(has(g.f, 'sturdy'), false);
  const w = duel('oddish', 'pidgey', { foe: { status: 'sleep', statusTurns: 2 } });
  applyMove(w.s, w.a.id, 'worry-seed', w.f.id, hit);
  assert.equal(w.f.ability, 'insomnia');
  assert.equal(w.f.status, null);
  const tr = duel('oddish', 'slakoth', { foe: { ability: 'truant' } });
  assert.equal(applyMove(tr.s, tr.a.id, 'worry-seed', tr.f.id, hit).effects[0].reason, 'immune');
});

test('destiny bond takes the attacker down, once, not a boss', () => {
  const { s, a, f } = duel('gastly', 'houndour', { level: 10, foeLevel: 80 });
  assert.equal(applyMove(s, a.id, 'destiny-bond', a.id, hit).effects[0].ok, true);
  endPhase(s);
  const r = applyMove(s, f.id, 'bite', a.id, hit);
  assert.ok(!s.units.includes(a));
  assert.ok(!s.units.includes(f));
  assert.deepEqual(r.bond, [f.id]);
  const x = duel('gastly', 'voltorb', { level: 10, foeLevel: 80 });
  applyMove(x.s, x.a.id, 'destiny-bond', x.a.id, hit);
  endPhase(x.s);
  applyMove(x.s, x.f.id, 'self-destruct', { self: true }, hit);
  assert.ok(!x.s.units.includes(x.f));
  assert.ok(x.s.log.defeated.length <= 1);
  const b = duel('gastly', 'houndour', { level: 10, foeLevel: 80, foe: { boss: true } });
  b.s.bossFloor = true;
  applyMove(b.s, b.a.id, 'destiny-bond', b.a.id, hit);
  endPhase(b.s);
  applyMove(b.s, b.f.id, 'bite', b.a.id, hit);
  assert.ok(b.s.units.includes(b.f));
  const c = duel('gastly', 'pidgey', { fx: 8, fy: 8 });
  applyMove(c.s, c.a.id, 'destiny-bond', c.a.id, hit);
  round(c.s);
  assert.equal(applyMove(c.s, c.a.id, 'destiny-bond', c.a.id, hit).effects[0].reason, 'chain');
  const p = duel('gastly', 'pidgey', { fx: 3, fy: 1 });
  applyMove(p.s, p.a.id, 'destiny-bond', p.a.id, hit);
  p.a.status = 'poison'; p.a.hp = 1;
  endPhase(p.s);
  assert.ok(p.s.units.includes(p.f));
});

test('review fix: gastro acid turns off abilities read directly (levitate, insomnia, static)', () => {
  const g = duel('grimer', 'gastly', { foe: { ability: 'levitate', hp: 999, maxHp: 999 } });
  applyMove(g.s, g.a.id, 'gastro-acid', g.f.id, hit);
  g.a.acted = false;
  assert.ok(applyMove(g.s, g.a.id, 'mud-slap', g.f.id, hit).damage > 0);
  const i = duel('slowpoke', 'hoothoot', { fx: 3, fy: 1, foe: { ability: 'insomnia' } });
  applyMove(i.s, i.a.id, 'gastro-acid', i.f.id, hit);
  i.a.acted = false;
  assert.equal(applyMove(i.s, i.a.id, 'yawn', i.f.id, hit).effects[0].ok, true);
  const p = duel('grimer', 'pikachu', { foe: { ability: 'static' } });
  applyMove(p.s, p.a.id, 'gastro-acid', p.f.id, hit);
  assert.equal(p.f.ability, null);
  assert.equal(p.f.suppressedAbility, 'static');
});

test('review fix: heal block stops water absorb healing', () => {
  const { s, a, f } = duel('squirtle', 'vaporeon', { foe: { ability: 'water-absorb', hp: 10, healBlock: 3 } });
  applyMove(s, a.id, 'water-gun', f.id, hit);
  assert.equal(f.hp, 10);
});

// ---- 속박기 ----
import { BIND_TURNS, BIND_MOVES } from '../src/core/volatile.js';
const miss = () => 0.99;
test('a binding move holds the target in place for 3 turns and chips 1/8 each phase end', () => {
  const { s, a, f } = duel('ekans', 'geodude');
  assert.equal(BIND_MOVES.size, 7);
  const r = applyMove(s, a.id, 'wrap', f.id, hit);
  assert.deepEqual(r.bound, [{ unitId: f.id, moveId: 'wrap' }]);
  assert.equal(f.bound.turns, BIND_TURNS);
  assert.equal(f.bound.reach, 1);
  assert.equal(moveBudget(f), 0);
  const hp = f.hp;
  round(s);
  assert.equal(hp - f.hp, Math.max(1, Math.floor(f.maxHp / 8)));
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'bind' && e.unitId === f.id && e.moveId === 'wrap'));
  round(s); assert.ok(f.bound);
  round(s);
  assert.equal(f.bound, null);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'bindEnd' && e.unitId === f.id));
  assert.ok(moveBudget(f) > 0);
});
test('a miss or protect does not bind; an already bound target keeps its first binder', () => {
  const { s, a, f } = duel('ekans', 'geodude');
  assert.deepEqual(applyMove(s, a.id, 'wrap', f.id, miss).bound ?? [], []);
  assert.equal(f.bound ?? null, null);
  applyMove(s, f.id, 'protect', f.id, hit);
  applyMove(s, a.id, 'wrap', f.id, hit);
  assert.equal(f.bound ?? null, null);
  round(s);
  applyMove(s, a.id, 'wrap', f.id, hit);
  f.bound.turns = 1;
  assert.deepEqual(applyMove(s, a.id, 'bind', f.id, hit).bound, []);
  assert.equal(f.bound.moveId, 'wrap');
  assert.equal(f.bound.turns, 1);
});
test('the binder fainting frees the target at once', () => {
  const { s, a, f } = duel('ekans', 'geodude');
  applyMove(s, a.id, 'wrap', f.id, hit);
  a.hp = 1;
  applyMove(s, f.id, 'tackle', a.id, hit);
  assert.ok(!s.units.includes(a));
  assert.equal(f.bound, null);
  assert.ok(moveBudget(f) > 0);
});
test('a ranged bind holds at its reach and lets go out of reach at the target phase start', () => {
  const { s, a, f } = duel('charmander', 'geodude', { fx: 3, fy: 1 }); // 거리 2
  applyMove(s, a.id, 'fire-spin', f.id, hit);
  assert.equal(f.bound.reach, 2);
  endPhase(s, () => 0.9); // 아군 끝 → 적 페이즈 시작: 거리 2 그대로
  assert.ok(f.bound);
  endPhase(s, () => 0.9);
  a.x = 0; // 거리 3
  endPhase(s, () => 0.9); // 적 페이즈 시작
  assert.equal(f.bound, null);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'bindEnd' && e.unitId === f.id));
});
test('magic guard takes no bind damage but still cannot move', () => {
  const { s, a, f } = duel('ekans', 'geodude', { foe: { ability: 'magic-guard' } });
  applyMove(s, a.id, 'wrap', f.id, hit);
  const hp = f.hp; round(s);
  assert.equal(f.hp, hp);
  assert.equal(moveBudget(f), 0);
});
test('bind damage that faints the target leaves no bind behind', () => {
  const { s, a, f } = duel('ekans', 'geodude');
  applyMove(s, a.id, 'wrap', f.id, hit);
  f.hp = 1; round(s);
  assert.ok(!s.units.includes(f));
});

test('lethal bind damage is not undone by ingrain or aqua ring healing', () => {
  const { s, a, f } = duel('ekans', 'geodude');
  applyMove(s, a.id, 'wrap', f.id, hit);
  f.rooted = true; f.hp = 1;
  round(s);
  assert.ok(!s.units.includes(f));
});
test('pushing the binder out of reach frees the bound unit at once, with a release line', () => {
  const { s, a, f } = duel('ekans', 'geodude');
  applyMove(s, a.id, 'wrap', f.id, hit);
  const r = applyMove(s, f.id, 'whirlwind', a.id, hit); // 묶인 쪽이 묶은 쪽을 날려버림
  assert.ok(r.pushed);
  assert.equal(f.bound, null);
  assert.ok(moveBudget(f) > 0);
  assert.deepEqual(r.unbound, [{ unitId: f.id, moveId: 'wrap' }]);
});
test('a binder knocked out by rough skin recoil reports no bind', () => {
  const { s, a, f } = duel('ekans', 'geodude', { foe: { ability: 'rough-skin' } });
  a.hp = 1;
  const r = applyMove(s, a.id, 'wrap', f.id, hit);
  assert.ok(!s.units.includes(a));
  assert.deepEqual(r.bound, []);
});

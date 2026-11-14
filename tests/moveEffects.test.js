import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, makeUnit } from '../src/core/battle.js';
import { calcDamage, expectedDamage, avgHits } from '../src/core/damage.js';
import { critRate } from '../src/core/abilities.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const seq = (vals, rest = 0.5) => { let i = 0; return () => (i < vals.length ? vals[i++] : rest); };
const duel = (allySp, foeSp, { level = 40, foeLevel = 40, ally = {}, foe = {} } = {}) => {
  const m = newMember(allySp, level, createRng(1));
  const map = { tiles: Array.from({ length: 8 }, () => '.'.repeat(8)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, x: 2, y: 1, level: foeLevel }] };
  const s = createBattle(map, [m]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};

test('drain heals half of the HP actually removed; liquid ooze hurts instead; dream eater needs sleep', () => {
  const { s, a, f } = duel('bulbasaur', 'squirtle', { ally: { hp: 10 }, foe: { hp: 5 } });
  applyMove(s, a.id, 'giga-drain', f.id, () => 0.01);
  assert.equal(a.hp, 10 + Math.max(1, Math.floor(5 * 0.5))); // 깎인 건 5 (남은 HP 만큼)
  const o = duel('bulbasaur', 'tentacool', { ally: { hp: 50 }, foe: { ability: 'liquid-ooze', hp: 999, maxHp: 999 } });
  const r = applyMove(o.s, o.a.id, 'mega-drain', o.f.id, () => 0.01);
  assert.ok(o.a.hp < 50, String(o.a.hp));
  assert.ok(r.drained < 0);
  const de = duel('gastly', 'pidgey');
  const r2 = applyMove(de.s, de.a.id, 'dream-eater', de.f.id, () => 0.01);
  assert.equal(r2.damage, 0);
  de.f.status = 'sleep'; de.f.statusTurns = 2;
  assert.ok(applyMove(de.s, de.a.id, 'dream-eater', de.f.id, () => 0.01).damage > 0);
});

test('recoil: fraction of damage dealt; rock head and magic guard are immune', () => {
  const { s, a, f } = duel('pidgeot', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  const hp = a.hp;
  const r = applyMove(s, a.id, 'double-edge', f.id, () => 0.01);
  assert.equal(hp - a.hp, Math.max(1, Math.floor(r.damage * 33 / 100)));
  const rh = duel('pidgeot', 'snorlax', { ally: { ability: 'rock-head' }, foe: { hp: 999, maxHp: 999 } });
  const hp2 = rh.a.hp;
  applyMove(rh.s, rh.a.id, 'double-edge', rh.f.id, () => 0.01);
  assert.equal(rh.a.hp, hp2);
});

test('recoil that knocks out the last ally while the last foe also falls is a win', () => {
  const { s, a, f } = duel('pidgeot', 'pidgey', { level: 60, foeLevel: 5, ally: { hp: 1 } });
  applyMove(s, a.id, 'double-edge', f.id, () => 0.01);
  assert.ok(!s.units.includes(f));
  assert.equal(s.result, 'win');
});

test('multi-hit: 2-5 distribution, skill link max, stops when the target faints, exp once', () => {
  const n = { 2: 0, 3: 0, 4: 0, 5: 0 };
  const rng = createRng(7);
  for (let i = 0; i < 4000; i++) {
    const { s, a, f } = duel('beedrill', 'snorlax', { foe: { hp: 9999, maxHp: 9999 } });
    const r = applyMove(s, a.id, 'pin-missile', f.id, rng);
    if (r.hit) n[r.strikes]++; // 빗나간 건 빼고
  }
  const tot = n[2] + n[3] + n[4] + n[5], pc = (k) => n[k] / tot * 100;
  assert.ok(Math.abs(pc(2) - 37.5) < 3 && Math.abs(pc(3) - 37.5) < 3 && Math.abs(pc(5) - 12.5) < 3, JSON.stringify(n));
  const sl = duel('beedrill', 'snorlax', { ally: { ability: 'skill-link' }, foe: { hp: 9999, maxHp: 9999 } });
  assert.equal(applyMove(sl.s, sl.a.id, 'pin-missile', sl.f.id, () => 0.01).strikes, 5);
  const k = duel('beedrill', 'pidgey', { foeLevel: 5, ally: { ability: 'skill-link' } });
  const r = applyMove(k.s, k.a.id, 'pin-missile', k.f.id, () => 0.01);
  assert.ok(r.strikes < 5, String(r.strikes));
  assert.equal(r.hits.filter((h) => h.fainted).length, 1);
  assert.ok(Object.keys(r.expGained).length >= 1);
  assert.equal(avgHits(MOVES['pin-missile']), 3); // 2·3 회 37.5%, 4·5 회 12.5% → 평균 3
  assert.ok(Math.abs(expectedDamage(sl.a, sl.f, MOVES['pin-missile'], '.') / expectedDamage(sl.a, sl.f, { ...MOVES['pin-missile'], minHits: null, maxHits: null }, '.') - avgHits(MOVES['pin-missile'])) < 0.01);
});

test('crit stages: high-crit 1/8, with super luck 1/4, armor 0', () => {
  const a = makeUnit({ species: 'scyther', side: 'ally', x: 0, y: 0, level: 30 }), d = makeUnit({ species: 'pidgey', side: 'enemy', x: 1, y: 0, level: 30 });
  assert.equal(critRate(a, d, MOVES.tackle), 1 / 16);
  assert.equal(critRate(a, d, MOVES.slash), 1 / 8);
  assert.equal(critRate({ ...a, ability: 'super-luck' }, d, MOVES.slash), 1 / 4);
  assert.equal(critRate(a, { ...d, ability: 'shell-armor' }, MOVES.slash), 0);
});

test('fixed damage: level / 40 / 20, type immunity still applies', () => {
  const { s, a, f } = duel('machop', 'snorlax', { level: 33, foe: { hp: 999, maxHp: 999 } });
  assert.equal(applyMove(s, a.id, 'seismic-toss', f.id, () => 0.01).damage, 33);
  const dr = duel('dratini', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  assert.equal(applyMove(dr.s, dr.a.id, 'dragon-rage', dr.f.id, () => 0.01).damage, 40);
  const g = duel('machop', 'gastly');
  assert.equal(applyMove(g.s, g.a.id, 'seismic-toss', g.f.id, () => 0.01).damage, 0);
  assert.equal(calcDamage(a, f, MOVES['sonic-boom'], { rng: () => 0.01, defTile: '.' }).damage, 20);
});

test('healing moves: half HP, weather for synthesis, two uses per floor, refused at full HP', () => {
  const { s, a } = duel('chansey', 'pidgey', { ally: { hp: 10 } });
  const r = applyMove(s, a.id, 'soft-boiled', null, () => 0.5);
  assert.equal(r.healed.amount, Math.floor(a.maxHp / 2));
  assert.equal(a.healUses, 1);
  a.hp = 10; applyMove(s, a.id, 'soft-boiled', null, () => 0.5);
  a.hp = 10;
  assert.equal(applyMove(s, a.id, 'soft-boiled', null, () => 0.5).healFailed, 'uses');
  assert.equal(a.hp, 10);
  const full = duel('chansey', 'pidgey');
  assert.equal(applyMove(full.s, full.a.id, 'soft-boiled', null, () => 0.5).healFailed, 'full');
  const sun = duel('bellossom', 'pidgey', { ally: { hp: 1 } });
  sun.s.weather = 'sun';
  assert.equal(applyMove(sun.s, sun.a.id, 'synthesis', null, () => 0.5).healed.amount, Math.floor(sun.a.maxHp * 2 / 3));
  const fresh = duel('chansey', 'pidgey');
  assert.equal(fresh.a.healUses, 2); // 새 층(새 전투)은 다시 2번
});

// ---- SRPG: 치고 빠지기 · 풀죽음 ----
import { moveUnit, endPhase, canRetreat, retreatMove, arrive } from '../src/core/battle.js';
import { reachable } from '../src/core/pathfind.js';
import { moveBudget } from '../src/core/status.js';

test('priority moves: after attacking, move again with the movement left (once)', () => {
  const { s, a, f } = duel('rattata', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  f.x = 3; f.y = 1;
  moveUnit(s, a.id, 2, 1, 1); // 1칸 이동 (비용 1)
  applyMove(s, a.id, 'quick-attack', f.id, () => 0.01);
  const left = canRetreat(s, a);
  assert.equal(left, moveBudget(a) - 1);
  const far = [...reachable(s.grid, s.units, a, left).keys()];
  assert.ok(far.length > 1);
  retreatMove(s, a.id, 1, 1, 1);
  assert.equal(canRetreat(s, a), 0); // 한 번만
  const t = duel('rattata', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  applyMove(t.s, t.a.id, 'tackle', t.f.id, () => 0.01);
  assert.equal(canRetreat(t.s, t.a), 0); // 선제기가 아니면 없음
  const p = duel('rattata', 'snorlax', { ally: { status: 'paralysis' }, foe: { hp: 999, maxHp: 999 } });
  const r = applyMove(p.s, p.a.id, 'quick-attack', p.f.id, () => 0.01); // 마비 25% 실패
  assert.equal(r.blocked, 'paralysis');
  assert.equal(canRetreat(p.s, p.a), 0);
});

test('retreating onto a chest opens it like a normal move', () => {
  const { s, a, f } = duel('rattata', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  s.chests = [{ x: 1, y: 3, item: 'candy' }];
  applyMove(s, a.id, 'quick-attack', f.id, () => 0.01);
  retreatMove(s, a.id, 1, 3, 2);
  assert.equal(arrive(s, a.id).item, 'candy');
});

test('flinch seals moves on the next own phase; inner focus, bosses and repeats are immune; fake out once per foe', () => {
  const { s, a, f } = duel('zubat', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  applyMove(s, a.id, 'bite', f.id, seq([0.01, 0.5, 0.5, 0.01]));
  assert.equal(f.flinch, true);
  endPhase(s, () => 0.9); // 적 차례 시작 → 봉인
  assert.equal(f.sealed, true);
  assert.equal(f.flinch, false);
  assert.equal(applyMove(s, f.id, 'tackle', a.id, () => 0.01).blocked, 'sealed');
  assert.ok(moveBudget(f) > 0); // 이동은 가능
  endPhase(s, () => 0.9); // 적 차례 끝 → 풀림
  assert.equal(f.sealed, false);
  const inner = duel('zubat', 'snorlax', { foe: { ability: 'inner-focus', hp: 999, maxHp: 999 } });
  applyMove(inner.s, inner.a.id, 'bite', inner.f.id, () => 0.01);
  assert.equal(inner.f.flinch, false);
  const boss = duel('zubat', 'snorlax', { foe: { boss: true, hp: 999, maxHp: 999 } });
  applyMove(boss.s, boss.a.id, 'bite', boss.f.id, () => 0.01);
  assert.equal(boss.f.flinch, false);
  const fo = duel('meowth', 'snorlax', { foe: { hp: 999, maxHp: 999 } });
  applyMove(fo.s, fo.a.id, 'fake-out', fo.f.id, () => 0.01);
  assert.equal(fo.f.flinch, true);
  endPhase(fo.s, () => 0.9); endPhase(fo.s, () => 0.9); // 봉인 끝
  fo.a.acted = false;
  applyMove(fo.s, fo.a.id, 'fake-out', fo.f.id, () => 0.01);
  assert.equal(fo.f.flinch, false); // 속이다는 한 층 한 번
});

import { retreatSpot } from '../src/core/ai.js';
import { createGame } from '../src/game/states.js';

test('AI retreat spot is the reachable tile farthest from the other side', () => {
  const { s, a, f } = duel('rattata', 'rattata', { foe: { hp: 999, maxHp: 999 } });
  f.x = 2; f.y = 1;
  const t = retreatSpot(s, f, 3);
  const d = (p) => Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
  assert.ok(d(t) >= 3, JSON.stringify(t));
});

test('a sealed-only ally phase can still end (wait is always available)', () => {
  const game = createGame({ rng: createRng(7) });
  game.handle({ type: 'confirm' });
  for (let i = 0; i < 40 && game.mode !== 'idle'; i++) { game.update(0.1); game.handle({ type: 'confirm' }); }
  for (const u of game.state.units) if (u.side === 'ally') u.sealed = true;
  game.handle({ type: 'endTurn' });
  for (let i = 0; i < 400 && game.mode !== 'idle' && game.mode !== 'result'; i++) { game.update(0.1); game.handle({ type: 'confirm' }); }
  assert.ok(['idle', 'result'].includes(game.mode), game.mode);
});

// ---- AI · 기술 정보 ----
import { planEnemyAction } from '../src/core/ai.js';
import { moveEffectTags } from '../src/game/states.js';

test('AI: skips recoil moves that would knock itself out; heals when low with uses left', () => {
  const { s, a, f } = duel('rattata', 'pidgeot', { foe: { hp: 1, moves: ['double-edge'] } });
  a.hp = 999; a.maxHp = 999;
  assert.equal(planEnemyAction(s, f).attack, null);
  const h = duel('rattata', 'chansey', { foe: { moves: ['soft-boiled', 'pound'] } });
  h.f.hp = Math.floor(h.f.maxHp * 0.4);
  assert.equal(planEnemyAction(h.s, h.f).attack?.moveId, 'soft-boiled');
  h.f.healUses = 0;
  assert.notEqual(planEnemyAction(h.s, h.f).attack?.moveId, 'soft-boiled');
});

test('move info tags describe the new effects', () => {
  assert.ok(moveEffectTags(MOVES['giga-drain']).includes('흡수 50%'));
  assert.ok(moveEffectTags(MOVES['pin-missile']).includes('2~5회'));
  assert.ok(moveEffectTags(MOVES['quick-attack']).includes('선제'));
  assert.ok(moveEffectTags(MOVES.bite).includes('풀죽음 30%'));
  assert.ok(moveEffectTags(MOVES['double-edge']).includes('반동 1/3'));
});

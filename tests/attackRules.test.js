import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { hitChance } from '../src/core/damage.js';
import { moveBudget } from '../src/core/status.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.01, miss = () => 0.99;
const duel = (allySp, foeSp, { ally = {}, foe = {}, fx = 2, fy = 1 } = {}) => {
  const m = newMember(allySp, 40, createRng(1));
  const map = { tiles: Array.from({ length: 10 }, () => '.'.repeat(10)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, x: fx, y: fy, level: 40 }] };
  const s = createBattle(map, [m]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};
const round = (s) => { endPhase(s, () => 0.9); endPhase(s, () => 0.9); };

test('sure-hit moves ignore grass, evasion and accuracy drops but not protect', () => {
  const { s, a, f } = duel('pidgey', 'geodude');
  a.stages.acc = -6; f.stages.eva = 6;
  assert.equal(hitChance(a, f, MOVES['aerial-ace'], '"'), 100);
  assert.ok(hitChance(a, f, MOVES.tackle, '"') < 100);
  applyMove(s, f.id, 'protect', f.id, hit);
  const r = applyMove(s, a.id, 'aerial-ace', f.id, miss);
  assert.equal(r.hits[0].protected, true);
});
test('hyper beam seals the user next own phase but still lets it move', () => {
  const { s, a, f } = duel('pidgey', 'geodude');
  applyMove(s, a.id, 'hyper-beam', { dir: 'right' }, miss);
  assert.equal(a.recharge, true);
  round(s);
  assert.equal(a.sealed, true);
  assert.ok(moveBudget(a) > 0);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'recharge' && e.unitId === a.id));
  assert.equal(applyMove(s, a.id, 'tackle', f.id, hit).blocked, 'sealed');
});
test('jump kick that misses or hits protect costs half max HP; magic guard is spared', () => {
  const { s, a, f } = duel('machop', 'geodude', { ally: { ability: 'guts' }, foe: { stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 6 } } }); // 회피 +6 → 빗나감
  const r = applyMove(s, a.id, 'jump-kick', f.id, miss);
  assert.equal(r.crash, Math.floor(a.maxHp / 2));
  assert.equal(a.hp, a.maxHp - r.crash);
  const g = duel('machop', 'gastly'); // 고스트: 격투 무효
  assert.ok(applyMove(g.s, g.a.id, 'high-jump-kick', g.f.id, hit).crash > 0);
  const m = duel('machop', 'geodude', { ally: { ability: 'magic-guard' }, foe: { stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 6 } } });
  assert.equal(applyMove(m.s, m.a.id, 'jump-kick', m.f.id, miss).crash, 0);
  assert.equal(m.a.hp, m.a.maxHp);
  const ok = duel('machop', 'geodude');
  assert.equal(applyMove(ok.s, ok.a.id, 'jump-kick', ok.f.id, hit).crash, 0);
});
test('false swipe always leaves at least 1 HP', () => {
  const { s, a, f } = duel('pidgey', 'pidgey');
  f.hp = 1;
  applyMove(s, a.id, 'false-swipe', f.id, hit);
  assert.equal(f.hp, 1);
  assert.ok(s.units.includes(f));
});
test('feint and shadow force break protect and remove it', () => {
  for (const id of ['feint', 'shadow-force']) {
    const { s, a, f } = duel('pidgey', 'pidgey');
    round(s);
    applyMove(s, f.id, 'protect', f.id, hit);
    const r = applyMove(s, a.id, id, f.id, hit);
    assert.ok(!r.hits[0].protected, id);
    assert.equal(f.guard, null, id);
  }
});
test('brick break shatters screens covering the target before damage', () => {
  const { s, a, f } = duel('machop', 'geodude');
  s.zones = [{ kind: 'reflect', side: 'enemy', x: f.x, y: f.y, turns: 5 }, { kind: 'lightScreen', side: 'enemy', x: f.x + 1, y: f.y, turns: 5 }, { kind: 'reflect', side: 'ally', x: a.x, y: a.y, turns: 5 }];
  const r = applyMove(s, a.id, 'brick-break', f.id, hit);
  assert.deepEqual(r.screensBroken.sort(), ['lightScreen', 'reflect']);
  assert.deepEqual(s.zones.map((z) => z.side), ['ally']);
});
test('rapid spin frees bind and leech seed and clears nearby foe spikes', () => {
  const { s, a, f } = duel('pidgey', 'geodude');
  a.bound = { by: f.id, moveId: 'wrap', turns: 3, reach: 1 }; a.leechBy = f.id;
  s.spikes = [{ x: 1, y: 2, kind: 'spikes', side: 'enemy' }, { x: 1, y: 3, kind: 'toxicSpikes', side: 'enemy' }, { x: 8, y: 8, kind: 'spikes', side: 'enemy' }, { x: 0, y: 1, kind: 'spikes', side: 'ally' }];
  const r = applyMove(s, a.id, 'rapid-spin', f.id, hit);
  assert.equal(a.bound, null); assert.equal(a.leechBy, null);
  assert.deepEqual(r.spun, { freed: true, cleared: 2 });
  assert.equal(s.spikes.length, 2);
});

// ---- 숨는 기술 ----
import { unitsHit, canTarget } from '../src/core/shapes.js';
test('a hidden unit cannot be targeted until the foe phase ends, then it is sealed', () => {
  const { s, a, f } = duel('diglett', 'pidgey');
  applyMove(s, a.id, 'dig', f.id, hit);
  assert.deepEqual(a.burrow, { kind: 'ground', moveId: 'dig' });
  assert.deepEqual(unitsHit(s, f, MOVES.tackle, { unitId: a.id }), []);
  endPhase(s, () => 0.9); // 아군 끝
  assert.ok(a.burrow);
  endPhase(s, () => 0.9); // 적 끝 → 풀림, 아군 시작 → 봉인
  assert.equal(a.burrow, null);
  assert.equal(a.sealed, true);
});
test('earthquake hits a digger for double, thunder hits a flier, nothing hits shadow force', () => {
  assert.equal(canTarget(MOVES.earthquake, { burrow: { kind: 'ground' } }), true);
  assert.equal(canTarget(MOVES.tackle, { burrow: { kind: 'ground' } }), false);
  assert.equal(canTarget(MOVES.thunder, { burrow: { kind: 'sky' } }), true);
  assert.equal(canTarget(MOVES.whirlpool, { burrow: { kind: 'water' } }), true);
  assert.equal(canTarget(MOVES.earthquake, { burrow: { kind: 'shadow' } }), false);
  const { s, a, f } = duel('rattata', 'geodude', { fx: 1, fy: 2, ally: { hp: 999, maxHp: 999 } });
  const plain = duel('rattata', 'geodude', { fx: 1, fy: 2, ally: { hp: 999, maxHp: 999 } });
  a.burrow = { kind: 'ground', moveId: 'dig' };
  const big = applyMove(s, f.id, 'earthquake', { self: true }, () => 0.5).hits.find((h) => h.unitId === a.id);
  const norm = applyMove(plain.s, plain.f.id, 'earthquake', { self: true }, () => 0.5).hits.find((h) => h.unitId === plain.a.id);
  assert.ok(big && norm && big.damage > norm.damage * 1.5);
});
test('a burrowed unit fainting from poison leaves no burrow behind', () => {
  const { s, a, f } = duel('diglett', 'pidgey');
  applyMove(s, a.id, 'dig', f.id, hit);
  a.status = 'poison'; a.hp = 1;
  round(s);
  assert.ok(!s.units.includes(a));
});

// ---- 준비 기술 ----
import { chargeRoute, moveUnit } from '../src/core/battle.js';
test('solar beam charges first, skull bash raises defense while charging, sunny solar beam fires at once', () => {
  const { s, a, f } = duel('bulbasaur', 'geodude');
  const r = applyMove(s, a.id, 'solar-beam', { dir: 'right' }, hit);
  assert.deepEqual(r.charged, { moveId: 'solar-beam', targetId: f.id });
  assert.equal(r.hits.length, 0);
  assert.equal(f.hp, f.maxHp);
  const k = duel('squirtle', 'geodude');
  const rk = applyMove(k.s, k.a.id, 'skull-bash', k.f.id, hit);
  assert.ok(rk.charged);
  assert.equal(k.a.stages.def, 1);
  const sun = duel('bulbasaur', 'geodude');
  sun.s.weather = 'sun';
  const rs = applyMove(sun.s, sun.a.id, 'solar-beam', { dir: 'right' }, hit);
  assert.equal(rs.charged, undefined);
  assert.ok(sun.f.hp < sun.f.maxHp);
});
test('the charged move fires next turn after rushing past the normal move range', () => {
  const { s, a, f } = duel('pidgey', 'geodude');
  applyMove(s, a.id, 'sky-attack', f.id, hit);
  f.x = 8; f.y = 6;
  round(s);
  const route = chargeRoute(s, a);
  assert.ok(route);
  const end = route.path.at(-1);
  assert.equal(Math.abs(end.x - f.x) + Math.abs(end.y - f.y), 1);
  assert.ok(route.path.length - 1 > moveBudget(a));
  moveUnit(s, a.id, end.x, end.y, 0, route.path);
  const r = applyMove(s, a.id, 'sky-attack', route.aim, hit);
  assert.ok(r.hits.some((h) => h.unitId === f.id && h.damage > 0));
  assert.equal(a.charging, null);
});
test('a fainted target, no path, or a sleeping charger fizzles', () => {
  const g = duel('pidgey', 'geodude');
  applyMove(g.s, g.a.id, 'sky-attack', g.f.id, hit);
  g.s.units = g.s.units.filter((u) => u !== g.f);
  assert.equal(chargeRoute(g.s, g.a), null);
  const z = duel('pidgey', 'geodude');
  applyMove(z.s, z.a.id, 'sky-attack', z.f.id, hit);
  z.a.status = 'sleep';
  assert.equal(chargeRoute(z.s, z.a), null);
  const w = duel('pidgey', 'geodude');
  applyMove(w.s, w.a.id, 'sky-attack', w.f.id, hit);
  w.s.grid = w.s.grid.map((row, y) => row.split('').map((c, x) => (Math.abs(x - 8) + Math.abs(y - 6) === 1 ? '#' : c)).join(''));
  w.f.x = 8; w.f.y = 6;
  assert.equal(chargeRoute(w.s, w.a), null);
});

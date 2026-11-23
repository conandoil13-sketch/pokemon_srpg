// 5세대 기술 (세대 추가 3단계, 2026-11-24): 지금 규칙 재활용 + 코덱스 판정 (codex-reviews/2026-11-20-gen5-moves-abilities.md · 2026-11-22-gen5-9-srpg-moves.md)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { varPower, expectedDamage, calcDamage } from '../src/core/damage.js';
import { critRate } from '../src/core/abilities.js';
import { chainPower } from '../src/core/chainMoves.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.01;
// 6×6 빈 맵: 아군 (1,1), 적 (2,1), 멀리 적 하나 더
const duel = (allySp, foeSp, { ally = {}, foe = {}, w = 6, foeAt = { x: 2, y: 1 }, extra = [] } = {}) => {
  const map = { tiles: Array.from({ length: 6 }, () => '.'.repeat(w)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, ...foeAt, level: 40 }, { species: 'rattata', x: w - 1, y: 5, level: 40 }, ...extra] };
  const s = createBattle(map, [newMember(allySp, 40, createRng(1))]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};
const P = (a, d, id) => varPower(a, d, MOVES[id]);

test('every gen 5 attack in a learnset has a rule or works as a plain attack (sky drop waits)', () => {
  assert.equal(MOVES['sky-drop'].learnable, false);
  for (const id of ['hex', 'venoshock', 'stored-power', 'acrobatics', 'electro-ball', 'final-gambit', 'retaliate', 'round', 'echoed-voice', 'fusion-flare', 'fusion-bolt', 'smack-down', 'dragon-tail', 'circle-throw', 'volt-switch', 'flame-burst', 'clear-smog', 'psyshock', 'foul-play', 'chip-away']) assert.equal(MOVES[id].learnable, true, id);
});

test('hex doubles on any status, venoshock only on poison', () => {
  const { a, f } = duel('gastly', 'geodude');
  assert.equal(P(a, f, 'hex'), 65); assert.equal(P(a, f, 'venoshock'), 65);
  f.status = 'paralysis'; assert.equal(P(a, f, 'hex'), 130); assert.equal(P(a, f, 'venoshock'), 65);
  f.status = 'toxic'; assert.equal(P(a, f, 'venoshock'), 130);
});

test('stored power: 20 + 20 per positive stage of the user', () => {
  const { a, f } = duel('abra', 'geodude');
  assert.equal(P(a, f, 'stored-power'), 20);
  a.stages = { ...a.stages, spa: 2, spd: 1, spe: -1 };
  assert.equal(P(a, f, 'stored-power'), 80);
});

test('acrobatics doubles without a held item', () => {
  const { a, f } = duel('pidgey', 'geodude');
  assert.equal(P(a, f, 'acrobatics'), 110);
  a.held = 'leftovers'; assert.equal(P(a, f, 'acrobatics'), 55);
});

test('electro ball: power from user speed ÷ target speed', () => {
  const { a, f } = duel('pikachu', 'geodude');
  const at = (ratio) => { a.stats = { ...a.stats, spe: 100 * ratio }; f.stats = { ...f.stats, spe: 100 }; f.stages = { ...f.stages, spe: 0 }; a.stages = { ...a.stages, spe: 0 }; return P(a, f, 'electro-ball'); };
  assert.deepEqual([0.5, 1, 2, 3, 4].map(at), [40, 60, 80, 120, 150]);
});

test('psyshock hits physical defense, foul play uses the target attack, chip away ignores defense stages', () => {
  const { a, f } = duel('abra', 'geodude');
  const base = expectedDamage(a, f, MOVES.psyshock, '.');
  f.stats = { ...f.stats, def: f.stats.def * 2 };
  assert.ok(expectedDamage(a, f, MOVES.psyshock, '.') < base * 0.6);
  const fp = expectedDamage(a, f, MOVES['foul-play'], '.');
  f.stats = { ...f.stats, atk: f.stats.atk * 2 };
  assert.ok(expectedDamage(a, f, MOVES['foul-play'], '.') > fp * 1.8);
  const ca = expectedDamage(a, f, MOVES['chip-away'], '.');
  f.stages = { ...f.stages, def: 6 };
  assert.ok(Math.abs(expectedDamage(a, f, MOVES['chip-away'], '.') - ca) < 1e-9);
});

test('frost breath and storm throw always crit (shell armor still blocks)', () => {
  const { a, f } = duel('lapras', 'geodude');
  assert.equal(critRate(a, f, MOVES['frost-breath']), 1);
  assert.equal(critRate(a, f, MOVES['storm-throw']), 1);
  f.ability = 'shell-armor'; assert.equal(critRate(a, f, MOVES['frost-breath']), 0);
});

test('synchronoise only hits a target that shares a type', () => {
  const { a, f } = duel('abra', 'geodude');
  assert.equal(calcDamage(a, f, MOVES.synchronoise, { rng: hit, defTile: '.' }).typeMult, 0);
  f.types = ['psychic']; assert.ok(calcDamage(a, f, MOVES.synchronoise, { rng: hit, defTile: '.' }).damage > 0);
});

test('final gambit deals the user HP and the user faints', () => {
  const { s, a, f } = duel('machop', 'snorlax');
  a.hp = 30; const before = f.hp;
  const r = applyMove(s, a.id, 'final-gambit', f.id, hit);
  assert.equal(before - f.hp, 30);
  assert.ok(r.selfKO); assert.ok(!s.units.includes(a));
});

test('retaliate: 140 against a foe that knocked out an ally, once', () => {
  const { s, a, f } = duel('rattata', 'snorlax', { extra: [] });
  const map = { tiles: Array.from({ length: 6 }, () => '.'.repeat(6)), allySlots: [{ x: 1, y: 1 }, { x: 3, y: 3 }], enemies: [{ species: 'snorlax', x: 2, y: 1, level: 40 }, { species: 'rattata', x: 5, y: 5, level: 40 }] };
  const b = createBattle(map, [newMember('rattata', 40, createRng(1)), newMember('pidgey', 5, createRng(2))]);
  const [r1, weak, foe] = [b.units[0], b.units[1], b.units.find((u) => u.species === 'snorlax')];
  assert.equal(P(r1, foe, 'retaliate'), 70);
  foe.x = 3; foe.y = 2; weak.hp = 1;
  applyMove(b, foe.id, 'tackle', weak.id, hit);
  assert.ok(!b.units.includes(weak));
  assert.equal(P(r1, foe, 'retaliate'), 140);
  foe.x = 2; foe.y = 1;
  applyMove(b, r1.id, 'retaliate', foe.id, hit);
  assert.equal(P(r1, foe, 'retaliate'), 70);
  void s; void a; void f;
});

test('round: 120 after an ally used round this phase; echoed voice climbs 40 per round, resets after a quiet round', () => {
  const { s, a, f } = duel('jigglypuff', 'snorlax');
  assert.equal(chainPower(s, a, MOVES.round), 60);
  applyMove(s, a.id, 'round', f.id, hit);
  assert.equal(chainPower(s, a, MOVES.round), 120);
  assert.equal(chainPower(s, f, MOVES.round), 60); // 다른 편은 아님
  assert.equal(chainPower(s, a, MOVES['echoed-voice']), 40);
  applyMove(s, a.id, 'echoed-voice', f.id, hit);
  assert.equal(chainPower(s, a, MOVES['echoed-voice']), 40); // 같은 라운드엔 그대로
  s.turn += 1; assert.equal(chainPower(s, f, MOVES['echoed-voice']), 80); // 다음 라운드: 양 진영 공유
  s.turn += 1; assert.equal(chainPower(s, f, MOVES['echoed-voice']), 40); // 한 라운드 쉼 → 처음부터
});

test('fusion flare after a landed fusion bolt is 200; anything in between breaks it', () => {
  const { s, a, f } = duel('zekrom', 'snorlax');
  applyMove(s, a.id, 'fusion-bolt', f.id, hit);
  assert.equal(chainPower(s, f, MOVES['fusion-flare']), 200);
  assert.equal(chainPower(s, f, MOVES['fusion-bolt']), 100);
  applyMove(s, a.id, 'tackle', f.id, hit);
  assert.equal(chainPower(s, f, MOVES['fusion-flare']), 100);
});

test('smack down grounds a flying target until the floor ends', () => {
  const { s, a, f } = duel('geodude', 'pidgey');
  applyMove(s, a.id, 'smack-down', f.id, hit);
  assert.ok(f.smackedDown); assert.ok(f.grounded);
  endPhase(s); endPhase(s);
  assert.ok(f.grounded);
});

test('dragon tail pushes the target away after the hit', () => {
  const { s, a, f } = duel('dratini', 'snorlax');
  const r = applyMove(s, a.id, 'dragon-tail', f.id, hit);
  assert.ok(r.shoved); assert.equal(f.y, 1); assert.ok(f.x > 2);
});

test('circle throw flings the target to the tile behind the user; blocked → damage only', () => {
  const { s, a, f } = duel('machop', 'snorlax');
  const r = applyMove(s, a.id, 'circle-throw', f.id, hit);
  assert.deepEqual([f.x, f.y], [0, 1]); assert.ok(r.shoved);
  const b = duel('machop', 'snorlax', { foeAt: { x: 1, y: 2 }, extra: [{ species: 'geodude', x: 1, y: 0, level: 40 }] }); // (1,0) 막힘
  applyMove(b.s, b.a.id, 'circle-throw', b.f.id, hit);
  assert.deepEqual([b.f.x, b.f.y], [1, 2]);
});

test('volt switch dashes up to 2 tiles, strikes from range 2 and comes back', () => {
  const { s, a, f } = duel('pikachu', 'snorlax', { foeAt: { x: 5, y: 1 } });
  const r = applyMove(s, a.id, 'volt-switch', f.id, hit);
  assert.ok(r.dashed); assert.deepEqual(r.dashed.to, { x: 3, y: 1 });
  assert.ok(r.returned); assert.deepEqual([a.x, a.y], [1, 1]);
  assert.ok(f.hp < f.maxHp);
});

test('flame burst splashes 1/16 of their own max HP onto the target side neighbours', () => {
  const { s, a, f } = duel('charmander', 'snorlax', { extra: [{ species: 'geodude', x: 3, y: 1, level: 40 }] });
  const g = s.units.find((u) => u.species === 'geodude');
  const r = applyMove(s, a.id, 'flame-burst', f.id, hit);
  assert.equal(g.maxHp - g.hp, Math.max(1, Math.floor(g.maxHp / 16)));
  assert.ok(r.chain.some((c) => c.unitId === g.id));
});

test('clear smog resets the target stages', () => {
  const { s, a, f } = duel('koffing', 'snorlax');
  f.stages = { ...f.stages, atk: 2 }; f.layers = [{ key: 'atk', amount: 2, turns: 3 }];
  applyMove(s, a.id, 'clear-smog', f.id, hit);
  assert.equal(f.stages.atk, 0);
});

test('shell smash and rage powder are learnable status moves', () => {
  assert.equal(MOVES['shell-smash'].learnable, true); assert.equal(MOVES['shell-smash'].kind, 'self');
  assert.equal(MOVES['rage-powder'].effect, 'followMe');
});

import { moveEffectTags } from '../src/game/states.js';
test('move cards name the gen 5 rules and fixed damage in words', () => {
  assert.ok(moveEffectTags(MOVES.hex).includes('상태이상 2배'));
  assert.ok(moveEffectTags(MOVES['frost-breath']).includes('반드시 급소'));
  assert.ok(moveEffectTags(MOVES['final-gambit']).includes('내 HP만큼'));
  assert.ok(moveEffectTags(MOVES['super-fang']).includes('상대 HP 절반'));
  assert.ok(!moveEffectTags(MOVES['frost-breath']).includes('급소↑'));
});

test('a throw or tail onto a cliff counts as a knockout of the hit (exp, faint, fell)', () => {
  const { s, a, f } = duel('machop', 'snorlax');
  s.grid[1] = 'X' + s.grid[1].slice(1); // (0,1) 낭떠러지
  const r = applyMove(s, a.id, 'circle-throw', f.id, hit);
  assert.ok(!s.units.includes(f));
  assert.ok(r.shoved.fell); assert.ok(r.fainted);
  assert.ok(Object.values(r.expGained).some((n) => n > 0));
  const b = duel('dratini', 'snorlax');
  b.s.grid[1] = b.s.grid[1].slice(0, 3) + 'X' + b.s.grid[1].slice(4); // (3,1)
  const r2 = applyMove(b.s, b.a.id, 'dragon-tail', b.f.id, hit);
  assert.ok(!b.s.units.includes(b.f));
  assert.ok(r2.shoved.fell); assert.ok(r2.fainted);
  assert.ok(Object.values(r2.expGained).some((n) => n > 0));
});

// 5세대 특성 (세대 추가 4단계, 2026-11-24): codex-reviews/2026-11-20-gen5-moves-abilities.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { expectedDamage, hitChance, terrainCtx } from '../src/core/damage.js';
import { speedMult, weatherChipImmune, immunity } from '../src/core/abilities.js';
import { ABILITIES } from '../src/data/abilities.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.01, miss = () => 0.99;
// 6×6 빈 맵: 아군 (1,1) [+ 둘째 아군], 적 (2,1) + 멀리 하나
const duel = (allySp, foeSp, { ally = {}, foe = {}, allies = [], extra = [] } = {}) => {
  const map = { tiles: Array.from({ length: 6 }, () => '......'), allySlots: [{ x: 1, y: 1 }, ...allies.map((a) => a.at)], enemies: [{ species: foeSp, x: 2, y: 1, level: 40 }, { species: 'rattata', x: 5, y: 5, level: 40 }, ...extra] };
  const s = createBattle(map, [newMember(allySp, 40, createRng(1)), ...allies.map((a, i) => newMember(a.sp, a.level ?? 40, createRng(i + 2)))]);
  const a = s.units[0], f = s.units.find((u) => u.side === 'enemy');
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};

test('only illusion, prankster and unnerve are still marked as having no effect', () => {
  for (const id of ['illusion', 'prankster', 'unnerve']) assert.equal(ABILITIES[id].inactive, true, id);
  for (const id of ['cursed-body', 'moxie', 'sheer-force', 'regenerator', 'mummy', 'teravolt']) assert.ok(!ABILITIES[id].inactive, id);
});

test('big pecks: defense cannot be lowered by others', () => {
  const { s, a, f } = duel('rattata', 'pidove', { foe: { ability: 'big-pecks' } });
  applyMove(s, a.id, 'leer', f.id, hit);
  assert.equal(f.stages.def ?? 0, 0);
});

test('defiant: a drop from another raises attack by 2', () => {
  const { s, a, f } = duel('rattata', 'pawniard', { foe: { ability: 'defiant' } });
  applyMove(s, a.id, 'growl', f.id, hit);
  assert.equal(f.stages.atk, 1); // −1 + 2
});

test('defeatist halves attack and special attack at half HP or less', () => {
  const { a, f } = duel('archen', 'snorlax', { ally: { ability: 'defeatist' } });
  const full = expectedDamage(a, f, MOVES.tackle, '.');
  a.hp = Math.floor(a.maxHp / 2);
  assert.ok(Math.abs(expectedDamage(a, f, MOVES.tackle, '.') - full / 2) < 1e-6);
});

test('cursed body: 30% for one holder disables the move that hit it', () => {
  const { s, a, f } = duel('rattata', 'frillish', { foe: { ability: 'cursed-body' } });
  f.hp = f.maxHp = 999;
  applyMove(s, a.id, 'bite', f.id, () => 0.01);
  assert.deepEqual(a.disable?.move, 'bite');
  const b = duel('rattata', 'frillish', { foe: { ability: 'cursed-body' } });
  b.f.hp = b.f.maxHp = 999;
  applyMove(b.s, b.a.id, 'bite', b.f.id, () => 0.35);
  assert.ok(!b.a.disable);
});

test('iron barbs hurts a contact attacker by 1/8; poison touch poisons on contact', () => {
  const { s, a, f } = duel('rattata', 'ferroseed', { foe: { ability: 'iron-barbs' } });
  applyMove(s, a.id, 'tackle', f.id, hit);
  assert.equal(a.maxHp - a.hp, Math.max(1, Math.floor(a.maxHp / 8)));
  const b = duel('rattata', 'snorlax', { ally: { ability: 'poison-touch' } });
  applyMove(b.s, b.a.id, 'tackle', b.f.id, hit);
  assert.equal(b.f.status, 'poison');
});

test('justified: a dark hit raises attack; weak armor: a physical hit drops defense, raises speed by 2', () => {
  const { s, a, f } = duel('poochyena', 'snorlax', { foe: { ability: 'justified' } });
  applyMove(s, a.id, 'bite', f.id, () => 0.5);
  assert.equal(f.stages.atk, 1);
  const b = duel('rattata', 'roggenrola', { foe: { ability: 'weak-armor' } });
  applyMove(b.s, b.a.id, 'tackle', b.f.id, hit);
  assert.equal(b.f.stages.def, -1); assert.equal(b.f.stages.spe, 2);
});

test('moxie: +1 attack per foe knocked out', () => {
  const { s, a, f } = duel('sandile', 'rattata', { ally: { ability: 'moxie' } });
  f.hp = 1;
  applyMove(s, a.id, 'tackle', f.id, hit);
  assert.equal(a.stages.atk, 1);
});

test('mummy: a contact attacker main ability turns into mummy', () => {
  const { s, a, f } = duel('rattata', 'yamask', { ally: { ability: 'guts' }, foe: { ability: 'mummy' } });
  applyMove(s, a.id, 'bite', f.id, () => 0.5);
  assert.equal(a.ability, 'mummy');
});

test('sap sipper absorbs grass moves and raises attack; telepathy ignores ally hits', () => {
  const { s, a, f } = duel('bulbasaur', 'deerling', { foe: { ability: 'sap-sipper' } });
  applyMove(s, a.id, 'vine-whip', f.id, hit);
  assert.equal(f.hp, f.maxHp); assert.equal(f.stages.atk, 1);
  const t = duel('rattata', 'snorlax', { ally: { ability: 'telepathy' }, allies: [{ sp: 'geodude', at: { x: 1, y: 2 } }] });
  assert.ok(immunity(t.s.units[1], t.a, MOVES.earthquake));
  assert.equal(immunity(t.f, t.a, MOVES.earthquake), null);
});

test('overcoat: no weather chip, no powder moves', () => {
  const { s, a, f } = duel('oddish', 'solosis', { foe: { ability: 'overcoat' } });
  assert.ok(weatherChipImmune(f, 'sand')); assert.ok(weatherChipImmune(f, 'hail'));
  applyMove(s, a.id, 'sleep-powder', f.id, hit);
  assert.ok(f.status !== 'sleep');
});

test('sand force and sand rush in a sandstorm', () => {
  const { a, f } = duel('drilbur', 'snorlax', { ally: { ability: 'sand-force' } });
  const calm = expectedDamage(a, f, MOVES['rock-slide'], '.');
  assert.ok(Math.abs(expectedDamage(a, f, MOVES['rock-slide'], '.', 1, 'sand') / calm - 1.3) < 1e-6);
  assert.ok(weatherChipImmune(a, 'sand'));
  a.ability = 'sand-rush'; a.fieldWeather = 'sand';
  assert.equal(speedMult(a), 2); assert.ok(weatherChipImmune(a, 'sand'));
});

test('sheer force: ×1.3 on moves with added effects, and the effects are gone', () => {
  const { s, a, f } = duel('druddigon', 'snorlax', { ally: { ability: 'sheer-force' } });
  const base = expectedDamage({ ...a, ability: null }, f, MOVES['fire-fang'], '.');
  assert.ok(Math.abs(expectedDamage(a, f, MOVES['fire-fang'], '.') / base - 1.3) < 1e-6);
  assert.ok(Math.abs(expectedDamage(a, f, MOVES.tackle, '.') - expectedDamage({ ...a, ability: null }, f, MOVES.tackle, '.')) < 1e-6);
  applyMove(s, a.id, 'crunch', f.id, hit);
  assert.equal(f.stages.def ?? 0, 0);
});

test('teravolt breaks abilities like mold breaker', () => {
  const { s, a, f } = duel('rattata', 'gastly', { ally: { ability: 'teravolt' }, foe: { ability: 'levitate', types: ['normal'] } });
  const r = applyMove(s, a.id, 'earthquake', f.id, hit);
  assert.ok(r.hits.find((h) => h.unitId === f.id).damage > 0);
});

test('victory star: ×1.1 accuracy for the holder and allies within 2', () => {
  const { s, a, f } = duel('victini', 'snorlax', { ally: { ability: 'blaze' } });
  const plain = hitChance(a, f, MOVES.thunder, '.', null, terrainCtx(s, a, f));
  a.ability = 'victory-star';
  assert.ok(Math.abs(hitChance(a, f, MOVES.thunder, '.', null, terrainCtx(s, a, f)) - plain * 1.1) < 1e-6);
});

test('wonder skin caps status move accuracy at 50', () => {
  const { a, f } = duel('rattata', 'sigilyph', { foe: { ability: 'wonder-skin' } });
  assert.ok(hitChance(a, f, { ...MOVES['thunder-wave'], accuracy: 90 }, '.') <= 50);
});

test('infiltrator ignores the target reflect', () => {
  const { a, f } = duel('rattata', 'snorlax', { ally: { ability: 'infiltrator' } });
  const plain = expectedDamage(a, f, MOVES.tackle, '.');
  f.field = { reflect: true };
  assert.ok(Math.abs(expectedDamage(a, f, MOVES.tackle, '.') - plain) < 1e-6);
});

test('regenerator heals 1/4 after a quiet round; healer may cure a neighbour', () => {
  const { s, a } = duel('mienfoo', 'rattata', { ally: { ability: 'regenerator' }, allies: [{ sp: 'audino', at: { x: 1, y: 2 } }] });
  const au = s.units[1]; au.ability = 'healer';
  a.hp = 60; a.ncTouched = false; a.status = 'burn';
  endPhase(s, () => 0.01);
  assert.equal(a.hp, 60 - Math.floor(a.maxHp / 8) + Math.floor(a.maxHp / 4)); // 화상 1/8 뒤 재생력 1/4
  assert.equal(a.status, null);
});

import { abilityNotices } from '../src/game/states.js';
test('ability notices: cursed body names the disabled foe, regenerator heals', () => {
  const units = { a: { id: 'a', species: 'gengar', x: 0, y: 0 }, b: { id: 'b', species: 'rattata', x: 1, y: 0 } };
  const get = (id) => units[id];
  assert.match(abilityNotices([{ unitId: 'a', ability: 'cursed-body', target: 'b' }], get)[0].lines.join(' '), /사슬묶기/);
  assert.match(abilityNotices([{ unitId: 'a', ability: 'regenerator' }], get)[0].lines.join(' '), /회복/);
});

test('cursed body: the disable lasts 3 of the attacker own turns (its own phase end does not count)', () => {
  const { s, a, f } = duel('rattata', 'frillish', { foe: { ability: 'cursed-body' } });
  f.hp = f.maxHp = 999;
  applyMove(s, a.id, 'bite', f.id, () => 0.01);
  endPhase(s, () => 0.5); // 공격자 페이즈 끝
  assert.equal(a.disable?.turns, 3);
});

test('moxie: a knockout mid spread move boosts only after the move (later targets take normal damage)', () => {
  const run = (ability) => {
    const { s, a, f } = duel('sandile', 'rattata', { ally: { ability }, extra: [{ species: 'snorlax', x: 1, y: 2, level: 40 }] });
    f.hp = 1;
    const big = s.units.find((u) => u.species === 'snorlax');
    const r = applyMove(s, a.id, 'earthquake', f.id, () => 0.01);
    return { dmg: r.hits.find((h) => h.unitId === big.id).damage, atk: a.stages.atk ?? 0 };
  };
  const plain = run('intimidate'), moxie = run('moxie');
  assert.equal(moxie.dmg, plain.dmg);
  assert.equal(moxie.atk, 1);
});

test('mummy: an enemy that turned into mummy leaves its original ability in the ditto capsule log', () => {
  const { s, a, f } = duel('yamask', 'rattata', { ally: { ability: 'mummy' }, foe: { ability: 'guts' } });
  applyMove(s, f.id, 'bite', a.id, () => 0.5); // 적이 미라에 닿음
  assert.equal(f.ability, 'mummy');
  f.hp = 1;
  applyMove(s, a.id, 'bite', f.id, () => 0.01);
  assert.equal(s.log.defeated.at(-1).ability, 'guts');
});

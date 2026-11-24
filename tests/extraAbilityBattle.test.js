// 2칸 특성: 전투에서 1칸과 똑같이 작동하는지 (같은 상황을 1칸 X / 2칸 X 로 돌려 비교)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase, redirectTarget } from '../src/core/battle.js';
import { has, abilitiesOf, phaseEndHp } from '../src/core/abilities.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const FILLER = 'run-away'; // 전투에 영향 없는 1칸
const asSlot1 = (id) => ({ ability: id, ability2: null });
const asSlot2 = (id) => ({ ability: FILLER, ability2: id });

const duel = (allySp, foeSp, { ally = {}, foe = {}, fx = 2, fy = 1, extra = [] } = {}) => {
  const m = newMember(allySp, 40, createRng(1));
  const map = { tiles: Array.from({ length: 10 }, () => '.'.repeat(10)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, x: fx, y: fy, level: 40 }, ...extra] };
  const s = createBattle(map, [m]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};
const same = (scenario, id) => assert.deepEqual(scenario(asSlot2(id)), scenario(asSlot1(id)), id);

test('slot 2 multiplier works like slot 1', () => {
  const sc = (ab) => { const { s, a, f } = duel('scyther', 'snorlax', { ally: ab }); applyMove(s, a.id, 'quick-attack', f.id, () => 0.5); return f.maxHp - f.hp; };
  same(sc, 'technician');
  assert.notEqual(sc(asSlot2('technician')), sc(asSlot1(FILLER))); // 실제로 배율이 들어감
});

test('slot 2 pinch boost', () => {
  const sc = (ab) => { const { s, a, f } = duel('charmander', 'snorlax', { ally: ab }); a.hp = Math.floor(a.maxHp / 4); applyMove(s, a.id, 'ember', f.id, () => 0.5); return f.maxHp - f.hp; };
  same(sc, 'blaze');
  assert.notEqual(sc(asSlot2('blaze')), sc(asSlot1(FILLER)));
});

test('slot 2 contact ailment', () => {
  const sc = (ab) => { const { s, a, f } = duel('machop', 'pikachu', { foe: ab }); applyMove(s, a.id, 'tackle', f.id, () => 0.01); return a.status ?? null; };
  same(sc, 'static');
  assert.equal(sc(asSlot2('static')), 'paralysis');
});

test('slot 2 status immunity', () => {
  const sc = (ab) => { const { s, a, f } = duel('pidgey', 'paras', { ally: ab }); applyMove(s, f.id, 'spore', a.id, () => 0.01); return a.status ?? null; };
  same(sc, 'insomnia');
  assert.equal(sc(asSlot2('insomnia')), null);
});

test('slot 2 redirect', () => {
  const sc = (ab) => {
    const { s, a } = duel('pikachu', 'geodude', { fx: 5, fy: 5, extra: [{ species: 'rhyhorn', x: 6, y: 5, level: 40 }] });
    const [, g, r] = s.units; Object.assign(r, ab); Object.assign(g, asSlot1(FILLER));
    return redirectTarget(s, a.id, 'thunder-shock', g.id)?.id ?? null;
  };
  same(sc, 'lightning-rod');
  assert.ok(sc(asSlot2('lightning-rod')));
});

test('slot 2 phase-end', () => {
  assert.equal(phaseEndHp(asSlot2('rain-dish'), 'rain'), 1 / 16);
  const sc = (ab) => { const { s, a } = duel('slowpoke', 'geodude', { ally: ab, fx: 9, fy: 9 }); a.hp = Math.floor(a.maxHp / 2); endPhase(s, () => 0.9); return a.hp; };
  same(sc, 'regenerator');
  assert.ok(sc(asSlot2('regenerator')) > sc(asSlot1(FILLER)));
});

test('slot 2 seen by the attacker', () => {
  const ooze = (ab) => { const { s, a, f } = duel('oddish', 'tentacool', { foe: ab }); a.hp = a.maxHp - 30; const before = a.hp; applyMove(s, a.id, 'absorb', f.id, () => 0.5); return a.hp - before; };
  same(ooze, 'liquid-ooze');
  assert.ok(ooze(asSlot2('liquid-ooze')) < 0);
  const unaware = (ab) => { const { s, a, f } = duel('machop', 'snorlax', { foe: ab }); a.stages = { ...(a.stages ?? {}), atk: 6 }; applyMove(s, a.id, 'tackle', f.id, () => 0.5); return f.maxHp - f.hp; };
  same(unaware, 'unaware');
  assert.notEqual(unaware(asSlot2('unaware')), unaware(asSlot1(FILLER)));
});

test('same ability in both slots applies once', () => {
  const sc = (ab) => { const { s, a, f } = duel('scyther', 'snorlax', { ally: ab }); applyMove(s, a.id, 'quick-attack', f.id, () => 0.5); return f.maxHp - f.hp; };
  assert.equal(sc({ ability: 'technician', ability2: 'technician' }), sc(asSlot1('technician')));
  assert.deepEqual(abilitiesOf({ ability: 'technician', ability2: 'technician' }), ['technician']);
});

test('members bring their slot-2 ability into battle', () => {
  const m = { ...newMember('charmander', 40, createRng(1)), extraAbility: 'technician' };
  const s = createBattle({ tiles: Array.from({ length: 6 }, () => '.'.repeat(6)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: 'geodude', x: 4, y: 4, level: 40 }] }, [m]);
  assert.equal(s.units[0].ability2, 'technician');
  assert.ok(has(s.units[0], 'technician') && has(s.units[0], 'blaze'));
});

test('ditto build ability plus slot 2', () => {
  const d = newMember('ditto', 40);
  d.build.ability = 'intimidate'; d.extraAbility = 'technician';
  const s = createBattle({ tiles: Array.from({ length: 6 }, () => '.'.repeat(6)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: 'geodude', x: 4, y: 4, level: 40 }] }, [d]);
  assert.ok(has(s.units[0], 'intimidate') && has(s.units[0], 'technician'));
});

test('enemies have no slot 2', () => {
  const { f } = duel('charmander', 'geodude');
  assert.equal(f.ability2, null);
});

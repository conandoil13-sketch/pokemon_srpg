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

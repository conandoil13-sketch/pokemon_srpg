import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { calcDamage, hitChance, expectedDamage } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';
import { SPECIES } from '../src/data/species.js';

const u = (species, side = 'ally') => {
  const hp = SPECIES[species].stats.hp;
  return { id: `${side}-${species}`, species, side, x: 0, y: 0, hp, maxHp: hp, moved: false, acted: false };
};

test('createRng is deterministic and in [0,1)', () => {
  const a = createRng(1), b = createRng(1);
  for (let i = 0; i < 5; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('rng 0: hit, crit, super effective', () => {
  const r = calcDamage(u('infernape'), u('torterra', 'enemy'), MOVES.flamethrower, { rng: () => 0, defTile: '.' });
  assert.equal(r.typeMult, 2);
  assert.equal(r.hit, true);
  assert.equal(r.crit, true);
  assert.ok(r.damage > 0);
});

test('rng 0.99: hit (acc 100), no crit', () => {
  const r = calcDamage(u('infernape'), u('torterra', 'enemy'), MOVES.flamethrower, { rng: () => 0.99, defTile: '.' });
  assert.equal(r.hit, true);
  assert.equal(r.crit, false);
});

test('immune: earthquake vs honchkrow', () => {
  const r = calcDamage(u('garchomp', 'enemy'), u('honchkrow'), MOVES.earthquake, { rng: () => 0.5, defTile: '.' });
  assert.equal(r.typeMult, 0);
  assert.equal(r.damage, 0);
});

test('tall grass lowers hit chance by 15', () => {
  const a = u('infernape'), d = u('torterra', 'enemy');
  assert.equal(hitChance(a, d, MOVES.flamethrower, '.') - hitChance(a, d, MOVES.flamethrower, '"'), 15);
});

test('mountain lowers expected damage', () => {
  const a = u('infernape'), d = u('torterra', 'enemy');
  assert.ok(expectedDamage(a, d, MOVES.flamethrower, '^') < expectedDamage(a, d, MOVES.flamethrower, '.'));
});

test('expectedDamage matches formula (STAB + type)', () => {
  const a = SPECIES.luxray.stats, d = SPECIES.empoleon.stats;
  const base = Math.floor(Math.floor((2 * 50 / 5 + 2) * 90 * a.spa / d.spd) / 50) + 2;
  const want = base * 1.5 * 2 * 0.925;
  const got = expectedDamage(u('luxray'), u('empoleon', 'enemy'), MOVES.thunderbolt, '.');
  assert.ok(Math.abs(got - want) <= 1, `${got} vs ${want}`);
});

test('weak hit still deals at least 1', () => {
  const r = calcDamage(u('roserade', 'enemy'), u('bronzong'), MOVES.energyball, { rng: () => 0.5, defTile: '^' });
  assert.ok(r.typeMult > 0);
  assert.ok(r.damage >= 1);
});

test('miss deals 0', () => {
  // 수풀 + 스피드 차 → hitChance < 100, rng 0.999 → 빗나감
  const r = calcDamage(u('bronzong', 'enemy'), u('infernape'), MOVES.flashcannon, { rng: () => 0.999, defTile: '"' });
  assert.equal(r.hit, false);
  assert.equal(r.damage, 0);
});

test('immune never reports a miss (no hit roll for immune targets)', () => {
  const r = calcDamage(u('torterra'), u('honchkrow', 'enemy'), MOVES.earthquake, { rng: () => 0.999, defTile: '"' });
  assert.equal(r.typeMult, 0);
  assert.equal(r.hit, true);
  assert.equal(r.damage, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { calcDamage, hitChance, expectedDamage } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';
import { SPECIES } from '../src/data/species.js';
import { makeUnit } from '../src/core/battle.js';

const u = (species, side = 'ally', level = 50) => makeUnit({ species, side, x: 0, y: 0, level, moves: ['tackle'] });

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
  const a = u('luxray').stats, d = u('empoleon', 'enemy').stats;
  const base = Math.floor(Math.floor((2 * 50 / 5 + 2) * 65 * a.atk / d.def) / 50) + 2;
  const want = base * 1.5 * 2 * 0.925;
  const got = expectedDamage(u('luxray'), u('empoleon', 'enemy'), MOVES.spark, '.');
  assert.ok(Math.abs(got - want) <= 1, `${got} vs ${want}`);
});

test('weak hit still deals at least 1', () => {
  const r = calcDamage(u('roserade', 'enemy', 5), u('bronzong'), MOVES['razor-leaf'], { rng: () => 0.5, defTile: '^' });
  assert.ok(r.typeMult > 0);
  assert.ok(r.damage >= 1);
});

test('miss deals 0', () => {
  // 수풀 + 스피드 차 → hitChance < 100, rng 0.999 → 빗나감
  const r = calcDamage(u('bronzong', 'enemy'), u('infernape'), MOVES.tackle, { rng: () => 0.999, defTile: '"' });
  assert.equal(r.hit, false);
  assert.equal(r.damage, 0);
});

test('immune never reports a miss (no hit roll for immune targets)', () => {
  const r = calcDamage(u('torterra'), u('honchkrow', 'enemy'), MOVES.earthquake, { rng: () => 0.999, defTile: '"' });
  assert.equal(r.typeMult, 0);
  assert.equal(r.hit, true);
  assert.equal(r.damage, 0);
});

test('attacker level scales damage', () => {
  const lo = expectedDamage(u('chimchar', 'ally', 8), u('bronzor', 'enemy', 8), MOVES.ember, '.');
  const hi = expectedDamage(u('chimchar', 'ally', 50), u('bronzor', 'enemy', 8), MOVES.ember, '.');
  assert.ok(hi > lo * 3, `${lo} → ${hi}`);
});

// ---- 랭크 ----
import { applyStageChange } from '../src/core/stages.js';

test('attack +2 roughly doubles damage, defense -1 → ×1.5', () => {
  const a = u('infernape'), d = u('torterra', 'enemy');
  const base = expectedDamage(a, d, MOVES.flamethrower, '.');
  applyStageChange(a, 'spa', 2);
  assert.ok(Math.abs(expectedDamage(a, d, MOVES.flamethrower, '.') / base - 2) < 0.1);
  const a2 = u('infernape'), d2 = u('torterra', 'enemy');
  const b2 = expectedDamage(a2, d2, MOVES['close-combat'], '.');
  applyStageChange(d2, 'def', -1);
  assert.ok(Math.abs(expectedDamage(a2, d2, MOVES['close-combat'], '.') / b2 - 1.5) < 0.1);
});

test('accuracy/evasion stages shift hit chance by 8 per stage; speed stages count', () => {
  const a = u('infernape'), d = u('torterra', 'enemy');
  const h0 = hitChance(a, d, MOVES['razor-leaf'], '.');
  applyStageChange(a, 'acc', -2);
  assert.equal(hitChance(a, d, MOVES['razor-leaf'], '.'), h0 - 16);
  const slow = u('torterra'), fast = u('infernape', 'enemy');
  const before = hitChance(slow, fast, MOVES.tackle, '.');
  applyStageChange(fast, 'spe', 2);
  assert.ok(hitChance(slow, fast, MOVES.tackle, '.') < before);
});

// ---- 날씨 ----
import { makeUnit as mkW } from '../src/core/battle.js';
test('weather changes damage and accuracy', () => {
  const a = mkW({ species: 'piplup', side: 'ally', x: 0, y: 0, level: 30, moves: ['water-gun'] });
  const d = mkW({ species: 'pikachu', side: 'enemy', x: 1, y: 0, level: 30, moves: ['tackle'] });
  const M = (k) => ({ ...MOVES[k], id: k });
  const base = expectedDamage(a, d, M('water-gun'), '.');
  assert.ok(Math.abs(expectedDamage(a, d, M('water-gun'), '.', 1, 'rain') - base * 1.5) < 0.01);
  assert.ok(Math.abs(expectedDamage(a, d, M('water-gun'), '.', 1, 'sun') - base * 0.5) < 0.01);
  assert.equal(hitChance(a, d, M('thunder'), '"', 'rain'), 100); // 풀숲 회피가 있어도 반드시 명중
  assert.ok(hitChance(a, d, M('thunder'), '.', 'sun') <= 50);
  assert.equal(hitChance(a, d, M('blizzard'), '"', 'hail'), 100);
  assert.equal(hitChance(a, d, M('tackle'), '.', 'fog'), hitChance(a, d, M('tackle'), '.') - 10);
});

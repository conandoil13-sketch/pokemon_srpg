import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newStatus, canInflict, inflict, moveBudget, speedMultiplier, phaseStart, phaseEnd, checkAction } from '../src/core/status.js';
import { effectiveStat } from '../src/core/stages.js';
import { expectedDamage, confusionDamage } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';
import { SPECIES } from '../src/data/species.js';

const u = (species, extra = {}) => ({ species, level: 30, stats: { hp: 80, atk: 60, def: 60, spa: 60, spd: 60, spe: 100 }, hp: 80, maxHp: 80, ...newStatus(), ...extra });
const seq = (vals) => { let i = 0; return () => vals[i++] ?? 0.5; };

test('type immunities (gen 4) and thunder wave vs ground', () => {
  assert.deepEqual(canInflict(u('charmander'), 'burn'), { ok: false, reason: 'immune' });
  assert.equal(canInflict(u('snorunt'), 'freeze').reason, 'immune');
  assert.equal(canInflict(u('bulbasaur'), 'poison').reason, 'immune');
  assert.equal(canInflict(u('steelix'), 'toxic').reason, 'immune');
  assert.equal(canInflict(u('gible'), 'paralysis', MOVES['thunder-wave']).reason, 'immune');
  assert.equal(canInflict(u('gible'), 'paralysis', MOVES['stun-spore']).ok, true);
  assert.equal(canInflict(u('pikachu'), 'paralysis').ok, true);
});

test('one primary status; confusion stacks once', () => {
  const p = u('pikachu');
  assert.equal(inflict(p, 'poison', seq([])).ok, true);
  assert.deepEqual(inflict(p, 'sleep', seq([])), { ok: false, reason: 'already' });
  assert.equal(inflict(p, 'confusion', seq([0])).ok, true);
  assert.equal(p.confusion, 1);
  assert.equal(inflict(p, 'confusion', seq([0])).reason, 'already');
  assert.equal(p.status, 'poison');
});

test('paralysis: half movement (min 1), half speed', () => {
  for (const [sp, want] of [['bronzor', 1], ['pikachu', Math.max(1, Math.floor(SPECIES.pikachu.move / 2))]]) {
    const x = u(sp); inflict(x, 'paralysis', seq([]));
    assert.equal(moveBudget(x), want, sp);
  }
  const x = u('pikachu');
  assert.equal(moveBudget(x), SPECIES.pikachu.move);
  inflict(x, 'paralysis', seq([]));
  assert.equal(speedMultiplier(x), 0.5);
  assert.equal(effectiveStat(x, 'spe'), 50);
});

test('poison 1/8, toxic n/16 growing, burn 1/8, min 1', () => {
  const p = u('pikachu'); inflict(p, 'poison', seq([]));
  assert.deepEqual(phaseEnd(p), { damage: 10, kind: 'poison', confusionEnded: false, infatuationEnded: false });
  const t = u('pikachu'); inflict(t, 'toxic', seq([]));
  assert.equal(phaseEnd(t).damage, 5);
  assert.equal(phaseEnd(t).damage, 10);
  const b = u('pikachu', { maxHp: 4, hp: 4 }); inflict(b, 'burn', seq([]));
  assert.deepEqual(phaseEnd(b), { damage: 1, kind: 'burn', confusionEnded: false, infatuationEnded: false });
});

test('burn halves physical damage only', () => {
  const a = u('pikachu'), d = u('pikachu');
  const phys = expectedDamage(a, d, MOVES.tackle, '.'), spec = expectedDamage(a, d, MOVES['thunder-shock'], '.');
  inflict(a, 'burn', seq([]));
  assert.ok(Math.abs(expectedDamage(a, d, MOVES.tackle, '.') - phys / 2) <= 1);
  assert.equal(expectedDamage(a, d, MOVES['thunder-shock'], '.'), spec);
});

test('confusion self-hit damage: 40 power, own atk/def, at least 1', () => {
  const a = u('pikachu');
  const base = confusionDamage(a);
  assert.ok(base >= 1);
  a.stages = { atk: 2, def: 0 };
  assert.ok(confusionDamage(a) > base);
});

test('sleep 1~3 phases then wakes', () => {
  const s = u('pikachu'); inflict(s, 'sleep', seq([0])); // 1턴
  assert.deepEqual(phaseStart(s, seq([])), { skip: true, event: 'asleep' });
  assert.deepEqual(phaseStart(s, seq([])), { skip: false, event: 'woke' });
  assert.equal(s.status, null);
  const l = u('pikachu'); inflict(l, 'sleep', seq([0.99])); // 3턴
  for (let i = 0; i < 3; i++) assert.equal(phaseStart(l, seq([])).skip, true);
  assert.equal(phaseStart(l, seq([])).event, 'woke');
});

test('freeze: 20% thaw, forced thaw after 3 skipped phases', () => {
  const f = u('pikachu'); inflict(f, 'freeze', seq([]));
  for (let i = 0; i < 3; i++) assert.deepEqual(phaseStart(f, seq([0.5])), { skip: true, event: 'frozen' });
  assert.deepEqual(phaseStart(f, seq([0.5])), { skip: false, event: 'thawed' });
  const g = u('pikachu'); inflict(g, 'freeze', seq([]));
  assert.deepEqual(phaseStart(g, seq([0.1])), { skip: false, event: 'thawed' });
  assert.equal(g.status, null);
  assert.deepEqual(phaseStart(u('pikachu'), seq([])), { skip: false });
});

test('confusion counts down at phase end; checkAction rolls', () => {
  const c = u('pikachu'); inflict(c, 'confusion', seq([0.3])); // 1 + floor(0.3*4) = 2
  assert.equal(c.confusion, 2);
  assert.equal(phaseEnd(c).confusionEnded, false);
  assert.equal(phaseEnd(c).confusionEnded, true);
  const p = u('pikachu'); inflict(p, 'paralysis', seq([]));
  assert.equal(checkAction(p, seq([0.2])), 'paralysis');
  assert.equal(checkAction(p, seq([0.3])), null);
  const q = u('pikachu'); inflict(q, 'confusion', seq([0.9]));
  assert.equal(checkAction(q, seq([0.4])), 'confusion');
  assert.equal(checkAction(q, seq([0.6])), null);
});

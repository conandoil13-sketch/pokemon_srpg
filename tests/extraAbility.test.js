import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES } from '../src/data/abilities.js';
import { ABILITY_TIERS } from '../src/data/abilityTiers.js';
import { EXTRA_COST, TIER_ODDS, TEASE_ODDS, extraCandidates, rollExtraAbility, rollExtra, extraTier } from '../src/core/extraAbility.js';
import { newMember } from '../src/core/progress.js';
import { lineRoot } from '../src/core/gacha.js';

test('every ability has a tier or is inactive', () => {
  const missing = Object.values(ABILITIES).filter((a) => !a.inactive && !ABILITY_TIERS[a.id]).map((a) => a.id);
  assert.deepEqual(missing, []);
  for (const t of Object.values(ABILITY_TIERS)) assert.ok(['SS', 'S', 'A', 'B', 'C'].includes(t));
});

test('new grades from the spec', () => {
  for (const id of ['multiscale', 'sheer-force', 'regenerator']) assert.equal(ABILITY_TIERS[id], 'S');
  for (const id of ['magic-bounce', 'moody']) assert.equal(ABILITY_TIERS[id], 'A');
  assert.equal(ABILITY_TIERS.contrary, 'B');
  assert.equal(ABILITY_TIERS['heavy-metal'], 'C');
  assert.equal(ABILITY_TIERS.defeatist, 'SS');
  assert.equal(ABILITY_TIERS['wonder-guard'], 'SS');
});

test('candidates skip SS, inactive and the slot-1 ability', () => {
  const s = extraCandidates('S', 'technician');
  assert.ok(!s.includes('technician') && !s.includes('huge-power'));
  assert.ok(s.length > 0);
  for (const t of ['S', 'A', 'B', 'C']) for (const id of extraCandidates(t, null)) { assert.ok(!ABILITIES[id].inactive, id); assert.equal(extraTier(id), t); }
});

test('roll is seeded', () => {
  assert.deepEqual(rollExtraAbility(7, 'blaze'), rollExtraAbility(7, 'blaze'));
});

test('tier odds', () => {
  const n = 20000, count = { S: 0, A: 0, B: 0, C: 0 };
  for (let seq = 0; seq < n; seq++) {
    const r = rollExtraAbility(seq, 'blaze');
    count[r.tier]++;
    assert.equal(extraTier(r.id), r.tier);
    assert.notEqual(r.id, 'blaze');
  }
  for (const t of Object.keys(TIER_ODDS)) assert.ok(Math.abs(count[t] / n - TIER_ODDS[t]) < 0.02, `${t} ${count[t] / n}`);
  assert.deepEqual(TIER_ODDS, { C: 0.5, B: 0.3, A: 0.15, S: 0.05 });
});

test('tease only on A/B', () => {
  assert.deepEqual(TEASE_ODDS, { A: 0.3, B: 0.1 });
  const seen = { A: [0, 0], B: [0, 0] };
  for (let seq = 0; seq < 20000; seq++) {
    const r = rollExtraAbility(seq, null);
    if (r.tier === 'S' || r.tier === 'C') assert.equal(r.tease, false);
    else { seen[r.tier][0]++; if (r.tease) seen[r.tier][1]++; }
  }
  assert.ok(Math.abs(seen.A[1] / seen.A[0] - 0.3) < 0.04, `A ${seen.A[1] / seen.A[0]}`);
  assert.ok(Math.abs(seen.B[1] / seen.B[0] - 0.1) < 0.03, `B ${seen.B[1] / seen.B[0]}`);
});

const gameWith = (species, shards) => {
  const m = { ...newMember(species, 30), uid: 1 };
  return { game: { party: [m], box: [], shards: { [lineRoot(species)]: shards }, extraSeq: 0 }, m };
};

test('rollExtra spends 2 shards and bumps the counter', () => {
  assert.equal(EXTRA_COST, 2);
  const { game, m } = gameWith('charmander', 4);
  const r = rollExtra(game, 1);
  assert.equal(r.ok, true);
  assert.equal(game.shards.charmander, 2);
  assert.equal(game.extraSeq, 1);
  assert.equal(m.extraAbility, r.id);
  assert.equal(r.prev, null);
  const r2 = rollExtra(game, 1);
  assert.equal(r2.prev, r.id);
  assert.equal(game.shards.charmander, 0);
  assert.equal(game.extraSeq, 2);
});

test('rollExtra refuses with 1 shard', () => {
  const { game, m } = gameWith('charmander', 1);
  m.extraAbility = 'technician';
  assert.deepEqual(rollExtra(game, 1), { ok: false, reason: 'shards' });
  assert.equal(game.shards.charmander, 1);
  assert.equal(game.extraSeq, 0);
  assert.equal(m.extraAbility, 'technician');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GACHA_COST, lineFinalBst, rarityOf, gachaPool, lineRoot, pull, joinLevel } from '../src/core/gacha.js';
import { SPECIES } from '../src/data/species.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const game = (extra = {}) => ({
  party: ['ditto', 'chimchar', 'piplup', 'turtwig', 'shinx'].map((s) => newMember(s, 10)),
  sortie: ['chimchar', 'piplup', 'turtwig', 'shinx'], coins: 1000, shards: {}, ...extra,
});

test('pool: stage-0, non-legendary, no ditto; sorted', () => {
  const p = gachaPool();
  const all = [...p.common, ...p.rare, ...p.epic];
  for (const k of all) assert.ok(SPECIES[k].stage === 0 && !SPECIES[k].legendary && k !== 'ditto', k);
  assert.ok(!all.includes('ivysaur'));
  for (const tier of Object.values(p)) assert.deepEqual(tier, [...tier].sort());
});

test('rarity by the line final bst (max over branches)', () => {
  assert.equal(lineFinalBst('dratini'), SPECIES.dragonite.bst);
  assert.equal(rarityOf('dratini'), 'epic');
  assert.equal(rarityOf('caterpie'), 'common');
  const eeveeMax = Math.max(...SPECIES.eevee.evolutions.map((e) => SPECIES[e.to].bst));
  assert.equal(lineFinalBst('eevee'), eeveeMax);
  for (const k of [...gachaPool().common]) assert.ok(lineFinalBst(k) < 450, k);
  for (const k of [...gachaPool().rare]) assert.ok(lineFinalBst(k) >= 450 && lineFinalBst(k) < 535, k);
  for (const k of [...gachaPool().epic]) assert.ok(lineFinalBst(k) >= 535, k);
});

test('distribution ≈ 70/25/5 over 10,000 seeded pulls', () => {
  const rng = createRng(42);
  const g = game({ coins: GACHA_COST * 10000 });
  const n = { common: 0, rare: 0, epic: 0 };
  for (let i = 0; i < 10000; i++) n[pull(g, rng).rarity]++;
  assert.ok(Math.abs(n.common / 100 - 70) <= 2, JSON.stringify(n));
  assert.ok(Math.abs(n.rare / 100 - 25) <= 2, JSON.stringify(n));
  assert.ok(Math.abs(n.epic / 100 - 5) <= 2, JSON.stringify(n));
});

test('lineRoot', () => {
  assert.equal(lineRoot('infernape'), 'chimchar');
  assert.equal(lineRoot('chimchar'), 'chimchar');
  assert.equal(lineRoot('espeon'), 'eevee');
});

test('duplicate line (evolved member) → shard, party unchanged', () => {
  const fresh = () => { const g = game({ coins: 100 }); g.party[1] = newMember('monferno', 20); return g; };
  let g, r;
  for (let s = 1; s < 5000; s++) { g = fresh(); r = pull(g, createRng(s)); if (r.species === 'chimchar') break; }
  assert.equal(r.species, 'chimchar');
  assert.equal(r.duplicate, true);
  assert.equal(g.shards.chimchar, 1);
  assert.equal(g.party.length, 5);
  assert.equal(g.coins, 0);
});

test('new species joins at avg sortie level - 2 (min 5) and costs 100', () => {
  const g = game({ coins: 150 });
  const r = pull(g, createRng(7));
  assert.equal(g.coins, 50);
  if (!r.duplicate) {
    assert.equal(g.party.at(-1).species, r.species);
    assert.equal(g.party.at(-1).level, 8);
  }
  assert.equal(joinLevel(game()), 8);
  assert.equal(joinLevel({ ...game(), party: game().party.map((m) => ({ ...m, level: 5 })) }), 5);
});

test('not enough coins → nothing happens', () => {
  const g = game({ coins: 99 });
  const r = pull(g, createRng(1));
  assert.deepEqual(r, { ok: false, reason: 'coins' });
  assert.equal(g.coins, 99);
  assert.equal(g.party.length, 5);
});

import { rollBall, rollBalls, claimBall, BALL_OF } from '../src/core/gacha.js';

test('rollBalls returns 3 independent results without touching the game', () => {
  const g = game({ coins: 150 });
  const party = g.party.length;
  const a = rollBalls(createRng(5)), b = rollBalls(createRng(5));
  assert.equal(a.length, 3);
  assert.deepEqual(a, b);
  assert.equal(g.coins, 150);
  assert.equal(g.party.length, party);
  const rng = createRng(9);
  const n = { common: 0, rare: 0, epic: 0 };
  for (let i = 0; i < 3334; i++) for (const ball of rollBalls(rng)) n[ball.rarity]++;
  const total = n.common + n.rare + n.epic;
  assert.ok(Math.abs(n.common / total * 100 - 70) <= 2, JSON.stringify(n));
  assert.ok(Math.abs(n.rare / total * 100 - 25) <= 2, JSON.stringify(n));
  assert.ok(Math.abs(n.epic / total * 100 - 5) <= 2, JSON.stringify(n));
  assert.deepEqual(BALL_OF, { common: 'poke', rare: 'great', epic: 'ultra' });
});

test('claimBall charges once and applies only the chosen ball', () => {
  const g = game({ coins: 150 });
  const balls = [{ species: 'bulbasaur', rarity: 'rare' }, { species: 'dratini', rarity: 'epic' }, { species: 'caterpie', rarity: 'common' }];
  const r = claimBall(g, balls[0], createRng(1));
  assert.equal(r.ok, true);
  assert.equal(g.coins, 50);
  assert.ok(g.party.some((m) => m.species === 'bulbasaur'));
  assert.ok(!g.party.some((m) => m.species === 'dratini' || m.species === 'caterpie'));
  assert.deepEqual(g.shards, {});
});

test('claimBall refuses without coins; owned line gives a shard', () => {
  const poor = game({ coins: 50 });
  assert.deepEqual(claimBall(poor, { species: 'caterpie', rarity: 'common' }, createRng(1)), { ok: false, reason: 'coins' });
  assert.equal(poor.coins, 50);
  const g = game({ coins: 100 });
  const r = claimBall(g, { species: 'chimchar', rarity: 'common' }, createRng(1));
  assert.equal(r.duplicate, true);
  assert.equal(g.shards.chimchar, 1);
  assert.equal(rollBall(createRng(3)).species.length > 0, true);
});

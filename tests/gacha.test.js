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
  assert.equal(g.shards.chimchar, 2);
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

import { claimBalls, GACHA_TEN_COST } from '../src/core/gacha.js';

test('claimBalls: ten-pull charges 900 once, applies all, repeats in one pull become shards', () => {
  assert.equal(GACHA_TEN_COST, 900);
  const g = game({ coins: 1000 });
  const balls = [...rollBalls(createRng(11), 8), { species: 'bulbasaur', rarity: 'rare' }, { species: 'bulbasaur', rarity: 'rare' }];
  const party = g.party.length;
  const r = claimBalls(g, balls, createRng(2));
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 10);
  assert.equal(g.coins, 100);
  assert.equal(r.results[9].duplicate, true);
  const shards = Object.values(g.shards).reduce((a, b) => a + b, 0);
  const duplicates = r.results.filter((result) => result.duplicate);
  assert.equal(g.party.length - party + duplicates.length, 10);
  assert.equal(r.results[9].shardCount, 2);
  assert.equal(shards, duplicates.reduce((sum, result) => sum + ({ common: 1, rare: 2, epic: 3 }[result.rarity]), 0));
  assert.deepEqual(claimBalls(game({ coins: 899 }), balls, createRng(2)), { ok: false, reason: 'coins' });
});

test('a duplicate pull raises the whole line and records genders the current form cannot use', async () => {
  const { newGame } = await import('../src/core/save.js');
  const { giveUid } = await import('../src/core/members.js');
  const g = newGame();
  const low = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const a = giveUid(g, { ...newMember('gallade', 30), ivs: { ...low }, gender: 'male', genders: ['male'] }); g.party.push(a);
  const b = giveUid(g, { ...newMember('ralts', 20), ivs: { ...low }, gender: 'male', genders: ['male'] }); g.party.push(b);
  g.coins = 99999;
  const rng = createRng(3);
  for (let i = 0; i < 30 && !a.genders.includes('female'); i++) claimBall(g, { species: 'ralts', rarity: 'common' }, rng);
  assert.ok(a.genders.includes('female'), 'female recorded even though gallade is male-only');
  assert.deepEqual(b.genders, a.genders);
  assert.notEqual(b.genders, a.genders);
  assert.ok(Object.values(a.ivs).some((v) => v > 0));
  assert.deepEqual(b.ivs, a.ivs);
  assert.equal(a.gender, 'male');
  assert.equal(g.party.length, 7, 'no new member for a duplicate');
});

import { rollBalls as rollB, GACHA_TEN_COST as TEN, claimBalls as claimTen } from '../src/core/gacha.js';
import { newGame as fresh } from '../src/core/save.js';
test('a ten-pull voucher pays for the 10-pull instead of coins', () => {
  const g = fresh(); g.coins = 0; g.items.tenVoucher = 1;
  const r = claimTen(g, rollB(createRng(3), 10), createRng(4));
  assert.equal(r.ok, true); assert.equal(r.voucher, true);
  assert.equal(g.items.tenVoucher, 0); assert.equal(g.coins, 0);
  g.coins = TEN;
  assert.equal(claimTen(g, rollB(createRng(5), 10), createRng(6)).voucher, undefined);
  assert.equal(g.coins, 0);
});

test('epic duplicate awards three shared shards', () => {
  const species = gachaPool().epic[0];
  const g = game({ party: [newMember(species, 10)] });
  const result = claimBall(g, { species, rarity: 'epic' }, createRng(1));
  assert.equal(result.shardCount, 3);
  assert.equal(g.shards[species], 3);
});

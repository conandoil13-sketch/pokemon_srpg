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

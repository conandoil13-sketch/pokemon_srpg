import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statCap, effectiveBase, bonusTotal, applyPowder, capsuleUse, applyCapsule, clearSecondType,
  rollCapsules, addCapsules, CAPSULE_CHANCE, CAPSULE_BAG_MAX, POWDER_STEP, STAT_MAX, DEFAULT_BUILD,
} from '../src/core/dittoBuild.js';
import { newGame } from '../src/core/save.js';
import { abilityOf, typesOfMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { MOVES } from '../src/data/moves.js';

const fresh = (level = 8) => {
  const g = newGame();
  const d = g.party.find((m) => m.species === 'ditto');
  d.level = level;
  return { g, d };
};

test('statCap rises every 10 levels up to 600', () => {
  assert.deepEqual([1, 9, 10, 69, 70, 99].map(statCap), [320, 320, 360, 560, 600, 600]);
  assert.equal(POWDER_STEP, 10);
  assert.equal(bonusTotal(DEFAULT_BUILD()), 0);
  assert.deepEqual(effectiveBase(DEFAULT_BUILD()), { hp: 48, atk: 48, def: 48, spa: 48, spd: 48, spe: 48 });
});

test('powders: +10 from the bag, refused at the cap, at 255, or with none', () => {
  const { g, d } = fresh(8);
  assert.equal(applyPowder(g, 'atk').reason, 'none');
  g.items.powders.atk = 5;
  for (let i = 0; i < 3; i++) assert.deepEqual(applyPowder(g, 'atk'), { ok: true }); // 288 → 318
  assert.equal(d.build.bonus.atk, 30);
  assert.equal(g.items.powders.atk, 2);
  assert.equal(applyPowder(g, 'atk').reason, 'cap'); // 318 + 10 > 320
  assert.equal(g.items.powders.atk, 2);
  d.level = 99; d.build.bonus.atk = STAT_MAX - 48;
  assert.equal(applyPowder(g, 'atk').reason, 'max');
});

test('capsules: slots, same refusals, second type only from Lv.10, consumed on use', () => {
  const { g, d } = fresh(9);
  g.items.capsules = [
    { kind: 'move', value: 'tackle', from: 'rattata' },
    { kind: 'move', value: 'ember', from: 'charmander' },
    { kind: 'type', value: 'fire', from: 'charmander' },
    { kind: 'ability', value: 'limber', from: 'persian' },
    { kind: 'ability', value: 'blaze', from: 'charmander' },
  ];
  assert.equal(capsuleUse(d, g.items.capsules[0]).reason, 'same');
  assert.deepEqual(capsuleUse(d, g.items.capsules[1]).slots, [0, 1, 2, 3]);
  assert.deepEqual(capsuleUse(d, g.items.capsules[2]).slots, [0]); // Lv.9
  assert.equal(capsuleUse(d, g.items.capsules[3]).reason, 'same');
  assert.deepEqual(applyCapsule(g, 1, 1), { ok: true });
  assert.deepEqual(d.moves, ['tackle', 'ember']);
  assert.equal(g.items.capsules.length, 4);
  d.level = 10;
  const typeIdx = g.items.capsules.findIndex((c) => c.kind === 'type');
  assert.deepEqual(capsuleUse(d, g.items.capsules[typeIdx]).slots, [0, 1]);
  applyCapsule(g, typeIdx, 1);
  assert.deepEqual(d.build.types, ['normal', 'fire']);
  assert.deepEqual(typesOfMember(d), ['normal', 'fire']);
  g.items.capsules.push({ kind: 'type', value: 'normal', from: 'rattata' });
  assert.deepEqual(capsuleUse(d, g.items.capsules.at(-1)).slots, []); // 노말은 이미 첫 칸, 둘째 칸에 넣으면 중복
  assert.equal(capsuleUse(d, g.items.capsules.at(-1)).reason, 'same');
  applyCapsule(g, g.items.capsules.findIndex((c) => c.value === 'blaze'), 0);
  assert.equal(abilityOf(d), 'blaze');
  assert.deepEqual(clearSecondType(g), { ok: true });
  assert.deepEqual(d.build.types, ['normal']);
  assert.equal(clearSecondType(g).reason, 'none');
});

test('rollCapsules: ~15%, bosses always, contents come from that foe, unlearnable moves never', () => {
  const foe = { species: 'charmander', types: ['fire'], moves: ['scratch', 'ember', 'transform'], ability: 'blaze', boss: false };
  const rng = createRng(4);
  let n = 0;
  const seen = new Set();
  for (let i = 0; i < 10000; i++) for (const c of rollCapsules([foe], rng)) { n++; seen.add(`${c.kind}:${c.value}`); assert.equal(c.from, 'charmander'); }
  assert.ok(Math.abs(n / 100 - CAPSULE_CHANCE * 100) <= 1.5, String(n));
  assert.ok(!seen.has('move:transform') || MOVES.transform?.learnable);
  for (const k of ['type:fire', 'move:scratch', 'move:ember', 'ability:blaze']) assert.ok(seen.has(k), k);
  assert.equal(rollCapsules([{ ...foe, boss: true }], () => 0.99).length, 1);
});

test('addCapsules keeps at most 200 and reports what was dropped', () => {
  const { g } = fresh();
  g.items.capsules = Array.from({ length: CAPSULE_BAG_MAX - 1 }, () => ({ kind: 'type', value: 'fire', from: 'charmander' }));
  assert.equal(addCapsules(g, [{ kind: 'type', value: 'water', from: 'squirtle' }, { kind: 'type', value: 'grass', from: 'bulbasaur' }]), 1);
  assert.equal(g.items.capsules.length, CAPSULE_BAG_MAX);
  assert.equal(g.items.capsules.at(-1).value, 'grass');
});

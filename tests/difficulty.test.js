import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';
import { encounterPool } from '../src/core/encounters.js';
import { threat, bossLevel, levelCapFor } from '../src/core/difficulty.js';
import { BALANCE } from '../src/data/balance.js';

test('every dungeon follows the dungeon guide (fields, budgets, early species, caps, unlock chain)', () => {
  DUNGEONS.forEach((d, i) => {
    assert.equal(d.baseLevel.length, d.floors, d.id);
    assert.equal(d.budget.length, d.floors, d.id);
    for (let f = 1; f < d.floors; f++) {
      assert.ok(d.budget[f] > d.budget[f - 1], `${d.id} budget ${f}`);
      assert.ok(d.baseLevel[f] >= d.baseLevel[f - 1], `${d.id} level ${f}`);
    }
    assert.ok(d.early.length >= 4, d.id);
    for (const k of d.early) {
      assert.ok(SPECIES[k], `${d.id}: ${k}`);
      assert.equal(SPECIES[k].stage, 0, k);
      assert.ok(SPECIES[k].types.some((t) => d.types.includes(t)), `${d.id}: ${k} type`);
    }
    assert.equal(d.levelCap, bossLevel(d), d.id);
    assert.equal(d.unlock, i === 0 ? null : DUNGEONS[i - 1].id, d.id);
    assert.equal(d.level, undefined, `${d.id}: old level() removed`);
    assert.equal(d.count, undefined, `${d.id}: old count() removed`);
  });
  assert.ok(!DUNGEONS[0].types.includes('electric') && !DUNGEONS[0].types.includes('fairy'));
});

test('field floors 1-2 only use early species; threat and exp multiplier', () => {
  const d = DUNGEONS[0];
  for (const f of [1, 2]) for (const k of encounterPool(d, f)) assert.ok(d.early.includes(k), `${f}: ${k}`);
  assert.ok(encounterPool(d, 3).length > encounterPool(d, 1).length);
  assert.ok(Math.abs(threat(7, 'pidgey') - 17.57) < 0.01);
  assert.equal(BALANCE.expMultiplier, 1);
});

test('level cap: first uncleared dungeon in the chain, last one stays after everything is cleared', () => {
  assert.equal(levelCapFor({ cleared: [] }), 15);
  assert.equal(levelCapFor({ cleared: ['sinnoh-field'] }), 22);
  assert.equal(levelCapFor({ cleared: ['sinnoh-field', 'sinnoh-cave'] }), 22);
});

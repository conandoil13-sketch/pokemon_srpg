import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsAt, expForLevel, levelForExp, expYield } from '../src/core/stats.js';

const INFERNAPE = { hp: 76, atk: 104, def: 71, spa: 104, spd: 71, spe: 108 };

test('statsAt at Lv50: other stats as before, HP × (1.6 + 50/100)', () => {
  assert.deepEqual(statsAt(INFERNAPE, 50), { hp: Math.floor(151 * 2.1), atk: 124, def: 91, spa: 124, spd: 91, spe: 128 });
});

test('statsAt at Lv8', () => {
  const s = statsAt(INFERNAPE, 8);
  assert.equal(s.hp, Math.floor(32 * 1.68));
  assert.equal(s.atk, 24);
});

test('growth curves', () => {
  assert.equal(expForLevel('medium-slow', 10), 560);
  assert.equal(expForLevel('medium-slow', 50), 117360);
  assert.equal(expForLevel('medium-slow', 100), 1059860);
  assert.equal(expForLevel('medium', 50), 125000);
  assert.equal(expForLevel('fast', 100), 800000);
  assert.equal(expForLevel('slow', 100), 1250000);
  assert.equal(expForLevel('slow-then-very-fast', 100), 600000);
  assert.equal(expForLevel('fast-then-very-slow', 100), 1640000);
  for (const g of ['fast', 'medium', 'medium-slow', 'slow', 'slow-then-very-fast', 'fast-then-very-slow']) {
    assert.equal(expForLevel(g, 1), 0, g);
    for (let l = 2; l <= 100; l++) assert.ok(expForLevel(g, l) > expForLevel(g, l - 1), `${g} monotonic at ${l}`);
  }
});

test('levelForExp', () => {
  assert.equal(levelForExp('medium-slow', 559), 9);
  assert.equal(levelForExp('medium-slow', 560), 10);
  assert.equal(levelForExp('medium-slow', 1e9), 100);
  assert.equal(levelForExp('medium', 0), 1);
});

test('expYield', () => {
  assert.equal(expYield(62, 8, 2), 140);
});

test('HP scale is 1.6 + level/100 and lives in balance', async () => {
  const { BALANCE } = await import('../src/data/balance.js');
  assert.equal(BALANCE.hpScale(10), 1.7);
  assert.equal(BALANCE.hpScale(100), 2.6);
});

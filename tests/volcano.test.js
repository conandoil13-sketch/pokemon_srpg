import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';

const VC = DUNGEONS.find((d) => d.id === 'volcano');

test('volcano is 8-2 next to the stage 8 placeholder; desert opens it', () => {
  const s8 = DUNGEONS.filter((d) => d.stage === 8);
  assert.deepEqual(s8.map((d) => [d.id, d.branch, d.unlock]), [['trial-6', 1, 'power-plant'], ['volcano', 2, 'desert']]);
  assert.equal(VC.name, '화산동굴'); assert.equal(VC.theme, 'volcano');
  assert.deepEqual(VC.baseLevel, s8[0].baseLevel);
  assert.ok(VC.volcano);
  assert.deepEqual(VC.weather, [{ id: 'sun', chance: 0.3 }]);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 9).unlock, ['trial-6', 'volcano']);
});

test('volcano: slugma line always in the pool within the stage cap', () => {
  for (let f = 1; f <= VC.floors; f++) {
    const pool = encounterPool(VC, f);
    assert.ok(pool.includes('slugma'), `floor ${f}`);
    assert.equal(pool.includes('magcargo'), VC.stageCap(f) >= 1, `floor ${f}`);
  }
});

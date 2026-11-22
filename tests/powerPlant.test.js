import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';

test('power plant is 7-1 next to the stage 7 placeholder; sewer opens it, deep cave opens 7-2', () => {
  const s7 = DUNGEONS.filter((d) => d.stage === 7);
  assert.deepEqual(s7.map((d) => [d.id, d.branch, d.unlock]), [['power-plant', 1, 'sewer'], ['trial-5', 2, 'deep-cave']]);
  const pp = s7[0];
  assert.equal(pp.name, '발전소'); assert.equal(pp.theme, 'power-plant');
  assert.deepEqual(pp.baseLevel, s7[1].baseLevel); // 같은 자리 곡선
  assert.ok(pp.power && pp.ambush.species === 'voltorb' && pp.ambush.drop === 12);
  assert.deepEqual(pp.weather, []);
  assert.equal(pp.clusters['~'], 0);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 8).unlock, ['power-plant', 'trial-5']);
});

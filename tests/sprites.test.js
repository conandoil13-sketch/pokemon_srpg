import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestSprites, setSpriteLoader } from '../src/render/sprites.js';

test('each species is requested once, failures resolve, only requested species load', async () => {
  const calls = [];
  setSpriteLoader(async (key) => { calls.push(key); if (key === 'pidgey') throw new Error('404'); });
  await requestSprites(['bulbasaur', 'pidgey']);
  await requestSprites(['bulbasaur', 'pidgey', 'ditto']);
  await Promise.all([requestSprites(['eevee']), requestSprites(['eevee'])]); // 동시에 두 번
  assert.deepEqual(calls.sort(), ['bulbasaur', 'ditto', 'eevee', 'pidgey']);
});

import { hasAnim } from '../src/render/sprites.js';
test('hasAnim is false for sprites that are not loaded', () => {
  assert.equal(hasAnim('no-such-mon', 'Sleep'), false);
});

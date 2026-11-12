import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleSpriteSize } from '../src/render/sprites.js';

test('battle sprites: integer upscale when small, integer shrink when too big', () => {
  assert.equal(battleSpriteSize(96, 96), 96);   // 1x
  assert.equal(battleSpriteSize(40, 96), 80);   // 2x
  assert.equal(battleSpriteSize(256, 96), 85);  // 1/3 → floor(256/3)
  assert.ok(battleSpriteSize(256, 96) <= 96);
  assert.equal(battleSpriteSize(192, 96), 96);  // 1/2
});

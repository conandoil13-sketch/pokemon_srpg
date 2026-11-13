import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUAD, quadrants } from '../src/render/autotile.js';

const W = (ch) => ch === '~';
const { INNER, EDGE_H, EDGE_V, OUTER, CORNER_IN } = QUAD;

test('isolated tile: four outer corners', () => {
  assert.deepEqual(quadrants(['...', '.~.', '...'], 1, 1, W), [OUTER, OUTER, OUTER, OUTER]);
});

test('horizontal run: top and bottom edges in the middle', () => {
  assert.deepEqual(quadrants(['.....', '.~~~.', '.....'], 2, 1, W), [EDGE_H, EDGE_H, EDGE_H, EDGE_H]);
});

test('2x2 block, top-left tile', () => {
  assert.deepEqual(quadrants(['....', '.~~.', '.~~.', '....'], 1, 1, W), [OUTER, EDGE_H, EDGE_V, INNER]);
});

test('inner corner where only the diagonal differs', () => {
  const g = ['~~', '~.'];
  assert.deepEqual(quadrants(g, 0, 0, W), [INNER, INNER, INNER, CORNER_IN]);
});

test('off-map counts as the same kind (no edge at the map border)', () => {
  assert.deepEqual(quadrants(['~~', '~~'], 0, 0, W), [INNER, INNER, INNER, INNER]);
});

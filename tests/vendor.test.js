import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { FX } from '../src/vendor/pixelfx/fx-index.js';
import { createFx, PAL } from '../src/vendor/pixelfx/core/index.js';
import { FX_FILES } from '../tools/vendor-pixelfx.js';

const root = new URL('../src/vendor/pixelfx/', import.meta.url);

test('every listed effect is vendored and loads', () => {
  assert.ok(FX_FILES.length >= 20);
  for (const id of FX_FILES) {
    assert.ok(FX[id], id);
    assert.ok(FX[id].meta?.duration > 0, id);
  }
});

test('license and notice ship with it; no gallery fonts', () => {
  assert.ok(existsSync(new URL('LICENSE', root)));
  assert.ok(existsSync(new URL('NOTICE.md', root)));
  assert.ok(!existsSync(new URL('gallery', root)));
});

test('a one-shot recolored effect runs to the end', () => {
  const fx = createFx(FX['impacts/hit-spark'], { palette: PAL.fire });
  for (let i = 0; i < 40; i++) fx.update(1 / 60);
  assert.equal(fx.done(), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAD_EVENTS, createRepeater, REPEAT_DELAY, REPEAT_EVERY } from '../src/game/touchPad.js';
import { fitScale } from '../src/render/screen.js';

test('pad buttons map to the same events as the keyboard', () => {
  assert.deepEqual(PAD_EVENTS.a, { type: 'confirm' });
  assert.deepEqual(PAD_EVENTS.b, { type: 'cancel' });
  assert.deepEqual(PAD_EVENTS.start, { type: 'endTurn' });
  assert.deepEqual(PAD_EVENTS.select, { type: 'sort' });
  assert.deepEqual(PAD_EVENTS.left, { type: 'dir', dx: -1, dy: 0 });
});

test('holding a direction repeats after a delay and releases on lift', () => {
  const r = createRepeater();
  assert.deepEqual(r.press('up', 0), [{ type: 'dir', dx: 0, dy: -1 }]);
  assert.deepEqual(r.tick(REPEAT_DELAY - 1), []);
  assert.deepEqual(r.tick(REPEAT_DELAY), [{ type: 'dir', dx: 0, dy: -1, repeat: true }]);
  assert.equal(r.tick(REPEAT_DELAY + REPEAT_EVERY).length, 1);
  assert.deepEqual(r.release('up'), [{ type: 'release', dx: 0, dy: -1 }]);
  assert.deepEqual(r.tick(5000), []);
});

test('A does not repeat; a direction keeps repeating while A is pressed', () => {
  const r = createRepeater();
  r.press('left', 0);
  assert.deepEqual(r.press('a', 100), [{ type: 'confirm' }]);
  assert.equal(r.tick(REPEAT_DELAY).filter((e) => e.type === 'dir').length, 1);
  assert.deepEqual(r.release('a'), []);
});

test('cancelAll releases every held direction', () => {
  const r = createRepeater();
  r.press('up', 0); r.press('right', 0);
  assert.deepEqual(r.cancelAll().map((e) => e.type), ['release', 'release']);
  assert.deepEqual(r.tick(5000), []);
});

test('fitScale uses whole numbers when 2x or more fits, otherwise fits exactly', () => {
  assert.equal(fitScale(1024, 800), 4);
  assert.equal(fitScale(600, 500), 2);
  assert.equal(fitScale(390, 400), 390 / 256);
  assert.equal(fitScale(320, 140), 140 / 192);
});

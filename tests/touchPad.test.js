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

import { touchToEvents } from '../src/game/input.js';
test('touch on the screen: down picks the tile, move only moves the cursor, outside does nothing', () => {
  assert.deepEqual(touchToEvents('down', { px: 10, py: 20 }), [{ type: 'cursor', px: 10, py: 20, touch: true }, { type: 'click', px: 10, py: 20, touch: true }]);
  assert.deepEqual(touchToEvents('move', { px: 10, py: 20 }), [{ type: 'cursor', px: 10, py: 20, touch: true }]);
  assert.deepEqual(touchToEvents('down', null), []);
});

// ---- 최종 검토 수정: 마우스 흉내 이벤트가 와도 두 번 눌리지 않는다 ----
import { bindInput } from '../src/game/input.js';
test('review fix: a tap is one click even if the browser also sends fake mouse events', () => {
  const on = {};
  const canvas = { addEventListener: (t, f) => { (on[t] ??= []).push(f); }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 192 }), setPointerCapture() {} };
  const saved = globalThis.addEventListener;
  globalThis.addEventListener = () => {};
  const got = [];
  try { bindInput(canvas, () => 1, (ev) => got.push(ev.type)); } finally { globalThis.addEventListener = saved; }
  const fire = (t, e) => (on[t] ?? []).forEach((f) => f({ clientX: 50, clientY: 50, button: 0, pointerId: 1, preventDefault() {}, ...e }));
  fire('pointerdown', { pointerType: 'touch' });
  fire('pointerup', { pointerType: 'touch' });
  fire('mousemove', {}); fire('mousedown', {}); // iOS 가 늦게 보내는 흉내 이벤트
  assert.deepEqual(got, ['cursor', 'click']);
  got.length = 0;
  fire('pointerdown', { pointerType: 'mouse' }); // PC 마우스는 그대로
  assert.deepEqual(got, ['cursor', 'click']);
});

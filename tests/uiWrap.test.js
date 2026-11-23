import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapWords, messageLayout, MESSAGE_MAX_LINES } from '../src/render/ui.js';
import { textWidth } from '../src/render/font.js';

test('wrapWords breaks at spaces, and inside a word only when the word alone is too wide', () => {
  assert.deepEqual(wrapWords('공+2(3) 방-1(2) 특공+1(3)', 90, 'small'), ['공+2(3) 방-1(2)', '특공+1(3)']);
  for (const l of wrapWords('가나다라마바사아자차카타파하', 50, 'small')) assert.ok(textWidth(l, 'small') <= 50, l);
  assert.deepEqual(wrapWords('', 50), []);
});

test('messages keep their own lines when they fit, wrap when not, and switch to the small font past two lines', () => {
  assert.deepEqual(messageLayout(['짧다', '둘째 줄'], 230), { style: 'main', lines: ['짧다', '둘째 줄'] });
  const long = '아르세우스는 에어로블라스트를 배우지 않았다.';
  const one = messageLayout([long], 230);
  assert.equal(one.style, 'main'); assert.equal(one.lines.length, 2);
  for (const l of one.lines) assert.ok(textWidth(l) <= 230);
  const many = messageLayout(['에어로블라스트를 잊고 에어로블라스트를 넣을까?', '스피드 1.5배·이동력 +1, 그 층에서 처음 쓴 기술만 쓸 수 있음'], 230);
  assert.equal(many.style, 'small');
  assert.ok(many.lines.length <= MESSAGE_MAX_LINES);
  for (const l of many.lines) assert.ok(textWidth(l, 'small') <= 230, l);
});

import { moveDetailLines } from '../src/game/moveInfo.js';
import { MOVES } from '../src/data/moves.js';
test('move detail lines never split a word and stay inside the card', () => {
  for (const id of Object.keys(MOVES).filter((m) => MOVES[m].learnable)) {
    const lines = moveDetailLines(id, 116);
    for (const l of lines) assert.ok(textWidth(l, 'small') <= 116, `${id}: ${l}`);
    const words = lines.join(' ').replace(/ · /g, ' ').split(' ').filter(Boolean);
    const want = lines.join(' · ').split(' · ').join(' ').split(' ').filter(Boolean);
    assert.deepEqual(words, want, id);
  }
  assert.deepEqual(moveDetailLines('silver-wind', 116).join(' ').includes('스피드 +1'), true);
});

// 자세히 보기 특성 페이지: 오른쪽 2칸 글자가 왼쪽 "특성 X" 와 겹치지 않는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slot2Note } from '../src/game/summary.js';
import { ABILITIES } from '../src/data/abilities.js';
import { textWidth } from '../src/render/font.js';
import { newMember } from '../src/core/progress.js';

const ids = Object.keys(ABILITIES);
const leftEnd = 10 + Math.max(...ids.map((id) => textWidth(`특성 ${ABILITIES[id].name}`)));
const longestId = ids.reduce((a, b) => (textWidth(ABILITIES[b].name, 'small') > textWidth(ABILITIES[a].name, 'small') ? b : a));

test('slot-2 note never overlaps the slot-1 name', () => {
  const m = newMember('charmander', 30);
  assert.ok(slot2Note(m).x > leftEnd + 2, 'no slot 2');
  m.extraAbility = longestId;
  assert.ok(slot2Note(m).x > leftEnd + 2, 'longest slot 2');
});

test('same ability in both slots: note still fits for every ability', () => {
  const d = newMember('ditto', 30);
  for (const id of ids) {
    d.build.ability = id; d.extraAbility = id;
    const n = slot2Note(d);
    assert.ok(n.same, id);
    assert.ok(n.x > 10 + textWidth(`특성 ${ABILITIES[id].name}`) + 2, id);
  }
});

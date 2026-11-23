import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBox, resetBoxMemory } from '../src/game/box.js';
import { createRelearn } from '../src/game/relearn.js';
import { CHOICE_LOCK } from '../src/game/learnFlow.js';
import { relearnCandidates } from '../src/core/relearn.js';
import { newGame } from '../src/core/save.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const press = (s, type, extra = {}) => s.handle({ type, ...extra });

test('the box menu offers 기술 떠올리기 for companions only, greyed with a reason when nothing is left', () => {
  resetBoxMemory();
  const game = newGame();
  const box = createBox({ game, onBack() {}, onEvolve() {} });
  assert.equal(box.cursorMember.species, 'ditto');
  press(box, 'confirm');
  assert.ok(!box.menuLabels.includes('기술 떠올리기'));
  press(box, 'cancel'); press(box, 'dir', { dx: 1, dy: 0 }); press(box, 'confirm');
  const m = box.cursorMember, k = box.menuLabels.indexOf('기술 떠올리기');
  assert.ok(k >= 0);
  assert.equal(box.menuEnabled[k], relearnCandidates(m).length > 0);
  m.level = 1; m.learned = []; m.moves = [...new Set([...m.moves, ...relearnCandidates(m)])].slice(0, 4); m.learned = [...m.moves]; // 떠올릴 기술 없음
  assert.deepEqual(relearnCandidates(m), []);
  press(box, 'cancel'); press(box, 'confirm');
  assert.equal(box.menuEnabled[k], false);
  for (let i = 0; i < k; i++) press(box, 'dir', { dx: 0, dy: 1 });
  press(box, 'confirm');
  assert.deepEqual(box.message, ['떠올릴 기술이 없다.']);
});

test('relearn into an empty slot: pick, confirm, saved; cancel at the question changes nothing', () => {
  const m = newMember('bidoof', 30, createRng(1)); m.moves = m.moves.slice(0, 3);
  let saved = 0, closed = 0;
  const s = createRelearn({ member: m, onSave: () => saved++, onClose: () => closed++ });
  const first = s.candidates[0];
  press(s, 'confirm'); assert.equal(s.mode, 'learn');
  press(s, 'cancel'); assert.equal(s.mode, 'list'); assert.equal(m.moves.length, 3);
  press(s, 'confirm'); s.update(CHOICE_LOCK + 0.1); press(s, 'confirm');
  assert.deepEqual(m.moves.at(-1), first); assert.equal(saved, 1); assert.equal(s.mode, 'msg');
  s.update(CHOICE_LOCK + 0.1); press(s, 'confirm'); assert.equal(s.mode, 'list');
  press(s, 'cancel'); assert.equal(closed, 1);
});

test('relearn with four moves: choose the move to forget while comparing, confirm replaces; cancel backs out', () => {
  const m = newMember('bidoof', 30, createRng(1));
  assert.equal(m.moves.length, 4);
  const before = [...m.moves];
  const s = createRelearn({ member: m, onSave() {}, onClose() {} });
  press(s, 'dir', { dx: 0, dy: 1 }); const pick = s.candidates[1];
  press(s, 'confirm'); assert.equal(s.mode, 'forget');
  assert.deepEqual(s.compare, { old: before[0], new: pick });
  press(s, 'dir', { dx: 0, dy: 1 }); assert.deepEqual(s.compare, { old: before[1], new: pick });
  press(s, 'confirm'); assert.equal(s.mode, 'confirm');
  press(s, 'cancel'); assert.equal(s.mode, 'forget'); assert.deepEqual(m.moves, before);
  press(s, 'cancel'); assert.equal(s.mode, 'list'); assert.deepEqual(m.moves, before);
  press(s, 'confirm'); press(s, 'dir', { dx: 0, dy: 1 }); press(s, 'confirm'); s.update(CHOICE_LOCK + 0.1); press(s, 'confirm');
  assert.equal(m.moves[1], pick); assert.ok(s.candidates.includes(before[1]));
});

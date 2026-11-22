import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageSlots, unlockedBy, branchUnlocks } from '../src/data/fillerStages.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { levelCapFor } from '../src/core/difficulty.js';

const fake = (id) => ({ id, name: id });
// 3번 자리(시티 자리) 하나 → 4번 [A, B] → 5번 [C, D] → 6번 [E, F, G] → 7번 임시
const slots = stageSlots({ 3: fake('city'), 4: [fake('a'), fake('b')], 5: [fake('c'), fake('d')], 6: [fake('e'), fake('f'), fake('g')] });
const by = (id) => slots.find((d) => d.id === id);
const open = (cleared) => slots.filter((d) => unlockedBy(d, cleared)).map((d) => d.id);

test('branch maps share their slot: stage number, branch index and level curve', () => {
  assert.equal(by('a').stage, 6); assert.equal(by('b').stage, 6);
  assert.equal(by('a').branch, 1); assert.equal(by('b').branch, 2);
  assert.equal(by('city').branch, undefined);
  assert.deepEqual(by('a').baseLevel, by('b').baseLevel);
  assert.equal(by('a').levelCap, by('b').levelCap);
  assert.ok(!slots.some((d) => d.id === 'trial-4')); // 진짜 맵이 생긴 자리의 임시 스테이지는 빠짐
  assert.ok(slots.some((d) => d.id === 'trial-7'));
});

test('one map to many: clearing it opens every branch', () => {
  assert.deepEqual(open(['city']).filter((id) => 'ab'.includes(id)), ['a', 'b']);
});

test('two to two: each branch opens its partner only', () => {
  assert.deepEqual(open(['a']).filter((id) => 'cd'.includes(id)), ['c']);
  assert.deepEqual(open(['b']).filter((id) => 'cd'.includes(id)), ['d']);
  assert.deepEqual(open(['a', 'b']).filter((id) => 'cd'.includes(id)), ['c', 'd']);
});

test('two to three: a shared map plus one partner each', () => {
  assert.deepEqual(open(['c']).filter((id) => 'efg'.includes(id)), ['e', 'f']);
  assert.deepEqual(open(['d']).filter((id) => 'efg'.includes(id)), ['e', 'g']);
  assert.deepEqual(open(['c', 'd']).filter((id) => 'efg'.includes(id)), ['e', 'f', 'g']);
  assert.ok(open(['e']).includes('trial-7')); // 여러 개 → 하나: 아무거나
  assert.ok(open(['g']).includes('trial-7'));
});

test('branchUnlocks covers the other shapes', () => {
  assert.deepEqual(branchUnlocks(['x', 'y', 'z'], 2), [['x'], ['y', 'z']]);
  assert.deepEqual(branchUnlocks(['x'], 3), [['x'], ['x'], ['x']]);
});

test('level cap moves on once any branch of a stage is cleared', async () => {
  const { finishRun } = await import('../src/core/run.js');
  const ids = DUNGEONS.map((d) => d.id);
  const before = levelCapFor({ cleared: ids.slice(0, 5) }); // 시티까지
  assert.equal(before, DUNGEONS[5].levelCap);
  assert.equal(levelCapFor({ cleared: [...ids.slice(0, 5), 'deep-cave'] }), DUNGEONS.find((d) => d.stage === 7).levelCap); // 6-2 하나만 깨도
  assert.equal(typeof finishRun, 'function');
});

test('the real table: stage 6 branches into sewer and deep cave', () => {
  assert.deepEqual(DUNGEONS.map((d) => d.stage), [1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10]);
  assert.deepEqual(DUNGEONS.slice(5, 7).map((d) => [d.id, d.branch, d.unlock]), [['sewer', 1, 'city'], ['deep-cave', 2, 'city']]); // 6-1 하수도 · 6-2 깊은 동굴
  assert.deepEqual(DUNGEONS[7].unlock, ['sewer', 'deep-cave']); // 여럿 → 1: 하나라도
});

test('level cap with real branches: clearing one branch is enough', () => {
  const capOf = (id) => by(id).levelCap;
  const base = ['sinnoh-field', 'sinnoh-cave', 'trial-1', 'trial-2', 'city'];
  const list = [{ id: 'sinnoh-field', stage: 1, levelCap: 1 }, { id: 'sinnoh-cave', stage: 2, levelCap: 2 }, ...slots];
  assert.equal(levelCapFor({ cleared: base }, list), capOf('a'));
  assert.equal(levelCapFor({ cleared: [...base, 'b'] }, list), capOf('c'));
});

test('finishing a run on one branch unlocks only its partner', async () => {
  const { finishRun } = await import('../src/core/run.js');
  const { newGame } = await import('../src/core/save.js');
  const g = newGame(); g.cleared = DUNGEONS.slice(0, 5).map((d) => d.id); g.unlocked = DUNGEONS.slice(0, 6).map((d) => d.id);
  finishRun(g, { dungeonId: DUNGEONS[5].id, floor: DUNGEONS[5].floors, loot: {} }, 'cleared');
  assert.ok(g.unlocked.includes(DUNGEONS[6].id));
});

test('locked hint names every map that can open it', async () => {
  const { unlockHint } = await import('../src/game/dungeonSelect.js');
  assert.deepEqual(unlockHint({ unlock: 'city' }), ['???시티 돌파 시 해금']);
  assert.deepEqual(unlockHint({ unlock: ['city', 'beach'] }), ['???시티 또는 해변', '돌파 시 해금']);
});

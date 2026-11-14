import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortMembers, boxesOf, SORT_KEYS, BOX_SIZE } from '../src/core/box.js';
import { newMember } from '../src/core/progress.js';

const m = (species, level) => newMember(species, level);

test('sortMembers by joined/level/dex, ties keep joined order', () => {
  const party = [m('ditto', 8), m('turtwig', 12), m('bulbasaur', 8), m('chimchar', 12)];
  assert.deepEqual(SORT_KEYS, ['joined', 'level', 'dex']);
  assert.deepEqual(sortMembers(party, 'joined').map((x) => x.species), ['ditto', 'turtwig', 'bulbasaur', 'chimchar']);
  assert.deepEqual(sortMembers(party, 'level').map((x) => x.species), ['turtwig', 'chimchar', 'ditto', 'bulbasaur']);
  assert.deepEqual(sortMembers(party, 'dex').map((x) => x.species), ['bulbasaur', 'ditto', 'turtwig', 'chimchar']);
  assert.notEqual(sortMembers(party, 'joined'), party); // 새 배열
});

test('boxesOf splits 31 into 30 + 1; empty party gives one empty box', () => {
  assert.equal(BOX_SIZE, 30);
  const list = Array.from({ length: 31 }, (_, i) => i);
  assert.deepEqual(boxesOf(list).map((b) => b.length), [30, 1]);
  assert.deepEqual(boxesOf([]), [[]]);
});

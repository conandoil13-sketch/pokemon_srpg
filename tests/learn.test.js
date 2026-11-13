import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startingMoves, movesLearnedBetween, learnOutcome } from '../src/core/learn.js';

const LS = [[1, 'scratch'], [1, 'leer'], [7, 'ember'], [9, 'taunt'], [15, 'fury-swipes'], [17, 'flame-wheel'], [23, 'nasty-plot'], [25, 'torment'], [29, 'facade'], [31, 'fire-spin']];
const MD = {
  scratch: { learnable: true }, leer: { learnable: false }, ember: { learnable: true }, taunt: { learnable: false },
  'fury-swipes': { learnable: true }, 'flame-wheel': { learnable: true }, 'nasty-plot': { learnable: false },
  torment: { learnable: false }, facade: { learnable: true }, 'fire-spin': { learnable: true },
};

test('startingMoves: learnable moves up to level, last four', () => {
  assert.deepEqual(startingMoves(LS, 8, MD), ['scratch', 'ember']);
  assert.deepEqual(startingMoves(LS, 20, MD), ['scratch', 'ember', 'fury-swipes', 'flame-wheel']);
  assert.deepEqual(startingMoves(LS, 40, MD), ['fury-swipes', 'flame-wheel', 'facade', 'fire-spin']);
});

test('startingMoves: no learnable move falls back to tackle', () => {
  assert.deepEqual(startingMoves([[1, 'leer']], 10, MD), ['tackle']);
});

test('startingMoves: duplicates in learnset count once', () => {
  assert.deepEqual(startingMoves([[1, 'scratch'], [5, 'scratch'], [7, 'ember']], 10, MD), ['scratch', 'ember']);
});

test('movesLearnedBetween: (from, to] and skips status', () => {
  assert.deepEqual(movesLearnedBetween(LS, 7, 17, MD), ['fury-swipes', 'flame-wheel']);
  assert.deepEqual(movesLearnedBetween(LS, 8, 8, MD), []);
});

test('learnOutcome', () => {
  assert.equal(learnOutcome(['a', 'b', 'c', 'ember'], 'ember'), 'known');
  assert.equal(learnOutcome(['a', 'b', 'c', 'd'], 'ember'), 'choose');
  assert.equal(learnOutcome(['a', 'b', 'c'], 'ember'), 'learn');
});

// ---- 찌리리공·붐볼: 자폭 기믹 ----
import { SPECIES } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';
import { makeUnit } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
test('voltorb line always starts with self-destruct', () => {
  for (const sp of ['voltorb', 'electrode']) {
    const ms = startingMoves(SPECIES[sp].learnset, 5, MOVES, sp);
    assert.ok(ms.includes('self-destruct') && ms.length <= 4, `${sp}: ${ms}`);
  }
  assert.ok(!startingMoves(SPECIES.pikachu.learnset, 5, MOVES, 'pikachu').includes('self-destruct'));
  assert.ok(makeUnit({ species: 'voltorb', side: 'enemy', x: 0, y: 0, level: 6 }).moves.includes('self-destruct'));
  assert.ok(newMember('voltorb', 6).moves.includes('self-destruct'));
});

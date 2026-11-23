import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMember, evolveMember, resolveChoice, applyExp } from '../src/core/progress.js';
import { relearnCandidates, relearn, remember } from '../src/core/relearn.js';
import { SPECIES } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const lvMoves = (sp, lv) => [...new Set(SPECIES[sp].learnset.filter(([l, m]) => l <= lv && MOVES[m]?.learnable).map(([, m]) => m))];

test('candidates = current learnset up to the level + moves it once knew, minus current moves', () => {
  const m = newMember('eevee', 30, createRng(1));
  const want = lvMoves('eevee', 30).filter((mv) => !m.moves.includes(mv));
  assert.deepEqual(relearnCandidates(m), want);
  assert.ok(!relearnCandidates(m).some((mv) => m.moves.includes(mv)));
});

test('a move forgotten at level up stays in the history; evolving keeps pre-evolution moves but not other branches', () => {
  const m = newMember('eevee', 30, createRng(1));
  const old = m.moves[0];
  resolveChoice(m, 'tackle' === old ? 'growl' : 'tackle', 0);
  evolveMember(m, 'umbreon');
  assert.ok(relearnCandidates(m).includes(old), 'forgotten eevee move');
  const flareonOnly = SPECIES.flareon.learnset.map(([, mv]) => mv).filter((mv) => MOVES[mv]?.learnable && !SPECIES.umbreon.learnset.some(([, x]) => x === mv) && !SPECIES.eevee.learnset.some(([, x]) => x === mv));
  for (const mv of flareonOnly) assert.ok(!relearnCandidates(m).includes(mv), mv);
});

test('old saves without a history use the current moves', () => {
  const m = newMember('bidoof', 20, createRng(1));
  delete m.learned;
  assert.deepEqual(relearnCandidates(m), lvMoves('bidoof', 20).filter((mv) => !m.moves.includes(mv)));
  remember(m, 'tackle');
  assert.ok(m.learned.includes('tackle'));
});

test('relearn fills an empty slot or replaces the chosen one; the replaced move becomes a candidate', () => {
  const m = newMember('bidoof', 20, createRng(1));
  m.moves = m.moves.slice(0, 3);
  const [a] = relearnCandidates(m);
  assert.deepEqual(relearn(m, a, null), { ok: true });
  assert.equal(m.moves.length, 4); assert.ok(m.moves.includes(a));
  const [b] = relearnCandidates(m), gone = m.moves[1];
  assert.deepEqual(relearn(m, b, 1), { ok: true });
  assert.equal(m.moves[1], b); assert.ok(relearnCandidates(m).includes(gone));
  assert.equal(relearn(m, b, 2).ok, false); // 이미 앎
  assert.equal(relearn(m, 'hyper-beam', 2).ok, false); // 후보 아님
  assert.equal(relearn(m, relearnCandidates(m)[0], null).ok, false); // 칸이 꽉 참
});

test('level-up learning is remembered; ditto has no relearning', () => {
  const m = newMember('bidoof', 5, createRng(1));
  applyExp([m], { bidoof: 99999 }, createRng(1), 40);
  for (const mv of m.moves) assert.ok(m.learned.includes(mv));
  assert.deepEqual(relearnCandidates(newMember('ditto', 30, createRng(1))), []);
});

import { loadGame, saveGame, newGame } from '../src/core/save.js';
test('the move history survives saving; unknown or junk entries are dropped, old saves get none', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  const g = newGame();
  const m = g.party.find((x) => x.species !== 'ditto');
  m.learned = [...m.moves, 'tackle', 'not-a-move', 'tackle', 5];
  saveGame(store, g);
  const back = loadGame(store).party.find((x) => x.uid === m.uid);
  assert.deepEqual(back.learned, [...new Set([...m.moves, 'tackle'])]);
  assert.equal(loadGame(store).party.find((x) => x.species === 'ditto').learned, undefined);
  const raw = JSON.parse(data['pokemon-tactics-save']);
  for (const x of raw.party) delete x.learned;
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  assert.equal(loadGame(store).party.find((x) => x.uid === m.uid).learned, undefined);
});

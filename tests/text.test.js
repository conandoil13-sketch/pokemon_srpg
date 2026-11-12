import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa, TYPE_KO } from '../src/data/text.js';
import { TYPES } from '../src/data/types.js';
import { SPECIES } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';

test('josa picks particle by final consonant', () => {
  assert.equal(josa('초염몽', '은/는'), '초염몽은');
  assert.equal(josa('루카리오', '은/는'), '루카리오는');
  assert.equal(josa('한카리아스', '이/가'), '한카리아스가');
  assert.equal(josa('동탁군', '이/가'), '동탁군이');
  assert.equal(josa('지진', '을/를'), '지진을');
  assert.equal(josa('10만볼트', '을/를'), '10만볼트를');
});

test('korean labels exist for all types, species and moves', () => {
  for (const t of TYPES) assert.ok(TYPE_KO[t], t);
  assert.equal(SPECIES.infernape.name, '초염몽');
  assert.equal(SPECIES.garchomp.name, '한카리아스');
  assert.equal(MOVES.thunderbolt.name, '10만볼트');
  for (const s of Object.values(SPECIES)) assert.match(s.name, /[가-힣]/);
  for (const m of Object.values(MOVES)) assert.match(m.name, /[가-힣]/);
});

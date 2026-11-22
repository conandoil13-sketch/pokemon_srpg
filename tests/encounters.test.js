import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encounterPool } from '../src/core/encounters.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';

test('every dungeon floor has a non-empty, valid pool', () => {
  for (const d of DUNGEONS) {
    for (let f = 1; f <= d.floors; f++) {
      for (const boss of [false, true]) {
        const pool = encounterPool(d, f, { boss });
        assert.ok(pool.length > 0, `${d.id} F${f} boss=${boss}`);
        for (const k of pool) {
          const s = SPECIES[k];
          assert.ok(!s.legendary && k !== 'ditto', `${d.id}: ${k}`);
          assert.ok(s.types.some((t) => d.types.includes(t)) || d.signature?.includes(k), `${d.id}: ${k} type`); // 고유종(signature)은 테마 타입 밖이어도 됨
        }
      }
    }
  }
});

test('stage and bst caps hold when the pool is not relaxed', () => {
  const field = DUNGEONS[0];
  const pool = encounterPool(field, 1);
  for (const k of pool) {
    assert.ok(SPECIES[k].stage <= field.stageCap(1), k);
    assert.ok(SPECIES[k].bst <= field.bstCap, k);
  }
  assert.ok(pool.includes('pidgey') || pool.includes('starly'), 'common early birds');
  assert.equal(pool.includes('pidgeot'), false, 'no final stage on floor 1');
});

test('deterministic order', () => {
  assert.deepEqual(encounterPool(DUNGEONS[1], 3), encounterPool(DUNGEONS[1], 3));
});

test('impossible caps relax, then fall back without crashing', () => {
  const weird = { ...DUNGEONS[0], types: ['ice'], bstCap: 1, stageCap: () => 0 };
  const pool = encounterPool({ ...weird, early: [] }, 3); // 초반 종 없이 3층: 완화 경로
  assert.ok(pool.length > 0);
  const none = { ...DUNGEONS[0], types: ['not-a-type'], fallback: 'pidgey' };
  assert.deepEqual(encounterPool({ ...none, early: [] }, 3), ['pidgey']);
});

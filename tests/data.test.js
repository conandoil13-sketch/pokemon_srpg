import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, TYPE_COLORS, typeMultiplier } from '../src/data/types.js';
import { SPECIES, validateData } from '../src/data/species.js';
import { MAP } from '../src/data/map.js';

test('typeMultiplier: 단일/이중/무효', () => {
  assert.equal(typeMultiplier('fire', ['grass']), 2);
  assert.equal(typeMultiplier('water', ['fire', 'ground']), 4);
  assert.equal(typeMultiplier('ground', ['flying']), 0);
  assert.equal(typeMultiplier('fighting', ['ghost']), 0);
  assert.equal(typeMultiplier('electric', ['grass', 'ground']), 0);
  assert.equal(typeMultiplier('fire', ['water', 'steel']), 1);
  assert.equal(typeMultiplier('normal', ['normal']), 1);
});

test('18 types with colors', () => {
  assert.equal(TYPES.length, 18);
  for (const t of TYPES) assert.ok(TYPE_COLORS[t], t);
});

test('validateData passes', () => {
  assert.doesNotThrow(() => validateData());
});

test('infernape real stats at Lv50', () => {
  assert.deepEqual(SPECIES.infernape.stats, { hp: 151, atk: 124, def: 91, spa: 124, spd: 91, spe: 128 });
});

test('map shape and chars', () => {
  assert.equal(MAP.tiles.length, 12);
  for (const row of MAP.tiles) {
    assert.equal(row.length, 16);
    assert.match(row, /^[."^~#]+$/);
  }
});

test('placements on walkable unique tiles', () => {
  const seen = new Set();
  for (const p of [...MAP.allies, ...MAP.enemies]) {
    const t = MAP.tiles[p.y][p.x];
    assert.ok(t !== '#' && t !== '~', `${p.species} on ${t}`);
    const k = `${p.x},${p.y}`;
    assert.ok(!seen.has(k), `dup ${k}`);
    seen.add(k);
    assert.ok(SPECIES[p.species], p.species);
  }
});

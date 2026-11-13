import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, TYPE_COLORS, typeMultiplier } from '../src/data/types.js';
import { SPECIES, validateData } from '../src/data/species.js';
import { MAP } from '../src/data/map.js';
import { MOVES } from '../src/data/moves.js';
import { startingMoves } from '../src/core/learn.js';

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

test('generated data: 24 species with base stats, learnsets and starting moves', () => {
  assert.equal(Object.keys(SPECIES).length, 493);
  assert.deepEqual(SPECIES.infernape.base, { hp: 76, atk: 104, def: 71, spa: 104, spd: 71, spe: 108 });
  for (const s of Object.values(SPECIES)) {
    assert.ok(s.learnset.length > 0, s.key);
    assert.ok(startingMoves(s.learnset, 8, MOVES).length > 0, s.key);
    assert.ok(s.baseExp > 0 && s.growth, s.key);
  }
});

test('evolution rules match the verified table (spec §4)', () => {
  const lv = (k) => SPECIES[k].evolutions[0]?.rule;
  assert.deepEqual(lv('chimchar'), { kind: 'level', level: 14, source: 'original' });
  assert.equal(lv('monferno').level, 36);
  assert.deepEqual(lv('riolu'), { kind: 'level', level: 20, source: 'friendship' });
  assert.deepEqual(lv('murkrow'), { kind: 'stone' });
  assert.deepEqual(lv('budew'), { kind: 'level', level: 16, source: 'friendship' });
  assert.deepEqual(lv('roselia'), { kind: 'stone' });
  assert.equal(lv('bronzor').level, 33);
  assert.equal(lv('gabite').level, 48);
  for (const k of ['infernape', 'empoleon', 'torterra', 'luxray', 'lucario', 'garchomp', 'honchkrow', 'roserade', 'bronzong']) assert.deepEqual(SPECIES[k].evolutions, [], k);
});

test('korean names, learnable flags, movement and range rules', () => {
  assert.equal(SPECIES.chimchar.name, '불꽃숭이');
  assert.equal(MOVES['close-combat'].name, '인파이트');
  assert.equal(MOVES.growl.learnable, false);
  assert.equal(SPECIES.bronzor.move, 3);
  assert.equal(SPECIES.gible.move, 3);
  assert.equal(SPECIES.chimchar.move, 4);
  assert.equal(SPECIES.murkrow.move, 6);
  assert.deepEqual(MOVES['aura-sphere'].range, [2, 3]);
  assert.deepEqual(MOVES.scratch.range, [1, 1]);
  assert.deepEqual(MOVES.ember.range, [1, 2]);
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
  for (const p of [...MAP.allySlots.map((q) => ({ ...q, species: 'chimchar' })), ...MAP.enemies]) {
    const t = MAP.tiles[p.y][p.x];
    assert.ok(t !== '#' && t !== '~', `${p.species} on ${t}`);
    const k = `${p.x},${p.y}`;
    assert.ok(!seen.has(k), `dup ${k}`);
    seen.add(k);
    assert.ok(SPECIES[p.species], p.species);
  }
  assert.equal(MAP.allySlots.length, 4);
  for (const e of MAP.enemies) assert.ok(Number.isInteger(e.level) && e.level >= 1, e.species);
});

test('every move and species is keyed by its PokeAPI identifier', () => {
  for (const [k, m] of Object.entries(MOVES)) assert.equal(m.api, k);
  for (const [k, s] of Object.entries(SPECIES)) assert.equal(s.api, k);
});

test('Gen 1-4: ditto, gen-4 types, branching lines', () => {
  assert.deepEqual(startingMoves(SPECIES.ditto.learnset, 8, MOVES), ['tackle']);
  assert.deepEqual(SPECIES.clefairy.types, ['normal']);
  const ev = (k) => Object.fromEntries(SPECIES[k].evolutions.map((e) => [e.to, e.rule]));
  const eevee = ev('eevee');
  assert.deepEqual(Object.keys(eevee).sort(), ['espeon', 'flareon', 'glaceon', 'jolteon', 'leafeon', 'umbreon', 'vaporeon']);
  assert.equal(eevee.vaporeon.kind, 'stone');
  assert.equal(eevee.espeon.level, 20);
  assert.equal(eevee.leafeon.kind, 'stone'); // PokeAPI 에 리프의돌(8세대) 경로가 있어 '아이템 → 진화의돌' 규칙 적용
  const wurmple = ev('wurmple');
  assert.ok(wurmple.silcoon.random && wurmple.cascoon.random);
  const tyrogue = ev('tyrogue');
  assert.equal(new Set(Object.values(tyrogue).map((r) => r.level)).size, 1);
  assert.equal(Object.keys(tyrogue).length, 3);
  for (const s of Object.values(SPECIES)) for (const e of s.evolutions) assert.ok(SPECIES[e.to], `${s.key} → ${e.to}`);
  assert.equal(SPECIES.mewtwo.legendary, true);
  assert.equal(SPECIES.chimchar.stage, 0);
  assert.equal(SPECIES.infernape.stage, 2);
});

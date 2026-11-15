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
  assert.equal(MOVES.growl.learnable, true); // 능력치 변화기는 이제 배운다
  assert.equal(MOVES['thunder-wave'].learnable, true); // 상태이상 기술도 배운다
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
  assert.equal(MAP.allySlots.length, 5);
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

test('status moves: stat changes, targets, learnable rules', () => {
  const sd = MOVES['swords-dance'];
  assert.deepEqual([sd.kind, sd.learnable, sd.statChanges], ['self', true, [{ stat: 'attack', change: 2 }]]);
  assert.deepEqual([MOVES.growl.kind, MOVES.growl.area, MOVES.growl.range], ['enemies', true, [0, 2]]);
  assert.equal(MOVES.agility.statChanges[0].stat, 'speed');
  assert.equal(MOVES['heal-bell'].learnable, false, 'other status moves stay out');
  assert.deepEqual([MOVES.crunch.effectKind, MOVES.crunch.statChance, MOVES.crunch.kind], ['damage-lower', 20, 'enemy']);
  assert.equal(MOVES['close-combat'].effectKind, 'damage-raise');
  for (const m of Object.values(MOVES)) if (m.category === 'status' && m.learnable) assert.ok(m.kind, m.id);
});

test('every species starts with at least one damaging move', () => {
  for (const s of Object.values(SPECIES)) {
    for (const lv of [5, 8, 10, 15, 20, 30]) {
      const ms = startingMoves(s.learnset, lv, MOVES);
      assert.ok(ms.length <= 4 && ms.some((m) => MOVES[m].category !== 'status'), `${s.key}@${lv}: ${ms}`);
    }
  }
});

test('status moves with side effects out of scope are not learnable', () => {
  for (const k of ['memento', 'stockpile']) assert.equal(MOVES[k].learnable, false, k); // 뽐내기·부추기기는 변화기 묶음 1차에서 배울 수 있게 됨
});

// ---- 상태이상 데이터 ----
test('status condition moves', () => {
  const m = MOVES;
  assert.deepEqual([m['thunder-wave'].learnable, m['thunder-wave'].ailment, m['thunder-wave'].kind], [true, 'paralysis', 'enemy']);
  assert.equal(m['will-o-wisp'].ailment, 'burn');
  assert.equal(m.toxic.ailment, 'toxic');
  assert.deepEqual([m['poison-fang'].ailment, m['poison-fang'].ailmentChance], ['toxic', 50]);
  assert.deepEqual([m.ember.ailment, m.ember.ailmentChance], ['burn', 10]);
  assert.equal(m['sleep-powder'].ailment, 'sleep');
  assert.equal(m['confuse-ray'].ailment, 'confusion');
  assert.equal(m['teeter-dance'].learnable, false); // 뽐내기·부추기기는 변화기 묶음 1차에서 배울 수 있게 됨
  assert.equal(m['tri-attack'].ailment, null);
});

test('starting moves: at most 2 status moves, at least 1 attack', () => {
  for (const s of Object.values(SPECIES)) {
    for (const lv of [5, 8, 10, 15, 20, 30]) {
      const ms = startingMoves(s.learnset, lv, MOVES);
      const st = ms.filter((x) => MOVES[x].category === 'status').length;
      assert.ok(ms.length <= 4 && st <= 2 && ms.length - st >= 1, `${s.key}@${lv}: ${ms}`);
    }
  }
  const odd = startingMoves(SPECIES.oddish.learnset, 15, MOVES);
  const learnedAttacks = SPECIES.oddish.learnset.filter(([lv, k]) => lv <= 15 && MOVES[k]?.learnable && MOVES[k].category !== 'status').map(([, k]) => k);
  if (new Set(learnedAttacks).size >= 2) assert.ok(odd.filter((x) => MOVES[x].category !== 'status').length >= 2, String(odd));
});

test('move shapes from rules and overrides', () => {
  const s = (k) => [MOVES[k].shape.type, MOVES[k].friendlyFire];
  assert.deepEqual(s('earthquake'), ['around', true]);
  assert.deepEqual(s('magnitude'), ['around', true]);
  assert.deepEqual(s('heat-wave'), ['cone', false]);
  assert.deepEqual([...s('hydro-pump'), MOVES['hydro-pump'].shape.length], ['line', false, 3]);
  assert.deepEqual([MOVES['fire-blast'].shape.type, MOVES['fire-blast'].aimRange], ['blast', [2, 3]]);
  assert.deepEqual([MOVES['shadow-ball'].shape.type, MOVES['shadow-ball'].aimRange], ['single', [2, 3]]);
  assert.deepEqual([MOVES.tackle.shape.type, MOVES.tackle.range], ['single', [1, 1]]);
  assert.deepEqual([MOVES['razor-leaf'].shape.type, MOVES['razor-leaf'].range], ['single', [1, 2]]);
  assert.deepEqual(MOVES.ember.range, [1, 2]);
  assert.equal(MOVES.growl.shape, null);
});

// ---- 특성 데이터 ----
import { ABILITIES, SRPG_ABILITY_TEXT } from '../src/data/abilities.js';
test('species carry gen-4 abilities only', () => {
  assert.deepEqual(SPECIES.gengar.abilities, ['levitate']);
  assert.deepEqual(SPECIES.koffing.abilities, ['levitate']);
  assert.deepEqual(SPECIES.geodude.abilities, ['rock-head', 'sturdy']);
  assert.deepEqual(SPECIES.pikachu.abilities, ['static']);
  for (const s of Object.values(SPECIES)) {
    assert.ok(s.abilities.length >= 1 && s.abilities.length <= 2, s.key);
    for (const a of s.abilities) assert.ok(ABILITIES[a], `${s.key}: ${a}`);
  }
  for (const a of ['competitive', 'neutralizing-gas', 'sharpness', 'wind-rider']) assert.equal(ABILITIES[a], undefined, a);
});

test('every ability has a Korean name and description; SRPG ones use our rules text', () => {
  for (const a of Object.values(ABILITIES)) assert.ok(a.name && a.desc, a.id);
  assert.equal(ABILITIES.intimidate.desc, SRPG_ABILITY_TEXT.intimidate);
  assert.ok(ABILITIES.intimidate.desc.includes('이동'));
});

// ---- 성별 비율 · 몸무게 · 성별 진화 ----
import POKEDEX from '../src/data/generated/pokedex.js';
import { createHash } from 'node:crypto';

test('every species has a gender rate and a weight', () => {
  for (const s of Object.values(SPECIES)) {
    assert.ok(Number.isInteger(s.genderRate) && s.genderRate >= -1 && s.genderRate <= 8, s.key);
    assert.ok(s.weight > 0, s.key);
  }
  assert.equal(SPECIES.ditto.genderRate, -1);
  assert.equal(SPECIES.ditto.weight, 4);
  assert.equal(SPECIES['nidoran-f'].genderRate, 8);
  assert.equal(SPECIES['nidoran-m'].genderRate, 0);
  assert.equal(SPECIES.eevee.genderRate, 1);
  assert.equal(SPECIES.snorlax.weight, 460);
});

test('gendered evolutions keep their gender condition', () => {
  const rule = (from, to) => SPECIES[from].evolutions.find((e) => e.to === to).rule;
  assert.equal(rule('kirlia', 'gallade').gender, 'male');
  assert.equal(rule('kirlia', 'gardevoir').gender, undefined);
  assert.equal(rule('snorunt', 'froslass').gender, 'female');
  assert.equal(rule('burmy', 'wormadam').gender, 'female');
  assert.equal(rule('burmy', 'mothim').gender, 'male');
  assert.equal(rule('combee', 'vespiquen').gender, 'female');
});

test('regenerated data keeps every existing value (only new fields added)', () => {
  const strip = (evos) => evos.map((e) => ({ ...e, rule: Object.fromEntries(Object.entries(e.rule).filter(([k]) => k !== 'gender')) }));
  const keep = Object.fromEntries(Object.entries(POKEDEX.species).map(([k, s]) => [k, { base: s.base, types: s.types, learnset: s.learnset, evolutions: strip(s.evolutions), abilities: s.abilities, stage: s.stage, bst: s.bst, dex: s.dex, name: s.name, growth: s.growth, baseExp: s.baseExp, legendary: s.legendary }]));
  const sha = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex');
  assert.equal(sha(keep), '6bbb9325dd6bb975499e89900f09691e551e8a58');
  const NEW = ['drain', 'healing', 'minHits', 'maxHits', 'critRate', 'flinchChance', 'priority']; // 기술 효과 메타 (2026-11-15 추가)
  const { 'grass-knot': gk, ...oldMoves } = POKEDEX.moves;
  const oldOnly = Object.fromEntries(Object.entries(oldMoves).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).filter(([f]) => !NEW.includes(f)))]));
  assert.equal(sha(oldOnly), 'd8bfe8cd8abd8d1a6eab82e276ba6203092ea7fb');
  assert.equal(sha(POKEDEX.abilities), '4354c097e52659f6d0ee4dbe1193f2e036b37815');
  assert.ok(gk);
});

test('weight-power moves are learnable and flagged', () => {
  for (const id of ['low-kick', 'grass-knot']) {
    assert.equal(MOVES[id].weightPower, true, id);
    assert.equal(MOVES[id].learnable, true, id);
  }
  assert.equal(MOVES.attract.ailment, 'infatuation');
  assert.equal(MOVES.attract.learnable, true);
});

import { makeUnit } from '../src/core/battle.js';
import { expectedDamage } from '../src/core/damage.js';
import { weightPower } from '../src/core/individual.js';

test('low kick power follows the target weight', () => {
  assert.deepEqual([9.9, 10, 24.9, 25, 49.9, 50, 99.9, 100, 199.9, 200].map(weightPower), [20, 40, 40, 60, 60, 80, 80, 100, 100, 120]);
  const a = makeUnit({ species: 'machop', side: 'ally', x: 0, y: 0, level: 30 });
  const light = makeUnit({ species: 'ditto', side: 'enemy', x: 1, y: 0, level: 30 });
  const heavy = makeUnit({ species: 'ditto', side: 'enemy', x: 1, y: 0, level: 30 });
  heavy.weight = 460;
  const r = expectedDamage(a, heavy, MOVES['low-kick'], '.') / expectedDamage(a, light, MOVES['low-kick'], '.');
  assert.ok(r > 4 && r < 7, String(r)); // 위력 120 / 20
});

test('move effect meta and newly learnable moves', () => {
  assert.equal(MOVES['giga-drain'].drain, 50);
  assert.equal(MOVES['double-edge'].drain, -33);
  assert.deepEqual([MOVES['pin-missile'].minHits, MOVES['pin-missile'].maxHits], [2, 5]);
  assert.equal(MOVES['slash'].critRate, 1);
  assert.equal(MOVES.bite.flinchChance, 30);
  assert.equal(MOVES['quick-attack'].priority, 1);
  assert.equal(MOVES['fake-out'].priority, 3);
  assert.equal(MOVES['fake-out'].flinchChance, 100);
  for (const id of ['seismic-toss', 'night-shade', 'dragon-rage', 'sonic-boom', 'recover', 'soft-boiled', 'milk-drink', 'roost', 'synthesis', 'morning-sun', 'moonlight']) assert.equal(MOVES[id].learnable, true, id);
  assert.equal(MOVES['seismic-toss'].fixedDamage, 'level');
  assert.equal(MOVES['dragon-rage'].fixedDamage, 40);
  assert.equal(MOVES.synthesis.heal.weather, true);
  assert.equal(MOVES['dream-eater'].dreamOnly, true);
});

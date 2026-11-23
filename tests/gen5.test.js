// 5세대 포켓몬 추가 (2026-11-24, 세대 추가 2단계)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, validateData } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';
import { gachaPool } from '../src/core/gacha.js';

test('the dex now runs to 649 and the data still validates', () => {
  assert.equal(Object.keys(SPECIES).length, 649);
  assert.equal(Math.max(...Object.values(SPECIES).map((s) => s.dex)), 649);
  validateData();
});

test('snivy line: grass, gen 9 stats, levels 17 and 36', () => {
  const s = SPECIES.snivy;
  assert.equal(s.name, '주리비얀');
  assert.deepEqual(s.types, ['grass']);
  assert.deepEqual(s.base, { hp: 45, atk: 45, def: 55, spa: 45, spd: 55, spe: 63 });
  assert.deepEqual(s.evolutions.map((e) => [e.to, e.rule.kind, e.rule.level]), [['servine', 'level', 17]]);
  assert.deepEqual(SPECIES.servine.evolutions.map((e) => [e.to, e.rule.level]), [['serperior', 36]]);
});

test('trade evolutions become level evolutions (karrablast, shelmet, boldore)', () => {
  for (const [from, to] of [['karrablast', 'escavalier'], ['shelmet', 'accelgor'], ['boldore', 'gigalith']]) {
    const e = SPECIES[from].evolutions.find((x) => x.to === to);
    assert.equal(e?.rule.kind, 'level', `${from} → ${to}`);
  }
});

test('gen 5 legendaries stay out of the gacha; first stages join it', () => {
  for (const k of ['victini', 'reshiram', 'zekrom', 'kyurem', 'keldeo', 'meloetta', 'genesect', 'cobalion']) assert.ok(SPECIES[k].legendary, k);
  const all = Object.values(gachaPool()).flat();
  for (const k of ['reshiram', 'victini']) assert.ok(!all.includes(k));
  for (const k of ['snivy', 'tepig', 'oshawott', 'zorua', 'axew']) assert.ok(all.includes(k), k);
});

test('gen 5 moves arrive, gen 6 moves still wait', () => {
  for (const id of ['volt-switch', 'scald', 'hurricane']) assert.ok(MOVES[id], id);
  for (const id of ['moonblast', 'play-rough', 'dazzling-gleam']) assert.equal(MOVES[id], undefined, id);
});

test('gen 5 moves really reach learnsets (snivy learns leaf tornado at 16)', () => {
  assert.ok(SPECIES.snivy.learnset.some(([lv, m]) => m === 'leaf-tornado' && lv === 16));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvolution, levelEvolutionReady, stoneEvolutionReady } from '../src/core/evolution.js';
import { BALANCE } from '../src/data/balance.js';

const d = (o) => ({ trigger: 'level-up', minLevel: null, minHappiness: null, item: null, extra: false, ...o });

test('original level evolution keeps its level', () => {
  assert.deepEqual(classifyEvolution([d({ minLevel: 14 })], { length: 3, order: 1, prevLevel: null }), { kind: 'level', level: 14, source: 'original' });
});

test('friendship: riolu-like (2-stage) → 20, budew-like (3-stage 1st) → 16', () => {
  assert.deepEqual(classifyEvolution([d({ minHappiness: 160 })], { length: 2, order: 1, prevLevel: null }), { kind: 'level', level: 20, source: 'friendship' });
  assert.deepEqual(classifyEvolution([d({ minHappiness: 160 })], { length: 3, order: 1, prevLevel: null }), { kind: 'level', level: 16, source: 'friendship' });
});

test('any item trigger is the Evolution Stone', () => {
  assert.deepEqual(classifyEvolution([d({ trigger: 'use-item', item: 'shiny-stone' })], { length: 3, order: 2, prevLevel: 16 }), { kind: 'stone' });
});

test('matrix: all 9 cells', () => {
  const lines = { two: { length: 2, order: 1 }, three1: { length: 3, order: 1 }, three2: { length: 3, order: 2 } };
  const kinds = { friendship: d({ minHappiness: 220 }), trade: d({ trigger: 'trade' }), other: d({ minLevel: null, extra: true }) };
  for (const [cell, line] of Object.entries(lines)) {
    for (const [source, det] of Object.entries(kinds)) {
      const r = classifyEvolution([det], { ...line, prevLevel: null });
      assert.deepEqual(r, { kind: 'level', level: BALANCE.evoMatrix[cell][source], source }, `${cell}/${source}`);
    }
  }
});

test('2nd-stage adjustment: at least previous level + 8, none after a stone', () => {
  assert.equal(classifyEvolution([d({ minHappiness: 160 })], { length: 3, order: 2, prevLevel: 30 }).level, 38);
  assert.equal(classifyEvolution([d({ minHappiness: 160 })], { length: 3, order: 2, prevLevel: null }).level, 32);
  // 원작 레벨은 보정하지 않음
  assert.equal(classifyEvolution([d({ minLevel: 33 })], { length: 3, order: 2, prevLevel: 30 }).level, 33);
});

test('priority: stone > original level > friendship > trade > other', () => {
  assert.deepEqual(classifyEvolution([d({ trigger: 'use-item', item: 'x' }), d({ minLevel: 20 })], { length: 2, order: 1, prevLevel: null }), { kind: 'stone' });
  assert.equal(classifyEvolution([d({ minLevel: 30, extra: true })], { length: 2, order: 1, prevLevel: null }).source, 'other');
  assert.equal(classifyEvolution([d({ minLevel: 30, extra: true })], { length: 2, order: 1, prevLevel: null }).level, 25);
  assert.equal(classifyEvolution([d({ trigger: 'trade' }), d({ minHappiness: 1 })], { length: 2, order: 1, prevLevel: null }).source, 'friendship');
});

test('readiness helpers', () => {
  const lv = { evolution: { to: 'monferno', rule: { kind: 'level', level: 14 } } };
  assert.equal(levelEvolutionReady(lv, 14), true);
  assert.equal(levelEvolutionReady(lv, 13), false);
  const st = { evolution: { to: 'roserade', rule: { kind: 'stone' } } };
  assert.equal(levelEvolutionReady(st, 99), false);
  assert.equal(stoneEvolutionReady(st), true);
  assert.equal(stoneEvolutionReady({ evolution: null }), false);
});

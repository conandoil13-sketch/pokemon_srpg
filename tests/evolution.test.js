import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvolution } from '../src/core/evolution.js';
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

test('priority: original level > stone > friendship > trade > other', () => {
  // 원작 레벨이 있으면 레벨 (리전폼의 돌 조건이 같이 와도: 모래두지·찌리리공·달막화)
  assert.deepEqual(classifyEvolution([d({ trigger: 'use-item', item: 'x' }), d({ minLevel: 20 })], { length: 2, order: 1, prevLevel: null }), { kind: 'level', level: 20, source: 'original' });
  assert.deepEqual(classifyEvolution([d({ trigger: 'use-item', item: 'x' }), d({ trigger: 'trade' })], { length: 2, order: 1, prevLevel: null }), { kind: 'stone' });
  assert.equal(classifyEvolution([d({ minLevel: 30, extra: true })], { length: 2, order: 1, prevLevel: null }).source, 'other');
  assert.equal(classifyEvolution([d({ minLevel: 30, extra: true })], { length: 2, order: 1, prevLevel: null }).level, 25);
  assert.equal(classifyEvolution([d({ trigger: 'trade' }), d({ minHappiness: 1 })], { length: 2, order: 1, prevLevel: null }).source, 'friendship');
});


// ---- 분기 진화 ----
import { classifyBranches, levelEvolutionOptions, stoneEvolutionOptions, pickEvolution } from '../src/core/evolution.js';

const lv = (minLevel, extra = {}) => ({ trigger: 'level-up', minLevel, minHappiness: null, item: null, extra: false, ...extra });
const two = { length: 2, order: 1, prevLevel: null };

test('wurmple-like: same original level on two branches → random', () => {
  const b = classifyBranches('wurmple', [{ to: 'silcoon', details: [lv(7)] }, { to: 'cascoon', details: [lv(7)] }], { length: 3, order: 1, prevLevel: null });
  assert.ok(b.every((x) => x.rule.random === true && x.rule.level === 7));
  const sp = { evolutions: b };
  assert.deepEqual(levelEvolutionOptions(sp, 7), ['silcoon', 'cascoon']);
  assert.deepEqual(pickEvolution(['silcoon', 'cascoon'], sp, () => 0), { auto: 'silcoon' });
  assert.deepEqual(pickEvolution(['silcoon', 'cascoon'], sp, () => 0.99), { auto: 'cascoon' });
});

test('eevee-like: stones ×3, friendship ×2 at 20, other ×2 at 25 → choose', () => {
  const stone = (item) => ({ ...lv(null), trigger: 'use-item', item });
  const b = classifyBranches('eevee', [
    { to: 'vaporeon', details: [stone('water-stone')] }, { to: 'jolteon', details: [stone('thunder-stone')] }, { to: 'flareon', details: [stone('fire-stone')] },
    { to: 'espeon', details: [lv(null, { minHappiness: 160 })] }, { to: 'umbreon', details: [lv(null, { minHappiness: 160 })] },
    { to: 'leafeon', details: [lv(null, { extra: true })] }, { to: 'glaceon', details: [lv(null, { extra: true })] },
  ], two);
  const sp = { evolutions: b };
  assert.deepEqual(stoneEvolutionOptions(sp), ['vaporeon', 'jolteon', 'flareon']);
  assert.deepEqual(levelEvolutionOptions(sp, 19), []);
  assert.deepEqual(levelEvolutionOptions(sp, 20), ['espeon', 'umbreon']);
  assert.deepEqual(levelEvolutionOptions(sp, 25), ['espeon', 'umbreon', 'leafeon', 'glaceon']);
  assert.deepEqual(pickEvolution(['espeon', 'umbreon'], sp, () => 0), { choose: ['espeon', 'umbreon'] });
  assert.ok(b.every((x) => !x.rule.random));
});

test('tyrogue-like: three "other" branches at the same replacement level → choose', () => {
  const b = classifyBranches('tyrogue', ['hitmonlee', 'hitmonchan', 'hitmontop'].map((to) => ({ to, details: [lv(20, { extra: true })] })), two);
  const sp = { evolutions: b };
  assert.deepEqual(levelEvolutionOptions(sp, 25), ['hitmonlee', 'hitmonchan', 'hitmontop']);
  assert.ok('choose' in pickEvolution(levelEvolutionOptions(sp, 25), sp, () => 0));
});

test('single branch → auto, none → null', () => {
  const sp = { evolutions: classifyBranches('x', [{ to: 'y', details: [lv(14)] }], two) };
  assert.deepEqual(pickEvolution(levelEvolutionOptions(sp, 14), sp, () => 0), { auto: 'y' });
  assert.equal(pickEvolution([], sp, () => 0), null);
});

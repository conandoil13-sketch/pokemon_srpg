import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageMultiplier, newStages, effectiveStat, accuracyShift, applyStageChange, tickStages, STAGE_TURNS } from '../src/core/stages.js';

const unit = () => ({ stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, ...newStages() });

test('multiplier table', () => {
  assert.equal(stageMultiplier(-6), 0.25);
  assert.equal(stageMultiplier(-1), 2 / 3);
  assert.equal(stageMultiplier(0), 1);
  assert.equal(stageMultiplier(2), 2);
  assert.equal(stageMultiplier(6), 4);
});

test('effectiveStat and accuracyShift', () => {
  const u = unit();
  applyStageChange(u, 'atk', 2);
  assert.equal(effectiveStat(u, 'atk'), 200);
  assert.equal(effectiveStat(u, 'def'), 100);
  const a = unit(), d = unit();
  applyStageChange(a, 'acc', 1); applyStageChange(d, 'eva', 2);
  assert.equal(accuracyShift(a, d), -8);
});

test('stacking refreshes turns; clamped at ±6 with no refresh', () => {
  const u = unit();
  applyStageChange(u, 'atk', 2);
  tickStages(u);
  assert.equal(u.turns.atk, STAGE_TURNS - 1);
  const r = applyStageChange(u, 'atk', 1);
  assert.deepEqual([r.applied, r.after, u.turns.atk], [1, 3, STAGE_TURNS]);
  applyStageChange(u, 'atk', 6);
  tickStages(u);
  const turnsBefore = u.turns.atk;
  const capped = applyStageChange(u, 'atk', 2);
  assert.equal(capped.applied, 0);
  assert.equal(u.stages.atk, 6);
  assert.equal(u.turns.atk, turnsBefore, 'no refresh at the cap');
});

test('expires after 3 ticks', () => {
  const u = unit();
  applyStageChange(u, 'spe', -1);
  assert.deepEqual(tickStages(u), []);
  assert.deepEqual(tickStages(u), []);
  assert.deepEqual(tickStages(u), ['spe']);
  assert.equal(u.stages.spe, 0);
  assert.deepEqual(tickStages(u), []);
});

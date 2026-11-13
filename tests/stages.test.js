import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageMultiplier, newStages, effectiveStat, accuracyShift, applyStageChange, tickStages, STAGE_TURNS, AREA_STAGE_TURNS } from '../src/core/stages.js';

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

test('each change keeps its own timer; re-buffing does not extend the old one', () => {
  const u = unit();
  applyStageChange(u, 'atk', 2);   // 3턴
  tickStages(u); tickStages(u);    // 1턴 남음
  applyStageChange(u, 'atk', 2);   // 새 층 3턴, 합 +4
  assert.equal(u.stages.atk, 4);
  tickStages(u);                   // 첫 층 만료 → +2 만 남음 (무한 유지 불가)
  assert.equal(u.stages.atk, 2);
  tickStages(u); tickStages(u);
  assert.equal(u.stages.atk, 0);
});

test('up and down stack numerically but expire separately', () => {
  const u = unit();
  applyStageChange(u, 'def', 2);
  tickStages(u);
  applyStageChange(u, 'def', -1);  // 합 +1
  assert.equal(u.stages.def, 1);
  tickStages(u); tickStages(u);    // +2 층 만료 → −1
  assert.equal(u.stages.def, -1);
  tickStages(u);
  assert.equal(u.stages.def, 0);
});

test('clamped at ±6: a capped change adds no layer', () => {
  const u = unit();
  applyStageChange(u, 'atk', 6);
  const capped = applyStageChange(u, 'atk', 2);
  assert.deepEqual([capped.applied, u.stages.atk], [0, 6]);
  tickStages(u); tickStages(u); tickStages(u);
  assert.equal(u.stages.atk, 0);
});

test('area changes can use a shorter timer', () => {
  const u = unit();
  applyStageChange(u, 'atk', -1, AREA_STAGE_TURNS);
  assert.equal(AREA_STAGE_TURNS, 2);
  tickStages(u);
  assert.equal(u.stages.atk, -1);
  assert.deepEqual(tickStages(u), ['atk']);
  assert.equal(u.stages.atk, 0);
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

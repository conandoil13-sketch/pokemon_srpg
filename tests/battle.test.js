import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, unitAt, moveUnit, applyAttack, endPhase, checkResult, spec } from '../src/core/battle.js';

const zero = () => 0;

test('createBattle initial state', () => {
  const s = createBattle();
  assert.equal(s.units.length, 9);
  assert.equal(s.units.filter((u) => u.side === 'ally').length, 4);
  assert.equal(s.units.filter((u) => u.side === 'enemy').length, 5);
  for (const u of s.units) assert.equal(u.hp, u.maxHp);
  assert.equal(s.phase, 'player');
  assert.equal(s.turn, 1);
  assert.equal(s.result, null);
  assert.equal(spec(s.units[0]).name.length > 0, true);
});

test('moveUnit updates position and flag', () => {
  const s = createBattle();
  moveUnit(s, 'ally-infernape', 3, 5);
  const u = unitAt(s, 3, 5);
  assert.equal(u.id, 'ally-infernape');
  assert.equal(u.moved, true);
  assert.equal(unitAt(s, 2, 5), undefined);
});

test('applyAttack faints and removes target', () => {
  const s = createBattle();
  s.units.find((u) => u.id === 'enemy-roserade').hp = 1;
  const r = applyAttack(s, 'ally-infernape', 'enemy-roserade', 'flamethrower', zero);
  assert.equal(r.fainted, true);
  assert.equal(s.units.some((u) => u.id === 'enemy-roserade'), false);
  assert.equal(s.units.find((u) => u.id === 'ally-infernape').acted, true);
});

test('immune attack leaves hp unchanged', () => {
  const s = createBattle();
  const before = s.units.find((u) => u.id === 'enemy-honchkrow').hp;
  const r = applyAttack(s, 'ally-torterra', 'enemy-honchkrow', 'earthquake', zero);
  assert.equal(r.damage, 0);
  assert.equal(r.fainted, false);
  assert.equal(s.units.find((u) => u.id === 'enemy-honchkrow').hp, before);
});

test('endPhase twice → player, turn 2, flags reset', () => {
  const s = createBattle();
  const a = s.units.find((u) => u.side === 'ally');
  a.moved = true; a.acted = true;
  endPhase(s);
  assert.equal(s.phase, 'enemy');
  endPhase(s);
  assert.equal(s.phase, 'player');
  assert.equal(s.turn, 2);
  assert.equal(a.moved, false);
  assert.equal(a.acted, false);
});

test('last ally fainting → lose', () => {
  const s = createBattle();
  s.units = s.units.filter((u) => u.side === 'enemy' || u.id === 'ally-luxray');
  s.units.find((u) => u.id === 'ally-luxray').hp = 1;
  applyAttack(s, 'enemy-garchomp', 'ally-luxray', 'earthquake', zero);
  assert.equal(s.result, 'lose');
});

test('all enemies gone → win', () => {
  const s = createBattle();
  s.units = s.units.filter((u) => u.side === 'ally');
  assert.equal(checkResult(s), 'win');
  assert.equal(s.result, 'win');
});

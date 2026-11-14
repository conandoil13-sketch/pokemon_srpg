import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRun, floorSeed, floorStartHp, afterFloor, addLoot, settleLoot, finishRun, addBattleCoins, addFloorCoins } from '../src/core/run.js';
import { hashSeed } from '../src/core/floorgen.js';

const game = () => ({ version: 2, party: [{ species: 'chimchar' }, { species: 'piplup' }], items: { evoStone: 0 }, unlocked: ['sinnoh-field'], best: {}, cleared: [], run: null });

test('startRun / floorSeed', () => {
  const r = startRun('sinnoh-field', 42);
  assert.deepEqual(r, { dungeonId: 'sinnoh-field', floor: 1, seed: 42, faintedLast: [], loot: { evoStone: 0, candy: [], coins: 0, capsules: [], powders: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } } });
  assert.equal(floorSeed(r), hashSeed(42, 1));
});

test('next floor carries fainted list only one floor', () => {
  const r0 = startRun('sinnoh-field', 1);
  const a = afterFloor(r0, 'stairs', ['piplup']);
  assert.equal(a.outcome, 'next');
  assert.equal(a.run.floor, 2);
  assert.equal(r0.floor, 1, 'original untouched');
  assert.deepEqual(floorStartHp(a.run), { piplup: 0.5 });
  const b = afterFloor(a.run, 'win', []);
  assert.equal(b.outcome, 'next');
  assert.deepEqual(floorStartHp(b.run), {});
});

test('fainted two floors in a row → still 0.5', () => {
  let r = startRun('sinnoh-field', 1);
  r = afterFloor(r, 'stairs', ['piplup']).run;
  r = afterFloor(r, 'stairs', ['piplup']).run;
  assert.deepEqual(floorStartHp(r), { piplup: 0.5 });
});

test('boss floor win → cleared, lose → wiped', () => {
  const r = { ...startRun('sinnoh-field', 1), floor: 5 };
  assert.equal(afterFloor(r, 'win', []).outcome, 'cleared');
  assert.equal(afterFloor(startRun('sinnoh-field', 1), 'lose', []).outcome, 'wiped');
});

test('loot settles into items and candy exp', () => {
  const g = game();
  const r = startRun('sinnoh-field', 1);
  addLoot(r, 'evoStone', 1); addLoot(r, 'evoStone', 2); addLoot(r, 'candy', 1); addLoot(r, 'candy', 3);
  const s = settleLoot(g, r);
  assert.equal(g.items.evoStone, 2);
  assert.equal(s.evoStone, 2);
  assert.deepEqual(s.exp, { chimchar: 120, piplup: 120 });
});

test('finishRun: cleared unlocks next dungeon; wiped/retreat only record best', () => {
  const g = game();
  finishRun(g, { ...startRun('sinnoh-field', 1), floor: 5 }, 'cleared');
  assert.deepEqual(g.unlocked, ['sinnoh-field', 'sinnoh-cave']);
  assert.deepEqual(g.cleared, ['sinnoh-field']);
  assert.equal(g.best['sinnoh-field'], 5);
  assert.equal(g.run, null);

  const h = game();
  finishRun(h, { ...startRun('sinnoh-field', 1), floor: 3 }, 'wiped');
  assert.equal(h.best['sinnoh-field'], 3);
  assert.deepEqual(h.unlocked, ['sinnoh-field']);
  finishRun(h, { ...startRun('sinnoh-field', 1), floor: 2 }, 'retreat');
  assert.equal(h.best['sinnoh-field'], 3, 'keeps the max');
  assert.equal(h.items.evoStone, 0);
});

test('coins: battle + floor + chest coins settle; wipe keeps old coins only', () => {
  const g = { ...game(), coins: 50 };
  const r = startRun('sinnoh-field', 1);
  addBattleCoins(r, 20); addFloorCoins(r, 3); addLoot(r, 'coins', 1);
  assert.equal(r.loot.coins, 20 + 30 + 20);
  const s = settleLoot(g, r);
  assert.equal(s.coins, 70);
  assert.equal(g.coins, 120);
  const h = { ...game(), coins: 50 };
  const r2 = startRun('sinnoh-field', 1); addBattleCoins(r2, 80);
  finishRun(h, r2, 'wiped');
  assert.equal(h.coins, 50);
});

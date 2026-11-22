import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.5;
// 아군 피카츄(1,0) · 파이리(1,2). 적은 [종, x, y]. 모두 HP 넉넉히
function setup(rows, foes, { allies = [['pikachu', 1, 0], ['charmander', 1, 2]] } = {}) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 30 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 999; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}
const ten = (r, id) => Math.max(1, Math.floor(r.hits.filter((h) => h.unitId === id).reduce((t, h) => t + h.damage, 0) * 0.1));

const WATER = ['..........', '.~~~~.~...', '.~........'];

test('electric chain: spreads along adjacent water foes for 10%, stops at gaps', () => {
  const { s, at } = setup(WATER, [['magikarp', 1, 1], ['goldeen', 2, 1], ['magikarp', 6, 1]]);
  const [t, n, far] = [at(1, 1), at(2, 1), at(6, 1)];
  const r = applyMove(s, at(1, 0).id, 'thunder-shock', t.id, hit);
  assert.deepEqual(r.chain.map((c) => c.unitId), [n.id]);
  assert.equal(r.chain[0].damage, ten(r, t.id));
  assert.equal(r.chain[0].from, t.id);
  assert.equal(n.hp, 999 - r.chain[0].damage);
  assert.equal(far.hp, 999);
});

test('electric chain: allies on water are never hit', () => {
  const { s, at } = setup(WATER, [['magikarp', 1, 1]]);
  const ally = at(1, 2);
  const r = applyMove(s, at(1, 0).id, 'thunder-shock', at(1, 1).id, hit);
  assert.deepEqual(r.chain, []);
  assert.equal(ally.hp, 999);
});

test('electric chain: immune foe takes nothing but passes the chain on', () => {
  const { s, at } = setup(WATER, [['magikarp', 1, 1], ['goldeen', 2, 1], ['geodude', 3, 1], ['magikarp', 4, 1]]);
  const r = applyMove(s, at(1, 0).id, 'thunder-shock', at(1, 1).id, hit);
  assert.deepEqual(r.chain.map((c) => c.unitId).sort(), [at(2, 1).id, at(4, 1).id].sort());
  assert.equal(at(3, 1).hp, 999);
});

test('electric chain: does not start from land or from a miss', () => {
  const { s, at } = setup(['..........', '.~........', '..........'], [['magikarp', 2, 0], ['goldeen', 2, 1]], { allies: [['pikachu', 1, 0]] });
  const r = applyMove(s, at(1, 0).id, 'thunder-shock', at(2, 0).id, hit); // 땅 위 대상
  assert.deepEqual(r.chain, []);
});

test('electric chain: a target already hit by the move is not chained again', () => {
  const { s, at } = setup(WATER, [['magikarp', 1, 1], ['goldeen', 2, 1], ['magikarp', 3, 1]]);
  s.units.find((u) => u.x === 1 && u.y === 0).moves = ['discharge'];
  const r = applyMove(s, at(1, 0).id, 'discharge', { self: true }, hit); // 주변 1칸(대각 포함): (1,1)·(2,1) 이 직접 맞음
  const ids = r.chain.map((c) => c.unitId);
  assert.ok(r.hits.some((h) => h.unitId === at(2, 1).id));
  assert.deepEqual(ids, [at(3, 1).id]);
});

test('fire chain: grass and leaf route tiles carry it, water does not', () => {
  const rows = ['..........', '."".~.....', '.~........'];
  const { s, at } = setup(rows, [['bidoof', 1, 1], ['bidoof', 2, 1], ['bidoof', 3, 1], ['magikarp', 4, 1]], { allies: [['charmander', 1, 0]] });
  s.leafTiles = new Set(['3,1']);
  const r = applyMove(s, at(1, 0).id, 'ember', at(1, 1).id, hit);
  assert.deepEqual(r.chain.map((c) => c.unitId), [at(2, 1).id, at(3, 1).id]);
});

test('electric on grass does not chain', () => {
  const { s, at } = setup(['..........', '."".......', '..........'], [['bidoof', 1, 1], ['bidoof', 2, 1]], { allies: [['pikachu', 1, 0]] });
  const r = applyMove(s, at(1, 0).id, 'thunder-shock', at(1, 1).id, hit);
  assert.deepEqual(r.chain, []);
});

test('chain knockout counts as a normal knockout', () => {
  const { s, at } = setup(WATER, [['magikarp', 1, 1], ['goldeen', 2, 1]]);
  const n = at(2, 1); n.hp = 1;
  const r = applyMove(s, at(1, 0).id, 'thunder-shock', at(1, 1).id, hit);
  assert.equal(r.chain[0].fainted, true);
  assert.ok(!s.units.includes(n));
  assert.ok(Object.values(r.expGained).some((v) => v > 0));
});

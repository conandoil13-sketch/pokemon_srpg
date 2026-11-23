import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reachable } from '../src/core/pathfind.js';
import { calcDamage, hitChance, terrainCtx } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';
import { makeUnit } from '../src/core/battle.js';

const u = (species, side = 'ally', x = 0, y = 0) => makeUnit({ species, side, x, y, level: 50, moves: ['tackle'] });
const dmg = (a, d, tile = '.', ctx = {}) => calcDamage(a, d, MOVES.tackle, { rng: () => 0.5, defTile: tile, ...ctx }).damage;

test('rock/ground: rock tile costs 1', () => {
  const grid = ['^^^^^^^'];
  const g = u('geodude', 'ally', 0, 0); // 바위·땅, 이동력 2
  assert.equal(reachable(grid, [g], g).get('2,0'), 2);
  const p = u('pikachu', 'ally', 0, 0);
  assert.equal(reachable(grid, [p], p).get('2,0'), 4);
});

test('steel: rock tile defense x1.35', () => {
  const a = u('machop'), steel = u('bronzor', 'enemy');
  assert.ok(dmg(a, steel, '^') < Math.floor(dmg(a, steel, '.') / 1.3) + 1);
  const rock = u('bonsly', 'enemy');
  assert.ok(dmg(a, rock, '^') > dmg(a, rock, '.') / 1.3);
});

test('fighting on rock: +5 accuracy', () => {
  const f = u('primeape'), d = u('pikachu', 'enemy');
  const mv = { ...MOVES.tackle, accuracy: 80 };
  assert.equal(hitChance(f, d, mv, '.', null, { atkTile: '^' }) - hitChance(f, d, mv, '.', null, { atkTile: '.' }), 5);
  const n = u('bidoof');
  assert.equal(hitChance(n, d, mv, '.', null, { atkTile: '^' }), hitChance(n, d, mv, '.', null, { atkTile: '.' }));
});

test('grass in bush: evasion 20', () => {
  const a = u('bidoof'), g = u('turtwig', 'enemy'), n = u('starly', 'enemy');
  const mv = { ...MOVES.tackle, accuracy: 100 };
  a.stats.spe = 999; // 스피드 차 회피 제외
  assert.equal(hitChance(a, g, mv, '"'), 80);
  assert.equal(hitChance(a, n, mv, '"'), 85);
});

test('normal: 3% less damage per adjacent ally, max 12%', () => {
  const a = u('machop'), d = u('snorlax', 'enemy');
  const base = dmg(a, d);
  const two = dmg(a, d, '.', { guards: 2 });
  assert.ok(two < base && two >= Math.floor(base * 0.94) - 1);
  assert.equal(dmg(a, d, '.', { guards: 6 }), dmg(a, d, '.', { guards: 4 }));
  const w = u('pikachu', 'enemy');
  assert.equal(dmg(a, w, '.', { guards: 4 }), dmg(a, w));
});

test('terrainCtx reads attacker tile and defender neighbours', () => {
  const a = u('machop', 'ally', 0, 0), d = u('snorlax', 'enemy', 2, 0);
  const m1 = u('bidoof', 'enemy', 3, 0), m2 = u('bidoof', 'enemy', 2, 1), foe = u('bidoof', 'ally', 1, 0);
  const state = { grid: ['^...', '....'], units: [a, d, m1, m2, foe] };
  assert.deepEqual(terrainCtx(state, a, d), { atkTile: '^', guards: 2, charged: false, victoryStar: false });
});

// ── 2차분: 물·풀 출발 이동력 +1, 고스트 상대 칸 통과 ──
import { moveBudget } from '../src/core/status.js';
import { terrainStart } from '../src/core/battle.js';

test('water starting on water / grass starting on bush: +1 move', () => {
  const grid = ['~"..'];
  const w = u('buizel', 'ally', 0, 0), g = u('turtwig', 'ally', 1, 0);
  const before = [moveBudget(w), moveBudget(g)];
  terrainStart({ grid }, w); terrainStart({ grid }, g);
  assert.deepEqual([moveBudget(w), moveBudget(g)], [before[0] + 1, before[1] + 1]);
  w.x = 2; terrainStart({ grid }, w);
  assert.equal(moveBudget(w), before[0]);
});

test('non-matching types get no start bonus', () => {
  const grid = ['"~..'];
  const w = u('buizel', 'ally', 0, 0), p = u('psyduck', 'ally', 0, 0); // 물인데 수풀
  const b = moveBudget(w);
  terrainStart({ grid }, w);
  assert.equal(moveBudget(w), b);
});

test('ghost passes through foes but cannot stop on them', () => {
  const grid = ['.....'];
  const gh = u('gastly', 'ally', 0, 0), foe = u('bidoof', 'enemy', 1, 0);
  const r = reachable(grid, [gh, foe], gh);
  assert.ok(r.has('2,0'));
  assert.ok(!r.has('1,0'));
  const n = u('pikachu', 'ally', 0, 0);
  assert.ok(!reachable(grid, [n, foe], n).has('2,0'));
});

// ── 3차분: 벌레 나무, 비행·드래곤 장애물 통과, 드래곤 물 위 ──
const treeMap = (rows) => Object.assign([...rows], { trees: true });

test('bug passes and stops on trees (tree maps only)', () => {
  const b = u('kricketune', 'ally', 0, 0);
  const r = reachable(treeMap(['.#.']), [b], b);
  assert.equal(r.get('1,0'), 1);
  assert.ok(r.has('2,0'));
  assert.ok(!reachable(['.#.'], [b], b).has('1,0')); // 동굴 벽은 안 됨
});

test('flying passes obstacles at cost 3 but cannot stop on them', () => {
  const f = u('staravia', 'ally', 0, 0);
  const r = reachable(['.#..', '....'], [f], f);
  assert.ok(!r.has('1,0'));
  assert.equal(reachable(['.#.*.'], [f], f).get('2,0'), 4);
  f.grounded = true;
  assert.equal(reachable(['.#.'], [f], f).has('2,0'), false); // 중력: 통과 못 함
});

test('dragon passes obstacles and walks on water', () => {
  const d = u('gible', 'ally', 0, 0);
  const r = reachable(['.#.', '~..'], [d], d);
  assert.equal(r.get('0,1'), 1);
  assert.ok(!r.has('1,0'));
  const far = u('gabite', 'ally', 0, 0);
  assert.ok(reachable(['.#.'], [far], far).has('2,0'));
});

test('standing on a tree: defense x1.1 and evasion +8', () => {
  const a = u('bidoof'), d = u('kricketune', 'enemy');
  a.stats.spe = 999;
  const mv = { ...MOVES.tackle, accuracy: 100 };
  assert.equal(hitChance(a, d, mv, '#'), 92);
  assert.ok(dmg(a, d, '#') < dmg(a, d, '.'));
});

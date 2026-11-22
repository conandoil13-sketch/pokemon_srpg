import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, endPhase } from '../src/core/battle.js';
import { reachable } from '../src/core/pathfind.js';
import { planEnemyAction } from '../src/core/ai.js';
import { poolDamage } from '../src/core/pool.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

function setup(allies, foes = [['bidoof', 9, 3]], rows = ['..%%......', '..........', '..........', '..........']) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 160; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}

test('pool: 1/8 damage, steel 1/16, poison and floaters immune, magic guard immune', () => {
  const { s, at } = setup([['bidoof', 2, 0], ['magnemite', 3, 0], ['grimer', 1, 0], ['starly', 0, 0]]);
  assert.equal(poolDamage(at(2, 0), '%').damage, 20);
  assert.equal(poolDamage(at(3, 0), '%').damage, 10);
  assert.equal(poolDamage(at(1, 0), '%'), null);
  assert.equal(poolDamage(at(0, 0), '%'), null);
  assert.equal(poolDamage(at(2, 0), '.'), null);
  const b = at(2, 0);
  assert.equal(poolDamage({ ...b, types: ['poison', 'steel'] }, '%'), null);
  assert.equal(poolDamage({ ...b, ability: 'levitate' }, '%'), null);
  assert.equal(poolDamage({ ...b, ability: 'magic-guard' }, '%'), null);
  assert.equal(poolDamage({ ...b, grounded: true, types: ['flying'] }, '%').damage, 20); // 중력 비행은 맞음
  assert.equal(poolDamage({ ...b, hp: 3, maxHp: 3 }, '%').damage, 1); // 최소 1
  s.phase = 'player';
});

test('pool: phase end hurts allies standing in it, not ones nearby', () => {
  const { s, at } = setup([['bidoof', 2, 0], ['bidoof', 2, 1]]);
  s.phase = 'player';
  const inPool = at(2, 0), dry = at(2, 1);
  endPhase(s, () => 0.99);
  assert.equal(inPool.hp, 140);
  assert.equal(dry.hp, 160);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'poisonPool' && e.unitId === inPool.id && e.damage === 20));
});

test('pool: walking through costs 1', () => {
  const { s, at } = setup([['bidoof', 1, 0]]);
  assert.equal(reachable(s.grid, s.units, at(1, 0)).get('4,0'), 3);
});

test('AI: prefers a dry cell over the pool for the same attack', () => {
  const rows = ['%..', '.%.', '...'];
  const { s, at } = setup([['bidoof', 1, 0]], [['bidoof', 1, 2]], rows);
  for (const u of s.units) u.moves = ['tackle'];
  const plan = planEnemyAction(s, at(1, 2));
  assert.equal(plan.attack?.moveId, 'tackle');
  assert.notEqual(s.grid[plan.moveTo.y][plan.moveTo.x], '%');
});

// ---- 층 생성 ----
import { generateFloor, reachableFrom } from '../src/core/floorgen.js';
import { DUNGEONS } from '../src/data/dungeons.js';
const SEWER = DUNGEONS.find((d) => d.id === 'sewer');

test('sewer data: poison/dark theme, sewer flag, trash bags', () => {
  assert.equal(SEWER.name, '하수도');
  assert.equal(SEWER.theme, 'sewer');
  assert.ok(SEWER.sewer && SEWER.piles);
  assert.deepEqual(SEWER.bossTypes, ['poison', 'dark']);
  assert.ok(SEWER.pileSpecies.filter((s) => s === 'grimer').length >= 2); // 질퍽이 자주
});

test('sewer floors: walls with straight corridors, water channel and poison shortcuts, all connected', () => {
  let water = 0, poison = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const floor = 1 + (seed % SEWER.floors);
    const f = generateFloor(SEWER, floor, seed);
    const all = f.tiles.join('');
    const walls = [...all].filter((c) => c === '#').length / all.length;
    assert.ok(walls >= 0.25, `walls ${walls} seed ${seed}`);
    if (all.includes(',')) water++;
    if (all.includes('%')) poison++;
    for (let y = 0; y < f.tiles.length; y++) for (let x = 0; x < 3; x++) assert.notEqual(f.tiles[y][x], '#', 'start zone open');
    const reach = reachableFrom(f.tiles, { x: 1, y: Math.floor(f.tiles.length / 2) });
    const spots = [...f.enemies, ...f.chests, ...(f.stairs ? [f.stairs] : [])];
    for (const p of spots) {
      assert.ok(reach.has(`${p.x},${p.y}`), `reachable ${p.x},${p.y} seed ${seed}`);
      assert.ok(!',%'.includes(f.tiles[p.y][p.x]), `not on water/pool seed ${seed}`);
    }
  }
  assert.ok(water >= 20 && poison >= 20, `water ${water} poison ${poison}`);
});

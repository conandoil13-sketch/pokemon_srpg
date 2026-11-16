import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS, dungeonById } from '../src/data/dungeons.js';
import { fillerStage } from '../src/data/fillerStages.js';
import { generateFloor } from '../src/core/floorgen.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

const memStore = () => { const data = {}; return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };

test('autumn forest takes the first trial slot with the trial curve', () => {
  const d = DUNGEONS[2], t = fillerStage(1);
  assert.equal(d.id, 'autumn-forest'); assert.equal(d.name, '단풍 숲'); assert.equal(d.theme, 'autumn');
  assert.deepEqual(d.types, ['bug', 'poison', 'fire', 'grass']); assert.deepEqual(d.piles, [2, 4]);
  for (const k of ['floors', 'baseLevel', 'budget', 'levelCap', 'bstCap']) assert.deepEqual(d[k], t[k]);
  assert.equal(d.unlock, 'sinnoh-cave'); assert.equal(DUNGEONS[3].unlock, 'autumn-forest'); assert.ok(!d.filler);
});

test('old saves move trial-1 progress to the autumn forest', () => {
  const store = memStore();
  const g = newGame();
  saveGame(store, g);
  const raw = JSON.parse(store.data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'sinnoh-cave', 'trial-1', 'trial-2'];
  raw.cleared = ['sinnoh-field', 'sinnoh-cave', 'trial-1'];
  raw.best = { 'trial-1': 7 };
  raw.run = { ...(raw.run ?? {}), dungeonId: 'trial-1', floor: 3, seed: 5, faintedLast: [], loot: { evoStone: 0, candy: [], coins: 0, capsules: [] } };
  store.data['pokemon-tactics-save'] = JSON.stringify(raw);
  const l = loadGame(store);
  assert.ok(l.unlocked.includes('autumn-forest')); assert.ok(!l.unlocked.includes('trial-1'));
  assert.ok(l.cleared.includes('autumn-forest')); assert.ok(!l.cleared.includes('trial-1'));
  assert.equal(l.best['autumn-forest'], 7);
  assert.equal(l.run.dungeonId, 'autumn-forest'); assert.equal(l.run.floor, 3);
});

test('every autumn floor generates enemies of the forest types and a boss', () => {
  const d = dungeonById('autumn-forest');
  for (let seed = 1; seed <= 3; seed++) for (let f = 1; f <= d.floors; f++) {
    const m = generateFloor(d, f, seed);
    assert.ok(m.enemies.length >= 1, `f${f} s${seed}`);
    if (f === d.floors) assert.ok(m.enemies.some((e) => e.boss));
  }
});

import { createBattle, arrive, moveUnit } from '../src/core/battle.js';
import { canEnter, reachable } from '../src/core/pathfind.js';
import { reachableFrom } from '../src/core/floorgen.js';
import { newParty } from '../src/core/progress.js';

test('autumn floors place 2-4 piles that block and keep the floor connected', () => {
  const d = dungeonById('autumn-forest');
  let mon = 0, all = 0;
  for (let seed = 1; seed <= 40; seed++) for (let f = 1; f <= d.floors; f++) {
    const m = generateFloor(d, f, seed);
    if (seed <= 5) {
      assert.ok(m.piles.length >= 2 && m.piles.length <= 4, `f${f} s${seed}: ${m.piles.length}`);
      assert.deepEqual(generateFloor(d, f, seed), m);
      const reach = reachableFrom(m.tiles, { x: 1, y: Math.floor(m.tiles.length / 2) });
      m.tiles.forEach((row, y) => [...row].forEach((c, x) => { if ('."^>'.includes(c)) assert.ok(reach.has(`${x},${y}`), `cut f${f} s${seed} ${x},${y}`); }));
    }
    for (const p of m.piles) {
      assert.equal(m.tiles[p.y][p.x], '*'); assert.ok(p.x >= 3);
      assert.ok(m.allySlots.every((a) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) > 1));
      assert.ok(!m.enemies.some((e) => e.x === p.x && e.y === p.y) && !m.chests.some((c) => c.x === p.x && c.y === p.y));
      all++; if (p.kind === 'mon') mon++;
    }
  }
  assert.ok(mon / all > 0.45 && mon / all < 0.75, `${mon}/${all}`);
});

test('sinnoh floors have no piles', () => {
  assert.equal(generateFloor(dungeonById('sinnoh-field'), 1, 7).piles.length, 0);
});

// 손으로 만든 맵: 아군 하나 (1,1), 더미는 인자로
const tinyMap = (piles, { stairs = null } = {}) => {
  const rows = ['........', '........', '........'].map((r) => [...r]);
  for (const p of piles) rows[p.y][p.x] = '*';
  if (stairs) rows[stairs.y][stairs.x] = '>';
  return { tiles: rows.map((r) => r.join('')), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: 'pidgey', level: 5, x: 7, y: 2 }], stairs, chests: [], piles };
};
const ally = (s) => s.units.find((u) => u.side === 'ally');

test('nobody can enter a pile', () => {
  assert.equal(canEnter('*', 'pidgey'), false);
  assert.equal(canEnter('*', { species: 'pidgey', ability: 'levitate', types: ['normal'] }), false);
  assert.equal(canEnter('*', { species: 'pidgey', ability: 'limber', types: ['normal'] }, true), false);
  const s = createBattle(tinyMap([{ x: 2, y: 1, kind: 'chest', item: 'candy' }]), newParty());
  assert.ok(!reachable(s.grid, s.units, ally(s), 10).has('2,1'));
});

test('an ally finishing next to a pile opens it: ambush deals the level and leaves 1 hp', () => {
  for (const [hp, dmg, left] of [[30, 24, 6], [10, 9, 1]]) {
    const s = createBattle(tinyMap([{ x: 3, y: 1, kind: 'mon', species: 'paras', level: 24 }]), newParty());
    const a = ally(s); a.hp = hp; moveUnit(s, a.id, 2, 1, 0);
    const r = arrive(s, a.id);
    assert.equal(r.piles.length, 1); assert.equal(r.piles[0].damage, dmg); assert.equal(a.hp, left);
    const e = s.units.find((u) => u.id === r.piles[0].unitId);
    assert.equal(e.species, 'paras'); assert.equal(e.level, 24); assert.equal(e.side, 'enemy'); assert.deepEqual([e.x, e.y], [3, 1]);
    assert.equal(s.grid[1][3], '.'); assert.equal(s.piles.length, 0);
  }
});

test('two mon piles at once never faint the ally', () => {
  const s = createBattle(tinyMap([{ x: 2, y: 0, kind: 'mon', species: 'paras', level: 24 }, { x: 2, y: 2, kind: 'mon', species: 'oddish', level: 24 }]), newParty());
  const a = ally(s); a.hp = 20; moveUnit(s, a.id, 2, 1, 0);
  const r = arrive(s, a.id);
  assert.equal(r.piles.length, 2); assert.equal(a.hp, 1); assert.equal(r.piles[0].damage + r.piles[1].damage, 19);
});

test('a chest pile opens itself into loot', () => {
  const s = createBattle(tinyMap([{ x: 3, y: 1, kind: 'chest', item: 'candy' }]), newParty());
  const a = ally(s); moveUnit(s, a.id, 2, 1, 0);
  const r = arrive(s, a.id);
  assert.equal(r.piles[0].item, 'candy'); assert.ok(s.log.loot.includes('candy'));
});

test('enemies and diagonal neighbours do not open piles', () => {
  const s = createBattle(tinyMap([{ x: 3, y: 1, kind: 'chest', item: 'candy' }]), newParty());
  const e = s.units.find((u) => u.side === 'enemy'); moveUnit(s, e.id, 4, 1, 0);
  assert.equal(arrive(s, e.id).piles.length, 0);
  const a = ally(s); moveUnit(s, a.id, 2, 0, 0);
  assert.equal(arrive(s, a.id).piles.length, 0); assert.equal(s.piles.length, 1);
});

test('arriving on stairs next to a pile reports both', () => {
  const s = createBattle(tinyMap([{ x: 3, y: 1, kind: 'chest', item: 'coins' }], { stairs: { x: 2, y: 1 } }), newParty());
  const a = ally(s); moveUnit(s, a.id, 2, 1, 0);
  const r = arrive(s, a.id);
  assert.equal(r.stairs, true); assert.equal(r.piles.length, 1);
});

test('boss floor with piles keeps its boss', () => {
  const d = dungeonById('autumn-forest');
  for (let seed = 1; seed <= 5; seed++) {
    const m = generateFloor(d, d.floors, seed);
    const boss = m.enemies.filter((e) => e.boss);
    assert.equal(boss.length, 1); assert.ok(!m.piles.some((p) => p.x === boss[0].x && p.y === boss[0].y));
  }
});

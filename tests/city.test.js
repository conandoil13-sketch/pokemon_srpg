import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle } from '../src/core/battle.js';
import { reachable, canEnter } from '../src/core/pathfind.js';
import { hitChance, terrainCtx } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

// 건물 (4..6, 1..2) 3×2
const ROWS = ['..........', '....BBB...', '....BBB...', '..........'];
function setup(allies, foes = [['bidoof', 9, 3]], rows = ROWS) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 999; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}
const has = (r, x, y) => r.has(`${x},${y}`);

test('roof: walk freely on the building, step down to the road, never climb up on foot', () => {
  const { s, at } = setup([['bidoof', 5, 1]]);
  const r = reachable(s.grid, s.units, at(5, 1));
  assert.ok(has(r, 6, 2) && has(r, 4, 1)); // 옥상 안
  assert.ok(has(r, 5, 0) && has(r, 3, 2) && has(r, 5, 3)); // 내려오기
  const g = setup([['bidoof', 3, 0]]);
  const r2 = reachable(g.s.grid, g.s.units, g.at(3, 0));
  assert.ok(has(r2, 4, 0)); // 도로는 됨
  assert.ok(!has(r2, 4, 1)); // 옥상은 안 됨
});

test('roof: flying and dragon climb for 2 and may stop there; grounded flyers cannot', () => {
  const { s, at } = setup([['starly', 3, 1]]);
  const st = at(3, 1);
  const r = reachable(s.grid, s.units, st);
  assert.equal(r.get('4,1'), 2);
  assert.ok(has(r, 5, 2));
  const d = setup([['dratini', 3, 1]]);
  assert.equal(reachable(d.s.grid, d.s.units, d.at(3, 1)).get('4,1'), 2);
  st.grounded = true;
  assert.ok(!has(reachable(s.grid, s.units, st), 4, 1));
});

test('canEnter: a building only takes flyers (no shoving walkers onto roofs)', () => {
  const { s, at } = setup([['bidoof', 0, 0], ['starly', 1, 0]]);
  assert.equal(canEnter('B', at(0, 0)), false);
  assert.equal(canEnter('B', at(1, 0)), true);
});

test('height: roof to road +10 accuracy, road to roof −10', () => {
  const { s, at } = setup([['bidoof', 5, 2], ['bidoof', 5, 3]]);
  const top = at(5, 2), low = at(5, 3), mv = { ...MOVES['tackle'], accuracy: 80 };
  assert.equal(hitChance(top, low, mv, s.grid[3][5], null, terrainCtx(s, top, low)), 90);
  assert.equal(hitChance(low, top, mv, s.grid[2][5], null, terrainCtx(s, low, top)), 70);
});

import { warpTarget, useWarp } from '../src/core/warp.js';
const WARPS = [{ x: 1, y: 3, color: 'blue', to: { x: 5, y: 1 } }, { x: 5, y: 1, color: 'blue', to: { x: 1, y: 3 } }];
function warped(allies, foes) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: ROWS, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })), warps: WARPS };
  const s = createBattle(map, ms);
  return { s, at: (x, y) => s.units.find((u) => u.x === x && u.y === y) };
}

test('warp: ending a move on a pad sends an ally to its partner, still free to act', () => {
  const { s, at } = warped([['bidoof', 1, 3]], [['bidoof', 9, 0]]);
  const u = at(1, 3);
  assert.deepEqual(warpTarget(s, u), { x: 5, y: 1 });
  const r = useWarp(s, u);
  assert.deepEqual(r, { from: { x: 1, y: 3 }, to: { x: 5, y: 1 }, color: 'blue' });
  assert.deepEqual([u.x, u.y], [5, 1]);
  assert.equal(u.acted, false);
});

test('warp: blocked partner, flyers, and enemies do not warp; dragons do', () => {
  const a = warped([['bidoof', 1, 3], ['bidoof', 5, 1]], [['bidoof', 9, 0]]);
  assert.equal(warpTarget(a.s, a.at(1, 3)), null); // 짝 칸에 누가 있음
  const b = warped([['starly', 1, 3]], [['bidoof', 9, 0]]);
  assert.equal(warpTarget(b.s, b.at(1, 3)), null);
  const c = warped([['dratini', 1, 3]], [['bidoof', 9, 0]]);
  assert.deepEqual(warpTarget(c.s, c.at(1, 3)), { x: 5, y: 1 });
  const d = warped([['bidoof', 0, 0]], [['bidoof', 1, 3]]);
  assert.equal(warpTarget(d.s, d.at(1, 3)), null); // 적은 안 씀
});

test('walking onto a warp on screen: lands on the roof, notice, and the move cannot be undone', async () => {
  const { createGame } = await import('../src/game/states.js');
  const map = { tiles: ROWS, allySlots: [{ x: 0, y: 3 }], enemies: [{ species: 'bidoof', x: 9, y: 0, level: 5 }], warps: WARPS };
  const game = createGame({ rng: createRng(3), map, party: [newMember('bidoof', 40, createRng(1))], theme: 'city' });
  const s = game.state, p = s.units[0];
  for (let i = 0; i < 200; i++) { game.update(0.05); if (game.mode === 'idle') break; game.handle({ type: 'confirm' }); }
  game.handle({ type: 'confirm' });
  game.handle({ type: 'dir', dx: 1, dy: 0 });
  game.handle({ type: 'confirm' });
  for (let i = 0; i < 200 && game.mode !== 'notice'; i++) game.update(0.05);
  assert.equal(game.mode, 'notice');
  assert.deepEqual([p.x, p.y], [5, 1]);
  for (let i = 0; i < 50 && game.mode === 'notice'; i++) { game.handle({ type: 'confirm' }); game.update(0.5); }
  assert.equal(game.mode, 'action');
  game.handle({ type: 'cancel' });
  assert.deepEqual([p.x, p.y], [5, 1]);
});

import { generateFloor, reachableFrom } from '../src/core/floorgen.js';
import { CITY } from '../src/data/city.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';

const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7919);
const floors = () => SEEDS.flatMap((seed, i) => { const f = 1 + (i % CITY.floors); return [{ f, seed, m: generateFloor(CITY, f, seed) }]; });

test('city dungeon takes trial slot 3 with its curve and types', () => {
  const i = DUNGEONS.findIndex((d) => d.id === 'city');
  assert.ok(i > 0);
  assert.equal(DUNGEONS[i].name, '???시티');
  assert.equal(DUNGEONS[i].unlock, 'beach');
  assert.equal(CITY.baseLevel[0], 37);
  assert.deepEqual(CITY.bossTypes, ['poison', 'psychic']);
});

test('city floors: 3x2 buildings with alleys, everything important reachable by road', () => {
  for (const { f, m } of floors()) {
    const g = m.tiles, H = g.length, W = g[0].length;
    let b = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'B') b++;
    assert.ok(b >= 6 && b % 6 === 0, `floor ${f}: ${b} building tiles`);
    assert.ok(b / (W * H) > 0.15, 'buildings cover a good share');
    // 건물마다 3×2 덩어리 (붙은 건물 없음)
    const seen = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x] !== 'B' || seen.has(`${x},${y}`)) continue;
      const q = [[x, y]], blob = [];
      seen.add(`${x},${y}`);
      while (q.length) { const [cx, cy] = q.pop(); blob.push([cx, cy]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = cx + dx, ny = cy + dy; if (g[ny]?.[nx] === 'B' && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); } } }
      assert.equal(blob.length, 6);
      const xs = blob.map((p) => p[0]), ys = blob.map((p) => p[1]);
      assert.equal(Math.max(...xs) - Math.min(...xs), 2); assert.equal(Math.max(...ys) - Math.min(...ys), 1);
    }
    const reach = reachableFrom(g, m.allySlots[0]);
    if (m.stairs) assert.ok(reach.has(`${m.stairs.x},${m.stairs.y}`));
    const boss = m.enemies.find((e) => e.boss);
    if (boss) assert.ok(reach.has(`${boss.x},${boss.y}`));
    for (const p of m.piles) assert.equal(g[p.y][p.x], '*');
    for (const e of m.enemies) assert.ok('."^B'.includes(g[e.y][e.x]));
  }
});

test('city floors: some foes start on roofs; warps come in colored pairs with a road-to-roof link', () => {
  let roofFoes = 0, warpFloors = 0;
  for (const { m } of floors()) {
    const g = m.tiles;
    roofFoes += m.enemies.filter((e) => g[e.y][e.x] === 'B').length;
    assert.ok(!m.enemies.some((e) => e.boss && g[e.y][e.x] === 'B'));
    if (!m.warps.length) continue;
    warpFloors++;
    assert.equal(m.warps.length, 8);
    for (const w of m.warps) {
      const back = m.warps.find((o) => o.x === w.to.x && o.y === w.to.y);
      assert.ok(back && back.color === w.color && back.to.x === w.x && back.to.y === w.y);
      assert.ok('.B'.includes(g[w.y][w.x]));
      assert.ok(!m.chests.some((c) => c.x === w.x && c.y === w.y) && !m.enemies.some((e) => e.x === w.x && e.y === w.y));
    }
    assert.ok(m.warps.some((w) => g[w.y][w.x] === '.' && g[w.to.y][w.to.x] === 'B'));
    assert.equal(new Set(m.warps.map((w) => `${w.x},${w.y}`)).size, 8);
  }
  assert.ok(roofFoes > 0);
  assert.ok(warpFloors >= 10 && warpFloors <= 22);
});

test('city trash cans hide street species; bosses are poison or psychic', () => {
  for (const { m } of floors()) {
    for (const p of m.piles.filter((p) => p.kind === 'mon')) assert.ok(CITY.pileSpecies.includes(p.species));
    for (const e of m.enemies.filter((e) => e.boss)) assert.ok(SPECIES[e.species].types.some((t) => t === 'poison' || t === 'psychic'));
  }
});

import { newGame, saveGame, loadGame } from '../src/core/save.js';
test('old saves move trial-3 progress to the city', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'sinnoh-cave', 'trial-1', 'trial-2', 'trial-3']; raw.cleared = ['trial-3']; raw.best = { 'trial-3': 5 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const l = loadGame(store);
  assert.ok(l.unlocked.includes('city')); assert.ok(l.cleared.includes('city')); assert.equal(l.best.city, 5);
});

test('trash cans never sit right next to a building (roof exits stay open)', () => {
  for (const { m } of floors()) for (const p of m.piles) assert.ok(![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.tiles[p.y + dy]?.[p.x + dx] === 'B'), `${p.x},${p.y}`);
});

import { moveUnit } from '../src/core/battle.js';
test('a walker fainting on spikes does not leave the previous warp in the log', () => {
  const { s, at } = warped([['bidoof', 1, 3], ['bidoof', 0, 0]], [['bidoof', 9, 0]]);
  moveUnit(s, at(1, 3).id, 1, 3, 0, null, { warp: true }); // 제자리 — 워프 안 함
  const b = at(0, 0); b.hp = 1;
  s.log.warp = { from: { x: 1, y: 3 }, to: { x: 5, y: 1 }, color: 'blue' }; // 앞 아군의 워프
  s.spikes.push({ x: 0, y: 1, kind: 'spikes', side: 'enemy', by: 'x', revealed: false });
  moveUnit(s, b.id, 0, 1, 1, [{ x: 0, y: 0 }, { x: 0, y: 1 }], { warp: true });
  assert.equal(b.hp, 0);
  assert.equal(s.log.warp, null);
});

test('city trees only grow in parks (next to lawn), never alone on the road', () => {
  let trees = 0, lawns = 0;
  for (const { m } of floors()) {
    const g = m.tiles;
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
      if (g[y][x] === '"') lawns++;
      if (g[y][x] !== '#') continue;
      trees++;
      let lawn = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy]?.[x + dx] === '"') lawn = true;
      assert.ok(lawn, `tree at ${x},${y} is not in a park`);
    }
  }
  assert.ok(trees > 0 && lawns > 0);
});

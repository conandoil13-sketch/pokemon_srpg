import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';
import { SPECIES } from '../src/data/species.js';
import { generateFloor } from '../src/core/floorgen.js';
import { fillerStage } from '../src/data/fillerStages.js';

const GY = DUNGEONS.find((d) => d.id === 'graveyard');

test('graveyard is 9-2 on the stage 9 curve; the volcano opens it, 9-1 stays a placeholder', () => {
  const s9 = DUNGEONS.filter((d) => d.stage === 9);
  assert.deepEqual(s9.map((d) => [d.id, d.branch, d.unlock]), [['trial-7', 1, 'ice-cave'], ['graveyard', 2, 'volcano']]);
  assert.equal(GY.name, '묘지'); assert.equal(GY.theme, 'graveyard'); assert.ok(GY.graveyard);
  const c = fillerStage(7);
  assert.deepEqual(GY.baseLevel, c.baseLevel); assert.equal(GY.floors, 9); assert.equal(GY.levelCap, 73);
  assert.deepEqual(GY.weather, [{ id: 'fog', chance: 0.6 }]);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 10).unlock, ['trial-7', 'graveyard']);
});

test('graveyard: ghost types lead and ghost + psychic make most of the pool; spiritomb always in the pool', () => {
  const n = { ghost: 0, psychic: 0, all: 0 };
  for (let seed = 1; seed <= 40; seed++) for (let f = 1; f < GY.floors; f++) for (const e of generateFloor(GY, f, seed).enemies) {
    const t = SPECIES[e.species].types; n.all++;
    if (t.includes('ghost')) n.ghost++; else if (t.includes('psychic')) n.psychic++;
  }
  assert.ok(n.ghost / n.all >= 0.35, `ghost ${n.ghost}/${n.all}`);
  assert.ok((n.ghost + n.psychic) / n.all >= 0.55, `ghost+psychic ${n.ghost + n.psychic}/${n.all}`);
  for (let f = 1; f <= GY.floors; f++) assert.ok(encounterPool(GY, f).includes('spiritomb'), `floor ${f}`);
});

test('fog about 60%', () => {
  let fog = 0;
  for (let seed = 1; seed <= 200; seed++) if (generateFloor(GY, 2, seed).weather === 'fog') fog++;
  assert.ok(fog > 100 && fog < 140, String(fog));
});

// ---- 묘비 T ----
import { reachable, canEnter, pathTo, pathCost } from '../src/core/pathfind.js';
import { tilesOf } from '../src/core/shapes.js';
import { makeUnit } from '../src/core/battle.js';

// 7×3: 가운데 열이 묘비 줄 (통로 없음)
const GRID = ['...T...', '...T...', '...T...'].map((r) => r.split(''));
const unitOf = (species) => makeUnit({ species, side: 'ally', x: 1, y: 1, level: 50, moves: ['tackle'], id: species });

test('tombstones: ghosts pass for 1, flying and dragon for 3, others never; nobody stops on one', () => {
  const r = (sp, budget) => reachable(GRID, [], unitOf(sp), budget);
  assert.ok(!r('bidoof', 20).has('5,1'), 'ground cannot cross');
  assert.ok(r('gastly', 4).has('5,1'), 'ghost: 1 + 1 + 1 + 1');
  assert.ok(!r('gastly', 3).has('5,1'));
  assert.ok(r('starly', 6).has('5,1') && !r('starly', 5).has('5,1'), 'flying: 1 + 3 + 1 + 1');
  assert.ok(r('gible', 6).has('5,1'), 'dragon');
  for (const sp of ['gastly', 'starly', 'gible']) for (let y = 0; y < 3; y++) assert.ok(!r(sp, 20).has(`3,${y}`), `${sp} on a tombstone`);
  const g = unitOf('gastly'), path = pathTo(GRID, [], g, 5, 1, 10);
  assert.equal(pathCost(GRID, g, path), 4);
});

test('tombstones block landing (teleport, shoves) and straight-line moves', () => {
  for (const sp of ['gastly', 'starly', 'bidoof']) assert.equal(canEnter('T', unitOf(sp)), false, sp);
  const state = { grid: GRID, width: 7, height: 3, units: [] };
  const line = tilesOf(state, { x: 1, y: 1 }, { shape: { type: 'line', length: 4 } }, { dir: 'right' });
  assert.deepEqual(line, [{ x: 2, y: 1 }]);
});

// ---- 층 생성 ----
import { createBattle } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const cellsOf = (T, ch) => { const o = []; T.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) o.push({ x, y }); })); return o; };

test('graveyard floors: 2-4 vertical tombstone lines two free columns apart, a straight passage, start columns clean, everything reachable on foot', () => {
  let withLines = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const f = 1 + (seed % GY.floors), m = generateFloor(GY, f, seed), T = m.tiles, W = T[0].length;
    const tombs = cellsOf(T, 'T');
    if (!tombs.length) continue;
    withLines++;
    const cols = [...new Set(tombs.map((p) => p.x))].sort((a, b) => a - b);
    assert.ok(cols.length >= 2 && cols.length <= 4, `seed ${seed}: ${cols.length} lines`);
    for (let i = 1; i < cols.length; i++) assert.ok(cols[i] - cols[i - 1] >= 3, `seed ${seed}: lines ${cols[i - 1]},${cols[i]} too close`);
    for (const p of tombs) assert.ok(p.x >= 3, `seed ${seed}: start columns`);
    for (const x of cols) assert.ok(tombs.filter((p) => p.x === x).length >= 3, `seed ${seed}: line at ${x} too short`);
    assert.ok(T.some((row) => !row.includes('T')), `seed ${seed}: straight passage`);
    const s = createBattle(m, [newMember('bidoof', 70, createRng(1))]), u = s.units[0];
    const r = reachable(s.grid, [u], u, 999);
    for (const p of [...(m.stairs ? [m.stairs] : []), ...m.chests]) assert.ok(r.has(`${p.x},${p.y}`), `seed ${seed}: ${JSON.stringify(p)}`);
    assert.ok(W > 0);
  }
  assert.ok(withLines >= 27, `lines on ${withLines}/30`);
});

test('graveyard floors: wisp schedule — 2 tombstones (3 on the last two floors), rounds 2-5 all different, each with a free side', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const f = 1 + (seed % GY.floors), m = generateFloor(GY, f, seed);
    if (!cellsOf(m.tiles, 'T').length) { assert.deepEqual(m.wisps ?? [], []); continue; }
    assert.equal(m.wisps.length, f >= GY.floors - 1 ? 3 : 2, `seed ${seed} f${f}`);
    assert.equal(new Set(m.wisps.map((w) => w.round)).size, m.wisps.length);
    for (const w of m.wisps) {
      assert.equal(m.tiles[w.y][w.x], 'T'); assert.ok(w.round >= 2 && w.round <= 5);
      assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => '."'.includes(m.tiles[w.y + dy]?.[w.x + dx] ?? '#')), `seed ${seed}: boxed in`);
    }
  }
  assert.deepEqual(generateFloor(GY, 3, 5), generateFloor(GY, 3, 5));
  assert.equal(generateFloor(DUNGEONS[0], 1, 1).wisps, undefined);
  assert.ok(!generateFloor(DUNGEONS[0], 1, 1).tiles.join('').includes('T'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';
import { loadGame, saveGame, newGame } from '../src/core/save.js';

const DS = DUNGEONS.find((d) => d.id === 'desert');

test('desert is 7-2 next to the power plant; deep cave opens it', () => {
  const s7 = DUNGEONS.filter((d) => d.stage === 7);
  assert.deepEqual(s7.map((d) => [d.id, d.branch, d.unlock]), [['power-plant', 1, 'sewer'], ['desert', 2, 'deep-cave']]);
  assert.equal(DS.name, '사막'); assert.equal(DS.theme, 'desert');
  assert.deepEqual(DS.baseLevel, s7[0].baseLevel);
  assert.ok(DS.desert);
  assert.deepEqual(DS.weather, [{ id: 'sand', chance: 0.6 }]);
  assert.equal(DS.clusters['~'], 0); assert.equal(DS.clusters['"'], 0);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 8).unlock, ['power-plant', 'desert']);
});

test('desert: the cacnea line is always in the pool (within the stage cap), mostly ground', () => {
  for (let f = 1; f <= DS.floors; f++) {
    const pool = encounterPool(DS, f);
    assert.ok(pool.includes('cacnea'), `floor ${f}`);
    if (DS.stageCap(f) >= 1) assert.ok(pool.includes('cacturne'), `floor ${f}`);
    else assert.ok(!pool.includes('cacturne'));
  }
  assert.ok(encounterPool(DS, 1).length > 3); // 1~2층이 선인왕 계열만으로 좁아지지 않음
});

test('desert: saves on the old 7-2 placeholder move to the desert', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'trial-5']; raw.cleared = ['trial-5']; raw.best = { 'trial-5': 4 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const g = loadGame(store);
  assert.ok(g.unlocked.includes('desert') && g.cleared.includes('desert')); assert.equal(g.best.desert, 4);
});

// ---- 층 생성 ----
import { generateFloor } from '../src/core/floorgen.js';
import { reachable } from '../src/core/pathfind.js';
import { createBattle } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
test('desert floors: 2-3 flowing strips of 3-6 cells flowing along themselves, 1 pit (2 on big maps), deep sand, nothing in the start columns', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const f = 1 + (seed % DS.floors), m = generateFloor(DS, f, seed), T = m.tiles, W = T[0].length, H = T.length;
    const cells = (c) => { const o = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T[y][x] === c) o.push({ x, y }); return o; };
    const flowCells = cells('=');
    assert.equal(Object.keys(m.flows).length, flowCells.length);
    // 띠: 같은 방향 이웃끼리 묶기
    const seen = new Set(); let strips = 0;
    for (const c of flowCells) {
      const k = `${c.x},${c.y}`; if (seen.has(k)) continue;
      const dir = m.flows[k], [dx, dy] = VEC[dir];
      let s = c; while (m.flows[`${s.x - dx},${s.y - dy}`] === dir) s = { x: s.x - dx, y: s.y - dy };
      let n = 0; for (let p = s; m.flows[`${p.x},${p.y}`] === dir; p = { x: p.x + dx, y: p.y + dy }) { seen.add(`${p.x},${p.y}`); n++; }
      assert.ok(n >= 3 && n <= 6, `seed ${seed}: strip ${n}`); strips++;
    }
    assert.ok(strips >= 2 && strips <= 3, `seed ${seed}: ${strips} strips`);
    const centers = cells('@');
    assert.equal(centers.length, W * H > 220 ? 2 : 1, `seed ${seed}`);
    for (const c of centers) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) assert.equal(T[c.y + dy][c.x + dx], 'o');
    assert.ok(cells(':').length >= 4, `seed ${seed}: deep sand`);
    for (const c of [...flowCells, ...cells('o'), ...centers, ...cells(':')]) assert.ok(c.x >= 3, `seed ${seed}: start columns`);
    const occupied = [...m.allySlots, ...m.enemies, ...m.chests, ...(m.stairs ? [m.stairs] : [])];
    for (const p of occupied) assert.ok(!'=o@'.includes(T[p.y][p.x]), `seed ${seed}: ${JSON.stringify(p)} on moving sand`);
    // 지상 이동만으로 계단까지
    if (m.stairs) {
      const s = createBattle(m, [newMember('bidoof', 40, createRng(1))]);
      const u = s.units[0];
      const r = reachable(s.grid, [u], u, 999);
      assert.ok(r.has(`${m.stairs.x},${m.stairs.y}`), `seed ${seed}: stairs`);
    }
  }
});

test('desert floors: sandstorm about 60%; other dungeons get no flows', () => {
  let sand = 0;
  for (let seed = 1; seed <= 200; seed++) if (generateFloor(DS, 2, seed).weather === 'sand') sand++;
  assert.ok(sand > 100 && sand < 140, String(sand));
  assert.equal(generateFloor(DUNGEONS[0], 1, 1).flows, undefined);
});

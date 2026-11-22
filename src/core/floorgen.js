// 층 맵 생성 (순수, 시드 고정이면 같은 결과). 탁 트인 필드에 지형 덩어리를 뿌리고 연결성을 보장한다.
import { createRng } from './rng.js';
import { STATS } from './dittoBuild.js';
import { rollEnemies } from './difficulty.js';
import { rollWeather } from './weather.js';
import { encounterPool } from './encounters.js';
import { rollChestHeld } from '../data/heldItems.js';
import { SPECIES } from '../data/species.js';

import { DEFAULT_SIZE } from '../data/mapSize.js'; // 후반 던전은 넓음 (data/mapSize.js)
const WALK = '."^>'; // 땅 타입이 지나갈 수 있는 칸
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SAFE_COLS = 3; // 아군 출발 구역 (x < 3) 에는 지형을 칠하지 않는다
export const ALLY_SLOTS = 5; // 메타몽 + 동료 4

export const hashSeed = (runSeed, floor) => (runSeed ^ Math.imul(floor + 1, 0x9e3779b1)) >>> 0;
const key = (x, y) => `${x},${y}`;

// 땅 이동 기준 BFS. 반환: Map<"x,y", 거리>
function distances(tiles, start) {
  const W = tiles[0].length, H = tiles.length;
  const dist = new Map([[key(start.x, start.y), 0]]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist.has(k) || !WALK.includes(tiles[ny][nx])) continue;
      dist.set(k, dist.get(key(x, y)) + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

export const reachableFrom = (tiles, start) => new Set(distances(tiles, start).keys());

// 예전 층별 적 수 (공용 난수 소비를 그대로 지켜 지형·상자를 같게 하는 데 쓴다)
const LEGACY_COUNT = (d, f) => (d.id === 'sinnoh-cave' ? Math.min(4 + Math.ceil(f / 2), 6) : Math.min(3 + Math.ceil(f / 2), 6));

// 왼쪽 지역(안전 열 밖, x < 8)의 빈 칸 — 오른쪽 자리가 모자랄 때만. 아군에서 먼 쪽(큰 x)부터
function leftCells(dist, g, used) {
  return [...dist.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
    .filter((p) => p.x >= SAFE_COLS && p.x < 8 && '."^'.includes(g[p.y][p.x]) && !used.has(`${p.x},${p.y}`))
    .sort((a, b) => b.x - a.x || a.y - b.y);
}

// 굴린 적을 자리에 놓는다 (순수): 예약 자리 → 남은 오른쪽 칸 → 왼쪽 칸(안전 열 밖), 그래도 없으면 생략
export function placeEnemies(rolled, reserved, spareRight, spareLeft) {
  const r = [...reserved], s = [...spareRight], l = [...spareLeft];
  const out = [];
  for (const e of rolled) {
    const p = r.shift() ?? s.pop() ?? l.shift();
    if (!p) break;
    out.push({ ...e, x: p.x, y: p.y });
  }
  return out;
}

export function generateFloor(dungeon, floor, seed) {
  const rng = createRng(seed);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // 1~2. 바닥 + 지형 덩어리 (무작위 걸음). 넓은 맵은 덩어리 수를 면적비로 늘림
  const [W, H] = dungeon.size ?? DEFAULT_SIZE, area = (W * H) / (DEFAULT_SIZE[0] * DEFAULT_SIZE[1]);
  const g = Array.from({ length: H }, () => new Array(W).fill('.'));
  // 1a. 해변: 가장자리 바다 띠 (별도 난수 — 다른 던전은 결과·난수 소비 그대로)
  const sea = dungeon.sea ? seaBand(W, H, createRng(hashSeed(seed, 4000))) : null;
  if (sea) for (const [k, grade] of sea.grade) { const [x, y] = k.split(',').map(Number); g[y][x] = grade === 'a' ? ',' : '~'; }
  for (const tile of ['~', '#', '^', '"']) {
    const c = dungeon.clusters[tile];
    const n0 = Array.isArray(c) ? int(c[0], c[1]) : c, n = area === 1 ? n0 : Math.round(n0 * area);
    for (let i = 0; i < n; i++) {
      let x = int(SAFE_COLS, W - 1), y = int(0, H - 1);
      for (let s = int(4, 12); s > 0; s--) {
        if (!sea?.banned(x, y)) g[y][x] = tile; // 해변: 바다 띠와 그 옆 한 줄엔 덩어리 없음
        const [dx, dy] = pick(DIRS);
        x = Math.min(W - 1, Math.max(SAFE_COLS, x + dx));
        y = Math.min(H - 1, Math.max(0, y + dy));
      }
    }
  }
  const tiles = () => g.map((r) => r.join(''));

  // 3. 연결성 보장: 도달 못 한 칸 → 가장 가까운 도달 칸까지 막힌 칸을 뚫는다
  const anchor = { x: 1, y: Math.floor(H / 2) };
  for (;;) {
    const reach = reachableFrom(tiles(), anchor);
    let lost = null;
    for (let y = 0; y < H && !lost; y++) for (let x = 0; x < W && !lost; x++) {
      if (WALK.includes(g[y][x]) && !reach.has(key(x, y))) lost = { x, y };
    }
    if (!lost) break;
    let best = null, bd = Infinity;
    for (const k of reach) {
      const [x, y] = k.split(',').map(Number);
      const d = Math.abs(x - lost.x) + Math.abs(y - lost.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    let { x, y } = lost;
    while (x !== best.x) { x += Math.sign(best.x - x); if (!WALK.includes(g[y][x])) g[y][x] = '.'; }
    while (y !== best.y) { y += Math.sign(best.y - y); if (!WALK.includes(g[y][x])) g[y][x] = '.'; }
  }

  // 3a. 시티: 3×2 건물 (별도 난수 — 다른 던전은 결과·난수 소비 그대로). 도로가 안 끊길 때만
  if (dungeon.city) cityBlocks(g, anchor, createRng(hashSeed(seed, 5000)));

  const used = new Set();
  const take = (p) => { used.add(key(p.x, p.y)); return p; };

  // 4. 아군 출발 4칸 (왼쪽 3열)
  const left = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < SAFE_COLS; x++) left.push({ x, y });
  const allySlots = shuffle(left).slice(0, ALLY_SLOTS).map(take);

  // 5. 계단 (보스 층 제외): 출발점에서 가장 먼 바닥 칸 상위 25%
  const isBoss = floor === dungeon.floors;
  let stairs = null;
  const dist = distances(tiles(), anchor);
  if (!isBoss) {
    const far = [...dist.entries()]
      .map(([k, d]) => { const [x, y] = k.split(',').map(Number); return { x, y, d }; })
      .filter((p) => g[p.y][p.x] === '.' && !used.has(key(p.x, p.y)))
      .sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
    stairs = take(pick(far.slice(0, Math.max(1, Math.ceil(far.length * 0.25)))));
    stairs = { x: stairs.x, y: stairs.y };
    g[stairs.y][stairs.x] = '>';
  }

  // 5a. 해변 섬: 60% — 모래 2칸 + 둘레 깊은 물 10칸, 섬 위 상자 1개 확정 (기존 상자와 별개). 12칸은 used 로 막음
  const island = sea ? placeIsland(g, used, anchor, sea, seed) : null;

  // 6. 적 (오른쪽 절반)
  const right = [...dist.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
    .filter((p) => p.x >= 8 && '."^'.includes(g[p.y][p.x]) && !used.has(key(p.x, p.y)))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  shuffle(right);
  // 예전과 같은 공용 난수 소비(자리 예약 + 종 고르기) — 지형·상자가 같은 시드에서 그대로이게
  const pool = encounterPool(dungeon, floor);
  const reserved = [];
  for (let i = 0; i < LEGACY_COUNT(dungeon, floor) && right.length; i++) { reserved.push(take(right.pop())); pick(pool); }
  const enemies = [];
  if (isBoss && right.length) {
    const p = take(right.pop());
    enemies.push({ species: pick(encounterPool(dungeon, floor, { boss: true })), level: dungeon.baseLevel[floor - 1] + dungeon.boss.levelBonus, x: p.x, y: p.y, boss: true });
  }
  // 7. 보물상자 0~2개 (0: 30%, 1: 50%, 2: 20%)
  const r = rng();
  const nChests = r < 0.3 ? 0 : r < 0.8 ? 1 : 2;
  const floorCells = [...dist.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
    .filter((p) => g[p.y][p.x] === '.' && !used.has(key(p.x, p.y)))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  shuffle(floorCells);
  const chests = [];
  for (let i = 0; i < nChests && floorCells.length; i++) {
    const p = take(floorCells.pop());
    const roll = rng(); // 진화의돌 15% · 메타몽 파우더 10% · 경험 사탕 45% · 코인 주머니 30%
    // 파우더 종류는 별도 난수 — 상자 위치·수·나머지 굴림은 파우더 도입 전과 같다
    const powder = () => `powder-${STATS[Math.floor(createRng(hashSeed(seed, 1000 + i))() * STATS.length)]}`;
    chests.push({ x: p.x, y: p.y, item: roll < 0.15 ? 'evoStone' : roll < 0.25 ? powder() : roll < 0.7 ? 'candy' : 'coins' });
  }
  chests.forEach((c, i) => { const h = rollChestHeld(hashSeed(seed, 3000 + i)); if (h) c.held = h; }); // 20% 는 지니는 도구 (별도 난수 · 원래 굴림 item 은 그대로 두고 held 가 이김)

  // 8. 실제 적: 위협도 예산 굴림(별도 난수). 예약 자리 먼저, 모자라면 상자 뒤 남은 오른쪽 칸, 그래도 없으면 생략
  const spare = right.filter((p) => !used.has(key(p.x, p.y)));
  const leftSpare = leftCells(dist, g, used);
  const placed = placeEnemies(rollEnemies(dungeon, floor, seed), reserved, spare, leftSpare);
  for (const p of placed) take(p);
  enemies.unshift(...placed);
  const leftFree = leftSpare.filter((p) => !used.has(key(p.x, p.y)));
  if (isBoss && !enemies.some((e) => e.boss) && leftFree.length) { // 오른쪽이 꽉 차 보스 자리가 없었으면 왼쪽(안전 칸 밖)에
    const p = take(leftFree[0]);
    enemies.push({ species: encounterPool(dungeon, floor, { boss: true })[0], level: dungeon.baseLevel[floor - 1] + dungeon.boss.levelBonus, x: p.x, y: p.y, boss: true });
  }

  if (island) chests.push(island.chest);

  // 8a. 시티: 적 일부·상자 하나를 옥상으로, 워프 타일 (별도 난수)
  const warps = dungeon.city ? cityExtras(g, used, enemies, chests, allySlots, seed) : null;

  // 9. 낙엽더미 (던전에 piles 가 있을 때만, 별도 난수 — 다른 던전은 결과·난수 소비 그대로)
  const piles = dungeon.piles ? placePiles(dungeon, floor, seed, g, used, allySlots, anchor) : [];

  return { tiles: tiles(), allySlots, enemies, stairs, chests, piles, weather: rollWeather(dungeon, seed),
    ...(sea ? { tide: { a: sea.list('a'), b: sea.list('b') }, island: island?.info ?? null } : {}), ...(warps ? { warps } : {}) };
}

// 바다 띠: 위 또는 아래 가장자리, 열마다 깊이 D 또는 D+1 (D = H/4 반올림), 출발 3열 제외.
// 물때 등급: 해안 첫 줄 a(얕은 물) · 둘째 줄 b(깊은 물, 썰물엔 얕은 물) · 그 너머 c(늘 깊은 물)
function seaBand(W, H, rng) {
  const top = rng() < 0.5, D = Math.round((0.27 * W * H) / (W - SAFE_COLS)); // 띠만으로 맵의 약 30% (깊이 D~D+1)
  const edge = (y) => (top ? y : H - 1 - y); // 가장자리에서 몇 줄째
  const depth = [];
  let d = D;
  for (let x = 0; x < W; x++) {
    if (x < SAFE_COLS) { depth.push(0); continue; }
    if (rng() < 0.35) d = D + (rng() < 0.5 ? 1 : 0); // 해안선 흔들림: D ~ D+1, 몇 열씩 이어짐
    depth.push(d);
  }
  const grade = new Map();
  for (let y = 0; y < H; y++) for (let x = SAFE_COLS; x < W; x++) {
    const r = edge(y);
    if (r >= depth[x]) continue;
    const fromCoast = depth[x] - 1 - r;
    grade.set(key(x, y), fromCoast === 0 ? 'a' : fromCoast === 1 ? 'b' : 'c');
  }
  return {
    grade,
    banned: (x, y) => edge(y) <= D + 1 && x >= SAFE_COLS, // 띠(최대 깊이 D+1)와 그 옆 한 줄
    list: (gr) => [...grade].filter(([, v]) => v === gr).map(([k]) => { const [x, y] = k.split(',').map(Number); return { x, y }; }),
  };
}

// 섬: 6×5 직사각형 — 가운데 모래 2칸, 모래에서 두 칸까지는 늘 깊은 물. 바다 띠와 겹쳐도 됨(겹친 물은 늘 깊은 물로).
// 바다와 많이 겹치는 자리를 먼저 고름 (먼바다 섬 느낌). 놓아도 나머지 땅이 안 끊길 때만
export const ISLAND_W = 6, ISLAND_H = 5;
function placeIsland(g, used, anchor, sea, seed) {
  const W = g[0].length, H = g.length, rng = createRng(hashSeed(seed, 4050));
  if (rng() >= 0.6) return null;
  const isLand = (x0, y0, x, y) => y === y0 + 2 && (x === x0 + 2 || x === x0 + 3);
  const spots = [];
  for (let y0 = 0; y0 + ISLAND_H <= H; y0++) for (let x0 = 6; x0 + ISLAND_W <= W; x0++) {
    let ok = true, wet = 0;
    for (let y = y0; y < y0 + ISLAND_H && ok; y++) for (let x = x0; x < x0 + ISLAND_W && ok; x++) {
      if (sea.grade.has(key(x, y))) wet++;
      else ok = '."^'.includes(g[y][x]) && !used.has(key(x, y));
    }
    if (ok) spots.push({ x0, y0, wet: wet + rng() * 4 });
  }
  spots.sort((a, b) => b.wet - a.wet);
  const reach0 = reachableFrom(g.map((r) => r.join('')), anchor);
  for (const { x0, y0 } of spots.slice(0, 12)) {
    const saved = g.map((r) => r.slice());
    let drop = 0, added = 0;
    for (let y = y0; y < y0 + ISLAND_H; y++) for (let x = x0; x < x0 + ISLAND_W; x++) {
      if (reach0.has(key(x, y))) drop++;
      if (!sea.grade.has(key(x, y)) && !isLand(x0, y0, x, y)) added++;
      g[y][x] = isLand(x0, y0, x, y) ? '.' : '~';
    }
    if (reachableFrom(g.map((r) => r.join('')), anchor).size !== reach0.size - drop) { for (let y = 0; y < H; y++) g[y] = saved[y]; continue; }
    const land = [];
    for (let y = y0; y < y0 + ISLAND_H; y++) for (let x = x0; x < x0 + ISLAND_W; x++) {
      used.add(key(x, y));
      if (isLand(x0, y0, x, y)) { sea.grade.delete(key(x, y)); land.push({ x, y }); } else sea.grade.set(key(x, y), 'c'); // 섬 둘레는 늘 깊은 물
    }
    const c = land[rng() < 0.5 ? 0 : 1];
    const roll = createRng(hashSeed(seed, 4100))(); // 기존 상자 확률표
    const chest = { x: c.x, y: c.y, item: roll < 0.15 ? 'evoStone' : roll < 0.25 ? `powder-${STATS[Math.floor(createRng(hashSeed(seed, 4150))() * STATS.length)]}` : roll < 0.7 ? 'candy' : 'coins', island: true };
    const h = rollChestHeld(hashSeed(seed, 4200)); if (h) chest.held = h;
    return { chest, info: { x0, y0, w: ISLAND_W, h: ISLAND_H, land, added } };
  }
  return null;
}

// 낙엽더미: 바닥 칸(출발 3열 밖, 출발 칸과 안 붙음)에 '*'. 놓아도 나머지 칸이 모두 이어질 때만. 포켓몬 60% · 상자 40%
function placePiles(dungeon, floor, seed, g, used, allySlots, anchor) {
  const W = g[0].length, H = g.length;
  const rng = createRng(hashSeed(seed, 2000));
  const [lo, hi] = dungeon.piles, want = lo + Math.floor(rng() * (hi - lo + 1));
  const nearAlly = (x, y) => allySlots.some((a) => Math.abs(a.x - x) + Math.abs(a.y - y) <= 1);
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = SAFE_COLS; x < W; x++) if (g[y][x] === '.' && !used.has(key(x, y)) && !nearAlly(x, y) && !DIRS.some(([dx, dy]) => g[y + dy]?.[x + dx] === 'B')) cells.push({ x, y }); // 시티: 건물 바로 옆엔 안 놓음 (옥상에서 내려올 길을 막지 않게)
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const pool = dungeon.pileSpecies ?? encounterPool(dungeon, floor), out = []; // 해변: 바닷가 종만
  let size = reachableFrom(g.map((r) => r.join('')), anchor).size;
  for (const p of cells) {
    if (out.length >= want) break;
    g[p.y][p.x] = '*';
    const now = reachableFrom(g.map((r) => r.join('')), anchor).size;
    if (now !== size - 1) { g[p.y][p.x] = '.'; continue; } // 길을 끊으면 건너뜀
    size = now; used.add(key(p.x, p.y));
    if (rng() < 0.6) out.push({ x: p.x, y: p.y, kind: 'mon', species: pool[Math.floor(rng() * pool.length)], level: dungeon.baseLevel[floor - 1] });
    else {
      const roll = rng(); // 기존 상자 확률표: 진화의돌 15% · 파우더 10% · 사탕 45% · 코인 30%
      const powder = `powder-${STATS[Math.floor(rng() * STATS.length)]}`;
      const h = rollChestHeld(hashSeed(seed, 3100 + out.length));
      out.push({ x: p.x, y: p.y, kind: 'chest', item: h ? `held-${h}` : roll < 0.15 ? 'evoStone' : roll < 0.25 ? powder : roll < 0.7 ? 'candy' : 'coins' });
    }
  }
  return out;
}

// 시티 건물: 3×2, 둘레 한 칸엔 다른 건물 없음(골목), 출발 3열 + 한 칸 밖. 바닥 '.' 위에만, 놓아도 도로가 안 끊길 때만. 면적 약 30% 목표
export const BLOCK_W = 3, BLOCK_H = 2;
function cityBlocks(g, anchor, rng) {
  const W = g[0].length, H = g.length, want = Math.round((W * H * 0.3) / (BLOCK_W * BLOCK_H));
  let size = reachableFrom(g.map((r) => r.join('')), anchor).size, placed = 0;
  for (let tries = 0; tries < 400 && placed < want; tries++) {
    const x0 = SAFE_COLS + 1 + Math.floor(rng() * (W - BLOCK_W - SAFE_COLS)), y0 = Math.floor(rng() * (H - BLOCK_H + 1));
    let ok = x0 + BLOCK_W <= W;
    for (let y = y0 - 1; y <= y0 + BLOCK_H && ok; y++) for (let x = x0 - 1; x <= x0 + BLOCK_W && ok; x++) {
      const inside = x >= x0 && x < x0 + BLOCK_W && y >= y0 && y < y0 + BLOCK_H;
      if (inside) ok = g[y][x] === '.';
      else if (g[y]?.[x] === 'B') ok = false;
    }
    if (!ok) continue;
    for (let y = y0; y < y0 + BLOCK_H; y++) for (let x = x0; x < x0 + BLOCK_W; x++) g[y][x] = 'B';
    const now = reachableFrom(g.map((r) => r.join('')), anchor).size;
    if (now !== size - BLOCK_W * BLOCK_H) { for (let y = y0; y < y0 + BLOCK_H; y++) for (let x = x0; x < x0 + BLOCK_W; x++) g[y][x] = '.'; continue; }
    size = now; placed++;
  }
}

// 옥상 배치(일반 적 약 25% — 비행·에스퍼 먼저, 상자 하나 50%) + 워프 70%: 파랑·주황 × 2쌍, 파랑 첫 쌍은 도로↔옥상
const WARP_COLORS = ['blue', 'orange'];
function cityExtras(g, used, enemies, chests, allySlots, seed) {
  const W = g[0].length, H = g.length, rng = createRng(hashSeed(seed, 5100));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const roofs = [], roads = [];
  const nearAlly = (x, y) => allySlots.some((a) => Math.abs(a.x - x) + Math.abs(a.y - y) <= 1);
  for (let y = 0; y < H; y++) for (let x = SAFE_COLS; x < W; x++) {
    if (used.has(key(x, y))) continue;
    if (g[y][x] === 'B') roofs.push({ x, y }); else if (g[y][x] === '.' && !nearAlly(x, y)) roads.push({ x, y });
  }
  shuffle(roofs); shuffle(roads);
  const roofFoes = roofs.filter((p) => p.x >= 8);
  const up = (thing) => { const p = roofFoes.pop(); if (!p) return; roofs.splice(roofs.indexOf(p), 1); used.delete(key(thing.x, thing.y)); thing.x = p.x; thing.y = p.y; used.add(key(p.x, p.y)); };
  const flier = (e) => SPECIES[e.species]?.types.some((t) => t === 'flying' || t === 'psychic') ? 0 : 1;
  const movable = enemies.filter((e) => !e.boss).map((e) => ({ e, r: flier(e) + rng() })).sort((a, b) => a.r - b.r).map((o) => o.e);
  for (const e of movable.slice(0, Math.round(movable.length * 0.25))) up(e);
  const chest = chests.find((c) => !c.island);
  if (chest && rng() < 0.5) up(chest);
  const warps = [];
  if (rng() >= 0.7) return warps;
  for (const color of WARP_COLORS) for (let k = 0; k < 2; k++) {
    const link = (color === 'blue' && k === 0) || rng() < 0.5;
    const a = roads.pop(), b = (link ? roofs.pop() : null) ?? roads.pop();
    if (!a || !b) break;
    for (const p of [a, b]) used.add(key(p.x, p.y));
    warps.push({ x: a.x, y: a.y, color, to: { x: b.x, y: b.y } }, { x: b.x, y: b.y, color, to: { x: a.x, y: a.y } });
  }
  return warps;
}

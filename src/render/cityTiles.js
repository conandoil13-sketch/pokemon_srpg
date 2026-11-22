// ???시티 지형 그림 (픽셀 단위로 직접 찍음). 바닥 한 장(아스팔트·보도블록·연석·잔디 공원·건물·계단·그림자)은 맵마다 굽고,
// 위로 솟는 나무·쓰레기통과 깜빡이는 워프 판은 매 프레임. 스펙 docs/superpowers/specs/2026-11-22-city-design.md
const TILE = 24;
export const hashXY = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ 83492791) >>> 0;
export const h2 = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
const OUT = '#26242e';

// ---- 픽셀 버퍼 ----
const rgbCache = new Map();
const rgb = (hex) => { if (!rgbCache.has(hex)) rgbCache.set(hex, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))); return rgbCache.get(hex); };
export function buffer(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  return {
    w, h, d,
    set(x, y, hex) { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4, c = rgb(hex); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; },
    mix(x, y, hex, a) { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4, c = rgb(hex); for (let i = 0; i < 3; i++) d[o + i] = d[o + i] * (1 - a) + c[i] * a; d[o + 3] = Math.max(d[o + 3], 255 * a); },
    rect(x, y, rw, rh, hex) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) this.set(x + i, y + j, hex); },
    has(x, y) { return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0; },
    canvas() { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(d, w, h), 0, 0); return c; },
  };
}
// 모양 바깥 1px 외곽선 (스프라이트용)
export function outline(b, hex = OUT) {
  const add = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (!b.has(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => b.has(x + dx, y + dy))) add.push([x, y]);
  for (const [x, y] of add) b.set(x, y, hex);
}

// ---- 바닥 칸 종류 ----
const isB = (g, x, y) => g[y]?.[x] === 'B';
const PARK = '"#';
const open = (g, x, y) => { // 아스팔트 후보: 3×3 안에 건물·공원이 없음
  if (g[y]?.[x] === undefined) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = g[y + dy]?.[x + dx]; if (c === 'B' || (c !== undefined && PARK.includes(c))) return false; }
  return true;
};
const kindMemo = new WeakMap();
// 아스팔트 = 열린 칸끼리 이어진 덩어리 중 6칸 이상 (작은 조각은 보도로)
function roadCells(g) {
  const out = new Set(), seen = new Set();
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if (seen.has(`${x},${y}`) || !open(g, x, y)) continue;
    const blob = [], q = [[x, y]]; seen.add(`${x},${y}`);
    while (q.length) { const [cx, cy] = q.pop(); blob.push(`${cx},${cy}`); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${cx + dx},${cy + dy}`; if (!seen.has(k) && open(g, cx + dx, cy + dy)) { seen.add(k); q.push([cx + dx, cy + dy]); } } }
    if (blob.length >= 6) for (const k of blob) out.add(k);
  }
  return out;
}
function kindAt(g, x, y) {
  const c = g[y]?.[x];
  if (c === undefined) return 'edge';
  if (c === 'B') return 'B';
  if (PARK.includes(c)) return 'lawn';
  if (!kindMemo.has(g)) kindMemo.set(g, roadCells(g));
  return kindMemo.get(g).has(`${x},${y}`) ? 'road' : 'pave';
}

const ASPH = { base: '#676b74', d1: '#5d6169', d2: '#54575f', l1: '#71757e', l2: '#7d818a', line: '#e8e2c8', lineD: '#c4bea4' };
const PAVE = { a: '#dcd3be', b: '#d2c8b0', hi: '#ece6d6', lo: '#b9ae96', grout: '#a59a83', acc: '#c7b89a' };
const CURB = { top: '#efebdf', face: '#b3ae9f', low: '#8a8578', sh: '#484b53' };
const LAWN = { a: '#7cc65a', b: '#70ba50', hi: '#9bdc74', lo: '#5ea444', blade: '#4f9038', stone: '#c8c0ac', stoneD: '#968e7c' };

function asphalt(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, r = h2(wx, wy) % 64, blot = (h2(wx >> 3, wy >> 3, 7) % 5 === 0); // 큰 얼룩 + 자갈
    b.set(wx, wy, r < 5 ? ASPH.d2 : r < 14 ? ASPH.d1 : r > 61 ? ASPH.l2 : r > 55 ? ASPH.l1 : blot ? ASPH.d1 : ASPH.base);
  }
  // 차선: 위아래가 도로가 아닌 가로 도로 / 좌우가 도로가 아닌 세로 도로 한가운데 점선
  const road = (x, y) => kindAt(g, x, y) === 'road';
  const horiz = road(tx - 1, ty) && road(tx + 1, ty) && road(tx, ty - 1) && road(tx, ty + 1) && (ty % 3 === 1);
  if (horiz && !road(tx, ty - 2) === false) for (let x = 2; x < 12; x++) { b.set(px + x, py + 11, ASPH.line); b.set(px + x, py + 12, ASPH.lineD); }
  // 연석: 보도·잔디와 맞닿은 변
  const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of sides) {
    const k = kindAt(g, tx + dx, ty + dy);
    if (k !== 'pave' && k !== 'lawn') continue;
    for (let i = 0; i < TILE; i++) {
      const [x0, y0, x1, y1, x2, y2] = dy === -1 ? [i, 0, i, 1, i, 2] : dy === 1 ? [i, 23, i, 22, i, 21] : dx === -1 ? [0, i, 1, i, 2, i] : [23, i, 22, i, 21, i];
      b.set(px + x0, py + y0, dy === 1 ? CURB.face : CURB.top); b.set(px + x1, py + y1, dy === 1 ? CURB.top : CURB.face); b.mix(px + x2, py + y2, CURB.sh, 0.45);
    }
  }
}

function pavers(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, lx = wx & 7, ly = wy & 7, cell = h2(wx >> 3, wy >> 3, 3);
    const accent = ((wx >> 3) + (wy >> 3)) % 6 === 0;
    let c = accent ? PAVE.acc : cell % 3 === 0 ? PAVE.b : PAVE.a;
    if (lx === 0 || ly === 0) c = PAVE.grout;
    else if (lx === 1 || ly === 1) c = PAVE.hi;
    else if (lx === 7 || ly === 7) c = PAVE.lo;
    else if (h2(wx, wy, 9) % 41 === 0) c = PAVE.lo; // 잔 얼룩
    b.set(wx, wy, c);
  }
}

function lawn(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, r = h2(wx, wy, 5) % 32, band = ((wx + (wy >> 1)) >> 2) & 1;
    b.set(wx, wy, r === 0 ? LAWN.hi : r < 3 ? LAWN.lo : band ? LAWN.a : LAWN.b);
  }
  for (let i = 0; i < 9; i++) { const h = h2(tx, ty, 20 + i), x = px + 2 + (h % 19), y = py + 3 + ((h >>> 8) % 18); b.set(x, y, LAWN.blade); b.set(x + 1, y - 1, LAWN.blade); b.set(x + 2, y, LAWN.blade); b.set(x + 1, y - 2, LAWN.hi); } // 풀잎
  // 공원 테두리 돌: 공원이 아닌 쪽 변
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (kindAt(g, tx + dx, ty + dy) === 'lawn' || kindAt(g, tx + dx, ty + dy) === 'edge') continue;
    for (let i = 0; i < TILE; i++) {
      const [x0, y0, x1, y1] = dy === -1 ? [i, 0, i, 1] : dy === 1 ? [i, 23, i, 22] : dx === -1 ? [0, i, 1, i] : [23, i, 22, i];
      const joint = (i + tx * 5 + ty * 3) % 6 === 0;
      b.set(px + x0, py + y0, joint ? LAWN.stoneD : LAWN.stone); b.set(px + x1, py + y1, LAWN.stoneD);
    }
  }
}

// 꽃 덤불 (수풀 칸): 잔디 위 둥근 덤불 두세 개 + 꽃
const BUSH = { o: '#24502a', d: '#3a7a34', m: '#4f9a40', l: '#74bc58', hi: '#a4dc80' };
const PETALS = [['#f8f0f8', '#f8a0c0'], ['#f8e060', '#f8a030'], ['#f87888', '#c83850']];
function flowerBush(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE, v = hashXY(tx, ty);
  const blobs = [[6.5, 10, 5.2], [16.5, 9, 5.6], [11.5, 17, 6]].map(([x, y, r], i) => [x + ((v >>> (i * 3)) % 3) - 1, y + ((v >>> (i * 3 + 1)) % 2), r]);
  const inside = (x, y) => blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 * 1.2 <= r * r);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (inside(x + 0.5, y + 0.5)) {
      const top = !inside(x + 0.5, y - 1.5), low = !inside(x + 0.5, y + 2.5) || !inside(x + 2.5, y + 0.5);
      const dith = (x + y) & 1;
      b.set(px + x, py + y, top ? BUSH.hi : low ? BUSH.d : dith && h2(x, y, v) % 3 === 0 ? BUSH.l : BUSH.m);
    } else if (inside(x + 0.5, y - 0.5) || inside(x + 1.5, y + 0.5) || inside(x - 0.5, y + 0.5) || inside(x + 0.5, y + 1.5)) b.set(px + x, py + y, BUSH.o);
  }
  const [pc, pd] = PETALS[v % 3];
  for (let i = 0; i < 7; i++) { const h = h2(tx, ty, 40 + i), x = 4 + (h % 16), y = 6 + ((h >>> 6) % 14); if (!inside(x + 0.5, y + 0.5)) continue; b.set(px + x, py + y, pc); b.set(px + x + 1, py + y, pd); b.set(px + x, py + y + 1, pd); }
}

// 계단 (보도 위): 난간 있는 내려가는 계단
function stairs(b, tx, ty) {
  const px = tx * TILE + 3, py = tx * 0 + ty * TILE + 2;
  b.rect(px - 1, py - 1, 20, 22, OUT);
  b.rect(px, py, 18, 20, '#3a3844');
  const steps = ['#e6e0d2', '#c8c0b0', '#a69e8e', '#847c6e', '#625c52'];
  for (let s = 0; s < 5; s++) { b.rect(px + 2, py + 1 + s * 4, 14, 3, steps[s]); b.rect(px + 2, py + 1 + s * 4, 14, 1, s === 0 ? '#f6f2e8' : steps[s - 1]); }
  b.rect(px, py, 2, 20, '#8a8c98'); b.rect(px + 16, py, 2, 20, '#6a6c78'); // 난간
  b.rect(px, py, 1, 20, '#b8bac4');
  b.rect(px - 1, py + 20, 20, 1, '#f0c040'); // 노란 경고 띠
}

// ---- 건물 (3×2 = 72×48px) ----
const SCHEMES = [ // 지붕 · 지붕 밝게 · 지붕 어둡게 · 난간 · 벽 · 벽 어둡게 · 차양
  { roof: '#9c6e58', roofL: '#b88a70', roofD: '#7a5444', rim: '#d8c8b0', wall: '#ece2cc', wallD: '#c6b89c', awn: ['#d84848', '#f8f0e8'] },
  { roof: '#5e7898', roofL: '#7896b4', roofD: '#465a74', rim: '#d0d4dc', wall: '#e4e8ec', wallD: '#b8c0c8', awn: ['#3878d0', '#f0f4f8'] },
  { roof: '#6e8a5c', roofL: '#8aa874', roofD: '#546a46', rim: '#d8d4c0', wall: '#efe8d4', wallD: '#c8bea0', awn: ['#48a050', '#f8f4e0'] },
  { roof: '#8a6688', roofL: '#a682a4', roofD: '#6a4c68', rim: '#dcd0d8', wall: '#f0e6ea', wallD: '#c8b8c0', awn: ['#c858a0', '#f8eef4'] },
  { roof: '#8c8478', roofL: '#a89e90', roofD: '#6c665c', rim: '#e0dcd2', wall: '#e8e0d0', wallD: '#c0b6a4', awn: ['#e09030', '#f8f0dc'] },
];
const GLASS = { f: '#3c4458', a: '#7ab4e0', b: '#a8d4f4', c: '#d8f0ff', lit: '#f8e08c', litD: '#e0b860' };
function windowAt(b, x, y, w, h, lit) {
  b.rect(x - 1, y - 1, w + 2, h + 2, GLASS.f);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(x + i, y + j, lit ? (j < h / 2 ? GLASS.lit : GLASS.litD) : j === 0 ? GLASS.c : i + j < 3 ? GLASS.c : j < h / 2 ? GLASS.b : GLASS.a);
  if (!lit) b.set(x + w - 2, y + 1, '#ffffff');
  b.rect(x - 1, y + h + 1, w + 2, 1, '#ffffff'); // 창틀 아래 빛
}
function building(b, x0, y0) {
  const S = SCHEMES[hashXY(x0 * 3, y0 * 7) % SCHEMES.length], shop = hashXY(x0, y0 * 5) % 3 === 0, px = x0 * TILE, py = y0 * TILE, W = 72, H = 48, ROOF = 35; // 지붕(옥상)이 아래 칸 대부분까지 — 옥상에 선 포켓몬·워프가 벽에 걸리지 않게
  for (let j = 0; j < H; j++) for (let i = 0; i < 4; i++) b.mix(px + W + i, py + 4 + j, '#1c1c28', 0.32 - i * 0.06); // 그림자 (오른쪽)
  for (let i = 0; i < W; i++) for (let j = 0; j < 4; j++) b.mix(px + 3 + i, py + H + j, '#1c1c28', 0.32 - j * 0.07); // 그림자 (아래)
  b.rect(px, py, W, H, OUT);
  // 지붕 + 난간
  b.rect(px + 1, py + 1, W - 2, ROOF - 1, S.rim);
  b.rect(px + 1, py + 1, W - 2, 1, '#ffffff');
  b.rect(px + 3, py + 3, W - 6, ROOF - 5, S.roof);
  for (let y = py + 3; y < py + ROOF - 2; y++) for (let x = px + 3; x < px + W - 3; x++) {
    const lx = x - px - 3, ly = y - py - 3;
    if (ly === 0 || lx === 0) b.set(x, y, S.roofD); // 난간 안쪽 그늘
    else if (ly % 6 === 5) b.set(x, y, S.roofD); // 옥상 바닥 줄
    else if (ly % 6 === 0 && lx % 12 !== 6) b.set(x, y, S.roofL);
    else if (lx % 12 === 6 && ly % 6 < 5) b.set(x, y, S.roofD);
  }
  b.rect(px + 2, py + ROOF - 2, W - 4, 1, S.roofD);
  const r = hashXY(x0 * 7, y0 * 11);
  // 옥상 장식: 실외기 / 물탱크 / 채광창 (겹치지 않게 왼쪽·오른쪽)
  const unit = (ux, uy) => { b.rect(ux - 1, uy - 1, 12, 9, OUT); b.rect(ux, uy, 10, 7, '#c8ccd4'); b.rect(ux, uy, 10, 1, '#eef0f4'); b.rect(ux, uy + 6, 10, 1, '#8a909c'); for (let k = 0; k < 4; k++) { b.set(ux + 5 + (k % 2) * 2, uy + 2 + (k >> 1) * 2, '#5a606c'); } b.rect(ux + 1, uy + 2, 3, 3, '#7a808c'); b.mix(ux + 11, uy + 1, '#000000', 0.25); b.rect(ux, uy + 8, 11, 1, S.roofD); };
  const tank = (ux, uy) => { for (let j = -1; j <= 9; j++) for (let i = -1; i <= 9; i++) { const d = Math.hypot(i - 4, (j - 4) * 1.1); if (d <= 4.6) b.set(ux + i, uy + j, j < 3 ? '#9cc4e8' : i > 5 ? '#3c6c9c' : '#5a8cc0'); else if (d <= 5.6) b.set(ux + i, uy + j, OUT); } b.set(ux + 2, uy + 1, '#e0f0ff'); b.rect(ux + 1, uy + 10, 8, 1, S.roofD); };
  const sky = (ux, uy) => { b.rect(ux - 1, uy - 1, 16, 8, OUT); for (let j = 0; j < 6; j++) for (let i = 0; i < 14; i++) b.set(ux + i, uy + j, (i + j) % 5 === 0 ? GLASS.c : j < 2 ? GLASS.b : GLASS.a); b.rect(ux + 7, uy, 1, 6, GLASS.f); };
  const deco = [unit, tank, sky];
  const d1 = r % 3, d2 = (r >>> 2) % 3 === d1 ? (d1 + 1) % 3 : (r >>> 2) % 3;
  deco[d1](px + 8 + (r >>> 4) % 6, py + 8);
  deco[d2](px + 44 + (r >>> 7) % 8, py + 12);
  // 앞면 벽
  const fy = py + ROOF;
  b.rect(px + 1, fy, W - 2, H - ROOF - 1, S.wall);
  b.rect(px + 1, fy, W - 2, 2, S.wallD); // 처마 그늘
  b.rect(px + 1, fy - 1, W - 2, 1, OUT);
  for (let j = 2; j < H - ROOF - 1; j++) b.set(px + W - 2, fy + j, S.wallD);
  if (shop) {
    // 가게: 줄무늬 차양 + 진열창 + 가운데 유리문
    for (let i = 1; i < W - 1; i++) for (let j = 2; j < 5; j++) b.set(px + i, fy + j, j === 4 ? (i % 6 < 3 ? S.awn[0] : S.wallD) : (Math.floor((i - 1) / 6) % 2 ? S.awn[1] : S.awn[0]));
    for (let i = 1; i < W - 1; i += 6) b.set(px + i + 1, fy + 5, OUT);
    windowAt(b, px + 6, fy + 7, 19, 3, false); windowAt(b, px + 47, fy + 7, 19, 3, false);
    b.rect(px + 30, fy + 5, 12, 7, OUT); b.rect(px + 31, fy + 6, 10, 6, GLASS.a); b.rect(px + 31, fy + 6, 10, 1, GLASS.c); b.rect(px + 35, fy + 6, 1, 6, GLASS.f); b.set(px + 33, fy + 9, '#f0d060'); b.set(px + 38, fy + 9, '#f0d060');
  } else {
    // 사무실: 창문 한 줄 + 가운데 나무문
    for (let k = 0; k < 6; k++) { if (k === 2 || k === 3) continue; windowAt(b, px + 5 + k * 11, fy + 4, 7, 4, (r >>> k) % 4 === 0); }
    b.rect(px + 30, fy + 4, 12, 8, OUT); b.rect(px + 31, fy + 5, 10, 7, '#6c4c3a'); b.rect(px + 31, fy + 5, 10, 1, '#8c6a52'); b.rect(px + 35, fy + 5, 1, 7, '#3c2c22'); b.set(px + 34, fy + 8, '#f0d060'); b.set(px + 37, fy + 8, '#f0d060');
    b.rect(px + 28, fy + 3, 16, 1, S.wallD); // 문 위 차양
  }
  b.rect(px + 1, py + H - 2, W - 2, 1, S.wallD);
}

export function bakeCityGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = kindAt(grid, x, y);
    if (k === 'road') asphalt(b, grid, x, y);
    else if (k === 'lawn') lawn(b, grid, x, y);
    else pavers(b, x, y); // 보도·건물 밑
    if (grid[y][x] === '"') flowerBush(b, x, y);
    if (grid[y][x] === '>') stairs(b, x, y);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isB(grid, x, y) && !isB(grid, x - 1, y) && !isB(grid, x, y - 1)) building(b, x, y);
  return b.canvas();
}

// ---- 위로 솟는 것 (스프라이트, 칸 아래쪽에 맞춤) ----
const TREE = { o: '#1e4626', d: '#2e6a34', m: '#3f8a3e', l: '#5eac4c', hi: '#90d070', trunk: '#7a5232', trunkD: '#4e3420' };
const sprites = new Map();
function treeSprite(v) {
  const k = `tree${v}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(26, 36), cx = 13, cy = 13 + (v === 2 ? 1 : 0), R = v === 1 ? 11.5 : 11;
  for (let y = 26; y < 31; y++) for (let x = 4; x < 22; x++) if (((x - 13) / 9) ** 2 + ((y - 28.5) / 2.6) ** 2 <= 1) b.mix(x, y, '#102010', 0.3); // 땅 그림자
  for (let y = 18; y < 30; y++) for (let x = 11; x < 15; x++) b.set(x, y, x === 11 ? '#9a6c44' : x === 14 ? TREE.trunkD : TREE.trunk);
  const clumps = [[13, 8, 6.5], [7.5, 12, 6], [18.5, 12, 6], [10, 17, 6], [16, 17, 6], [13, 13, 6.5]];
  const inC = (x, y) => clumps.some(([qx, qy, r]) => (x - qx) ** 2 + (y - qy) ** 2 <= r * r);
  for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
    if (!inC(x + 0.5, y + 0.5) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > R + 2.5) continue;
    const light = (cx - x) * 0.55 + (cy - y) * 0.8, edgeB = !inC(x + 2.5, y + 2.5), edgeT = !inC(x - 0.5, y - 1.5);
    const dith = (x + y + v) & 1;
    let c = light > 6 ? TREE.hi : light > 2 ? TREE.l : light > -3 ? TREE.m : TREE.d;
    if (edgeB) c = TREE.d; else if (edgeT && light > -2) c = TREE.hi;
    if (!edgeB && !edgeT && dith && h2(x, y, v) % 4 === 0) c = c === TREE.m ? TREE.l : c === TREE.l ? TREE.m : c; // 잎 무늬
    b.set(x, y, c);
  }
  outline(b, TREE.o);
  const c = b.canvas(); sprites.set(k, c); return c;
}
function canSprite() {
  if (sprites.has('can')) return sprites.get('can');
  const b = buffer(16, 22);
  for (let x = 2; x < 15; x++) for (let y = 18; y < 21; y++) if (((x - 8.5) / 6.5) ** 2 + ((y - 19.5) / 1.6) ** 2 <= 1) b.mix(x, y, '#101018', 0.3);
  for (let y = 6; y < 19; y++) for (let x = 3; x < 13; x++) b.set(x, y, x < 5 ? '#7ab88a' : x > 10 ? '#2c5a3c' : (x === 7 || y === 11 || y === 15) ? '#3a6e4a' : '#4c8a5c');
  for (let y = 2; y < 7; y++) for (let x = 2; x < 14; x++) { const e = ((x - 7.5) / 6) ** 2 + ((y - 4.5) / 2.6) ** 2; if (e <= 1) b.set(x, y, e < 0.35 ? '#a8d8b4' : y > 4 ? '#3a6e4a' : '#6aa87a'); }
  b.set(7, 3, '#e8f8ec'); b.set(8, 3, '#e8f8ec');
  outline(b, '#1a2e22');
  const c = b.canvas(); sprites.set('can', c); return c;
}

// 워프 판: 금속 테두리 원판 + 색 빛 고리가 안쪽으로 모였다 퍼짐 (6 프레임)
const WARP_RAMP = { blue: ['#14285a', '#1e48a8', '#3478e8', '#68b0ff', '#b4e0ff', '#ffffff'], orange: ['#4a1c0c', '#a43c10', '#e06a18', '#ffa040', '#ffd8a0', '#ffffff'] };
function warpFrame(color, f) {
  const k = `warp${color}${f}`;
  if (sprites.has(k)) return sprites.get(k);
  const ramp = WARP_RAMP[color] ?? WARP_RAMP.blue, b = buffer(24, 24), c = 11.5;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const dx = x - c, dy = (y - c) * 1.12, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d > 11) continue;
    if (d > 10) { b.set(x, y, OUT); continue; }
    if (d > 7.6) { const lit = Math.cos(a + 2.3); b.set(x, y, lit > 0.55 ? '#f4f6fa' : lit > 0 ? '#c4cad4' : lit > -0.6 ? '#9aa2b0' : '#6c7484'); continue; } // 금속 테
    if (d > 6.8) { b.set(x, y, '#1c2030'); continue; }
    const ring = Math.abs(d - (6 - f)) < 0.9 ? 2 : 0, pulse = (f % 3 === 0 ? 1 : 0);
    const i = Math.max(0, Math.min(5, Math.round(1 + (6.8 - d) * 0.42 + ring + pulse + ((x + y + f) & 1 ? 0.3 : -0.3))));
    b.set(x, y, ramp[i]);
  }
  for (const [bx, by] of [[4, 4], [19, 4], [4, 19], [19, 19]]) if (Math.hypot(bx - c, (by - c) * 1.12) < 10.6) b.set(bx, by, '#5a6070'); // 나사
  for (const [bx, by] of [[6, 6], [17, 6], [6, 17], [17, 17]]) b.set(bx, by, '#5a6070');
  b.rect(11, 11, 2, 2, '#ffffff');
  const canvas = b.canvas(); sprites.set(k, canvas); return canvas;
}

// 보이는 범위만 (호출 측에서 translate 한 상태). warps = state.warps
export function drawCityMap(ctx, grid, ground, camX, camY, viewW, viewH, warps = [], time = 0) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  const f = Math.floor(time * 8) % 6;
  for (const w of warps) if (w.x >= x0 && w.x <= x1 && w.y >= y0 && w.y <= y1) {
    const lift = grid[w.y][w.x] === 'B' && grid[w.y - 1]?.[w.x] === 'B' ? -5 : 0; // 건물 아래 줄 옥상 판은 조금 올려 앞 벽에 안 걸리게
    ctx.drawImage(warpFrame(w.color, (f + w.x + w.y) % 6), w.x * TILE, w.y * TILE + lift);
    if ((f + w.x * 3) % 6 < 3) { ctx.fillStyle = WARP_RAMP[w.color]?.[4] ?? '#fff'; ctx.fillRect(w.x * TILE + 8 + ((f * 5 + w.y) % 8), w.y * TILE + 6 - f + lift, 1, 2); } // 떠오르는 빛 알갱이
  }
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = x0; x <= x1; x++) { // 아래 한 줄 더 (나무가 위로 솟음)
    const ch = grid[y][x];
    if (ch === '#') ctx.drawImage(treeSprite(hashXY(x, y) % 3), x * TILE - 1, y * TILE - 8);
    else if (ch === '*') ctx.drawImage(canSprite(), x * TILE + 4, y * TILE + 2);
  }
}

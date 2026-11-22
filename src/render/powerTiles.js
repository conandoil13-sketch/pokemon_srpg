// 발전소 지형 그림 (픽셀 단위로 직접 찍음). 바닥 한 장(철판·리벳·기름 얼룩·경고 줄무늬·기계 벽·그림자)은 맵마다 굽고,
// 발전기(코일·계기판·예고 깜빡임·방출 번개)·낮은 가벽·고철더미·방출 예고 칸은 매 프레임. 스펙 docs/superpowers/specs/2026-11-23-power-plant-design.md
import { buffer, outline, h2, hashXY } from './cityTiles.js';

const TILE = 24;
const PLATE = { a: '#5f656d', b: '#585e66', hi: '#7d858f', lo: '#454a51', seam: '#2e3237', rivet: '#a3acb6', rivetLo: '#33373c', oil: '#34373a', oilHi: '#5a5248', scratch: '#848c96' };
const HAZ = { y: '#e6b422', yd: '#b0840e', k: '#24252b' };
const MACH = { top: '#3a3f47', topD: '#32363d', topL: '#4b515a', topHi: '#646c77', edge: '#1d2025', face: '#2b3037', faceL: '#363c44', faceD: '#22262c', vent: '#14161a', ventHi: '#4a515a' };
const PIPE = { d: '#245150', m: '#3a7472', l: '#58a09a', hi: '#9ad4cc', band: '#1c2024', bandHi: '#5a616b' };
const GEN = { o: '#121820', d: '#26313e', m: '#36475a', l: '#4c6078', hi: '#7890ac', plate: '#5a6c82', copperD: '#6e3612', copper: '#b0622a', copperL: '#de8a40', copperHi: '#f8c080', ins: '#d6cfbe', insD: '#9a9284', lampOff: '#5c5434', lampOn: '#ffe85a', glow: '#fff3a0', arc: '#d4ecff', meter: '#d8dcc4', needle: '#c02818' };
const SCRAP = { o: '#16181c', rust: '#7a3e20', rustL: '#a8582c', iron: '#5c6168', ironL: '#8a919a', ironHi: '#c0c6cc', dark: '#33373d' };

const at = (g, x, y) => g[y]?.[x];
const isWall = (g, x, y) => { const c = at(g, x, y); return c === undefined || c === '#'; };
const isGen = (g, x, y) => at(g, x, y) === 'G';

// ---- 바닥: 12×12 철판 (줄눈·리벳·긁힘·기름 얼룩), 발전기 옆 칸은 경고 줄무늬 ----
function plate(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  // 칸 하나 = 철판 한 장 (줄눈 1px, 위·왼쪽 밝은 턱, 네 귀퉁이 리벳). 판마다 색·무늬가 조금씩 다름
  const cell = h2(tx, ty, 5), tread = cell % 3 === 0, base = cell & 1 ? PLATE.a : PLATE.b;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y;
    let c = base;
    if (x === 0 || y === 0) c = PLATE.seam;
    else if (x === 1 || y === 1) c = PLATE.hi;
    else if (x === TILE - 1 || y === TILE - 1) c = PLATE.lo;
    else if ((x === 3 || x === TILE - 4) && (y === 3 || y === TILE - 4)) c = PLATE.rivet; // 리벳
    else if ((x === 4 || x === TILE - 3) && (y === 4 || y === TILE - 3)) c = PLATE.rivetLo;
    else if (tread && x > 5 && x < TILE - 6 && y > 5 && y < TILE - 6 && (x + y) % 4 === 0 && (x - y + 40) % 8 < 2) c = PLATE.hi; // 줄무늬 철판(미끄럼 방지)
    else if (tread && x > 5 && x < TILE - 6 && y > 5 && y < TILE - 6 && (x + y) % 4 === 1 && (x - y + 40) % 8 < 2) c = PLATE.lo;
    else if ((h2(wx, wy, 11) & 63) === 0) c = PLATE.lo; // 잔흠집
    b.set(wx, wy, c);
  }
  const v = hashXY(tx, ty);
  if (v % 5 === 0) { // 기름 얼룩
    const cx = 6 + (v >> 4) % 12, cy = 6 + (v >> 8) % 12, r = 3 + (v >> 12) % 3;
    for (let y = -r; y <= r; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const e = (x / (r + 1)) ** 2 + (y / r) ** 2 + ((h2(px + cx + x, py + cy + y, 9) & 7) / 30);
      if (e <= 1) b.mix(px + cx + x, py + cy + y, PLATE.oil, e < 0.5 ? 0.75 : 0.5);
    }
    b.set(px + cx - 1, py + cy - 1, PLATE.oilHi);
  }
  if (v % 7 === 2) { const sx = 3 + (v >> 3) % 14, sy = 4 + (v >> 7) % 14; for (let i = 0; i < 6; i++) b.set(px + sx + i, py + sy + (i >> 1), PLATE.scratch); } // 긁힘
  // 경고 줄무늬: 발전기와 맞닿은 변을 따라 4px 띠
  const stripe = (x0, y0, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const wx = px + x0 + x, wy = py + y0 + y; b.set(wx, wy, ((wx + wy) >> 2) & 1 ? HAZ.k : (x + y) % 9 === 0 ? HAZ.yd : HAZ.y); } };
  if (isGen(g, tx, ty - 1)) stripe(0, 0, TILE, 4);
  if (isGen(g, tx, ty + 1)) stripe(0, TILE - 4, TILE, 4);
  if (isGen(g, tx - 1, ty)) stripe(0, 0, 4, TILE);
  if (isGen(g, tx + 1, ty)) stripe(TILE - 4, 0, 4, TILE);
}

// ---- 벽: 기계 덩어리 (위면 = 통풍구 패널, 아래가 바닥이면 앞면 = 배관·계기) ----
function machine(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, face = !isWall(g, tx, ty + 1), topH = face ? 11 : TILE, v = hashXY(tx, ty);
  // 위면: 이어진 기계 덮개 — 칸 경계는 벽끼리 붙으면 줄눈만, 덮개 판은 2톤 + 볼트
  const W_ = !isWall(g, tx - 1, ty), E_ = !isWall(g, tx + 1, ty), N_ = !isWall(g, tx, ty - 1);
  for (let y = 0; y < topH; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y;
    let c = ((tx + ty) & 1) ? MACH.top : MACH.topD;
    if ((x === 0 && !W_) || (y === 0 && !N_)) c = MACH.edge; // 덮개 판 이음
    if (x >= 2 && x <= TILE - 3 && y >= 2 && y <= topH - 2 && (x === 2 || y === 2)) c = MACH.topL; // 판 테두리 빛
    if (x >= 2 && x <= TILE - 3 && y >= 2 && y <= topH - 2 && (x === TILE - 3 || y === topH - 2)) c = MACH.edge;
    if ((x === 4 || x === TILE - 5) && (y === 4 || y === topH - 4) && topH > 9) c = MACH.topHi; // 볼트
    b.set(wx, wy, c);
  }
  if (v % 4 === 1 && topH === TILE) for (let x = 0; x < TILE; x++) { // 위를 가로지르는 굵은 배관
    b.set(px + x, py + 9, PIPE.hi); b.set(px + x, py + 10, PIPE.l); b.set(px + x, py + 11, PIPE.l); b.set(px + x, py + 12, PIPE.m); b.set(px + x, py + 13, PIPE.d); b.set(px + x, py + 14, MACH.edge);
  }
  if (v % 3 === 0 && topH === TILE) for (let y = 7; y < 17; y += 2) for (let x = 7; x < 17; x++) { b.set(px + x, py + y, MACH.vent); b.set(px + x, py + y + 1, MACH.ventHi); } // 통풍구
  if (!isWall(g, tx, ty - 1)) for (let x = 0; x < TILE; x++) { b.set(px + x, py, MACH.topHi); b.set(px + x, py + 1, MACH.topL); }
  if (!isWall(g, tx - 1, ty)) for (let y = 0; y < topH; y++) b.set(px, py + y, MACH.topHi);
  if (!isWall(g, tx + 1, ty)) for (let y = 0; y < topH; y++) b.set(px + TILE - 1, py + y, MACH.edge);
  if (!face) return;
  for (let x = 0; x < TILE; x++) { b.set(px + x, py + 11, MACH.topHi); b.set(px + x, py + 12, MACH.faceL); }
  for (let y = 13; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let c = x % 12 === 0 ? MACH.faceD : y === 13 ? MACH.faceL : MACH.face;
    if (y >= TILE - 2) c = MACH.edge;
    b.set(px + x, py + y, c);
  }
  if (v % 2 === 0) { // 세로 배관 2줄 + 고정 띠
    for (const ox of [4 + (v >> 3) % 4, 14 + (v >> 5) % 4]) for (let y = 12; y < TILE - 1; y++) {
      b.set(px + ox, py + y, PIPE.hi); b.set(px + ox + 1, py + y, PIPE.l); b.set(px + ox + 2, py + y, PIPE.m); b.set(px + ox + 3, py + y, PIPE.d);
      if (y === 17) for (let i = -1; i <= 4; i++) b.set(px + ox + i, py + y, i < 1 ? PIPE.bandHi : PIPE.band);
    }
  } else { // 계기판 + 램프
    b.rect(px + 5, py + 14, 9, 7, MACH.faceD);
    b.rect(px + 6, py + 15, 7, 5, GEN.meter);
    for (let i = 0; i < 4; i++) b.set(px + 7 + i, py + 18 - (i >> 1), GEN.needle);
    b.set(px + 17, py + 16, v & 4 ? '#58d05a' : '#d05030'); b.set(px + 18, py + 16, v & 4 ? '#2a7a2c' : '#7a2a1c');
    b.set(px + 17, py + 17, v & 4 ? '#2a7a2c' : '#7a2a1c');
  }
  if (!isWall(g, tx - 1, ty)) for (let y = 11; y < TILE; y++) b.set(px, py + y, MACH.faceL);
  if (!isWall(g, tx + 1, ty)) for (let y = 11; y < TILE; y++) b.set(px + TILE - 1, py + y, MACH.edge);
}

// ---- 계단: 바닥 해치 + 아래로 내려가는 철계단 ----
function hatch(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  b.rect(px + 2, py + 2, 20, 20, HAZ.k);
  for (let i = 0; i < 20; i++) { b.set(px + 2 + i, py + 2, ((i >> 1) & 1) ? HAZ.y : HAZ.k); b.set(px + 2 + i, py + 21, ((i >> 1) & 1) ? HAZ.y : HAZ.k); b.set(px + 2, py + 2 + i, ((i >> 1) & 1) ? HAZ.y : HAZ.k); b.set(px + 21, py + 2 + i, ((i >> 1) & 1) ? HAZ.y : HAZ.k); }
  for (let s = 0; s < 5; s++) for (let x = 5; x < 19; x++) { const y = py + 5 + s * 3; b.set(px + x, y, s < 2 ? '#8a929c' : s < 4 ? '#5a616a' : '#3a3f46'); b.set(px + x, y + 1, '#16181c'); b.set(px + x, y + 2, '#0c0d10'); }
}

export function bakePowerGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] !== '#') plate(b, grid, x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === '>') hatch(b, x, y);
  // 그림자 (빛은 왼쪽 위): 벽·발전기 아래 칸 위쪽, 오른쪽 칸 왼쪽
  const tall = (x, y) => isWall(grid, x, y) || isGen(grid, x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tall(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (tall(x, y - 1)) for (let j = 0; j < 6; j++) for (let i = 0; i < TILE; i++) b.mix(px + i, py + j, '#0c0e12', 0.45 - j * 0.07);
    if (tall(x - 1, y)) for (let i = 0; i < 4; i++) for (let j = 0; j < TILE; j++) b.mix(px + i, py + j, '#0c0e12', 0.32 - i * 0.08);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === '#') machine(b, grid, x, y);
  return b.canvas();
}

// ---- 위로 솟는 것 ----
const sprites = new Map();
// 발전기 48×64 (아래 48 = 2×2 칸, 위 16 = 코일이 윗칸으로 솟음). lit = 예고 중 (코일 달아오름·램프 켜짐)
function genSprite(lit) {
  const k = `gen${lit}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(50, 66);
  // 몸통: 4~46 × 22~62, 앞면(아래 14px)은 어둡게, 위면은 밝은 철판
  for (let y = 22; y < 63; y++) for (let x = 3; x < 47; x++) {
    let c;
    if (y < 46) { // 위면
      c = (x + y) % 11 === 0 ? GEN.l : GEN.m;
      if (x < 6 || y < 25) c = GEN.hi; else if (x > 43) c = GEN.d;
    } else { // 앞면
      c = y === 46 ? GEN.hi : y > 60 ? GEN.o : x % 11 === 3 ? GEN.d : GEN.l;
      if (x < 5) c = GEN.m;
    }
    b.set(x, y, c);
  }
  // 앞면 통풍구 + 경고 판
  for (let y = 50; y < 58; y += 2) for (let x = 7; x < 21; x++) { b.set(x, y, GEN.o); b.set(x, y + 1, GEN.plate); }
  b.rect(27, 49, 15, 10, HAZ.k);
  for (let y = 50; y < 58; y++) for (let x = 28; x < 41; x++) b.set(x, y, ((x + y) >> 1) & 1 ? HAZ.y : HAZ.k);
  b.rect(32, 51, 5, 6, HAZ.y); for (const [x, y] of [[35, 51], [34, 52], [33, 53], [34, 53], [35, 53], [35, 54], [34, 55]]) b.set(x, y, HAZ.k); // 번개 표시
  // 위면 계기판 (왼쪽 위) + 램프
  b.rect(7, 27, 12, 9, GEN.o); b.rect(8, 28, 10, 7, GEN.meter);
  for (let i = 0; i < 5; i++) b.set(9 + i, 33 - i, GEN.needle);
  b.set(9, 29, '#6a6a5a'); b.set(16, 29, '#6a6a5a');
  b.rect(8, 38, 4, 4, GEN.o); b.rect(9, 39, 2, 2, lit ? GEN.lampOn : GEN.lampOff);
  // 코일 2개 (애자 위 구리 원통, 띠). 바닥 = 위면 위, 꼭대기는 몸통 위로 솟음
  for (const cx of [26, 39]) {
    for (let y = 36; y < 41; y++) for (let x = cx - 4; x <= cx + 4; x++) if (((x - cx) / 4.5) ** 2 + ((y - 39) / 2.2) ** 2 <= 1) b.set(x, y, GEN.o); // 받침 그림자
    for (let y = 30; y < 39; y++) for (let x = cx - 2; x <= cx + 2; x++) b.set(x, y, x === cx - 2 ? GEN.ins : x === cx + 2 ? GEN.insD : (y & 1) ? GEN.ins : GEN.insD); // 애자
    for (let y = 4; y < 31; y++) for (let x = cx - 4; x <= cx + 4; x++) { // 구리 원통 (감긴 줄)
      const r = x - cx;
      let c = r <= -3 ? GEN.copperL : r >= 3 ? GEN.copperD : GEN.copper;
      if (r === -2) c = GEN.copperHi;
      if (y % 3 === 0) c = r >= 2 ? GEN.copperD : GEN.copper; // 감긴 줄 홈
      if (y < 6) c = y === 4 ? GEN.copperHi : GEN.copperL;
      b.set(x, y, c);
    }
    for (let y = 1; y < 5; y++) for (let x = cx - 1; x <= cx + 1; x++) b.set(x, y, y === 1 ? GEN.hi : GEN.l); // 꼭지
    if (lit) for (let y = 6; y < 30; y += 3) for (let x = cx - 3; x <= cx + 3; x++) b.mix(x, y, GEN.glow, 0.55); // 달아오름
  }
  // 코일 사이 전선
  for (let x = 30; x < 36; x++) b.set(x, 33 + ((x - 30) >> 2), GEN.o);
  outline(b, GEN.o);
  const c = b.canvas(); sprites.set(k, c); return c;
}

function partitionSprite(v) {
  const k = `part${v}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(24, 24);
  for (let y = 19; y < 23; y++) for (let x = 1; x < 23; x++) b.mix(x, y, '#08090c', 0.32); // 그림자
  const x0 = 1, x1 = 22, top = 5, bot = 19;
  // 철망 (비쳐 보이게 빈칸을 남김) + 틀 + 위 경고 띠 + 받침
  for (let y = top + 3; y < bot; y++) for (let x = x0 + 2; x <= x1 - 2; x++) if (((x + y) % 4 === 0) || ((x - y + 40) % 4 === 0)) b.set(x, y, (x + y) % 8 === 0 ? '#9aa3ad' : '#6a727c');
  for (let y = top; y < top + 3; y++) for (let x = x0; x <= x1; x++) b.set(x, y, y === top ? '#f0c840' : ((x + y) >> 1) & 1 ? HAZ.y : HAZ.k);
  for (let y = top; y <= bot; y++) for (const fx of [x0, x0 + 1, x1 - 1, x1]) b.set(fx, y, fx === x0 ? '#a3acb6' : fx === x1 ? '#33373c' : '#6a717a');
  if (v) for (let y = top + 3; y <= bot; y++) for (const fx of [11, 12]) b.set(fx, y, fx === 11 ? '#8a929c' : '#454a51'); // 가운데 기둥
  for (let x = x0; x <= x1; x++) b.set(x, bot, '#3a3f46');
  for (const fx of [x0 + 1, x1 - 1]) for (let y = bot + 1; y < bot + 3; y++) { b.set(fx - 1, y, '#454a51'); b.set(fx, y, '#5a616a'); b.set(fx + 1, y, '#33373c'); } // 받침 발
  outline(b, '#15171b');
  const c = b.canvas(); sprites.set(k, c); return c;
}

function scrapSprite(v) {
  const k = `scrap${v}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(24, 24);
  for (let y = 17; y < 23; y++) for (let x = 1; x < 23; x++) if (((x - 12) / 11) ** 2 + ((y - 20) / 2.6) ** 2 <= 1) b.mix(x, y, '#08090c', 0.4);
  // 무더기 바탕 (녹슨 판때기 덩어리)
  for (let y = 7; y < 21; y++) for (let x = 2; x < 22; x++) {
    const e = ((x - 12) / 10) ** 2 + ((y - 15) / 7) ** 2;
    if (e > 1) continue;
    const n = h2(x, y, v + 40) & 7;
    let c = n < 2 ? SCRAP.rust : n < 4 ? SCRAP.iron : n < 5 ? SCRAP.rustL : SCRAP.dark;
    if (y < 11 && x < 12 && n > 2) c = SCRAP.ironL;
    b.set(x, y, c);
  }
  // 톱니바퀴
  const gx = v ? 8 : 14, gy = 12;
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    const r = Math.hypot(x, y), ang = Math.atan2(y, x);
    const teeth = r <= 4.3 && r > 3 && (Math.round(ang * 8 / Math.PI) & 1) === 0;
    if (r <= 3 || teeth) b.set(gx + x, gy + y, r < 1.2 ? SCRAP.dark : (x + y < 0 ? SCRAP.ironHi : SCRAP.ironL));
  }
  // 철근 2개 (대각선으로 삐죽)
  for (let i = 0; i < 9; i++) { b.set(v ? 15 + i : 3 + i, 5 + (i >> 1), SCRAP.rustL); b.set(v ? 15 + i : 3 + i, 6 + (i >> 1), SCRAP.rust); }
  for (let i = 0; i < 7; i++) b.set(17 - (v ? 12 : 0) + (i >> 1), 3 + i, SCRAP.ironL);
  outline(b, SCRAP.o);
  const c = b.canvas(); sprites.set(k, c); return c;
}

// 방출 예고 칸: 노란 테두리 + 사선 줄무늬가 깜빡임 (호출 측 translate 상태)
export function drawPulseWarn(ctx, cells, time) {
  if (!cells.length) return;
  const on = (Math.floor(time * 3) & 1) === 0;
  ctx.save();
  for (const p of cells) {
    const px = p.x * TILE, py = p.y * TILE;
    ctx.globalAlpha = on ? 0.28 : 0.14;
    ctx.fillStyle = HAZ.y;
    for (let i = -TILE; i < TILE; i += 6) for (let j = 0; j < 3; j++) { // 사선 줄
      const x = i + j, y0 = Math.max(0, -x), y1 = Math.min(TILE, TILE - x);
      for (let y = y0; y < y1; y += 1) ctx.fillRect(px + x + y, py + y, 1, 1);
    }
    ctx.globalAlpha = on ? 0.9 : 0.5;
    ctx.fillRect(px + 1, py + 1, TILE - 2, 1); ctx.fillRect(px + 1, py + TILE - 2, TILE - 2, 1);
    ctx.fillRect(px + 1, py + 1, 1, TILE - 2); ctx.fillRect(px + TILE - 2, py + 1, 1, TILE - 2);
  }
  ctx.restore();
}

// 번개 한 줄기 (지그재그, 결정적 난수)
function bolt(ctx, x0, y0, x1, y1, seed) {
  const n = 6;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, j = i === n ? 0 : ((h2(seed, i, 3) % 9) - 4);
    const nx = Math.round(x0 + (x1 - x0) * t + j), ny = Math.round(y0 + (y1 - y0) * t + (i === n ? 0 : ((h2(seed, i, 7) % 5) - 2)));
    const steps = Math.max(Math.abs(nx - px), Math.abs(ny - py));
    for (let s = 0; s <= steps; s++) ctx.fillRect(Math.round(px + (nx - px) * s / steps), Math.round(py + (ny - py) * s / steps), 2, 2);
    px = nx; py = ny;
  }
}

// 보이는 범위만 (호출 측에서 translate 한 상태). gens = state.generators, firing(g) = 이번 라운드 예고 중, pulseAge = 마지막 방출 후 초 (없으면 null)
export function drawPowerMap(ctx, grid, ground, camX, camY, viewW, viewH, time = 0, gens = [], firing = () => false, pulse = null) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 2); y++) for (let x = Math.max(0, x0 - 1); x <= x1; x++) { // 아래 두 줄 더 (위로 솟음)
    const ch = grid[y][x];
    if (ch === '^') ctx.drawImage(partitionSprite(hashXY(x, y) & 1), x * TILE, y * TILE - 2);
    else if (ch === '*') ctx.drawImage(scrapSprite(hashXY(x, y) & 1), x * TILE, y * TILE);
  }
  for (const g of gens) {
    if (g.x > x1 + 1 || g.x + 2 < x0 || g.y > y1 + 1 || g.y + 2 < y0) continue;
    const lit = firing(g), px = g.x * TILE - 1, py = g.y * TILE - 17;
    ctx.drawImage(genSprite(lit && (Math.floor(time * 4) & 1) === 0), px, py);
    if (lit) { // 코일 사이 작은 불꽃
      ctx.fillStyle = GEN.arc;
      if ((Math.floor(time * 12) % 3) !== 0) bolt(ctx, px + 27, py + 12, px + 38, py + 12 + (Math.floor(time * 12) % 4), Math.floor(time * 12));
    }
  }
  if (pulse && pulse.age < 0.6) { // 방출: 코일에서 사방으로 번개
    ctx.save();
    ctx.globalAlpha = 1 - pulse.age / 0.6;
    for (const g of pulse.gens) {
      const cx = g.x * TILE + TILE, cy = g.y * TILE - 2;
      ctx.fillStyle = GEN.glow;
      ctx.fillRect(cx - 14, cy - 14, 28, 4);
      ctx.fillStyle = GEN.arc;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + g.x, r = TILE * 2.4;
        bolt(ctx, cx, cy + 6, Math.round(cx + Math.cos(ang) * r), Math.round(cy + 18 + Math.sin(ang) * r), i * 31 + Math.floor(pulse.age * 20));
      }
    }
    ctx.restore();
  }
}

// 하수도 지형 그림 (픽셀 단위로 직접 찍음). 바닥 한 장(벽돌 벽·젖은 콘크리트·물길 턱·독 웅덩이 바탕·이끼·맨홀·그림자)은
// 맵마다 굽고, 흐르는 물결·터지는 독 거품·타이어 더미·쓰레기봉투는 매 프레임. 스펙 docs/superpowers/specs/2026-11-22-sewer-design.md
import { buffer, outline, h2, hashXY } from './cityTiles.js';

const TILE = 24;
const WALLTOP = { base: '#2c2e36', d: '#25272e', dd: '#1b1c22', l: '#363944', hi: '#4c505c' };
const BRICK = { a: '#6d5c50', b: '#625246', hi: '#86735f', lo: '#4a3e36', mortar: '#342d29', cap: '#7b7f86', capHi: '#a3a7ad', capLo: '#55585f' };
const MOSS = { o: '#1a2816', d: '#2d4424', m: '#3e5c2c', l: '#55763a', hi: '#7e9e50', drip: '#6f9a4c' };
const CONC = { a: '#71766c', b: '#6a6f65', hi: '#80857a', lo: '#585d53', grout: '#474b42', wet: '#536260', glint: '#b4cccc', grime: '#4b4a36' };
const PIPE = { d: '#5a3a24', m: '#8a5a34', l: '#b07a48', hi: '#d8a46a', band: '#3a3a40' };
const WATER = { murk: '#24463e', d: '#2b5852', m: '#356a62', l: '#47837a', foam: '#a2cbb8', lipTop: '#a2a69c', lip: '#868a80', lipFace: '#585c54' };
const POISON = { crust: '#2e2418', rim: '#22102c', deep: '#2a1240', d: '#3a1a58', m: '#4e2476', l: '#6c3a9c', hi: '#a070cc', bub: '#d4b4f0', stain: '#463a36', scum: '#5a6a3a' };

const at = (g, x, y) => g[y]?.[x];
const isWall = (g, x, y) => { const c = at(g, x, y); return c === undefined || c === '#'; };

// ---- 벽: 위면(어두운 석판) + 아래가 바닥이면 앞면(벽돌, 아래 10px) ----
function wall(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, face = !isWall(g, tx, ty + 1);
  const topH = face ? 10 : TILE;
  for (let y = 0; y < topH; y++) for (let x = 0; x < TILE; x++) { // 위면: 큰 석판 12×8, 줄눈 어긋나게
    const wx = px + x, wy = py + y, row = Math.floor(wy / 8), sx = (wx + (row & 1) * 6) % 12;
    let c = (h2(Math.floor((wx + (row & 1) * 6) / 12), row) & 3) === 0 ? WALLTOP.d : WALLTOP.base;
    if (wy % 8 === 0 || sx === 0) c = WALLTOP.dd;
    else if (wy % 8 === 1 || sx === 1) c = WALLTOP.l;
    if (c === WALLTOP.base && (h2(wx, wy, 3) & 31) === 0) c = WALLTOP.l;
    if (c === WALLTOP.base && (h2(wx >> 1, wy >> 1, 23) % 9) === 0) c = WALLTOP.d;
    b.set(wx, wy, c);
  }
  // 위면 가장자리: 바닥과 만나는 위·왼쪽은 밝게, 오른쪽은 어둡게
  if (!isWall(g, tx, ty - 1)) for (let x = 0; x < TILE; x++) { b.set(px + x, py, WALLTOP.hi); b.set(px + x, py + 1, WALLTOP.l); }
  if (!isWall(g, tx - 1, ty)) for (let y = 0; y < topH; y++) b.set(px, py + y, WALLTOP.hi);
  if (!isWall(g, tx + 1, ty)) for (let y = 0; y < topH; y++) b.set(px + TILE - 1, py + y, WALLTOP.dd);
  if (!face) return;
  // 앞면: 갓돌 2px + 벽돌 (6×3, 줄눈) + 이끼 얼룩·물 자국
  for (let x = 0; x < TILE; x++) { b.set(px + x, py + 10, BRICK.capHi); b.set(px + x, py + 11, BRICK.cap); b.set(px + x, py + 12, BRICK.capLo); }
  for (let y = 13; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, r = Math.floor((y - 13) / 3), sx = (wx + (r & 1) * 3) % 6;
    let c = (h2(Math.floor((wx + (r & 1) * 3) / 6), ty * 4 + r, 7) & 1) ? BRICK.a : BRICK.b;
    if ((y - 13) % 3 === 2 || sx === 5) c = BRICK.mortar;
    else if ((y - 13) % 3 === 0 && sx < 4) c = BRICK.hi;
    if (y >= TILE - 2) c = y === TILE - 1 ? BRICK.lo : BRICK.mortar;
    b.set(wx, py + y, c);
    if (y > 18) b.mix(wx, py + y, '#101418', (y - 18) * 0.06); // 아래로 갈수록 젖어 어두움
  }
  if (!isWall(g, tx - 1, ty)) for (let y = 10; y < TILE; y++) b.set(px, py + y, BRICK.capLo); // 모서리
  if (!isWall(g, tx + 1, ty)) for (let y = 10; y < TILE; y++) b.set(px + TILE - 1, py + y, BRICK.lo);
  const v = hashXY(tx, ty);
  if (v % 3 === 0) { // 이끼 얼룩 (갓돌 아래로 흘러내림)
    const mx = 3 + (v >> 3) % 14;
    for (let i = 0; i < 6; i++) for (let y = 13; y < 13 + ((v >> (i + 5)) & 3) + 1; y++) b.set(px + mx + i, py + y, i === 0 || i === 5 ? MOSS.d : MOSS.m);
    b.set(px + mx + 2, py + 18, MOSS.drip);
  }
  if (v % 4 === 1) { const dx = 4 + (v >> 5) % 16; for (let y = 13; y < TILE - 1; y++) if ((y + dx) % 5) b.mix(px + dx, py + y, '#1e2a2a', 0.45); } // 물 자국
  if ((tx * 7 + ty * 3) % 5 === 0) { // 녹슨 가로 관 + 고정쇠
    for (let x = 0; x < TILE; x++) { b.set(px + x, py + 15, PIPE.hi); b.set(px + x, py + 16, PIPE.l); b.set(px + x, py + 17, PIPE.m); b.set(px + x, py + 18, PIPE.d); }
    for (const bx of [5, 17]) for (let y = 14; y < 20; y++) { b.set(px + bx, py + y, PIPE.band); b.set(px + bx + 1, py + y, y === 14 ? '#6a6a74' : PIPE.band); }
    if (v % 2) { b.set(px + 11, py + 19, '#5e8a8a'); b.set(px + 11, py + 21, '#5e8a8a'); } // 물방울
  }
}

// ---- 바닥: 젖은 콘크리트 판 (12px, 월드 좌표로 이어짐) + 물기·배수구 ----
function concrete(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, slab = h2(Math.floor(wx / 12), Math.floor(wy / 12), 11);
    let c = slab & 1 ? CONC.a : CONC.b;
    if (wx % 12 === 0 || wy % 12 === 0) c = CONC.grout;
    else if (wx % 12 === 1 || wy % 12 === 1) c = CONC.hi;
    else if (wx % 12 === 11 || wy % 12 === 11) c = CONC.lo;
    else if ((h2(wx, wy, 13) & 15) === 0) c = slab & 2 ? CONC.lo : CONC.hi; // 자갈 결
    b.set(wx, wy, c);
  }
  const v = hashXY(tx, ty);
  if (v % 5 === 0) { // 물기 얼룩
    const cx = 6 + (v >> 4) % 12, cy = 6 + (v >> 8) % 12;
    for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) if ((x / 5.5) ** 2 + (y / 3.2) ** 2 <= 1) b.mix(px + cx + x, py + cy + y, CONC.wet, 0.55);
    b.set(px + cx - 2, py + cy - 1, CONC.glint); b.set(px + cx - 1, py + cy - 1, CONC.glint);
  }
  if (v % 3 === 1) { // 때 얼룩
    const cx = 4 + (v >> 6) % 16, cy = 4 + (v >> 10) % 16;
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 14 + ((h2(px + x, py + y, 29) & 7) - 4)) b.mix(px + cx + x, py + cy + y, CONC.grime, 0.28);
  }
  if (v % 13 === 4) { // 배수구 격자
    const gx = px + 6, gy = py + 8;
    b.rect(gx - 1, gy - 1, 14, 9, '#3a3d40');
    b.rect(gx, gy, 12, 7, '#8a8f94');
    for (let i = 0; i < 5; i++) b.rect(gx + 1 + i * 2 + (i > 2 ? 1 : 0), gy + 1, 1, 5, '#1a1c20');
    b.rect(gx, gy, 12, 1, '#b4b9bd');
  }
}

// 액체 칸 안쪽 깊이: 액체가 아닌 이웃 쪽으로 inset 만큼 물러나고 모서리는 둥글게. 반환 = 가장자리까지 거리 (밖이면 -1)
// 물길 다리: 마른 칸인데 좌우(또는 위아래)가 물 → 그림에선 물 위 철판 다리 (물길이 끊겨 보이지 않게)
const wetAt = (g, x, y, dx, dy) => at(g, x + dx, y + dy) === ',' || (at(g, x + dx, y + dy) === '.' && at(g, x + dx * 2, y + dy * 2) === ','); // 1~2칸 안에 물
const isBridge = (g, x, y) => at(g, x, y) === '.' && ((wetAt(g, x, y, -1, 0) && wetAt(g, x, y, 1, 0) && (at(g, x - 1, y) === ',' || at(g, x + 1, y) === ',')) || (wetAt(g, x, y, 0, -1) && wetAt(g, x, y, 0, 1) && (at(g, x, y - 1) === ',' || at(g, x, y + 1) === ',')));
const liq = (g, x, y, ch) => at(g, x, y) === ch || (ch === ',' && isBridge(g, x, y));
function liquidDepth(g, tx, ty, ch, inset, x, y) {
  const L = !liq(g, tx - 1, ty, ch), R = !liq(g, tx + 1, ty, ch), U = !liq(g, tx, ty - 1, ch), D = !liq(g, tx, ty + 1, ch);
  const dl = L ? x - inset : 99, dr = R ? TILE - 1 - inset - x : 99, du = U ? y - inset : 99, dd = D ? TILE - 1 - inset - y : 99;
  let d = Math.min(dl, dr, du, dd);
  const R0 = ch === '%' ? 7 : 4, corner = (a, c) => (a < R0 && c < R0 ? R0 - Math.hypot(R0 - a, R0 - c) : 99);
  if (L && U) d = Math.min(d, corner(dl, du));
  if (R && U) d = Math.min(d, corner(dr, du));
  if (L && D) d = Math.min(d, corner(dl, dd));
  if (R && D) d = Math.min(d, corner(dr, dd));
  return d < 0 ? -1 : d;
}

// 물길: 돌 턱(위는 밝은 갓, 아래로 그림자) + 탁한 청록 물 (깊을수록 어둡게)
function water(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = liquidDepth(g, tx, ty, ',', 2, x, y);
    if (d < 0) { const lipD = liquidDepth(g, tx, ty, ',', 0, x, y); if (lipD >= 0) b.set(px + x, py + y, lipD < 1 ? WATER.lipTop : WATER.lip); continue; }
    let c = d < 1 ? WATER.murk : d < 3 ? WATER.d : WATER.m;
    if (d >= 3 && ((x + y * 3 + tx * 7) % 11 === 0)) c = WATER.l;
    b.set(px + x, py + y, c);
  }
  if (!liq(g, tx, ty - 1, ',')) for (let x = 0; x < TILE; x++) if (liquidDepth(g, tx, ty, ',', 2, x, 3) >= 0) b.set(px + x, py + 3, WATER.lipFace); // 위 턱 그림자가 물에 드리움
}

// 독 웅덩이 바탕: 얼룩진 가장자리 + 보라 액체 (가운데 밝게)
function poisonBase(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, wob = (h2(wx >> 2, wy >> 2, 31) % 5) * 0.45 + (h2(wx, wy, 33) & 1) * 0.3; // 가장자리 울퉁불퉁
    const d = liquidDepth(g, tx, ty, '%', 2, x, y) - wob;
    if (d < 0) { if (d > -2.2) b.mix(wx, wy, (h2(wx, wy, 17) & 1) ? POISON.crust : POISON.stain, 0.7); continue; } // 말라붙은 얼룩
    let c = d < 1 ? POISON.rim : d < 2 ? POISON.l : d < 3.5 ? POISON.m : d < 6 ? POISON.d : POISON.deep; // 얕은 가장자리 밝게, 깊을수록 어둡게
    if (d >= 1 && d < 2 && (h2(wx, wy, 43) % 7) === 0) c = POISON.scum; // 가장자리 거품 찌꺼기
    const blot = h2(wx >> 2, wy >> 2, 37) % 9, fine = h2(wx, wy, 41) % 11;
    if (d >= 4.5 && blot === 0 && fine < 7) c = POISON.m; // 덩어리진 앙금
    if (d >= 2.2 && blot === 1 && fine === 0) c = POISON.hi; // 기름막 반짝임
    b.set(wx, wy, c);
  }
  if (at(g, tx, ty - 1) !== '%' && at(g, tx - 1, ty) !== '%') { for (let i = 0; i < 6; i++) b.set(px + 7 + i, py + 6 + (i > 3 ? 1 : 0), i < 4 ? POISON.bub : POISON.hi); for (let i = 0; i < 3; i++) b.set(px + 6, py + 7 + i, POISON.hi); } // 왼쪽 위 반사광 (웅덩이마다 하나)
}

// 물길 위 철판 다리 (가로 물길이면 세로로 놓임)
function bridge(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, across = wetAt(g, tx, ty, -1, 0) && wetAt(g, tx, ty, 1, 0); // 물이 좌우 → 다리는 위아래로 건넘
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const a = across ? x : y, l = across ? y : x; // a: 다리 폭 방향, l: 길이 방향
    if (a < 3 || a > 20) continue;
    let c = a === 3 || a === 20 ? '#3a3e44' : a === 4 ? '#b8bec4' : a === 19 ? '#6a7076' : (l % 4 === 0 ? '#5a6066' : (a + l) % 6 === 0 ? '#a0a6ac' : '#8a9096');
    if (a > 5 && a < 18 && l % 4 === 2 && (a % 3 === 0)) c = '#2a2e34'; // 구멍
    b.set(px + x, py + y, c);
  }
  for (let i = 0; i < TILE; i++) { const [x, y] = across ? [21, i] : [i, 21]; b.mix(px + x, py + y, '#0a1418', 0.5); b.mix(px + x + (across ? 1 : 0), py + y + (across ? 0 : 1), '#0a1418', 0.3); } // 물에 드리운 그림자
}

// 이끼 수풀: 바닥 위 축축한 덤불 덩어리 (외곽선·빛 방향)
function moss(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE, v = hashXY(tx, ty);
  const blobs = [[7, 9, 4.5], [15, 8, 4], [11, 14, 6], [5, 17, 4.5], [17, 16, 5], [12, 20, 3.5]].map(([cx, cy, r], i) => [cx + ((v >> i) & 1), cy + ((v >> (i + 3)) & 1), r]);
  const inB = (x, y) => blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  const s = buffer(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (!inB(x + 0.5, y + 0.5)) continue;
    const light = (12 - x) * 0.35 + (12 - y) * 0.45 + ((h2(x, y, v) & 3) - 1.5), edgeB = !inB(x + 0.5, y + 1.5), edgeT = !inB(x, y - 1);
    let c = light > 5 ? MOSS.hi : light > 1 ? MOSS.l : light > -4 ? MOSS.m : MOSS.d;
    if (edgeB) c = MOSS.d; else if (edgeT && light > -3) c = MOSS.hi;
    if (!edgeB && ((x + y + v) & 1) && h2(x, y, v) % 5 === 0) c = c === MOSS.m ? MOSS.l : MOSS.m;
    s.set(x, y, c);
  }
  for (let i = 0; i < 6; i++) { const fx = 3 + ((v >> (i * 3)) % 18), fy = 4 + ((v >> (i * 2 + 1)) % 15); if (s.has(fx, fy) && s.has(fx, fy - 2)) { s.set(fx, fy - 1, MOSS.hi); s.set(fx, fy - 2, MOSS.l); } } // 위로 솟은 이끼 잎
  outline(s, MOSS.o);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (s.has(x, y)) { const o = (y * TILE + x) * 4; b.set(px + x, py + y, '#' + [0, 1, 2].map((i) => s.d[o + i].toString(16).padStart(2, '0')).join('')); }
}

// 계단 = 열린 맨홀 + 사다리
function manhole(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE, c = 11.5;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.hypot(x - c, (y - c) * 1.15);
    if (d > 10.5) continue;
    if (d > 8.6) { const lit = Math.cos(Math.atan2(y - c, x - c) + 2.3); b.set(px + x, py + y, lit > 0.4 ? '#c4c8cc' : lit > -0.3 ? '#8e9398' : '#5e6268'); continue; } // 금속 테
    if (d > 7.8) { b.set(px + x, py + y, '#202226'); continue; }
    b.set(px + x, py + y, y < c - 3 ? '#121316' : '#08090b');
  }
  for (const rx of [8, 15]) for (let y = 6; y < 20; y++) b.set(px + rx, py + y, rx === 8 ? '#b88a4a' : '#7a5a30'); // 사다리
  for (let y = 8; y < 20; y += 4) for (let x = 9; x < 15; x++) b.set(px + x, py + y, y < 12 ? '#d8a860' : '#9a7238');
}

export function bakeSewerGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] !== '#') concrete(b, x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = grid[y][x];
    if (ch === ',' || isBridge(grid, x, y)) { water(b, grid, x, y); if (ch !== ',') bridge(b, grid, x, y); }
    else if (ch === '%') poisonBase(b, grid, x, y);
    else if (ch === '"') moss(b, x, y);
    else if (ch === '>') manhole(b, x, y);
  }
  // 그림자 (빛은 왼쪽 위): 벽 아래 칸 위쪽 5px, 벽 오른쪽 칸 왼쪽 3px
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] === '#') continue;
    const px = x * TILE, py = y * TILE;
    if (isWall(grid, x, y - 1)) for (let j = 0; j < 5; j++) for (let i = 0; i < TILE; i++) b.mix(px + i, py + j, '#0c0e12', 0.42 - j * 0.08);
    if (isWall(grid, x - 1, y)) for (let i = 0; i < 3; i++) for (let j = 0; j < TILE; j++) b.mix(px + i, py + j, '#0c0e12', 0.3 - i * 0.09);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === '#') wall(b, grid, x, y);
  return b.canvas();
}

// ---- 위로 솟는 것 ----
const sprites = new Map();
function tireSprite(v) {
  const k = `tire${v}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(24, 26);
  for (let y = 20; y < 25; y++) for (let x = 1; x < 23; x++) if (((x - 12) / 10.5) ** 2 + ((y - 22.5) / 2.4) ** 2 <= 1) b.mix(x, y, '#08080c', 0.4); // 땅 그림자
  // 아래 타이어부터: 위면(고리 + 홈 + 구멍) 위에 다음 타이어. 옆면은 위면 타원을 3px 아래로 민 띠
  const stack = v === 0 ? [[12, 18], [12, 13], [12, 8]] : v === 1 ? [[11, 18], [13, 13], [11, 8]] : [[7, 18], [17, 18], [12, 13]];
  const RX = 7.5, RY = 3.6, SIDE = 3;
  for (const [cx, cy] of stack) {
    for (let y = cy - 5; y <= cy + SIDE + 4; y++) for (let x = cx - 9; x <= cx + 9; x++) {
      const top = ((x - cx) / RX) ** 2 + ((y - cy) / RY) ** 2;
      let side = false;
      for (let s2 = 1; s2 <= SIDE; s2++) if (((x - cx) / RX) ** 2 + ((y - cy - s2) / RY) ** 2 <= 1) side = true;
      if (top > 1 && !side) continue;
      let c;
      if (top <= 1) {
        const hole = ((x - cx) / 3.6) ** 2 + ((y - cy) / 1.6) ** 2;
        if (hole <= 1) c = y <= cy ? '#0a0a0e' : '#1a1a20'; // 구멍 (아래 안쪽 벽이 살짝 보임)
        else if (hole <= 1.6) c = '#26262e'; // 안쪽 턱
        else c = top > 0.8 ? '#5a5a66' : (x < cx && y < cy) ? '#7e7e8c' : '#484854'; // 고무 위면, 왼쪽 위 밝게
        if (c === '#484854' && (Math.round(Math.atan2((y - cy) * 2, x - cx) * 5) & 1)) c = '#3c3c47'; // 홈
      } else c = (x + y * 2) % 4 === 0 ? '#1c1c22' : x < cx - 4 ? '#3a3a44' : '#2c2c35'; // 옆면 트레드
      b.set(x, y, c);
    }
  }
  outline(b, '#0a0a0e');
  const c = b.canvas(); sprites.set(k, c); return c;
}
function bagSprite(v) {
  const k = `bag${v}`;
  if (sprites.has(k)) return sprites.get(k);
  const P = v ? { o: '#0e1a10', d: '#1e3424', m: '#2c4a32', l: '#46704c', hi: '#8cb894' } : { o: '#0c0c10', d: '#1c1c24', m: '#2a2a34', l: '#44444f', hi: '#9a9aaa' };
  const b = buffer(20, 22);
  for (let y = 17; y < 21; y++) for (let x = 1; x < 19; x++) if (((x - 10) / 8.5) ** 2 + ((y - 19) / 1.8) ** 2 <= 1) b.mix(x, y, '#08080c', 0.35);
  for (let y = 5; y < 19; y++) for (let x = 2; x < 18; x++) {
    const e = ((x - 10) / 7.6) ** 2 + ((y - 12.5) / 6.4) ** 2;
    if (e > 1) continue;
    const light = (10 - x) * 0.6 + (12 - y) * 0.7;
    let c = light > 5 ? P.l : light > -2 ? P.m : P.d;
    if (Math.abs(x - 7 - (y - 8) * 0.3) < 0.6 && y > 7 && y < 14) c = P.hi; // 비닐 광택
    if ((x === 10 || x === 13) && y > 7 && y < 17 && (y & 1)) c = P.d; // 주름
    b.set(x, y, c);
  }
  for (const [x, y] of [[9, 4], [10, 4], [9, 3], [8, 2], [11, 2], [10, 3]]) b.set(x, y, P.m); // 매듭
  b.set(8, 1, P.l); b.set(11, 1, P.l); b.set(9, 5, P.d); b.set(10, 5, P.d);
  outline(b, P.o);
  const c = b.canvas(); sprites.set(k, c); return c;
}

// 보이는 범위만 (호출 측에서 translate 한 상태)
export function drawSewerMap(ctx, grid, ground, camX, camY, viewW, viewH, time = 0) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ch = grid[y][x], px = x * TILE, py = y * TILE, v = hashXY(x, y);
    if (ch === ',') { // 물결: 오른쪽으로 흐르는 밝은 줄
      ctx.fillStyle = WATER.foam;
      for (let i = 0; i < 2; i++) {
        const fx = Math.floor((time * 10 + (v >> (i * 4)) % 24 + i * 12)) % 24, fy = 6 + ((v >> (i * 3 + 2)) % 12);
        if (liquidDepth(grid, x, y, ',', 2, fx, fy) >= 2 && liquidDepth(grid, x, y, ',', 2, Math.min(23, fx + 3), fy) >= 2) ctx.fillRect(px + fx, py + fy, 4, 1);
      }
    } else if (ch === '%') { // 독 거품: 자라다가 터짐
      for (let i = 0; i < 2; i++) {
        const ph = (time * 0.9 + ((v >> (i * 5)) % 100) / 100 + i * 0.5) % 1, bx = 7 + ((v >> (i * 4 + 1)) % 10), by = 7 + ((v >> (i * 4 + 7)) % 10);
        if (liquidDepth(grid, x, y, '%', 3, bx, by) < 2.5) continue;
        if (ph < 0.75) { // 둥근 거품: 1px → 십자 → 고리
          const r = Math.round(ph * 3);
          ctx.fillStyle = POISON.hi;
          if (r === 0) ctx.fillRect(px + bx, py + by, 1, 1);
          else if (r === 1) { ctx.fillRect(px + bx - 1, py + by, 3, 1); ctx.fillRect(px + bx, py + by - 1, 1, 3); }
          else { ctx.fillRect(px + bx - 1, py + by - 2, 3, 1); ctx.fillRect(px + bx - 1, py + by + 2, 3, 1); ctx.fillRect(px + bx - 2, py + by - 1, 1, 3); ctx.fillRect(px + bx + 2, py + by - 1, 1, 3); ctx.fillStyle = POISON.m; ctx.fillRect(px + bx - 1, py + by - 1, 3, 3); }
          ctx.fillStyle = POISON.bub; ctx.fillRect(px + bx - (r ? 1 : 0), py + by - (r ? 1 : 0), 1, 1);
        }
        else if (ph < 0.85) { ctx.fillStyle = POISON.bub; for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) ctx.fillRect(px + bx + dx, py + by + dy, 1, 1); } // 터짐
      }
    }
  }
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = x0; x <= x1; x++) { // 아래 한 줄 더 (위로 솟음)
    const ch = grid[y][x];
    if (ch === '^') ctx.drawImage(tireSprite(hashXY(x, y) % 3), x * TILE, y * TILE - 3);
    else if (ch === '*') ctx.drawImage(bagSprite(hashXY(x, y) & 1), x * TILE + 2, y * TILE + 2);
  }
}

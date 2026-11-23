// 묘지 지형 그림 (픽셀 단위로 직접 찍음). 바닥 한 장(어둑한 풀밭 묘역·흙길·묘비 줄의 묘역 띠·돌담·연못·납골당 계단)은 맵마다 굽고,
// 묘비·마른 나무·부서진 비석 더미·혼불은 매 프레임. 스펙 docs/superpowers/specs/2026-11-23-graveyard-design.md
import { buffer, outline, h2, hashXY } from './cityTiles.js';

const TILE = 24;
const GRASS = ['#0d130e', '#121a12', '#172217', '#1d2a1c', '#243322', '#2c3d29', '#374a31', '#46593b'];
const SOIL = ['#17120e', '#1f1913', '#282018', '#32291f', '#3e3326', '#4b3e2e'];
const STONE = ['#15181c', '#1e2227', '#282d33', '#333940', '#3f464e', '#4d555e', '#5e6871', '#727d87', '#8a959e'];
const MOSS = ['#1f3220', '#2b4428', '#3a5833', '#4d6e3e'];
const WATER = { d: '#060c12', m: '#0b1620', l: '#13222f', hi: '#2c4458', lily: '#2a4a2a', lilyHi: '#3e6838' };
const FLOWER = ['#d8d2e8', '#a890d0', '#e0d8a0', '#c8b8e8'];
const WISP = { glow: '#3a7cf0', outer: '#4a9cff', mid: '#8ad8ff', core: '#e8fcff' };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function vnoise(x, y, sc, seed = 0) {
  const fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
  const s = (q) => q * q * (3 - 2 * q), r = (i, j) => (h2(x0 + i, y0 + j, seed) % 1000) / 1000;
  return (r(0, 0) * (1 - s(u)) + r(1, 0) * s(u)) * (1 - s(v)) + (r(0, 1) * (1 - s(u)) + r(1, 1) * s(u)) * s(v);
}
const at = (g, x, y) => g[y]?.[x];
const wallN = (g, x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => at(g, x + dx, y + dy) === '#').length;
const isTree = (g, x, y) => at(g, x, y) === '#' && wallN(g, x, y) <= 1; // 외따로 선 '#' 은 마른 나무, 붙은 '#' 은 돌담
const isWall = (g, x, y) => { const c = at(g, x, y); return c === undefined || (c === '#' && !isTree(g, x, y)); };
const pick = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.round(v)))];

export function bakeGraveyardGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  for (let py = 0; py < h * TILE; py++) for (let px = 0; px < w * TILE; px++) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE), ch = grid[ty][tx];
    if (ch === '#' && !isTree(grid, tx, ty)) continue;
    const dz = dither(px, py);
    // 풀밭: 큰 얼룩 + 잔 결, 군데군데 흙이 드러난 맨땅 (가장자리는 디더)
    const big = vnoise(px, py, 34, 11), fine = vnoise(px, py, 5, 12);
    let c = pick(GRASS, 2.7 + (big - 0.5) * 2 + (fine - 0.5) * 1.3 + (dz - 0.5) * 0.5);
    const bare = vnoise(px, py, 26, 13) * 0.75 + vnoise(px, py, 8, 14) * 0.25;
    if (bare > 0.7 || (bare > 0.66 && dz < (bare - 0.66) * 25)) c = pick(SOIL, 2.2 + (fine - 0.5) * 2.2 + (dz - 0.5) * 0.6 + (bare > 0.74 ? 0.5 : 0));
    else { // 풀잎: 세로 2px (밝은 끝 + 어두운 밑동)
      const k = h2(px, py, 15) % 41;
      if (k === 0) c = GRASS[6]; else if (k === 1 && py % TILE) c = GRASS[1];
      else if ((h2(px, py - 1, 15) % 41) === 0) c = GRASS[5];
    }
    if ((h2(px, py, 16) & 2047) === 1) c = FLOWER[(h2(px, py, 17) & 3)]; // 드문 잔꽃
    b.set(px, py, c);
    if (ch === '~') pond(b, grid, px, py, tx, ty);
  }
  // 묘비 줄: 이어진 묘역 띠 (흙 + 양옆 돌 연석) — 위아래 묘비와 끊기지 않게
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === 'T') plot(b, grid, x, y);
  // 풀숲 (추모 정원): 꽃 핀 덤불
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === '"') bush(b, x, y);
  // 그림자 (빛은 왼쪽 위): 돌담 아래·오른쪽
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isWall(grid, x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (isWall(grid, x, y - 1)) for (let j = 0; j < 6; j++) for (let i = 0; i < TILE; i++) b.mix(px + i, py + j, '#030504', 0.5 - j * 0.08);
    if (isWall(grid, x - 1, y)) for (let i = 0; i < 4; i++) for (let j = 0; j < TILE; j++) b.mix(px + i, py + j, '#030504', 0.38 - i * 0.09);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] === '#' && !isTree(grid, x, y)) wall(b, grid, x, y);
    else if (grid[y][x] === '>') crypt(b, x, y);
  }
  return b.canvas();
}

// 연못: 검푸른 물 + 잔물결 + 연잎, 둘레는 젖은 흙
function pond(b, g, px, py, tx, ty) {
  const lx = px - tx * TILE + 0.5, ly = py - ty * TILE + 0.5, dry = (dx, dy) => at(g, tx + dx, ty + dy) !== '~';
  const U = dry(0, -1), D = dry(0, 1), Lf = dry(-1, 0), R = dry(1, 0), RC = 8;
  let edge = Math.min(Lf ? lx : 99, R ? TILE - lx : 99, U ? ly : 99, D ? TILE - ly : 99);
  const cx = Lf && lx < RC ? RC - lx : R && lx > TILE - RC ? lx - (TILE - RC) : 0, cy = U && ly < RC ? RC - ly : D && ly > TILE - RC ? ly - (TILE - RC) : 0;
  if (cx > 0 && cy > 0) edge = Math.min(edge, RC - Math.hypot(cx, cy)); // 바깥 모서리는 둥글게
  edge += (vnoise(px, py, 4, 21) - 0.5) * 2.6;
  if (edge < 1.2) return; // 바깥: 풀밭 그대로 (호출 측이 이미 칠하지 않았으므로 풀 한 점)
  const r = Math.sin(px * 0.25 + py * 0.08) + Math.sin(py * 0.33 - px * 0.07) * 0.7 + (vnoise(px, py, 9, 22) - 0.5);
  let c = r > 1.5 ? WATER.hi : r > 0.6 ? WATER.l : r < -1.1 ? WATER.d : WATER.m;
  if (edge < 2.2) c = MOSS[0]; else if (edge < 3.6) c = WATER.d; // 이끼 낀 물가
  const lily = vnoise(px, py, 6, 23);
  if (lily > 0.8 && edge > 4.5) c = lily > 0.86 && (px + py) % 5 ? WATER.lilyHi : WATER.lily;
  b.set(px, py, c);
}

// 묘역 띠: 묘비 칸 바닥 = 흙, 양옆에 낮은 돌 연석 (위아래 묘비가 있으면 띠가 이어짐)
function plot(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, up = at(g, tx, ty - 1) === 'T', down = at(g, tx, ty + 1) === 'T';
  const y0 = up ? 0 : 3, y1 = down ? TILE : TILE - 2;
  for (let y = y0; y < y1; y++) for (let x = 3; x < TILE - 3; x++) {
    const n = vnoise(px + x, py + y, 3, 31);
    b.set(px + x, py + y, x === 3 || x === TILE - 4 ? STONE[x === 3 ? 6 : 2] : x === 4 ? STONE[4] : x === TILE - 5 ? STONE[1] : n > 0.66 ? SOIL[4] : n < 0.3 ? SOIL[1] : SOIL[2]);
  }
  if (!up) for (let x = 3; x < TILE - 3; x++) { b.set(px + x, py + 2, STONE[7]); b.set(px + x, py + 3, STONE[5]); }
  if (!down) for (let x = 3; x < TILE - 3; x++) { b.set(px + x, py + TILE - 2, STONE[1]); b.set(px + x, py + TILE - 1, '#050706'); }
  for (let y = y0; y < y1; y++) if ((h2(px, py + y, 32) & 7) === 0) b.set(px + 3, py + y, MOSS[2]); // 연석 이끼
}

// 꽃 핀 덤불: 둥근 풀 덩이 2~3개 + 꽃잎 점
function bush(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE, v = h2(tx, ty, 41);
  const blobs = [[8 + (v % 3), 9, 8], [16 - (v >> 3) % 3, 12, 8], [11, 17, 7]].slice(0, 2 + (v & 1));
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let best = -1;
    for (const [cx, cy, r] of blobs) best = Math.max(best, 1 - Math.hypot(x - cx, (y - cy) * 1.15) / r);
    if (best < 0) continue;
    const lit = (blobs.reduce((s, [cx, cy]) => s + (cx - x) * 0.5 + (cy - y), 0) / blobs.length) + (vnoise(px + x, py + y, 3, 42) - 0.5) * 5;
    let c = best < 0.12 ? GRASS[1] : lit > 3 ? GRASS[7] : lit > 0 ? GRASS[6] : lit > -3 ? GRASS[5] : GRASS[3];
    b.set(px + x, py + y, c);
  }
  for (let i = 0; i < 5; i++) { // 꽃송이: 십자 꽃잎 + 노란 가운데
    const fx = px + 4 + (h2(tx, ty, 45 + i) % 16), fy = py + 4 + (h2(tx, ty, 50 + i) % 15), col = FLOWER[(v >> i) & 3], col2 = col === FLOWER[2] ? '#a89850' : '#6a5890';
    b.set(fx, fy - 1, col); b.set(fx - 1, fy, col); b.set(fx + 1, fy, col2); b.set(fx, fy + 1, col2); b.set(fx, fy, '#f0e070');
  }
}

// 돌담: 이끼 낀 낡은 돌 블록 (윗면 + 앞면 벽돌줄)
function wall(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, face = !isWall(g, tx, ty + 1), topH = face ? 11 : TILE;
  for (let y = 0; y < topH; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, n = (vnoise(wx, wy, 5, 51) - 0.5) * 2.4 + (vnoise(wx, wy, 12, 52) - 0.5) * 1.4;
    const moss = vnoise(wx, wy, 9, 53);
    b.set(wx, wy, moss > 0.66 ? (moss > 0.72 ? MOSS[3] : MOSS[1]) : pick(STONE, 4 + n));
  }
  if (!isWall(g, tx, ty - 1)) for (let x = 0; x < TILE; x++) b.set(px + x, py, STONE[7]);
  if (!isWall(g, tx - 1, ty)) for (let y = 0; y < topH; y++) b.set(px, py + y, STONE[6]);
  if (!isWall(g, tx + 1, ty)) for (let y = 0; y < topH; y++) b.set(px + TILE - 1, py + y, STONE[1]);
  if (!face) return;
  for (let x = 0; x < TILE; x++) { b.set(px + x, py + 11, STONE[6]); b.set(px + x, py + 12, STONE[2]); }
  for (let y = 13; y < TILE; y++) for (let x = 0; x < TILE; x++) { // 벽돌줄: 두 단, 엇갈린 이음매
    const row = y < 18 ? 0 : 1, seam = (x + row * 6 + (tx & 1) * 3) % 12 === 0 || y === 18;
    const n = vnoise(px + x, py + y, 3, 54);
    b.set(px + x, py + y, y >= TILE - 1 ? '#050706' : seam ? STONE[0] : y === 13 || y === 19 ? STONE[4] : n > 0.7 ? STONE[4] : n < 0.25 ? STONE[2] : STONE[3]);
  }
  for (let x = 0; x < TILE; x++) if ((h2(px + x, py, 55) % 5) === 0) for (let k = 0; k < 1 + (h2(px + x, py, 56) % 3); k++) b.set(px + x, py + 13 + k, MOSS[1 + (k === 0)]); // 늘어진 이끼
}

// 납골당 입구 계단: 돌 문틀 + 어둠으로 내려가는 계단 + 양옆 작은 기둥
function crypt(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  b.rect(px + 2, py + 2, 20, 20, STONE[3]);
  b.rect(px + 5, py + 6, 14, 15, '#020304');
  for (let s = 0; s < 4; s++) for (let x = px + 6 + s; x < px + 18 - s; x++) {
    const y = py + 8 + s * 3;
    b.set(x, y, pick(STONE, 5 - s * 1.2)); b.set(x, y + 1, STONE[Math.max(0, 2 - s)]);
  }
  for (let x = px + 2; x < px + 22; x++) { b.set(x, py + 2, STONE[8]); b.set(x, py + 3, STONE[6]); b.set(x, py + 21, STONE[0]); b.set(x, py + 5, STONE[1]); }
  for (let y = py + 2; y < py + 22; y++) { b.set(px + 2, y, STONE[7]); b.set(px + 21, y, STONE[1]); }
  for (const cx of [px + 3, px + 19]) for (let y = py + 4; y < py + 21; y++) { b.set(cx, y, STONE[6]); b.set(cx + 1, y, STONE[4]); } // 기둥
  for (let x = px + 7; x < px + 17; x++) b.set(x, py + 4, (x - px) % 3 ? STONE[2] : STONE[0]); // 문틀 위 새김
  for (const [x, y] of [[3, 20], [4, 19], [20, 8], [19, 9], [2, 12]]) b.set(px + x, py + y, MOSS[2]);
}

// ---- 위로 솟는 것 (매 프레임) ----
const sprites = new Map();
function cached(k, make) { if (!sprites.has(k)) sprites.set(k, make()); return sprites.get(k); }

// 묘비: 둥근 머리 돌비석 (왼쪽 위가 밝음) + 받침돌 + 글자 홈. 변형 3 (금·이끼·기울기). lit = 혼불이 핀 묘비 (글자 홈이 푸르게)
function tombSprite(v, lit) {
  return cached(`tomb${v}${lit ? 'L' : ''}`, () => {
    const b = buffer(24, 30);
    const L = 5, R = 18, top = 1 + (v === 2 ? 1 : 0), base = 22, r = (R - L + 1) / 2, cx = (L + R) / 2;
    const inside = (x, y) => x >= L && x <= R && y >= top && y <= base && (y >= top + r || Math.hypot(x - cx, y - (top + r)) <= r + 0.3);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 24; x++) {
      if (!inside(x, y)) continue;
      const n = (vnoise(x + v * 30, y, 3, 61) - 0.5) * 1.6;
      let lv = 5 + n;
      if (!inside(x - 1, y) || !inside(x, y - 1)) lv = 7.6; // 빛 받는 왼쪽·윗면 테두리
      else if (!inside(x - 2, y) || !inside(x, y - 2)) lv += 1.2;
      else if (!inside(x + 1, y)) lv = 2;
      else if (!inside(x + 2, y)) lv -= 1.4;
      b.set(x, y, pick(STONE, lv));
    }
    // 글자 홈: 가로줄 3개 + 위에 작은 원 (홈은 어둡고 아래 픽셀이 밝음 — 새긴 느낌)
    const groove = lit ? '#9cf0ff' : STONE[1], glint = lit ? '#2a70c8' : STONE[6];
    const ring = [[11, 7], [12, 7], [10, 8], [13, 8], [10, 9], [13, 9], [11, 10], [12, 10]];
    for (const [x, y] of ring) { b.set(x, y + (v === 2 ? 1 : 0), groove); }
    for (const [y, a, z] of [[13, 8, 15], [15, 8, 15], [17, 9, 14], [19, 10, 13]]) for (let x = a; x <= z; x++) { b.set(x, y, groove); b.set(x, y + 1, glint); }
    if (v === 0) for (const [x, y] of [[15, 5], [15, 6], [14, 7], [14, 8], [15, 9], [16, 10]]) b.set(x, y + 1, STONE[0]); // 금
    for (let y = top; y <= base; y++) for (let x = L; x <= R; x++) { // 이끼: 아래쪽·왼쪽 모서리에 모임
      if (!inside(x, y)) continue;
      const m = vnoise(x + v * 13, y, 3, 62) + (y - top) / 40 + (x < L + 3 ? 0.12 : 0) + (v === 1 ? 0.12 : 0);
      if (m > 1.02) b.set(x, y, m > 1.1 ? MOSS[3] : MOSS[2]);
    }
    for (let x = L - 2; x <= R + 2; x++) for (let y = base + 1; y <= base + 4; y++) { // 받침돌
      b.set(x, y, y === base + 1 ? STONE[7] : x === L - 2 ? STONE[6] : x === R + 2 ? STONE[2] : y === base + 4 ? STONE[1] : STONE[4]);
    }
    outline(b, '#050608');
    for (let y = base + 3; y < 30; y++) for (let x = 2; x < 24; x++) { const e = ((x - 14) / 10) ** 2 + ((y - (base + 5)) / 2.2) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#020302', 0.5); }
    return b.canvas();
  });
}

// 마른 나무: 비틀린 회갈색 줄기 + 앙상한 가지
function treeSprite(v) {
  return cached(`tree${v}`, () => {
    const b = buffer(28, 40);
    const bark = ['#1c1814', '#2a241d', '#3a3228', '#4d4436', '#625746'];
    const branch = (x, y, ang, len, wd) => {
      for (let i = 0; i < len; i++) {
        const bx = Math.round(x + Math.cos(ang) * i), by = Math.round(y - Math.sin(ang) * i), half = Math.max(0, Math.round(wd * (1 - i / len)));
        for (let k = -half; k <= half; k++) b.set(bx + k, by, k < 0 ? bark[3] : k === 0 ? bark[2] : bark[1]);
        if (i === Math.floor(len * 0.6) && len > 6) branch(bx, by, ang + ((h2(bx, by, v) & 1) ? 0.7 : -0.7), Math.floor(len * 0.5), 0);
      }
    };
    for (let y = 36; y > 16; y--) { // 줄기 (살짝 휨)
      const sx = 14 + Math.round(Math.sin(y * 0.25 + v) * 1.5), half = y > 32 ? 3 : 2;
      for (let k = -half; k <= half; k++) b.set(sx + k, y, k <= -half + 1 ? bark[4] : k < half ? bark[2] : bark[0]);
    }
    for (let x = 9; x < 20; x++) if (Math.abs(x - 14) < 6 - (x & 1)) b.set(x, 37, bark[1]); // 뿌리
    branch(14, 18, 1.2 + (v % 3) * 0.1, 14, 1); branch(13, 22, 2.5, 10, 1); branch(15, 24, 0.5, 9, 0); branch(14, 17, 1.9, 9, 0);
    outline(b, '#060504');
    for (let y = 35; y < 40; y++) for (let x = 4; x < 28; x++) { const e = ((x - 16) / 10) ** 2 + ((y - 38) / 2) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#020302', 0.5); }
    return b.canvas();
  });
}

// 부서진 비석 더미 ('^' 험지): 쓰러진 비석 조각 + 돌멩이
function rubbleSprite(v) {
  return cached(`rubble${v}`, () => {
    const b = buffer(24, 24);
    const pieces = [[[5, 14, 9, 5, 0.25], [15, 17, 5, 4, 0]], [[4, 15, 7, 4, -0.3], [12, 13, 7, 5, 0.4], [17, 19, 3, 3, 0]], [[7, 16, 11, 4, -0.15], [6, 10, 4, 4, 0]]][v % 3];
    const inside = (x, y) => pieces.some(([px, py, w, hh, a]) => { const dx = x - px, dy = y - py - dx * a; return dx >= 0 && dx < w && dy >= 0 && dy < hh; });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (!inside(x, y)) continue;
      let lv = 4.6 + (vnoise(x + v * 9, y, 3, 71) - 0.5) * 1.6;
      if (!inside(x, y - 1)) lv = 7.4; else if (!inside(x - 1, y)) lv = 6.4; else if (!inside(x, y + 1) || !inside(x + 1, y)) lv = 2;
      b.set(x, y, vnoise(x, y + v * 5, 3, 72) > 0.74 ? MOSS[2] : pick(STONE, lv));
    }
    outline(b, '#050608');
    for (let y = 16; y < 24; y++) for (let x = 2; x < 24; x++) { const e = ((x - 13) / 10) ** 2 + ((y - 21) / 2.4) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#020302', 0.45); }
    return b.canvas();
  });
}

const view = (grid, camX, camY, viewW, viewH) => {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  return { x0, y0, x1, y1, sx: x0 * TILE, sy: y0 * TILE, sw: (x1 - x0 + 1) * TILE, sh: (y1 - y0 + 1) * TILE };
};

// 바닥 + 묘비·나무·비석 더미 (유닛 아래). lit = "x,y" → 혼불이 핀 묘비
export function drawGraveyardMap(ctx, grid, ground, camX, camY, viewW, viewH, time = 0, lit = new Set()) {
  const { x0, y0, x1, y1, sx, sy, sw, sh } = view(grid, camX, camY, viewW, viewH);
  ctx.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(grid[0].length - 1, x1 + 1); x++) {
    const ch = grid[y][x], v = hashXY(x, y);
    if (ch === 'T') ctx.drawImage(tombSprite(v % 3, lit.has(`${x},${y}`)), x * TILE, y * TILE - 6);
    else if (ch === '^') ctx.drawImage(rubbleSprite(v % 3), x * TILE, y * TILE);
    else if (ch === '#' && isTree(grid, x, y)) ctx.drawImage(treeSprite(v % 3), x * TILE - 2, y * TILE - 16);
  }
}

// 혼불: 묘비 위 일렁이는 청백 불꽃 (날씨·안개 위에 그림 — 안개 속에서도 보임). wisps = [{x, y}]
export function drawWisps(ctx, wisps, time = 0) {
  for (const w of wisps) {
    const bx = w.x * TILE + 12, by = w.y * TILE - 6, ph = hashXY(w.x, w.y) % 100 / 100 * 6.28;
    const glowR = 20 + Math.sin(time * 3 + ph) * 2;
    const g = ctx.createRadialGradient(bx, by + 2, 1, bx, by + 2, glowR);
    g.addColorStop(0, 'rgba(110,190,255,0.38)'); g.addColorStop(0.5, 'rgba(60,130,240,0.14)'); g.addColorStop(1, 'rgba(40,90,220,0)');
    ctx.fillStyle = g; ctx.fillRect(bx - glowR, by + 2 - glowR, glowR * 2, glowR * 2);
    // 불꽃: 아래 둥글고 위로 갈수록 가늘게 흔들림 (픽셀 단위 행)
    const H = 17 + Math.round(Math.sin(time * 5 + ph) * 1.5);
    for (let i = 0; i < H; i++) {
      const k = i / H, half = Math.round((k < 0.35 ? Math.sqrt(k / 0.35) : 1 - (k - 0.35) / 0.65) * 5.2);
      const sway = Math.round(Math.sin(time * 7 + ph + i * 0.45) * k * 2.2), y = by + 6 - i;
      for (let x = -half; x <= half; x++) {
        const d = Math.abs(x) / Math.max(1, half);
        ctx.fillStyle = k > 0.78 ? WISP.outer : d > 0.7 ? WISP.outer : d > 0.35 || k > 0.55 ? WISP.mid : WISP.core;
        ctx.fillRect(bx + x + sway, y, 1, 1);
      }
    }
    for (let e = 0; e < 3; e++) { // 떠오르는 불티
      const t = (time * 0.8 + e / 3 + ph) % 1, ex = bx + Math.round(Math.sin(t * 9 + e * 2 + ph) * 4), ey = by - 4 - Math.round(t * 14);
      ctx.globalAlpha = 1 - t; ctx.fillStyle = e ? WISP.mid : WISP.core; ctx.fillRect(ex, ey, 1, 1); ctx.globalAlpha = 1;
    }
  }
}

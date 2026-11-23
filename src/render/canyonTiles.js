// 협곡 지형 그림 (픽셀 단위로 직접 찍음). 바닥 한 장(풀밭·흙길·붉은 바위 능선 윗면·층진 절벽면·덩굴·낭떠러지 단면·개울·풀숲·계단)은 맵마다 굽고,
// 나무·바위·낭떠러지 안개·물 반짝임은 매 프레임. 스펙 docs/superpowers/specs/2026-11-23-canyon-design.md
import { buffer, outline, h2, hashXY } from './cityTiles.js';

const TILE = 24, FACE = 15; // 절벽면 높이: 고지 칸 아래 칸의 윗부분에 걸쳐 그림
const GRASS = ['#24331b', '#2d3f21', '#374d28', '#425c2f', '#4f6c37', '#5f7f41', '#74954f'];
const DIRT = ['#4a3826', '#5a4630', '#6b553a', '#7d6646', '#8e7752'];
const ROCK = ['#3a1f17', '#52291c', '#693524', '#7f432d', '#955338', '#a96545', '#bd7a56', '#d0926b', '#e2ad86'];
const STRATA = ['#5a2c1e', '#74392a', '#8c4a33', '#a35c3f', '#7a3f2c'];
const WATER = { d: '#1c4a6e', m: '#26608a', l: '#3478a6', hi: '#7cc0e4', foam: '#d8eef8' };
const SAND = ['#8a7552', '#a08a62', '#b49e72'];
const VINE = ['#1c3a18', '#2a5422', '#3c722e', '#58923e', '#7ab252'];
const VOID = ['#050407', '#0b0910', '#141019', '#1f1823'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function vnoise(x, y, sc, seed = 0) {
  const fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
  const s = (q) => q * q * (3 - 2 * q), r = (i, j) => (h2(x0 + i, y0 + j, seed) % 1000) / 1000;
  return (r(0, 0) * (1 - s(u)) + r(1, 0) * s(u)) * (1 - s(v)) + (r(0, 1) * (1 - s(u)) + r(1, 1) * s(u)) * s(v);
}
const at = (g, x, y) => g[y]?.[x];
const pick = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.round(v)))];
const isH = (g, x, y) => at(g, x, y) === 'H';

export function bakeCanyonGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  for (let py = 0; py < h * TILE; py++) for (let px = 0; px < w * TILE; px++) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE), ch = grid[ty][tx], dz = dither(px, py);
    if (ch === 'H') { b.set(px, py, ridgeTop(px, py, dz)); continue; }
    // 저지: 마른 풀밭 + 흙길 (큰 잡음 띠)
    const big = vnoise(px, py, 30, 11), fine = vnoise(px, py, 5, 12);
    let c = pick(GRASS, 3 + (big - 0.5) * 2.4 + (fine - 0.5) * 1.4 + (dz - 0.5) * 0.5);
    const path = vnoise(px, py, 22, 13) * 0.8 + vnoise(px, py, 6, 14) * 0.2;
    if (path > 0.7 || (path > 0.665 && dz < (path - 0.665) * 28)) c = pick(DIRT, 2 + (fine - 0.5) * 2 + (dz - 0.5) * 0.6);
    else { const k = h2(px, py, 15) % 37; if (k === 0) c = GRASS[6]; else if ((h2(px, py - 1, 15) % 37) === 0) c = GRASS[5]; }
    if ((h2(px, py, 16) & 1023) === 3) c = ['#e8d870', '#e0a0b0', '#f0f0e0'][h2(px, py, 17) % 3]; // 들꽃
    b.set(px, py, c);
    if (ch === '~') water(b, grid, px, py, tx, ty, dz);
    if (ch === 'X' && ty > 0 && isH(grid, tx, ty - 1)) b.set(px, py, VOID[0]);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = grid[y][x];
    if (ch === '"') bush(b, x, y);
    else if (ch === 'X') chasm(b, grid, x, y);
    else if (ch === '>') stairs(b, x, y);
  }
  // 절벽면: 고지 칸 바로 아래(고지가 아닌 칸)의 윗부분 — 층진 붉은 바위, 아래로 갈수록 어둡게. 덩굴 칸은 덩굴이 타고 내려옴
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isH(grid, x, y) && !isH(grid, x, y + 1) && y + 1 < h) face(b, grid, x, y + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === '|') vine(b, x, y);
  // 고지 가장자리: 왼쪽·위 밝은 테두리, 오른쪽 어두운 테두리 (능선이 도드라지게)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isH(grid, x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (y > 0 && !isH(grid, x, y - 1)) for (let i = 0; i < TILE; i++) { b.set(px + i, py, ROCK[8]); b.set(px + i, py + 1, ROCK[7]); }
    if (x > 0 && !isH(grid, x - 1, y)) for (let j = 0; j < TILE; j++) { b.set(px, py + j, ROCK[2]); b.set(px + 1, py + j, ROCK[4]); }
    if (x < w - 1 && !isH(grid, x + 1, y)) for (let j = 0; j < TILE; j++) { b.set(px + TILE - 1, py + j, ROCK[7]); }
    if (!isH(grid, x, y + 1) && y + 1 < h) for (let i = 0; i < TILE; i++) { b.set(px + i, py + TILE - 1, ROCK[8]); b.set(px + i, py + TILE - 2, ROCK[7]); } // 벼랑 끝 밝은 턱
  }
  return b.canvas();
}

// 능선 윗면: 큰 바위판 결 + 금 + 마른 풀 포기
function slab(px, py) { // 불규칙한 바위판 (보로노이): 가장자리까지 거리 · 판 번호
  const S = 20, tx = Math.floor(px / S), ty = Math.floor(py / S);
  let d1 = Infinity, d2 = Infinity, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (tx + i) * S + (h2(tx + i, ty + j, 27) % (S - 2)) + 1, cy = (ty + j) * S + (h2(tx + i, ty + j, 28) % (S - 2)) + 1;
    const d = Math.hypot(px - cx, py - cy);
    if (d < d1) { d2 = d1; d1 = d; id = h2(tx + i, ty + j, 29); } else if (d < d2) d2 = d;
  }
  return { edge: d2 - d1, id };
}
function ridgeTop(px, py, dz) {
  const { edge, id } = slab(px, py), big = vnoise(px, py, 24, 21), fine = vnoise(px, py, 3, 22);
  let lv = 5 + (id % 3) * 0.5 - 0.5 + (big - 0.5) * 1.4 + (fine - 0.5) * 1.2 + (dz - 0.5) * 0.5;
  const wob = edge + (vnoise(px, py, 4, 23) - 0.5) * 1.6;
  if (wob < 0.9) lv = 2.4; else if (wob < 1.7) lv -= 1; else if (wob < 2.6) lv += 0.8; // 판 사이 틈 · 틈 옆 그늘 · 판 모서리 빛
  let c = pick(ROCK, lv);
  if ((h2(px, py, 26) & 255) === 0) c = ROCK[8]; // 반짝 결정
  const tuft = vnoise(px, py, 9, 24);
  if (tuft > 0.8 && wob < 3 && (h2(px, py, 25) % 2) === 0) c = tuft > 0.86 ? '#9aa850' : '#76843c'; // 틈에 난 마른 풀
  return c;
}

function face(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, chasmBelow = at(g, tx, ty) === 'X';
  const hgt = chasmBelow ? TILE : FACE;
  for (let y = 0; y < hgt; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, band = Math.floor((wy + Math.floor(vnoise(wx, 0, 9, 31) * 4)) / 3) % STRATA.length;
    let c = STRATA[band];
    const n = vnoise(wx, wy, 3, 32);
    if (n > 0.72) c = ROCK[5]; else if (n < 0.22) c = ROCK[2];
    if ((h2(wx, wy, 33) % 11) === 0) c = ROCK[1]; // 바위 결 점
    if (x === 0 && !isH(g, tx - 1, ty - 1)) c = ROCK[4];
    const dark = y / hgt; // 아래로 어두워짐 (낭떠러지면 끝은 어둠)
    b.set(wx, wy, c);
    if (dark > 0.55) b.mix(wx, wy, chasmBelow ? VOID[0] : '#1a120c', chasmBelow ? Math.min(1, (dark - 0.55) * 2.4) : (dark - 0.55) * 0.9);
  }
  if (!chasmBelow) for (let x = 0; x < TILE; x++) { b.mix(px + x, py + FACE, '#0e0a06', 0.5); b.mix(px + x, py + FACE + 1, '#0e0a06', 0.25); } // 절벽 밑 그림자
}

// 덩굴: 절벽면(위 칸과 맞닿은 부분)부터 칸 아래까지 늘어진 줄기 3가닥 + 잎
function vine(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let k = 0; k < 3; k++) {
    let x = px + 4 + k * 7 + (h2(tx, ty, 40 + k) % 3);
    const len = 17 + (h2(tx, ty, 43 + k) % 6);
    for (let y = -3; y < len; y++) {
      if ((h2(tx * 7 + k, y, 46) % 6) === 0) x += (h2(tx, y + k, 49) & 1) ? 1 : -1;
      b.set(x - 1, py + y, VINE[0]); b.set(x, py + y, VINE[2]); b.set(x + 1, py + y, VINE[1]);
      if ((y + k * 3) % 5 === 0) for (const [lx, ly, c] of [[-3, 0, 3], [-2, -1, 4], [-2, 0, 3], [-2, 1, 2], [2, 1, 3], [3, 0, 4], [3, 1, 3], [3, 2, 2]]) b.set(x + lx, py + y + ly, VINE[c]); // 잎 두 장
    }
    for (const [lx, ly, c] of [[-1, 0, 3], [0, 0, 4], [1, 0, 3], [0, 1, 2]]) b.set(x + lx, py + len + ly, VINE[c]); // 끝 잎
  }
}

// 낭떠러지: 칸 가장자리가 들쭉날쭉한 깊은 틈. 이웃이 땅인 쪽은 갈라진 단면(바위 턱), 안쪽은 어둠
function chasm(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, solid = (dx, dy) => { const t = at(g, tx + dx, ty + dy); return t !== undefined && t !== 'X'; };
  const L = solid(-1, 0), R = solid(1, 0), U = solid(0, -1), D = solid(0, 1), underRidge = U && isH(g, tx, ty - 1);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, j = (vnoise(wx, wy, 5, 51) - 0.5) * 7 + (vnoise(wx, wy, 2, 54) - 0.5) * 2;
    const dl = L ? x + 2 + j : 99, dr = R ? TILE - 1 - x + 2 + j : 99, du = underRidge ? 99 : U ? y + 2 + j : 99, dd = D ? TILE - 1 - y + 2 + j : 99;
    const d = Math.min(dl, dr, du, dd);
    if (underRidge && y < FACE) continue; // 능선 아래: 절벽면(face)이 어둠까지 이어짐
    if (d < 3) continue; // 바깥: 풀밭 그대로 (가장자리가 들쭉날쭉)
    if (d < 4) { b.set(wx, wy, dd === d ? DIRT[4] : dl === d ? ROCK[6] : ROCK[3]); continue; } // 갈라진 땅 끝
    if (du < 11 && du === d) { // 먼 쪽 단면: 위 땅에서 내려가는 바위벽 (층 무늬, 아래로 어둠)
      const band = Math.floor((wy + Math.floor(vnoise(wx, 0, 9, 52) * 3)) / 2) % STRATA.length;
      b.set(wx, wy, STRATA[band]); b.mix(wx, wy, VOID[0], Math.min(1, (du - 4) / 7 + 0.1)); continue;
    }
    if (dl < 7 && dl === d) { b.set(wx, wy, ROCK[2]); b.mix(wx, wy, VOID[0], (dl - 4) / 3 * 0.8 + 0.2); continue; } // 옆 단면
    const deep = vnoise(wx, wy, 8, 53);
    b.set(wx, wy, d < 6 ? VOID[3] : d < 8 ? VOID[2] : deep > 0.6 ? VOID[1] : VOID[0]);
  }
}

function water(b, g, px, py, tx, ty, dz) {
  const lx = px - tx * TILE + 0.5, ly = py - ty * TILE + 0.5, dry = (dx, dy) => { const t = at(g, tx + dx, ty + dy); return t !== undefined && t !== '~'; };
  const e = Math.min(dry(-1, 0) ? lx : 99, dry(1, 0) ? TILE - lx : 99, dry(0, -1) ? ly : 99, dry(0, 1) ? TILE - ly : 99) + (vnoise(px, py, 4, 61) - 0.5) * 3;
  if (e < 1.2) return;
  if (e < 3) { b.set(px, py, SAND[e < 2 ? 2 : 1]); return; } // 모래 물가
  const depth = vnoise(px, py, 16, 62), flow = Math.sin(py * 0.9 + vnoise(px, py, 10, 63) * 9 + px * 0.05); // 가로로 흐르는 물결 줄
  let c = depth > 0.62 ? WATER.d : depth > 0.35 ? WATER.m : WATER.l;
  if (flow > 0.93 && (h2(px, py, 64) % 3)) c = WATER.hi; else if (flow > 0.8 && dz < 0.4) c = WATER.l;
  if (e < 4.4) c = dz < 0.5 ? WATER.foam : WATER.l; // 물가 거품
  b.set(px, py, c);
}

function bush(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE, v = h2(tx, ty, 71);
  const blobs = [[8 + (v % 3), 10, 8], [16 - (v >> 3) % 3, 12, 8], [12, 17, 7]];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let best = -1;
    for (const [cx, cy, r] of blobs) best = Math.max(best, 1 - Math.hypot(x - cx, (y - cy) * 1.15) / r);
    if (best < 0) continue;
    const lit = blobs.reduce((s, [cx, cy]) => s + (cx - x) * 0.5 + (cy - y), 0) / blobs.length + (vnoise(px + x, py + y, 3, 72) - 0.5) * 5;
    b.set(px + x, py + y, best < 0.12 ? GRASS[0] : lit > 3 ? '#8aa858' : lit > 0 ? GRASS[6] : lit > -3 ? GRASS[4] : GRASS[2]);
  }
}

// 계단: 바위 틈으로 내려가는 돌계단
function stairs(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  b.rect(px + 3, py + 3, 18, 18, VOID[1]);
  for (let s = 0; s < 4; s++) for (let x = px + 4 + s; x < px + 20 - s; x++) {
    const y = py + 5 + s * 4;
    b.set(x, y, pick(ROCK, 7 - s * 1.3)); b.set(x, y + 1, ROCK[Math.max(1, 4 - s)]); b.set(x, y + 2, VOID[0]);
  }
  for (let y = py + 2; y < py + 22; y++) { b.set(px + 2, y, ROCK[7]); b.set(px + 21, y, ROCK[2]); }
  for (let x = px + 2; x < px + 22; x++) { b.set(x, py + 2, ROCK[8]); b.set(x, py + 21, ROCK[1]); }
}

// ---- 위로 솟는 것 (매 프레임) ----
const sprites = new Map();
function cached(k, make) { if (!sprites.has(k)) sprites.set(k, make()); return sprites.get(k); }

// 나무: 둥근 수관 (왼쪽 위가 밝음) + 짧은 줄기
function treeSprite(v) {
  return cached(`tree${v}`, () => {
    const b = buffer(28, 34);
    const blobs = [[14, 12, 10], [9 + (v % 2), 16, 7], [19 - (v % 3), 16, 7], [14, 7, 6]];
    for (let y = 24; y < 32; y++) for (let x = 12; x < 16; x++) b.set(x, y, x === 12 ? '#7a5a3a' : x < 15 ? '#5a4028' : '#3a2818');
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      let best = -1;
      for (const [cx, cy, r] of blobs) best = Math.max(best, 1 - Math.hypot(x - cx, y - cy) / r);
      if (best < 0) continue;
      const lit = (14 - x) * 0.45 + (10 - y) * 0.7 + (vnoise(x + v * 30, y, 3, 81) - 0.5) * 6;
      b.set(x, y, lit > 5 ? '#9ac060' : lit > 1 ? '#6e9c44' : lit > -3 ? '#4d7a32' : lit > -7 ? '#375c26' : '#264218');
    }
    outline(b, '#10180a');
    for (let y = 29; y < 34; y++) for (let x = 4; x < 28; x++) { const e = ((x - 15) / 10) ** 2 + ((y - 31.5) / 2) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#0a0804', 0.4); }
    return b.canvas();
  });
}

// 바위: 붉은 바위 덩이
function rockSprite(v) {
  return cached(`rock${v}`, () => {
    const b = buffer(26, 26);
    const shapes = [[[12, 15, 8, 7], [18, 19, 5, 4]], [[10, 16, 7, 6], [17, 15, 5, 6]], [[13, 17, 9, 6], [8, 13, 4, 4]]][v % 3];
    const inside = (x, y) => y <= 22 && shapes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
      if (!inside(x, y)) continue;
      let c = (h2(x >> 2, y >> 2, v) & 1) ? ROCK[4] : ROCK[3];
      if (!inside(x, y - 1)) c = ROCK[7]; else if (!inside(x, y - 2)) c = ROCK[6]; else if (!inside(x - 1, y)) c = ROCK[5];
      else if (!inside(x + 2, y) || !inside(x, y + 2)) c = ROCK[1]; else if ((h2(x, y, v + 7) & 15) === 0) c = ROCK[2];
      b.set(x, y, c);
    }
    outline(b, '#1a0c08');
    for (let y = 18; y < 26; y++) for (let x = 2; x < 26; x++) { const e = ((x - 14) / 11) ** 2 + ((y - 23) / 2.5) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#0a0604', 0.4); }
    return b.canvas();
  });
}

const view = (grid, camX, camY, viewW, viewH) => {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  return { x0, y0, x1, y1, sx: x0 * TILE, sy: y0 * TILE, sw: (x1 - x0 + 1) * TILE, sh: (y1 - y0 + 1) * TILE };
};

export function drawCanyonMap(ctx, grid, ground, camX, camY, viewW, viewH, time = 0) {
  const { x0, y0, x1, y1, sx, sy, sw, sh } = view(grid, camX, camY, viewW, viewH);
  ctx.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { // 낭떠러지 안개: 천천히 흐르는 옅은 띠
    if (grid[y][x] !== 'X') continue;
    for (let k = 0; k < 3; k++) {
      const ph = (time * 0.25 + k / 3 + (hashXY(x, y) % 100) / 100) % 1, yy = y * TILE + 20 - Math.floor(ph * 14), a = Math.sin(ph * Math.PI) * 0.22;
      ctx.fillStyle = `rgba(200,190,210,${a.toFixed(3)})`;
      ctx.fillRect(x * TILE + 3 + ((k * 7) % 10), yy, 10 + k * 2, 2);
    }
  }
  ctx.fillStyle = WATER.foam;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { // 개울 반짝임
    if (grid[y][x] !== '~') continue;
    const v = hashXY(x, y), ph = (time * 0.6 + (v % 97) / 97) % 1;
    if (ph < 0.15) ctx.fillRect(x * TILE + 5 + (v >> 4) % 14, y * TILE + 6 + (v >> 9) % 12, 3, 1);
  }
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(grid[0].length - 1, x1 + 1); x++) {
    const ch = grid[y][x], v = hashXY(x, y);
    if (ch === '#') ctx.drawImage(treeSprite(v % 3), x * TILE - 2, y * TILE - 10);
    else if (ch === '^') ctx.drawImage(rockSprite(v % 3), x * TILE - 1, y * TILE - 2);
  }
}

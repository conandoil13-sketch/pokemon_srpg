// 얼음동굴 지형 그림 (픽셀 단위로 직접 찍음). 바닥 한 장(서리 낀 돌판·눈 쌓인 자리·지하 호수·얼음 결정 벽·계단)은 맵마다 굽고,
// 빙판(격자가 바뀌면 다시 구움 — 얼음 타입이 물을 얼림)·반짝임·바위·고드름·눈더미는 매 프레임. 스펙 docs/superpowers/specs/2026-11-23-ice-cave-design.md
// 다른 맵에서 얼음 타입이 얼린 칸은 drawFrozen 으로 그 맵 그림 위에 덧그림
import { buffer, outline, h2, hashXY } from './cityTiles.js';

const TILE = 24;
const STONE = ['#151c27', '#1c2533', '#242f40', '#2d3a4d', '#38475b', '#46586d', '#5a6e84', '#7488a0'];
const SNOW = ['#eef6fc', '#d4e4f2', '#b2c8dc', '#8aa2bc', '#647c98'];
const ICE = { rim: '#1f4466', crack: '#2e6a96', deep: '#4a8cc0', mid: '#72b2dc', light: '#a6d8f2', hi: '#dcf4ff', white: '#ffffff' };
const WATER = { d: '#08122a', m: '#0e1c40', l: '#18305e', hi: '#46689c' };
const WALL = { top: '#2a3648', topL: '#36465c', topHi: '#52677f', edge: '#0a0f17', face: '#1c2636', faceL: '#28364a', band: '#141c28', cr: '#7cc4e8', crHi: '#d8f6ff', crD: '#3a7aa8' };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function vnoise(x, y, sc, seed = 0) {
  const fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
  const s = (q) => q * q * (3 - 2 * q), r = (i, j) => (h2(x0 + i, y0 + j, seed) % 1000) / 1000;
  return (r(0, 0) * (1 - s(u)) + r(1, 0) * s(u)) * (1 - s(v)) + (r(0, 1) * (1 - s(u)) + r(1, 1) * s(u)) * s(v);
}
const at = (g, x, y) => g[y]?.[x];
const isWall = (g, x, y) => { const c = at(g, x, y); return c === undefined || c === '#'; };
const clampS = (v) => STONE[Math.max(0, Math.min(STONE.length - 1, Math.round(v)))];

// 서리 낀 돌판: 큼직한 판 + 판 사이 금
function slab(px, py) {
  const S = 22, tx = Math.floor(px / S), ty = Math.floor(py / S);
  let d1 = Infinity, d2 = Infinity, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (tx + i) * S + (h2(tx + i, ty + j, 41) % (S - 2)) + 1, cy = (ty + j) * S + (h2(tx + i, ty + j, 42) % (S - 2)) + 1;
    const d = Math.hypot(px - cx, py - cy);
    if (d < d1) { d2 = d1; d1 = d; id = h2(tx + i, ty + j, 43); } else if (d < d2) d2 = d;
  }
  return { edge: d2 - d1, id };
}

export function bakeIceGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  for (let py = 0; py < h * TILE; py++) for (let px = 0; px < w * TILE; px++) {
    const ch = grid[Math.floor(py / TILE)][Math.floor(px / TILE)];
    if (ch === '#') continue;
    if (ch === '~') { // 짙은 남색 지하 호수 (잔잔한 물결)
      const r = Math.sin(px * 0.22 + py * 0.1) + Math.sin(py * 0.31 - px * 0.08) * 0.8 + (vnoise(px, py, 9, 51) - 0.5);
      b.set(px, py, r > 1.45 ? WATER.hi : r > 0.55 ? WATER.l : r < -1.2 ? WATER.d : WATER.m);
      continue;
    }
    const { edge, id } = slab(px, py), dz = dither(px, py);
    let lv = 3.1 + (id % 3) * 0.35 + (vnoise(px, py, 8, 44) - 0.5) * 1.3 + (vnoise(px, py, 30, 45) - 0.5) * 1.1 + (dz - 0.5) * 0.4;
    const wob = edge + (vnoise(px, py, 4, 46) - 0.5) * 1.4;
    if (wob < 0.9 && (id & 3)) lv = 1.2; else if (wob < 1.8) lv -= 0.8; else if (wob < 2.6) lv += 0.6;
    let c = clampS(lv);
    const snow = vnoise(px, py, 30, 47) * 0.8 + vnoise(px, py, 9, 48) * 0.2; // 군데군데 쌓인 눈 (부드러운 가장자리)
    if (snow > 0.7) c = snow > 0.735 ? (vnoise(px - 2, py - 2, 30, 47) * 0.8 + vnoise(px - 2, py - 2, 9, 48) * 0.2 < 0.735 ? SNOW[0] : SNOW[1]) : snow > 0.715 ? SNOW[2] : SNOW[3];
    else if ((h2(px, py, 49) & 63) === 0) c = SNOW[3]; // 서리 알갱이
    b.set(px, py, c);
  }
  // 그림자 (빛은 왼쪽 위): 벽 아래·오른쪽
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isWall(grid, x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (isWall(grid, x, y - 1)) for (let j = 0; j < 7; j++) for (let i = 0; i < TILE; i++) b.mix(px + i, py + j, '#04070d', 0.55 - j * 0.07);
    if (isWall(grid, x - 1, y)) for (let i = 0; i < 5; i++) for (let j = 0; j < TILE; j++) b.mix(px + i, py + j, '#04070d', 0.4 - i * 0.08);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] === '#') wall(b, grid, x, y);
    else if (grid[y][x] === '>') stairs(b, x, y);
  }
  return b.canvas();
}

// ---- 벽: 푸른 회색 암벽 (윗면에 눈·서리, 앞면에 얼음 결정이 박힘) ----
function wall(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, face = !isWall(g, tx, ty + 1), topH = face ? 12 : TILE;
  for (let y = 0; y < topH; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, n = (vnoise(wx, wy, 5, 61) - 0.5) * 2.6 + (vnoise(wx, wy, 13, 62) - 0.5) * 1.6;
    const snow = vnoise(wx, wy, 11, 63);
    b.set(wx, wy, snow > 0.68 ? (snow > 0.74 ? SNOW[1] : SNOW[3]) : n > 1 ? WALL.topHi : n > -0.3 ? WALL.topL : WALL.top);
  }
  if (!isWall(g, tx, ty - 1)) for (let x = 0; x < TILE; x++) { b.set(px + x, py, SNOW[1]); b.set(px + x, py + 1, SNOW[3]); }
  if (!isWall(g, tx - 1, ty)) for (let y = 0; y < topH; y++) b.set(px, py + y, WALL.topHi);
  if (!isWall(g, tx + 1, ty)) for (let y = 0; y < topH; y++) b.set(px + TILE - 1, py + y, WALL.edge);
  if (!face) return;
  for (let x = 0; x < TILE; x++) { b.set(px + x, py + 12, SNOW[2]); b.set(px + x, py + 13, WALL.faceL); }
  for (let y = 14; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = vnoise(px + x, py + y, 4, 64);
    b.set(px + x, py + y, y >= TILE - 2 ? WALL.edge : n > 0.62 ? WALL.faceL : n < 0.3 ? WALL.band : WALL.face);
  }
  // 얼음 결정: 앞면에서 비스듬히 솟은 육각 기둥 1~2개
  const v = h2(tx, ty, 65);
  for (let k = 0; k < 1 + (v & 1); k++) {
    const cx = px + 4 + ((v >> (3 + k * 4)) % 15), base = py + TILE - 3, ht = 6 + ((v >> (9 + k)) % 5), wd = 2 + ((v >> 12) & 1);
    for (let y = 0; y < ht; y++) {
      const half = y > ht - 3 ? Math.max(0, wd - (y - (ht - 3))) : wd;
      for (let x = -half; x <= half; x++) b.set(cx + x + Math.floor(y / 4), base - y, x < 0 ? WALL.crHi : x === 0 ? WALL.cr : WALL.crD);
    }
  }
}

function stairs(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  b.rect(px + 3, py + 3, 18, 18, '#04070d');
  for (let s = 0; s < 4; s++) for (let x = px + 4 + s; x < px + 20 - s; x++) {
    const y = py + 5 + s * 4;
    b.set(x, y, s < 1 ? SNOW[1] : s < 2 ? STONE[6] : s < 3 ? STONE[5] : STONE[4]); b.set(x, y + 1, STONE[2]); b.set(x, y + 2, '#04070d');
  }
  for (let y = py + 2; y < py + 22; y++) { b.set(px + 2, y, STONE[6]); b.set(px + 21, y, STONE[1]); }
  for (let x = px + 2; x < px + 22; x++) { b.set(x, py + 2, SNOW[1]); b.set(x, py + 21, STONE[0]); }
  for (const [x, y] of [[5, 3], [9, 3], [14, 3], [18, 3], [3, 8], [20, 12]]) b.set(px + x, py + y, SNOW[0]); // 계단 턱의 눈
}

// ---- 빙판: 지금 격자의 '_' 칸 (얼면 다시 구움) ----
let iceCache = { key: null, canvas: null };
function iceLayer(grid) {
  const key = grid.join('|');
  if (iceCache.key === key) return iceCache.canvas;
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  const ice = (x, y) => at(grid, x, y) === '_';
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (!ice(tx, ty)) continue;
    const U = !ice(tx, ty - 1), D = !ice(tx, ty + 1), L = !ice(tx - 1, ty), Rt = !ice(tx + 1, ty), RAD = 6;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const px = tx * TILE + x, py = ty * TILE + y, dz = dither(px, py);
      // 둘레까지 거리 (바깥 모서리는 둥글게 깎음)
      let d = Math.min(U ? y : 99, D ? TILE - 1 - y : 99, L ? x : 99, Rt ? TILE - 1 - x : 99);
      const cx = L && x < RAD ? RAD - x : Rt && x > TILE - 1 - RAD ? x - (TILE - 1 - RAD) : 0, cy = U && y < RAD ? RAD - y : D && y > TILE - 1 - RAD ? y - (TILE - 1 - RAD) : 0;
      if (cx && cy) d = Math.min(d, RAD - Math.hypot(cx, cy));
      if (d < 0) continue;
      const depth = vnoise(px, py, 20, 71) * 0.65 + vnoise(px, py, 7, 72) * 0.35; // 얼음 속 짙고 옅은 결
      let c = depth > 0.64 ? ICE.light : depth > 0.47 ? ICE.mid : depth > 0.4 && dz < 0.5 ? ICE.mid : ICE.deep;
      const sheen = (px * 0.8 + py * 0.6 + vnoise(px, py, 12, 73) * 10) % 52; // 비스듬한 윤기 띠
      if (sheen < 1.6) c = ICE.hi; else if (sheen < 3.4) c = ICE.light;
      const cr = Math.abs(vnoise(px, py, 15, 74) - 0.5); // 가는 금
      if (cr < 0.016 && vnoise(px, py, 33, 75) > 0.5) c = ICE.crack;
      if ((h2(px, py, 76) & 255) === 0) c = ICE.white; // 갇힌 공기 방울
      // 둘레: 어두운 테 → 서리 낀 밝은 띠 (빛은 왼쪽 위 — 아래·오른쪽 띠는 어둡게)
      const lowSide = (D && TILE - 1 - y <= d + 0.5) || (Rt && TILE - 1 - x <= d + 0.5);
      if (d < 1) c = ICE.rim;
      else if (d < 2) c = lowSide ? ICE.crack : ICE.white;
      else if (d < 4 && !lowSide && dz < 0.7 - (d - 2) * 0.25) c = ICE.hi;
      else if (d < 3 && lowSide) c = ICE.deep;
      b.set(px, py, c);
    }
  }
  iceCache = { key, canvas: b.canvas() };
  return iceCache.canvas;
}

// ---- 위로 솟는 것 ----
const sprites = new Map();
function cached(k, make) { if (!sprites.has(k)) sprites.set(k, make()); return sprites.get(k); }

// 바위: 푸른 회색 + 눈 모자
function rockSprite(v) {
  return cached(`rock${v}`, () => {
    const b = buffer(26, 28);
    const shapes = [[[12, 16, 8, 8], [18, 21, 5, 4]], [[10, 17, 7, 7], [17, 15, 5, 7]], [[13, 18, 9, 6], [9, 13, 5, 4]]][v % 3];
    const inside = (x, y) => y <= 24 && shapes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
    for (let y = 0; y < 28; y++) for (let x = 0; x < 26; x++) {
      if (!inside(x, y)) continue;
      let c = STONE[4];
      const top = !inside(x, y - 3) || !inside(x, y - 2);
      if (!inside(x, y - 1)) c = SNOW[0];
      else if (top) c = (h2(x, y, v) & 3) ? SNOW[1] : SNOW[2];
      else if (!inside(x - 1, y)) c = STONE[6];
      else if (!inside(x - 2, y)) c = STONE[5];
      else if (!inside(x + 2, y) || !inside(x, y + 2)) c = STONE[2];
      else if ((h2(x, y, v + 7) & 15) === 0) c = STONE[6];
      b.set(x, y, c);
    }
    outline(b, '#060a10');
    for (let y = 19; y < 28; y++) for (let x = 2; x < 26; x++) { const e = ((x - 15) / 11) ** 2 + ((y - 25) / 3) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#04070d', 0.45); }
    return b.canvas();
  });
}

// 고드름 바위: 위로 솟은 뾰족한 얼음 기둥 3~4개 (왼쪽이 밝음)
function icicleSprite(v) {
  return cached(`icicle${v}`, () => {
    const b = buffer(26, 32);
    const spikes = [[[8, 13, 4], [14, 22, 5], [19, 15, 4]], [[7, 16, 4], [12, 24, 4], [18, 19, 5], [22, 11, 3]], [[9, 20, 5], [16, 25, 5], [21, 14, 3]]][v % 3];
    for (const [cx, ht, half] of spikes) for (let y = 0; y < ht; y++) {
      const w = Math.max(0, Math.round(half * (1 - y / ht) + 0.3)), yy = 29 - y;
      for (let x = -w; x <= w; x++) {
        const c = y >= ht - 2 ? ICE.white : x < -w / 2 ? ICE.hi : x <= 0 ? ICE.light : x < w ? ICE.mid : ICE.deep;
        b.set(cx + x, yy, c);
      }
    }
    for (let x = 4; x < 24; x++) for (let y = 27; y < 31; y++) if (((x - 14) / 10) ** 2 + ((y - 29) / 2) ** 2 <= 1) b.set(x, y, y < 29 ? SNOW[1] : SNOW[3]); // 밑동의 눈
    outline(b, '#0a1a2c');
    for (let y = 26; y < 32; y++) for (let x = 2; x < 26; x++) { const e = ((x - 15) / 12) ** 2 + ((y - 30) / 2) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#04070d', 0.45); }
    return b.canvas();
  });
}

// 눈더미: 둥근 눈 언덕
function snowSprite(v) {
  return cached(`snow${v}`, () => {
    const b = buffer(24, 22);
    const rx = 10 + (v % 2), ry = 8;
    for (let y = 0; y < 22; y++) for (let x = 0; x < 24; x++) {
      const e = ((x - 12) / rx) ** 2 + ((y - 13) / ry) ** 2 + (((x - 8 - v) / 5) ** 2 + ((y - 9) / 4) ** 2 <= 1 ? -1 : 0);
      if (e > 1) continue;
      const l = (12 - x) * 0.6 + (13 - y);
      b.set(x, y, l > 8 ? SNOW[0] : l > 2 ? SNOW[1] : l > -4 ? SNOW[2] : SNOW[3]);
    }
    for (const [x, y] of [[9, 7], [14, 10], [6, 12]]) if (b.has(x, y)) b.set(x, y, '#ffffff');
    outline(b, '#2c3c52');
    return b.canvas();
  });
}

// 반짝임: 빙판 칸마다 가끔 4갈래 별
function sparkles(ctx, grid, x0, y0, x1, y1, time) {
  ctx.fillStyle = ICE.white;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (grid[y][x] !== '_') continue;
    const v = hashXY(x, y), ph = (time * 0.45 + (v % 97) / 97) % 1;
    if (ph > 0.2) continue;
    const r = ph < 0.1 ? 1 + Math.floor(ph * 20) : Math.max(0, 3 - Math.floor((ph - 0.1) * 30));
    const sx = x * TILE + 4 + (v >> 4) % 16, sy = y * TILE + 4 + (v >> 9) % 16;
    ctx.fillRect(sx - r, sy, r * 2 + 1, 1); ctx.fillRect(sx, sy - r, 1, r * 2 + 1);
  }
}

const view = (grid, camX, camY, viewW, viewH) => {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  return { x0, y0, x1, y1, sx: x0 * TILE, sy: y0 * TILE, sw: (x1 - x0 + 1) * TILE, sh: (y1 - y0 + 1) * TILE };
};

// 다른 맵: 얼음 타입이 얼린 칸만 덧그림 (호출 측 translate)
export function drawFrozen(ctx, grid, camX, camY, viewW, viewH, time = 0) {
  const { x0, y0, x1, y1, sx, sy, sw, sh } = view(grid, camX, camY, viewW, viewH);
  ctx.drawImage(iceLayer(grid), sx, sy, sw, sh, sx, sy, sw, sh);
  sparkles(ctx, grid, x0, y0, x1, y1, time);
}

export function drawIceMap(ctx, grid, ground, camX, camY, viewW, viewH, time = 0) {
  const { x0, y0, x1, y1, sx, sy, sw, sh } = view(grid, camX, camY, viewW, viewH);
  ctx.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);
  ctx.drawImage(iceLayer(grid), sx, sy, sw, sh, sx, sy, sw, sh);
  sparkles(ctx, grid, x0, y0, x1, y1, time);
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= x1; x++) {
    const ch = grid[y][x], v = hashXY(x, y);
    if (ch === '^') ctx.drawImage(rockSprite(v % 3), x * TILE - 1, y * TILE - 4);
    else if (ch === 'Y') ctx.drawImage(icicleSprite(v % 3), x * TILE - 1, y * TILE - 8);
    else if (ch === '*') ctx.drawImage(snowSprite(v % 3), x * TILE, y * TILE + 2);
  }
}

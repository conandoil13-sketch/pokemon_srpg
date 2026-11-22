// 해변 지형 그림: pixelfx 해변 타일(src/fx-custom/beach/tiles.js)을 구워서 그린다.
// 바닥(모래·계단)은 맵마다 한 장으로 굽고, 물은 물때에 따라 바뀌므로 매 프레임 지금 격자대로 칸마다 그린다. 위로 솟는 것(야자수·풀·바위·더미)은 위 줄부터.
import { createFrame, clearFrame, createFx, composite } from '../vendor/pixelfx/core/index.js';
import * as beach from '../fx-custom/beach/tiles.js';

const TILE = 24, [FW, FH] = beach.meta.size, [OX, OY] = beach.meta.origin;
const hashXY = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ 83492791) >>> 0;
const WATER = ',~';

function bake(piece, variant = 0, seed = 1, wx = 0, wy = 0) {
  const frame = createFrame(FW, FH); clearFrame(frame);
  createFx(beach, { piece, variant, seed, wx, wy, x: OX, y: OY }).draw(frame, 'front');
  const img = new ImageData(FW, FH); composite(frame, img.data, null);
  const c = document.createElement('canvas'); c.width = FW; c.height = FH; c.getContext('2d').putImageData(img, 0, 0); return c;
}
const pieces = new Map();
const piece = (p, v, s = 1, wx = 0, wy = 0) => { const k = `${p}/${v}/${s}/${wx}/${wy}`; if (!pieces.has(k)) pieces.set(k, bake(p, v, s, wx, wy)); return pieces.get(k); };
const blitAt = (g, img, x, y) => g.drawImage(img, x * TILE + TILE / 2 - OX, (y + 1) * TILE - OY);

// 모래 바닥 한 장 (계단 포함). 물 칸도 모래로 깔아 둠 — 물때로 물이 빠지면 그대로 보임
export function bakeBeachGround(grid) {
  const h = grid.length, w = grid[0].length;
  const c = document.createElement('canvas'); c.width = w * TILE; c.height = h * TILE;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = hashXY(x, y);
    blitAt(g, bake('sand', r % 7 === 0 ? 2 : r % 3 === 0 ? 1 : 0, r % 5 + 1, x, y), x, y);
    if (grid[y][x] === '>') blitAt(g, piece('stairs', 0), x, y);
  }
  return c;
}

// 물 한 장: 칸마다 깊이(얕은 물 1, 깊은 물 = 1 + 땅에서 떨어진 칸 수)를 픽셀 단위로 이어 붙여 에메랄드 → 청록 → 짙은 바다로.
// 4×4 바이어 디더로 단계 사이를 섞고, 잔물결 반짝임. 물때가 3가지뿐이라 격자 글자열로 캐시
const RAMP = ['#e6fff6', '#aaf3df', '#6fe2cc', '#3cc9bd', '#22a8b0', '#16879f', '#0f6a8a', '#0b5274'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const waterCache = new Map();
export function waterDepths(grid) {
  const h = grid.length, w = grid[0].length, D = grid.map((r) => [...r].map((c) => (WATER.includes(c) ? Infinity : 0)));
  const q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (D[y][x] === 0) q.push([x, y]);
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (D[ny]?.[nx] === Infinity) { D[ny][nx] = D[y][x] + 1; q.push([nx, ny]); } } }
  return grid.map((r, y) => [...r].map((c, x) => (c === ',' ? 1 : c === '~' ? Math.min(6, Math.max(2, D[y][x] === Infinity ? 6 : D[y][x])) : 0.2))); // 땅 0.2 · 얕은 물 1 · 깊은 물 2~6
}
function waterLayer(grid) {
  const k = grid.join('|');
  if (waterCache.has(k)) return waterCache.get(k);
  const h = grid.length, w = grid[0].length, dep = waterDepths(grid);
  const c = document.createElement('canvas'); c.width = w * TILE; c.height = h * TILE;
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
  const at = (x, y) => dep[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))];
  for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (!WATER.includes(grid[ty][tx])) continue;
    const fx = px / TILE - 0.5, fy = py / TILE - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const depth = (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - v) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * v;
    const wave = Math.sin(px * 0.21 + py * 0.07) * 0.18 + Math.sin(py * 0.19 - px * 0.06 + 2) * 0.16;
    const f = 0.6 + (depth - 1) * 1.15 + wave + (BAYER[(py & 3) * 4 + (px & 3)] - 0.5) * 0.9;
    let i = Math.max(0, Math.min(RAMP.length - 1, Math.round(f)));
    if (Math.sin(px * 0.33 + py * 0.11) + Math.sin(px * 0.07 - py * 0.29) > 1.85) i = Math.max(0, i - 2); // 반짝이는 잔물결
    const o = (py * c.width + px) * 4, [r, gg, b] = RAMP[i];
    d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  waterCache.set(k, c);
  if (waterCache.size > 6) waterCache.delete(waterCache.keys().next().value);
  return c;
}

// 보이는 범위만 (호출 측에서 translate 한 상태)
export function drawBeachMap(ctx, grid, ground, camX, camY, viewW, viewH) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  const wet = (x, y) => WATER.includes(grid[y]?.[x] ?? '~');
  const water = waterLayer(grid); // 물 (지금 물때 그대로)
  ctx.drawImage(water, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  ctx.fillStyle = '#f6fffc'; // 물가 거품: 땅과 닿은 변에 점선
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!wet(x, y)) continue;
    for (let k = (x + y) & 1; k < TILE; k += 3) {
      if (!wet(x, y - 1)) ctx.fillRect(x * TILE + k, y * TILE, 2, 1);
      if (!wet(x, y + 1)) ctx.fillRect(x * TILE + k, y * TILE + TILE - 1, 2, 1);
      if (!wet(x - 1, y)) ctx.fillRect(x * TILE, y * TILE + k, 1, 2);
      if (!wet(x + 1, y)) ctx.fillRect(x * TILE + TILE - 1, y * TILE + k, 1, 2);
    }
  }
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 2); y++) for (let x = x0; x <= x1; x++) { // 아래 두 줄 더 (야자수가 위로 솟음)
    const ch = grid[y][x], r = hashXY(x, y);
    if (ch === '#') blitAt(ctx, piece('palm', r % 3, r % 7 + 1), x, y);
    else if (ch === '"') blitAt(ctx, piece('grass', r % 3, r % 5 + 1), x, y);
    else if (ch === '^') blitAt(ctx, piece([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => WATER.includes(grid[y + dy]?.[x + dx] ?? '.')) ? 'reef' : 'rock', r % 2, r % 5 + 1), x, y);
    else if (ch === '*') blitAt(ctx, piece('pile', r % 3, r % 5 + 1), x, y);
  }
}

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

// 보이는 범위만 (호출 측에서 translate 한 상태)
export function drawBeachMap(ctx, grid, ground, camX, camY, viewW, viewH) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  const wet = (x, y) => WATER.includes(grid[y]?.[x] ?? '~');
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { // 물 (지금 물때 그대로)
    const ch = grid[y][x];
    if (!WATER.includes(ch)) continue;
    blitAt(ctx, piece(ch === ',' ? 'shallow' : 'deep', 0, 1, x, y), x, y);
    ctx.fillStyle = '#e8f8f4'; // 물가 거품: 땅과 닿은 변
    if (!wet(x, y - 1)) ctx.fillRect(x * TILE, y * TILE, TILE, 2);
    if (!wet(x, y + 1)) ctx.fillRect(x * TILE, y * TILE + TILE - 2, TILE, 2);
    if (!wet(x - 1, y)) ctx.fillRect(x * TILE, y * TILE, 2, TILE);
    if (!wet(x + 1, y)) ctx.fillRect(x * TILE + TILE - 2, y * TILE, 2, TILE);
  }
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 2); y++) for (let x = x0; x <= x1; x++) { // 아래 두 줄 더 (야자수가 위로 솟음)
    const ch = grid[y][x], r = hashXY(x, y);
    if (ch === '#') blitAt(ctx, piece('palm', r % 3, r % 7 + 1), x, y);
    else if (ch === '"') blitAt(ctx, piece('grass', r % 3, r % 5 + 1), x, y);
    else if (ch === '^') blitAt(ctx, piece([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => WATER.includes(grid[y + dy]?.[x + dx] ?? '.')) ? 'reef' : 'rock', r % 2, r % 5 + 1), x, y);
    else if (ch === '*') blitAt(ctx, piece('pile', r % 3, r % 5 + 1), x, y);
  }
}

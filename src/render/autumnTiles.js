// 단풍 숲 지형 그림: pixelfx 단풍 타일(src/fx-custom/autumn/tiles.js)을 구워서 그린다.
// 바닥 층(바닥·단풍길·연못·계단)은 맵마다 한 장으로 미리 굽고, 위로 솟는 것(나무·억새·바위·낙엽더미)은 위 줄부터 칸마다 그린다.
import { createFrame, clearFrame, createFx, composite } from '../vendor/pixelfx/core/index.js';
import * as autumn from '../fx-custom/autumn/tiles.js';

const TILE = 24, [FW, FH] = autumn.meta.size, [OX, OY] = autumn.meta.origin;
const LP_V = [0, 0, 1, 1, 2, 3, 4, 0, 1, 2]; // 단풍길 변형 섞는 비율 (빨강·주황 위주)
const hashXY = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ 83492791) >>> 0;

function bake(piece, variant = 0, seed = 1, wx = 0, wy = 0) {
  const frame = createFrame(FW, FH); clearFrame(frame);
  createFx(autumn, { piece, variant, seed, wx, wy, x: OX, y: OY }).draw(frame, 'front');
  const img = new ImageData(FW, FH); composite(frame, img.data, null);
  const c = document.createElement('canvas'); c.width = FW; c.height = FH; c.getContext('2d').putImageData(img, 0, 0); return c;
}
const pieces = new Map();
const piece = (p, v, s = 1, wx = 0, wy = 0) => { const k = `${p}/${v}/${s}/${wx}/${wy}`; if (!pieces.has(k)) pieces.set(k, bake(p, v, s, wx, wy)); return pieces.get(k); };
const blitAt = (g, img, x, y) => g.drawImage(img, x * TILE + TILE / 2 - OX, (y + 1) * TILE - OY);

// 바닥 층 한 장 (grid = 처음 지형, route = 단풍길 칸 Set)
export function bakeAutumnGround(grid, route) {
  const h = grid.length, w = grid[0].length;
  const c = document.createElement('canvas'); c.width = w * TILE; c.height = h * TILE;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => route.has(`${x + dx},${y + dy}`));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = grid[y][x], r = hashXY(x, y), onRoute = route.has(`${x},${y}`) && ch !== '~';
    blitAt(g, bake(onRoute ? 'leafpath' : near(x, y) ? 'leafspill' : r % 9 === 0 ? 'leafpile' : 'ground', onRoute ? LP_V[(r >>> 4) % LP_V.length] : r % 3, r % 5 + 1, x, y), x, y); // 칸 좌표로 무늬를 이음
    if (ch === '~') {
      blitAt(g, bake('pond', r % 2, r % 4 + 1, x, y), x, y);
      g.fillStyle = '#5a4428'; // 물가: 땅 쪽 가장자리
      if (grid[y - 1]?.[x] !== '~') g.fillRect(x * TILE, y * TILE, TILE, 2);
      if (grid[y + 1]?.[x] !== '~') g.fillRect(x * TILE, y * TILE + TILE - 2, TILE, 2);
      if (grid[y][x - 1] !== '~') g.fillRect(x * TILE, y * TILE, 2, TILE);
      if (grid[y][x + 1] !== '~') g.fillRect(x * TILE + TILE - 2, y * TILE, 2, TILE);
    }
    if (ch === '>') blitAt(g, piece('stairs', 0), x, y);
  }
  return c;
}

// 보이는 범위만 (호출 측에서 translate 한 상태). ground = bakeAutumnGround 결과
export function drawAutumnMap(ctx, grid, ground, camX, camY, viewW, viewH) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 2); y++) for (let x = x0; x <= x1; x++) { // 아래 두 줄 더 (나무가 위로 솟음)
    const ch = grid[y][x], r = hashXY(x, y);
    if (ch === '#') blitAt(ctx, piece('tree', r % 3, r % 7 + 1), x, y);
    else if (ch === '"') blitAt(ctx, piece('bush', r % 3, r % 5 + 1, x, y), x, y);
    else if (ch === '^') blitAt(ctx, piece('rock', r % 3, r % 5 + 1), x, y);
    else if (ch === '*') blitAt(ctx, piece('pile', r % 3, r % 5 + 1, x, y), x, y);
  }
}

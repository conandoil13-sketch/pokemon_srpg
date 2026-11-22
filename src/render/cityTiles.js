// ???시티 지형 그림 (캔버스에 직접): 도로·보도·건물(지붕 + 앞면)·화단·계단은 맵마다 한 장으로 굽고,
// 가로수·쓰레기통·워프 타일은 매 프레임 (가로수는 위로 솟고, 워프는 깜빡임). 스펙 docs/superpowers/specs/2026-11-22-city-design.md
const TILE = 24;
const hashXY = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ 83492791) >>> 0;
const ROOFS = [ // [지붕, 밝은 테, 난간, 벽, 창문]
  ['#8c6c5c', '#a88a78', '#5c4438', '#c8b8a0', '#f0d878'],
  ['#5c6c80', '#7a8ca0', '#3a4658', '#b8c0c8', '#a8d8f0'],
  ['#6c7c5c', '#8a9a78', '#46523a', '#c8c4b0', '#f0e8a0'],
  ['#7c5c70', '#9a7a8c', '#523a4a', '#d0c0c8', '#f8c8a0'],
];
const isB = (grid, x, y) => grid[y]?.[x] === 'B';

function road(g, x, y) {
  const px = x * TILE, py = y * TILE;
  g.fillStyle = '#5a5e66'; g.fillRect(px, py, TILE, TILE);
  for (let i = 0; i < 18; i++) { // 아스팔트 자갈
    const h = hashXY(x * 31 + i, y * 17 - i);
    g.fillStyle = h % 3 ? '#50545c' : '#686c74';
    g.fillRect(px + (h % TILE), py + ((h >>> 5) % TILE), 1, 1);
  }
}
function sidewalk(g, x, y) {
  const px = x * TILE, py = y * TILE;
  g.fillStyle = '#a8a498'; g.fillRect(px, py, TILE, TILE);
  g.fillStyle = '#8e8a7e';
  for (let k = 0; k < TILE; k += 12) { g.fillRect(px + k, py, 1, TILE); g.fillRect(px, py + k, TILE, 1); } // 보도블록 줄눈
  g.fillStyle = '#bcb8ac'; g.fillRect(px + 1, py + 1, 10, 1); g.fillRect(px + 13, py + 13, 10, 1);
}
function flowerbed(g, x, y) {
  const px = x * TILE, py = y * TILE, r = hashXY(x, y);
  g.fillStyle = '#6a5038'; g.fillRect(px, py, TILE, TILE);
  g.fillStyle = '#4c8a3c'; g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  g.fillStyle = '#68ac4c';
  for (let i = 0; i < 10; i++) { const h = hashXY(x + i * 7, y - i * 3); g.fillRect(px + 3 + (h % 17), py + 3 + ((h >>> 6) % 17), 2, 2); }
  const petals = ['#f87890', '#f8e058', '#f8f8f0'];
  for (let i = 0; i < 5; i++) { const h = hashXY(x * 3 + i, y * 5 + i); g.fillStyle = petals[(r + i) % 3]; g.fillRect(px + 4 + (h % 15), py + 4 + ((h >>> 7) % 15), 2, 2); }
}
function stairs(g, x, y) {
  const px = x * TILE, py = y * TILE;
  g.fillStyle = '#2a2a30'; g.fillRect(px + 3, py + 3, 18, 18);
  const shades = ['#d8d4c8', '#b0aca0', '#88847a', '#646058'];
  for (let s = 0; s < 4; s++) { g.fillStyle = shades[s]; g.fillRect(px + 4 + s * 2, py + 4 + s * 4, 16 - s * 4, 3); }
  g.fillStyle = '#f0c040'; g.fillRect(px + 3, py + 3, 18, 1); g.fillRect(px + 3, py + 20, 18, 1); // 노란 테
}

// 건물 하나 (왼쪽 위 칸 x0,y0 · 3×2). 지붕이 위 1⅔ 칸, 앞면(창문 벽)이 아래 8픽셀 — 옥상 = 건물 칸 전체
function building(g, x0, y0) {
  const [roof, lit, rim, wall, win] = ROOFS[hashXY(x0, y0) % ROOFS.length];
  const px = x0 * TILE, py = y0 * TILE, w = 3 * TILE, h = 2 * TILE, face = 9;
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px + w, py + 4, 4, h); g.fillRect(px + 4, py + h, w, 3); // 그림자 (오른쪽·아래)
  g.fillStyle = rim; g.fillRect(px, py, w, h - face);
  g.fillStyle = roof; g.fillRect(px + 2, py + 2, w - 4, h - face - 4);
  g.fillStyle = lit; g.fillRect(px + 2, py + 2, w - 4, 1);
  g.fillStyle = 'rgba(0,0,0,0.08)'; for (let yy = py + 6; yy < py + h - face - 2; yy += 5) g.fillRect(px + 3, yy, w - 6, 1); // 옥상 바닥 이음
  const r = hashXY(x0 * 7, y0 * 11);
  if (r % 2) { g.fillStyle = '#9aa0a8'; g.fillRect(px + 8 + (r % 30), py + 6, 10, 7); g.fillStyle = '#6a7078'; g.fillRect(px + 8 + (r % 30), py + 12, 10, 1); g.fillRect(px + 10 + (r % 30), py + 8, 6, 1); } // 환기구
  else { g.fillStyle = '#4a7aa8'; g.fillRect(px + 46 - (r % 20), py + 5, 9, 9); g.fillStyle = '#7aa8d0'; g.fillRect(px + 46 - (r % 20), py + 5, 9, 2); g.fillStyle = '#2c4c70'; g.fillRect(px + 47 - (r % 20), py + 14, 1, 2); g.fillRect(px + 53 - (r % 20), py + 14, 1, 2); } // 물탱크
  g.fillStyle = wall; g.fillRect(px, py + h - face, w, face); // 앞면
  g.fillStyle = rim; g.fillRect(px, py + h - face, w, 1); g.fillRect(px, py + h - 1, w, 1);
  for (let k = 0; k < 6; k++) { g.fillStyle = (hashXY(x0 + k, y0) % 4) ? win : '#58606c'; g.fillRect(px + 4 + k * 11, py + h - face + 2, 7, 4); } // 창문 (불 꺼진 곳 섞음)
}

export function bakeCityGround(grid) {
  const h = grid.length, w = grid[0].length;
  const c = document.createElement('canvas'); c.width = w * TILE; c.height = h * TILE;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const nearB = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isB(grid, x + dx, y + dy)) return true; return false; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = grid[y][x];
    if (ch === 'B') continue;
    if (nearB(x, y)) sidewalk(g, x, y); else road(g, x, y);
    if (ch === '"') flowerbed(g, x, y);
    else if (ch === '>') stairs(g, x, y);
    else if (ch === '.' && !nearB(x, y) && hashXY(x, y) % 19 === 0) { g.fillStyle = '#3e4248'; g.fillRect(x * TILE + 7, y * TILE + 7, 10, 10); g.fillStyle = '#747880'; g.fillRect(x * TILE + 8, y * TILE + 9, 8, 1); g.fillRect(x * TILE + 8, y * TILE + 13, 8, 1); } // 맨홀
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isB(grid, x, y) && !isB(grid, x - 1, y) && !isB(grid, x, y - 1)) building(g, x, y);
  return c;
}

function tree(ctx, x, y) {
  const px = x * TILE, py = y * TILE, v = hashXY(x, y) % 3;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 5, py + 19, 14, 3);
  ctx.fillStyle = '#6a4a2c'; ctx.fillRect(px + 10, py + 10, 4, 11);
  ctx.fillStyle = ['#2e6a34', '#356e2c', '#2a6040'][v]; ctx.fillRect(px + 3, py - 6, 18, 18); ctx.fillRect(px + 5, py - 8, 14, 22);
  ctx.fillStyle = ['#48923e', '#56963a', '#3e8a54'][v]; ctx.fillRect(px + 5, py - 5, 12, 10);
  ctx.fillStyle = '#7cc05c'; ctx.fillRect(px + 7, py - 4, 4, 2);
}
function trashCan(ctx, x, y) {
  const px = x * TILE + 6, py = y * TILE + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(px - 1, py + 16, 14, 3);
  ctx.fillStyle = '#2a4a34'; ctx.fillRect(px, py + 3, 12, 14);
  ctx.fillStyle = '#3e7050'; ctx.fillRect(px + 1, py + 4, 10, 12);
  ctx.fillStyle = '#5a9a6c'; ctx.fillRect(px + 2, py + 5, 2, 10);
  ctx.fillStyle = '#20382a'; ctx.fillRect(px - 1, py, 14, 4);
  ctx.fillStyle = '#4a8060'; ctx.fillRect(px, py + 1, 12, 2);
}
const WARP_RGB = { blue: ['#2050c0', '#70b8ff'], orange: ['#c05010', '#ffb050'] };
function warpPad(ctx, w, time) {
  const px = w.x * TILE, py = w.y * TILE, [dark, glow] = WARP_RGB[w.color] ?? WARP_RGB.blue, on = Math.floor(time * 3 + w.x + w.y) % 3 !== 0;
  ctx.fillStyle = '#20242c'; ctx.fillRect(px + 3, py + 3, 18, 18);
  ctx.fillStyle = dark; ctx.fillRect(px + 4, py + 4, 16, 16);
  ctx.fillStyle = on ? glow : dark; ctx.fillRect(px + 6, py + 6, 12, 2); ctx.fillRect(px + 6, py + 16, 12, 2); ctx.fillRect(px + 6, py + 6, 2, 12); ctx.fillRect(px + 16, py + 6, 2, 12);
  ctx.fillStyle = '#ffffff'; if (on) ctx.fillRect(px + 11, py + 11, 2, 2);
}

// 보이는 범위만 (호출 측에서 translate 한 상태). warps = state.warps
export function drawCityMap(ctx, grid, ground, camX, camY, viewW, viewH, warps = [], time = 0) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  for (const w of warps) if (w.x >= x0 && w.x <= x1 && w.y >= y0 && w.y <= y1) warpPad(ctx, w, time);
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = x0; x <= x1; x++) { // 아래 한 줄 더 (가로수가 위로 솟음)
    const ch = grid[y][x];
    if (ch === '#') tree(ctx, x, y);
    else if (ch === '*') trashCan(ctx, x, y);
  }
}

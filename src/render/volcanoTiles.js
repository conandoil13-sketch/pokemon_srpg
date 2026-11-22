// 화산동굴 지형 그림 (픽셀 단위로 직접 찍음). 바닥 한 장(화산암 판·균열·현무암의 붉은 틈·용암 가장자리 빛·검은 벽·물·계단)은 맵마다 굽고,
// 용암(흐르는 무늬, 8프레임 미리 구움)·바위·분출구(예고 김·분출 스팀 기둥)·스팀 예고 칸은 매 프레임. 스펙 docs/superpowers/specs/2026-11-23-volcano-design.md
import { buffer, outline, h2, hashXY } from './cityTiles.js';

const TILE = 24;
const ROCK = ['#1c1716', '#262020', '#302826', '#3b312d', '#473b35', '#56483f', '#6a584c'];
const WALL = { top: '#2c2422', topL: '#3c312c', topHi: '#544238', edge: '#120e0e', face: '#1e1818', faceL: '#2a2220', band: '#171212' };
const LAVA = ['#3a0804', '#6a1206', '#9c2208', '#cc3c0c', '#ec6418', '#ff9a2c', '#ffd060', '#fff2b0'];
const BAS = { a: '#1a1616', b: '#221c1b', hi: '#36302d', crack: '#ff7a1c', crackD: '#a8300a' };
const WATER = { d: '#0c2a30', m: '#123c44', l: '#1e5a60', hi: '#5a9a96' };
const STEAM = '#f4f0ea';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// 값 잡음 (부드럽게 보간, 0..1)
function vnoise(x, y, sc, seed = 0) {
  const fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
  const s = (q) => q * q * (3 - 2 * q), r = (i, j) => (h2(x0 + i, y0 + j, seed) % 1000) / 1000;
  return (r(0, 0) * (1 - s(u)) + r(1, 0) * s(u)) * (1 - s(v)) + (r(0, 1) * (1 - s(u)) + r(1, 1) * s(u)) * s(v);
}
const at = (g, x, y) => g[y]?.[x];
const isWall = (g, x, y) => { const c = at(g, x, y); return c === undefined || c === '#' || c === 'V'; };
const clampR = (v) => ROCK[Math.max(0, Math.min(ROCK.length - 1, Math.round(v)))];

// 용암까지 거리(픽셀 근사): 칸 가운데 기준 가까운 용암 칸 — 가장자리 빛
function lavaNear(grid) {
  const cells = [];
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) if (grid[y][x] === 'L') cells.push([x * TILE + TILE / 2, y * TILE + TILE / 2]);
  return (px, py) => { let d = Infinity; for (const [cx, cy] of cells) { const dx = Math.max(0, Math.abs(px - cx) - TILE / 2), dy = Math.max(0, Math.abs(py - cy) - TILE / 2); if (dx < 12 && dy < 12) d = Math.min(d, Math.hypot(dx, dy)); } return d; };
}

// 화산암 바닥: 큼직한 판(보로노이 비슷하게 칸마다 중심점) + 판 사이 어두운 금 + 거친 얼룩
function floorShade(px, py) {
  const S = 26, tx = Math.floor(px / S), ty = Math.floor(py / S);
  let d1 = Infinity, d2 = Infinity, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (tx + i) * S + (h2(tx + i, ty + j, 1) % (S - 2)) + 1, cy = (ty + j) * S + (h2(tx + i, ty + j, 2) % (S - 2)) + 1;
    const d = Math.hypot(px - cx, py - cy);
    if (d < d1) { d2 = d1; d1 = d; id = h2(tx + i, ty + j, 3); } else if (d < d2) d2 = d;
  }
  return { edge: d2 - d1, id };
}

export function bakeVolcanoGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE), near = lavaNear(grid);
  for (let py = 0; py < h * TILE; py++) for (let px = 0; px < w * TILE; px++) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE), ch = grid[ty][tx];
    if (ch === '#' || ch === 'V' || ch === 'L') continue;
    if (ch === '~') { // 어둡고 김 서린 물
      const r = Math.sin(px * 0.3 + py * 0.12) + Math.sin(py * 0.4 - px * 0.1);
      b.set(px, py, r > 1.5 ? WATER.hi : r > 0.6 ? WATER.l : (px + py) % 7 === 0 ? WATER.d : WATER.m);
      continue;
    }
    const { edge, id } = floorShade(px, py), dz = dither(px, py);
    const rough = vnoise(px, py, 7, 4) + vnoise(px, py, 23, 5) * 0.8;
    let lv = 2.2 + (id % 3) * 0.35 + rough * 1.3 + (dz - 0.5) * 0.45;
    const wob = edge + (vnoise(px, py, 4, 6) - 0.5) * 1.6; // 금을 울퉁불퉁하게
    if (wob < 0.9 && (id & 3)) lv = 0.8; else if (wob < 1.8) lv -= 0.8; else if (wob < 2.6) lv += 0.5; // 판 사이 금 (일부만 깊게) + 윗턱
    if ((h2(px, py, 9) & 63) === 0) lv += 1.2; // 반짝이는 광물
    let c = clampR(lv);
    if (ch === 'v') { // 현무암: 더 검고, 판 사이 금이 붉게 빛남
      c = edge < 1.3 ? (id & 1 ? BAS.crack : BAS.crackD) : edge < 2.3 ? BAS.crackD : edge < 3.3 ? BAS.hi : (id % 3 === 0 ? BAS.a : BAS.b);
      if (edge >= 2.3 && edge < 3.3 && (px + py) & 1) c = BAS.b;
    }
    b.set(px, py, c);
    const d = near(px, py); // 용암 옆 붉은 반사광
    if (d < 9) b.mix(px, py, d < 2.5 ? LAVA[5] : LAVA[3], (1 - d / 9) * (d < 2.5 ? 0.55 : 0.35) * (dz < 0.85 ? 1 : 0.5));
  }
  // 그림자 (빛은 왼쪽 위): 벽 아래·오른쪽
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isWall(grid, x, y) || grid[y][x] === 'L') continue;
    const px = x * TILE, py = y * TILE;
    if (isWall(grid, x, y - 1)) for (let j = 0; j < 7; j++) for (let i = 0; i < TILE; i++) b.mix(px + i, py + j, '#050303', 0.55 - j * 0.07);
    if (isWall(grid, x - 1, y)) for (let i = 0; i < 5; i++) for (let j = 0; j < TILE; j++) b.mix(px + i, py + j, '#050303', 0.4 - i * 0.08);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] === '#' || grid[y][x] === 'V') wall(b, grid, x, y);
    else if (grid[y][x] === '>') stairs(b, x, y);
  }
  return b.canvas();
}

// ---- 벽: 검은 화산암 덩어리 (위면 거친 결, 아래가 트이면 앞면 = 세로 주상절리) ----
function wall(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, face = !isWall(g, tx, ty + 1), topH = face ? 12 : TILE;
  for (let y = 0; y < topH; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y, n = (vnoise(wx, wy, 5, 21) - 0.5) * 2.6 + (vnoise(wx, wy, 13, 22) - 0.5) * 1.6;
    b.set(wx, wy, n > 1 ? WALL.topHi : n > -0.3 ? WALL.topL : WALL.top);
  }
  if (!isWall(g, tx, ty - 1)) for (let x = 0; x < TILE; x++) { b.set(px + x, py, WALL.topHi); b.set(px + x, py + 1, WALL.topL); }
  if (!isWall(g, tx - 1, ty)) for (let y = 0; y < topH; y++) b.set(px, py + y, WALL.topHi);
  if (!isWall(g, tx + 1, ty)) for (let y = 0; y < topH; y++) b.set(px + TILE - 1, py + y, WALL.edge);
  if (!face) return;
  for (let x = 0; x < TILE; x++) b.set(px + x, py + 12, WALL.topHi);
  for (let y = 13; y < TILE; y++) for (let x = 0; x < TILE; x++) { // 주상절리 (6px 기둥)
    const col = (x + (tx * 3)) % 6;
    b.set(px + x, py + y, y >= TILE - 2 ? WALL.edge : col === 0 ? WALL.band : col === 1 ? WALL.faceL : WALL.face);
  }
  const lavaBelow = at(g, tx, ty + 1) === 'L';
  if (lavaBelow) for (let y = 17; y < TILE; y++) for (let x = 0; x < TILE; x++) b.mix(px + x, py + y, LAVA[4], (y - 16) / 14); // 아래 용암 빛을 받음
}

function stairs(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  b.rect(px + 3, py + 3, 18, 18, '#0a0606');
  for (let s = 0; s < 4; s++) for (let x = px + 4 + s; x < px + 20 - s; x++) {
    const y = py + 5 + s * 4;
    b.set(x, y, s < 1 ? ROCK[6] : s < 2 ? ROCK[5] : s < 3 ? ROCK[4] : ROCK[3]); b.set(x, y + 1, ROCK[2]); b.set(x, y + 2, '#0a0606');
  }
  for (let y = py + 2; y < py + 22; y++) { b.set(px + 2, y, ROCK[5]); b.set(px + 21, y, ROCK[1]); }
  for (let x = px + 2; x < px + 22; x++) { b.set(x, py + 2, ROCK[6]); b.set(x, py + 21, ROCK[0]); }
  for (let x = px + 5; x < px + 19; x++) b.mix(x, py + 20, LAVA[3], 0.35); // 아래에서 올라오는 붉은 빛
}

// ---- 용암: 8프레임 미리 구운 흐르는 무늬 (지금 격자로 캐시) ----
const lavaCache = new Map();
function lavaFrames(grid) {
  const k = grid.join('|');
  if (lavaCache.has(k)) return lavaCache.get(k);
  const h = grid.length, w = grid[0].length, frames = [];
  for (let f = 0; f < 8; f++) {
    const b = buffer(w * TILE, h * TILE), ph = (f / 8) * Math.PI * 2;
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      if (grid[ty][tx] !== 'L') continue;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const px = tx * TILE + x, py = ty * TILE + y;
        // 굽이치는 흐름 + 식은 껍질(검붉은 판) — 위상은 한 바퀴로 이어짐
        const flow = Math.sin(px * 0.11 + Math.sin(py * 0.09 + ph) * 1.6 + ph) + Math.sin(py * 0.15 - px * 0.05 - ph) * 0.8;
        const wx = px + Math.sin(ph + py * 0.06) * 5, wy = py + Math.cos(ph + px * 0.05) * 5; // 위상으로 한 바퀴 도는 일렁임
        const crust = vnoise(wx, wy, 9, 11) * 0.7 + vnoise(wx, wy, 4, 12) * 0.3;
        let lv = 3.4 + flow * 1.1 + (dither(px, py) - 0.5) * 0.7;
        if (crust > 0.66) lv = crust > 0.74 ? 0.4 : 1.4; // 식은 껍질 (불규칙한 판)
        else if (crust > 0.6) lv = Math.max(lv, 5.2); // 껍질 가장자리 갈라진 밝은 틈
        const edge = (x < 2 && at(grid, tx - 1, ty) !== 'L') || (x > TILE - 3 && at(grid, tx + 1, ty) !== 'L') || (y < 2 && at(grid, tx, ty - 1) !== 'L') || (y > TILE - 3 && at(grid, tx, ty + 1) !== 'L');
        if (edge) lv = 0.6; // 둑에 붙어 식은 테두리
        b.set(px, py, LAVA[Math.max(0, Math.min(LAVA.length - 1, Math.round(lv)))]);
      }
    }
    frames.push(b.canvas());
  }
  lavaCache.set(k, frames);
  if (lavaCache.size > 4) lavaCache.delete(lavaCache.keys().next().value);
  return frames;
}

// ---- 위로 솟는 것 ----
const sprites = new Map();
function rockSprite(v) {
  const k = `rock${v}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(26, 28);
  const shapes = [[[12, 16, 8, 8], [18, 21, 5, 4]], [[10, 17, 7, 7], [17, 15, 5, 7]], [[13, 18, 9, 6], [9, 13, 5, 4]]][v % 3];
  const inside = (x, y) => y <= 24 && shapes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 26; x++) {
    if (!inside(x, y)) continue;
    let c = ROCK[3];
    if (!inside(x, y - 1) || !inside(x - 1, y)) c = ROCK[6];
    else if (!inside(x, y - 2) || !inside(x - 2, y)) c = ROCK[5];
    else if (!inside(x + 2, y) || !inside(x, y + 2)) c = ROCK[1];
    else if ((h2(x, y, v) & 15) === 0) c = ROCK[5];
    b.set(x, y, c);
  }
  outline(b, '#080505');
  for (let y = 19; y < 28; y++) for (let x = 2; x < 26; x++) { const e = ((x - 15) / 11) ** 2 + ((y - 25) / 3) ** 2; if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#050303', 0.5); }
  const c = b.canvas(); sprites.set(k, c); return c;
}

// 분출구: 벽 칸 위에 돌 굴뚝 입구 (방향 쪽 면에 검은 구멍 + 붉은 속), lit = 이번 라운드 분출
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function ventSprite(dir, lit) {
  const k = `vent${dir}${lit}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(TILE, TILE), [dx, dy] = DIRV[dir];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { // 칸을 거의 채우는 돌무덤 (빛은 왼쪽 위)
    const r = Math.hypot(x - 11.5, y - 12.5);
    if (r > 11.5) continue;
    const lit2 = (11.5 - x) + (12.5 - y);
    b.set(x, y, r > 10.5 ? '#0a0606' : lit2 > 8 ? ROCK[6] : lit2 > 2 ? ROCK[5] : lit2 > -6 ? ROCK[4] : ROCK[2]);
  }
  const cx = 12 + dx * 5, cy = 12 + dy * 5; // 방향 쪽으로 치우친 분화구
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = Math.hypot(x - cx, y - cy);
    if (r <= 5.5) b.set(x, y, r > 4.5 ? ROCK[1] : r > 3 ? (lit ? LAVA[3] : '#2a0c06') : (lit ? LAVA[5] : '#100606'));
  }
  // 방향 표시: 입구 앞으로 짧은 화살 (어두운 홈)
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) b.set(cx + dx * (8 + i) + dy * s * (2 - i), cy + dy * (8 + i) + dx * s * (2 - i), lit ? LAVA[6] : ROCK[6]);
  const c = b.canvas(); sprites.set(k, c); return c;
}

// 스팀 예고 칸: 흰 점선 테두리 + 옅은 김 (호출 측 translate 상태)
export function drawSteamWarn(ctx, cells, time) {
  if (!cells.length) return;
  const on = (Math.floor(time * 3) & 1) === 0;
  ctx.save();
  ctx.fillStyle = STEAM;
  for (const p of cells) {
    const px = p.x * TILE, py = p.y * TILE;
    ctx.globalAlpha = on ? 0.16 : 0.08; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
    ctx.globalAlpha = on ? 0.85 : 0.45;
    for (let i = 1; i < TILE - 1; i += 3) { ctx.fillRect(px + i, py + 1, 2, 1); ctx.fillRect(px + i, py + TILE - 2, 2, 1); ctx.fillRect(px + 1, py + i, 1, 2); ctx.fillRect(px + TILE - 2, py + i, 1, 2); }
  }
  ctx.restore();
}

// 김 한 덩이 (반투명 원 2~3개)
function puff(ctx, x, y, r, a) {
  ctx.globalAlpha = a; ctx.fillStyle = STEAM;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.arc(x - r * 0.6, y + r * 0.3, r * 0.7, 0, Math.PI * 2); ctx.fill();
}

// 보이는 범위만 (호출 측 translate). vents = state.vents, firing(v) = 이번 라운드 분출, steam = { vents, age } 분출 직후 연출, paths(v) = 그 분출구 스팀 칸
export function drawVolcanoMap(ctx, grid, ground, camX, camY, viewW, viewH, time = 0, vents = [], firing = () => false, steam = null, paths = () => []) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  const sx = x0 * TILE, sy = y0 * TILE, sw = (x1 - x0 + 1) * TILE, sh = (y1 - y0 + 1) * TILE;
  ctx.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);
  const frames = lavaFrames(grid);
  ctx.drawImage(frames[Math.floor(time * 5) % frames.length], sx, sy, sw, sh, sx, sy, sw, sh);
  // 용암 거품 (가끔 부풀었다 터짐)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (grid[y][x] !== 'L') continue;
    const v = hashXY(x, y), ph = (time * 0.6 + (v % 100) / 100) % 1;
    if (ph < 0.25) { const r = 1 + Math.floor(ph * 12); const bx = x * TILE + 5 + (v >> 3) % 14, by = y * TILE + 5 + (v >> 7) % 14; ctx.fillStyle = LAVA[6]; ctx.fillRect(bx - r, by, r * 2, 1); ctx.fillRect(bx, by - r, 1, r * 2); ctx.fillStyle = LAVA[7]; ctx.fillRect(bx, by, 1, 1); }
  }
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= x1; x++) if (grid[y][x] === '^') ctx.drawImage(rockSprite(hashXY(x, y) % 3), x * TILE - 1, y * TILE - 4);
  ctx.save();
  for (const v of vents) {
    if (v.x < x0 - 1 || v.x > x1 + 1 || v.y < y0 - 1 || v.y > y1 + 1) continue;
    const lit = firing(v);
    ctx.globalAlpha = 1;
    ctx.drawImage(ventSprite(v.dir, lit), v.x * TILE, v.y * TILE);
    if (lit) { // 예고: 입구에서 김이 샘
      const [dx, dy] = DIRV[v.dir];
      for (let i = 0; i < 3; i++) {
        const ph = (time * 0.8 + i / 3) % 1;
        puff(ctx, v.x * TILE + 12 + dx * (10 + ph * 14), v.y * TILE + 12 + dy * (10 + ph * 14) - ph * 6, 2 + ph * 3, 0.45 * (1 - ph));
      }
    }
  }
  if (steam && steam.age < 0.9) { // 분출: 경로를 따라 흰 스팀 기둥
    const k = steam.age / 0.9;
    for (const v of steam.vents) {
      const path = paths(v);
      path.forEach((p, i) => {
        const reach = Math.min(1, steam.age * 6) * path.length;
        if (i > reach) return;
        for (let j = 0; j < 3; j++) puff(ctx, p.x * TILE + 12 + ((h2(p.x, p.y, j) % 9) - 4), p.y * TILE + 12 + ((h2(p.x, p.y, j + 5) % 9) - 4) - k * 6, 6 + j * 2 + k * 4, 0.75 * (1 - k));
      });
    }
  }
  ctx.restore();
}

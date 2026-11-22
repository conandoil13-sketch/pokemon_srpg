// 사막 지형 그림 (픽셀 단위로 직접 찍음). 해변보다 무겁고 짙은 황토·호박색 모래.
// 바닥 한 장(바람결 물결·자갈·마른 덤불 자국·깊은 모래 사구·모래지옥 깔때기·흐르는 모래 바탕·사암 절벽·반쯤 묻힌 돌계단)은 맵마다 굽고,
// 흐르는 모래결·모래지옥 소용돌이 알갱이·사암 바위는 매 프레임. 스펙 docs/superpowers/specs/2026-11-23-desert-design.md
import { buffer, outline, h2, hashXY } from './cityTiles.js';

const TILE = 24;
// 모래 램프 (어두움 → 밝음): 그을린 시에나 → 황토 → 호박
const SAND = ['#5a3418', '#6e4120', '#83522a', '#986434', '#a8723c', '#b88246', '#c79352', '#d6a462'];
const BASE = 4; // 평지 기본 단계
const PEBBLE = { d: '#4a3a30', m: '#6e5a4a', l: '#94806c', hi: '#b8a48a' };
const SHRUB = { d: '#3e2a16', m: '#5c4024', l: '#7a5a34' };
const STONE = { o: '#2a1810', d: '#5e2e1c', m: '#86422a', l: '#a85a36', hi: '#c87a4c', band: '#9a4e30', top: '#b86a40', topHi: '#d88c5a' };
const STEP = { o: '#1e0f08', d: '#5a2c1a', m: '#84462a', l: '#a8643c', hi: '#d08a58' };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (px, py) => BAYER[(py & 3) * 4 + (px & 3)];

const at = (g, x, y) => g[y]?.[x];
const isWall = (g, x, y) => { const c = at(g, x, y); return c === undefined || c === '#'; };
const clampI = (v) => Math.max(0, Math.min(SAND.length - 1, v));

// 칸 가운데 기준으로 이어 붙인 값 (경계가 칸 모양으로 각지지 않게)
function field(grid, pred) {
  const h = grid.length, w = grid[0].length;
  const v = (x, y) => (pred(grid[Math.max(0, Math.min(h - 1, y))][Math.max(0, Math.min(w - 1, x))]) ? 1 : 0);
  return (px, py) => {
    const fx = px / TILE - 0.5, fy = py / TILE - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, t = fy - y0;
    const s = (q) => q * q * (3 - 2 * q), uu = s(u), tt = s(t);
    return (v(x0, y0) * (1 - uu) + v(x0 + 1, y0) * uu) * (1 - tt) + (v(x0, y0 + 1) * (1 - uu) + v(x0 + 1, y0 + 1) * uu) * tt;
  };
}

// 칸들을 부드러운 덩어리로 (가우스 합, 1 에서 자름) — 칸 모양 다이아몬드가 안 보이게
function blobs(grid, ch, r) {
  const centers = [];
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) if (grid[y][x] === ch) centers.push([x * TILE + TILE / 2 + (h2(x, y, 21) % 7) - 3, y * TILE + TILE / 2 + (h2(x, y, 22) % 7) - 3]);
  return (px, py) => {
    let v = 0;
    for (const [cx, cy] of centers) { const dx = px - cx, dy = py - cy; if (Math.abs(dx) > r * 2.5 || Math.abs(dy) > r * 2.5) continue; v += Math.exp(-(dx * dx + dy * dy) / (r * r)); }
    return Math.min(1, v * 1.15);
  };
}

// 바람결 물결: 세상 좌표로 이어지는 비스듬한 물결 (칸 이음새 없음). 반환 -1..1
const ripple = (wx, wy) => Math.sin(wx * 0.16 + wy * 0.5 + Math.sin(wx * 0.045 + wy * 0.02) * 2.2 + Math.sin(wy * 0.07) * 0.8);
// 큰 얼룩 (모래 톤 변화)
const blotch = (wx, wy) => Math.sin(wx * 0.031 + 1.3) * Math.sin(wy * 0.043 + 0.4) + Math.sin((wx + wy) * 0.019) * 0.6;

export function bakeDesertGround(grid) {
  const h = grid.length, w = grid[0].length, b = buffer(w * TILE, h * TILE);
  const deep = blobs(grid, ':', 15);
  const flow = field(grid, (c) => c === '=');
  const pits = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === '@') pits.push({ cx: x * TILE + TILE / 2, cy: y * TILE + TILE / 2 });
  for (let py = 0; py < h * TILE; py++) for (let px = 0; px < w * TILE; px++) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (grid[ty][tx] === '#') continue;
    const r = ripple(px, py), bl = blotch(px, py), dz = dither(px, py);
    let lv = BASE + bl * 0.55 + (dz - 0.5) * 0.35;
    // 물결: 마루는 밝게, 바로 아래 골은 어둡게
    if (r > 0.82) lv += 1.1; else if (r < -0.55 && ripple(px, py - 2) > 0.3) lv -= 1.2;
    // 깊은 모래: 부드럽게 솟은 사구 — 더 짙고, 왼쪽 위 마루는 빛, 오른쪽 아래는 그늘
    const d = deep(px, py);
    if (d > 0.08) {
      const grad = deep(px - 4, py - 4) - deep(px + 4, py + 4);
      lv -= d * 1.4 + (dz - 0.5) * d * 0.5;
      lv += grad * 2.6;
      if (d > 0.45 && Math.sin(px * 0.24 + py * 0.62 + Math.sin(px * 0.06) * 2) > 0.88 && ripple(px, py) < 0.82) lv += 0.8; // 사구 위 촘촘한 잔물결 (바람결과 같은 방향)
    }
    // 흐르는 모래: 고운 모래 (밝고 고르게) — 결은 매 프레임
    const f = flow(px, py);
    if (f > 0.62) lv = BASE + 1.1 + (dz - 0.5) * 0.3 + Math.sin(px * 0.9 + py * 0.9) * 0.15; // 고운 모래 물길 (결은 매 프레임)
    else if (f > 0.42) lv = BASE + 2; // 물길 가장자리 밝은 턱
    else if (f > 0.22) lv -= 1.3; // 바깥 둑 그늘
    // 모래지옥: 가운데로 갈수록 짙어지는 깔때기 + 동심 줄
    for (const p of pits) {
      const dist = Math.hypot(px - p.cx, py - p.cy);
      if (dist > 38) continue;
      const k = 1 - dist / 38;
      const ang = Math.atan2(py - p.cy, px - p.cx);
      lv -= k ** 1.6 * 4.6 + (dz - 0.5) * k * 0.6;
      const ring = Math.sin(dist * 0.42 + ang * 2.0); // 나선으로 흘러내린 줄
      if (dist > 6 && ring > 0.82) lv += 0.8 * (1 - k * 0.6);
      if (dist < 4.5) lv = 0;
      const rim = 33 + Math.sin(ang * 5 + p.cx) * 1.5 + Math.sin(ang * 11) * 0.8; // 무너진 턱 (울퉁불퉁)
      if (dist > rim && dist < rim + 2.5) lv += 1.1;
      else if (dist > rim - 3 && dist <= rim) lv -= 0.5;
    }
    b.set(px, py, SAND[clampI(Math.round(lv))]);
  }
  // 자갈·마른 덤불 자국 (평지만)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] !== '.') continue;
    const v = hashXY(x, y), px = x * TILE, py = y * TILE;
    if (v % 6 === 0) { // 자갈 2~3개
      for (let i = 0; i < 2 + (v >> 5) % 2; i++) {
        const sx = px + 4 + (h2(x, y, i) % 15), sy = py + 5 + (h2(x, y, i + 9) % 14), big = h2(x, y, i + 3) & 1;
        b.set(sx, sy + 1, PEBBLE.d); b.set(sx + 1, sy + 1, PEBBLE.d);
        b.set(sx, sy, PEBBLE.l); b.set(sx + 1, sy, PEBBLE.m);
        if (big) { b.set(sx + 2, sy, PEBBLE.m); b.set(sx + 2, sy + 1, PEBBLE.d); b.set(sx, sy - 1, PEBBLE.hi); b.set(sx + 1, sy - 1, PEBBLE.l); }
      }
    } else if (v % 11 === 3) { // 마른 덤불 (잔가지 별 모양) + 그림자
      const cx = px + 8 + (v >> 4) % 8, cy = py + 10 + (v >> 8) % 6;
      for (let i = -3; i <= 3; i++) b.mix(cx + i + 1, cy + 2, SAND[1], 0.45);
      const arms = [[-3, -2], [-2, -3], [0, -3], [2, -3], [3, -1], [-3, 0], [3, 1]];
      for (const [ax, ay] of arms) { const n = Math.max(Math.abs(ax), Math.abs(ay)); for (let s = 1; s <= n; s++) b.set(cx + Math.round((ax * s) / n), cy + Math.round((ay * s) / n), s === n ? SHRUB.l : SHRUB.m); }
      b.set(cx, cy, SHRUB.d); b.set(cx, cy + 1, SHRUB.d);
    } else if (v % 13 === 5) { // 바람에 쓸린 짙은 줄
      for (let i = 0; i < 7; i++) b.mix(px + 5 + i, py + 8 + (i >> 2), SAND[2], 0.5);
    }
  }
  // 그림자 (빛은 왼쪽 위): 절벽 아래·오른쪽
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] === '#') continue;
    const px = x * TILE, py = y * TILE;
    if (isWall(grid, x, y - 1)) for (let j = 0; j < 7; j++) for (let i = 0; i < TILE; i++) b.mix(px + i, py + j, '#2a140a', 0.5 - j * 0.065);
    if (isWall(grid, x - 1, y)) for (let i = 0; i < 5; i++) for (let j = 0; j < TILE; j++) b.mix(px + i, py + j, '#2a140a', 0.34 - i * 0.065);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] === '#') cliff(b, grid, x, y);
    else if (grid[y][x] === '>') stairs(b, x, y);
  }
  return b.canvas();
}

// ---- 사암 절벽 (벽): 위면 = 층층이 쌓인 붉은 사암 윗면, 아래가 트이면 앞면 = 가로 지층 띠 ----
function cliff(b, g, tx, ty) {
  const px = tx * TILE, py = ty * TILE, face = !isWall(g, tx, ty + 1), topH = face ? 12 : TILE;
  for (let y = 0; y < topH; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, wy = py + y;
    const n = Math.sin(wx * 0.21 + wy * 0.09) + Math.sin(wy * 0.33 - wx * 0.05) * 0.6 + (dither(wx, wy) - 0.5) * 0.8;
    b.set(wx, wy, n > 0.9 ? STONE.topHi : n > -0.4 ? STONE.top : STONE.l);
  }
  if (!isWall(g, tx, ty - 1)) for (let x = 0; x < TILE; x++) { b.set(px + x, py, STONE.topHi); b.set(px + x, py + 1, STONE.topHi); }
  if (!isWall(g, tx - 1, ty)) for (let y = 0; y < topH; y++) b.set(px, py + y, STONE.topHi);
  if (!isWall(g, tx + 1, ty)) for (let y = 0; y < topH; y++) { b.set(px + TILE - 1, py + y, STONE.d); b.set(px + TILE - 2, py + y, STONE.m); }
  if ((hashXY(tx, ty) & 3) === 0 && topH === TILE) for (let i = 0; i < 6; i++) b.set(px + 7 + i, py + 10 + (i >> 1), STONE.d); // 갈라진 금
  if (!face) return;
  for (let x = 0; x < TILE; x++) { b.set(px + x, py + 12, STONE.hi); b.set(px + x, py + 13, STONE.l); }
  for (let y = 14; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const wx = px + x, band = Math.floor((y + Math.sin(wx * 0.19) * 1.2) / 3) % 3; // 물결치는 지층
    let c = band === 0 ? STONE.m : band === 1 ? STONE.band : STONE.d;
    if (y >= TILE - 2) c = STONE.o;
    else if ((h2(wx, py + y, 4) & 31) === 0) c = STONE.l;
    b.set(wx, py + y, c);
  }
  if (!isWall(g, tx - 1, ty)) for (let y = 12; y < TILE; y++) b.set(px, py + y, STONE.l);
  if (!isWall(g, tx + 1, ty)) for (let y = 12; y < TILE; y++) b.set(px + TILE - 1, py + y, STONE.o);
}

// ---- 계단: 모래에 반쯤 묻힌 돌계단 (아래로 내려가는 입구) ----
function stairs(b, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) b.mix(px + x, py + y, '#2a140a', 0.25); // 내려앉은 그늘
  b.rect(px + 3, py + 4, 18, 18, STEP.o); // 어두운 입구
  for (let s = 0; s < 4; s++) { // 계단 4단 (위가 밝음)
    const y = py + 6 + s * 4, inset = s;
    for (let x = px + 4 + inset; x < px + 20 - inset; x++) { b.set(x, y, s < 1 ? STEP.hi : s < 2 ? STEP.l : s < 3 ? STEP.m : STEP.d); b.set(x, y + 1, s < 2 ? STEP.m : STEP.d); b.set(x, y + 2, STEP.o); }
  }
  // 양옆 돌기둥
  for (let y = py + 2; y < py + 22; y++) { b.set(px + 2, y, STEP.l); b.set(px + 3, y, STEP.m); b.set(px + 20, y, STEP.m); b.set(px + 21, y, STEP.d); }
  for (let x = px + 2; x < px + 22; x++) { b.set(x, py + 2, STEP.hi); b.set(x, py + 3, STEP.l); }
  // 모래가 덮쳐 흘러든 자국 (왼쪽 위에서 비스듬히)
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12 - y; x++) b.set(px + 2 + x, py + 12 + y, SAND[(x + y) % 3 === 0 ? 6 : 5]);
  for (let i = 0; i < 9; i++) b.set(px + 2 + i, py + 21 - i, SAND[3]);
}

// ---- 위로 솟는 것: 붉은 사암 바위 ----
const sprites = new Map();
function rockSprite(v) {
  const k = `rock${v}`;
  if (sprites.has(k)) return sprites.get(k);
  const b = buffer(26, 28); // 칸보다 위로 4px 솟음
  const shapes = [
    [[12, 15, 8, 9], [18, 20, 5, 5]], // [cx, cy, rx, ry] 덩이들 — 큰 바위 + 곁돌
    [[10, 16, 7, 8], [17, 14, 5, 7], [7, 22, 4, 3]],
    [[13, 17, 9, 7], [9, 12, 5, 4]],
  ][v % 3];
  const inside = (x, y) => y <= 24 && shapes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 26; x++) {
    if (!inside(x, y)) continue;
    // 덩이마다 윗면(납작한 사암 판, 밝음)과 옆면(가로 지층)을 나눈다. 빛은 왼쪽 위
    const sh = shapes.find(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
    const [cx, cy, rx, ry] = sh, topFace = y < cy - ry * 0.2 + Math.sin(x * 0.7 + v) * 0.6;
    const right = !inside(x + 1, y) || !inside(x + 2, y), left = !inside(x - 1, y), edgeTop = !inside(x, y - 1);
    let c;
    if (topFace) {
      c = edgeTop || left ? STONE.topHi : (x - cx) > rx * 0.35 ? STONE.l : STONE.top;
      if (!edgeTop && (h2(x, y, v + 3) & 15) === 0) c = STONE.l; // 윗면 얽은 자국
    } else {
      const band = Math.floor((y - (cy - ry * 0.2) + Math.sin(x * 0.45 + v) * 0.9) / 2.5) % 3;
      c = band === 0 ? STONE.l : band === 1 ? STONE.m : STONE.band;
      if (x - cx > rx * 0.3) c = band === 0 ? STONE.m : STONE.d; // 오른쪽은 그늘
      if (left) c = STONE.l;
      if (!topFace && !inside(x, y - 1) === false && inside(x, y - 1) && y - 1 < cy - ry * 0.2 + Math.sin(x * 0.7 + v) * 0.6) c = STONE.hi; // 윗면 모서리 빛
    }
    if (right) c = STONE.d;
    if (!inside(x, y + 1)) c = STONE.o;
    b.set(x, y, c);
  }
  outline(b, STONE.o);
  for (let y = 18; y < 28; y++) for (let x = 2; x < 26; x++) { // 오른쪽 아래로 드리운 그림자 (외곽선 뒤에 — 그림자엔 선 없음)
    const e = ((x - 15) / 11) ** 2 + ((y - 25) / 3) ** 2;
    if (e <= 1 && !b.has(x, y)) b.mix(x, y, '#2a140a', 0.4);
  }
  const c = b.canvas(); sprites.set(k, c); return c;
}

// 흐르는 모래결: 띠 방향으로 흘러가는 밝은 결 + 어두운 꼬리 (매 프레임)
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function drawFlow(ctx, x, y, dir, time) {
  const [dx, dy] = VEC[dir] ?? [1, 0], px = x * TILE, py = y * TILE;
  const along = (i, j) => (dx ? { x: px + (dx > 0 ? i : TILE - 1 - i), y: py + j } : { x: px + j, y: py + (dy > 0 ? i : TILE - 1 - i) });
  for (let lane = 0; lane < 5; lane++) {
    const j = 2 + lane * 5 + (h2(x, y, lane) % 2);
    const speed = 14 + (h2(x, y, lane + 5) % 6), len = 4 + (h2(x, y, lane + 11) % 4);
    const head = ((time * speed + h2(x + y, lane, 3) % TILE) % (TILE + len)) | 0;
    for (let k = 0; k < len; k++) {
      const i = head - k;
      if (i < 0 || i >= TILE) continue;
      const p = along(i, j);
      ctx.fillStyle = k === 0 ? SAND[7] : k < 2 ? SAND[6] : SAND[3];
      ctx.fillRect(p.x, p.y, 1, 1);
    }
  }
  // 띠 방향 표시: 흘러가는 갈매기 무늬 (칸마다 하나, 천천히 이동)
  const off = ((time * 8) % TILE) | 0, tip = (off + 14) % TILE;
  ctx.fillStyle = SAND[2];
  for (let s = 0; s <= 4; s++) for (const sg of [-1, 1]) {
    const i = tip - s; if (i < 1 || i > TILE - 2) continue;
    const p = along(i, TILE / 2 + sg * s); ctx.fillRect(p.x, p.y, 1, 1);
    const q = along(i - 1, TILE / 2 + sg * s); ctx.fillStyle = SAND[1]; ctx.fillRect(q.x, q.y, 1, 1); ctx.fillStyle = SAND[2];
  }
}

// 모래지옥: 알갱이가 나선을 그리며 가운데로 흘러내림 (매 프레임)
function drawPit(ctx, x, y, time) {
  const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
  for (let i = 0; i < 22; i++) {
    const life = ((time * 0.35 + (h2(x, y, i) % 1000) / 1000) % 1); // 0 바깥 → 1 가운데
    const r = 34 * (1 - life), ang = (h2(x, y, i + 40) % 628) / 100 + life * 4.2;
    const gx = Math.round(cx + Math.cos(ang) * r), gy = Math.round(cy + Math.sin(ang) * r * 0.92);
    ctx.fillStyle = life < 0.6 ? SAND[6] : life < 0.85 ? SAND[4] : SAND[2];
    ctx.fillRect(gx, gy, 1, 1);
    if (i % 3 === 0 && life < 0.5) { ctx.fillStyle = SAND[3]; ctx.fillRect(gx + 1, gy, 1, 1); }
  }
}

// 보이는 범위만 (호출 측에서 translate 한 상태). flows = state.flows
export function drawDesertMap(ctx, grid, ground, camX, camY, viewW, viewH, time = 0, flows = null) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE)), y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  ctx.drawImage(ground, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  for (let y = Math.max(0, y0 - 2); y <= Math.min(grid.length - 1, y1 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(grid[0].length - 1, x1 + 2); x++) {
    const ch = grid[y][x];
    if (ch === '=' && flows) drawFlow(ctx, x, y, flows[`${x},${y}`], time);
    else if (ch === '@') drawPit(ctx, x, y, time);
  }
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x <= x1; x++) {
    if (grid[y][x] === '^') ctx.drawImage(rockSprite(hashXY(x, y) % 3), x * TILE - 1, y * TILE - 4);
  }
}

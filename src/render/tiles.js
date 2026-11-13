// 맵 타일 도트 (24×24, PMD 와 같은 타일 크기). 4~5세대 DS 필드풍: 또렷한 색, 외곽선, 위 왼쪽 빛.
// 물·풀숲·벽(나무/암벽)은 12×12 네 조각 오토타일로 경계를 둥글게 잇는다 (autotile.js).
import { hash } from './pixels.js';
import { QUAD, quadrants } from './autotile.js';

export const TILE = 24;
const Q = TILE / 2;

// 테마 팔레트 (그리기만 다르고 규칙은 같다)
const THEMES = {
  field: {
    ground: { base: '#8cd068', dark: '#6cb04c', light: '#b4e888', deep: '#58983c', flowers: ['#f8f8f0', '#f87878', '#f8d848'], pebble: ['#b8b0a0', '#807868'] },
    water: { deep: '#3068d0', mid: '#4088e8', light: '#70b0f8', foam: '#e8f8ff', sand: '#f0e0a0', sandD: '#d0b878' },
    cover: { outline: '#2a6a28', dark: '#3c8a34', mid: '#58b040', light: '#80d058', tip: '#b8f080' },
    wall: { kind: 'tree', outline: '#183c18', dark: '#286028', mid: '#3c8c38', light: '#64b450', hl: '#90d468', trunk: '#6a4020', trunkL: '#9a6a38' },
    rock: { outline: '#2e2a28', dark: '#5e5852', mid: '#847c72', light: '#a89e90', hl: '#cac2b4' },
  },
  cave: {
    ground: { base: '#a09080', dark: '#857565', light: '#bcac98', deep: '#6c5e50', flowers: [], pebble: ['#c8bca8', '#5c5044'] },
    water: { deep: '#203e80', mid: '#2c58a8', light: '#4878c8', foam: '#b8d8f8', sand: '#7c6e5e', sandD: '#5e5246' },
    cover: { outline: '#202868', dark: '#3848a0', mid: '#5878d0', light: '#90b8f0', tip: '#d0e8ff' }, // 동굴 수정 덤불
    wall: { kind: 'cave', outline: '#1c1712', dark: '#40362e', mid: '#5c5044', light: '#7c6e5e', hl: '#9c8c78' },
    rock: { outline: '#1e1a16', dark: '#3e3832', mid: '#5a524a', light: '#7a7066', hl: '#9a9084' }, // 바닥보다 어둡게
  },
};

const caches = {};
const WATER_FRAMES = 3;

function canvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'));
  return c;
}
// 픽셀 함수 → 캔버스 (null = 투명)
function paint(w, h, fn) {
  return canvas(w, h, (g) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    }
  });
}

// ---- 풀밭: 바탕 + 풀잎 무늬 + 가끔 꽃·돌멩이 ----
function groundTile(P, seed, deco) {
  const blades = [];
  for (let i = 0; i < 6; i++) blades.push([Math.floor(hash(seed, i, 'x') * 22) + 1, Math.floor(hash(seed, i, 'y') * 20) + 3]);
  return paint(TILE, TILE, (x, y) => {
    if (deco === 'flower') {
      const fx = 8 + Math.floor(hash(seed, 'fx') * 8), fy = 8 + Math.floor(hash(seed, 'fy') * 8);
      const col = P.flowers[Math.floor(hash(seed, 'fc') * P.flowers.length)];
      if (col && Math.abs(x - fx) + Math.abs(y - fy) === 1) return col;
      if (col && x === fx && y === fy) return '#f8e870';
    }
    if (deco === 'pebble') {
      const fx = 6 + Math.floor(hash(seed, 'px') * 12), fy = 8 + Math.floor(hash(seed, 'py') * 10);
      if (y === fy && (x === fx || x === fx + 1)) return P.pebble[0];
      if (y === fy + 1 && (x === fx || x === fx + 1)) return P.pebble[1];
    }
    for (const [bx, by] of blades) {
      if (x === bx && (y === by || y === by + 1)) return P.dark;   // 풀잎 줄기
      if (x === bx + 1 && y === by - 1) return P.light;            // 빛 받은 끝
      if (x === bx - 1 && y === by + 1) return P.dark;
    }
    const n = hash(x, y, seed); // 아주 드문 밝은 점만 (DS 풀밭은 거의 평평)
    return n > 0.985 ? P.light : P.base;
  });
}

// ---- 둥근 덩어리 무늬 (잎·바위): 타일마다 반복되지만 이음매 없이 (24px 주기로 감싸서 계산) ----
function clusterCenters(seed, n, r) {
  return Array.from({ length: n }, (_, i) => [hash(seed, i, 'cx') * TILE, hash(seed, i, 'cy') * TILE, r * (0.8 + hash(seed, i, 'r') * 0.4)]);
}
function clusterAt(x, y, centers) {
  let best = null, bestK = Infinity;
  for (const [cx0, cy0, r] of centers) for (const ox of [-TILE, 0, TILE]) for (const oy of [-TILE, 0, TILE]) {
    const cx = cx0 + ox, cy = cy0 + oy, k = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    // 겹치면 아래쪽(앞) 덩어리가 위에 보이도록 살짝 우선
    const score = k - (cy - y) * 0.004;
    if (k <= 1 && score < bestK) { bestK = score; best = { lx: (x + 0.5 - cx) / r, ly: (y + 0.5 - cy) / r, k }; }
  }
  return best;
}
function clusterColor(c, P, gap) {
  if (!c) return gap;
  if (c.k > 0.9) return P.dark; // 덩어리 테두리
  const lit = -c.lx * 0.7 - c.ly;
  if (lit > 0.75) return P.hl ?? P.tip ?? P.light;
  if (lit > 0.2) return P.light;
  if (lit < -0.55) return P.dark;
  return P.mid;
}

// ---- 오토타일 조각: 바깥 가장자리에서의 거리(d) ----
// u: 조각의 바깥 세로 가장자리에서 거리, w: 바깥 가로 가장자리에서 거리 (픽셀 중심)
function sdf(type, u, w, M, R) {
  switch (type) {
    case QUAD.INNER: return 99;
    case QUAD.EDGE_H: return w - M;
    case QUAD.EDGE_V: return u - M;
    case QUAD.OUTER: {
      const c = M + R;
      if (u >= c || w >= c) return Math.min(u - M, w - M);
      return R - Math.hypot(c - u, c - w);
    }
    default: return Math.hypot(u, w) - (M + 2); // CORNER_IN: 모서리에만 작은 홈
  }
}
// 조각 캔버스들: [type][corner] (corner: 0 왼쪽위 1 오른쪽위 2 왼쪽아래 3 오른쪽아래)
function quadSet(M, R, colorAt) {
  const out = [];
  for (let type = 0; type < 5; type++) {
    out.push([0, 1, 2, 3].map((corner) => {
      const right = corner & 1, bottom = corner >> 1;
      return paint(Q, Q, (px, py) => {
        const u = (right ? Q - 1 - px : px) + 0.5, w = (bottom ? Q - 1 - py : py) + 0.5;
        const d = sdf(type, u, w, M, R);
        return colorAt(d, px + right * Q, py + bottom * Q, { type, right, bottom, u, w });
      });
    }));
  }
  return out;
}

// ---- 물: 모래 물가 → 거품 → 밝은 물 → 깊은 물 + 흐르는 잔물결 ----
function waterSet(P, frame) {
  return quadSet(3, 6, (d, x, y) => {
    if (d < -3) return null;
    if (d < -1) return P.sand;
    if (d < 0) return P.sandD;
    if (d < 1) return P.foam;
    if (d < 3) return P.light;
    // 잔물결: 짧은 가로 줄이 프레임마다 흐른다
    const row = (y + 2) % 8, phase = (x + frame * 3 + (y >> 3) * 5) % 12;
    if (row === 0 && phase < 4) return P.light;
    if (row === 1 && phase === 4) return P.foam;
    return (x + y) % 2 === 0 && hash(x >> 1, y >> 1, frame) > 0.93 ? P.mid : P.deep;
  });
}

// ---- 긴 풀숲: 둥근 잎 덩어리, 위쪽 테두리에 삐죽한 잎 끝 ----
function bushSet(P) {
  // 긴 풀숲: 줄마다 위로 뾰족한 풀 다발(^)이 엇갈려 늘어선 무늬
  const tuft = (x, y) => {
    const band = Math.floor(y / 8), by = y % 8, cx = ((x + (band % 2) * 4) % 8) - 4;
    const half = by * 0.55, ax = Math.abs(cx + 0.5);
    if (ax <= half + 0.5) {
      if (by <= 1) return 'tip';
      if (ax >= half - 0.5) return cx < 0 ? 'light' : 'dark'; // 왼쪽 빛, 오른쪽 그늘
      return by < 4 ? 'light' : 'mid';
    }
    return 'gap';
  };
  return quadSet(1, 5, (d, x, y, k) => {
    if (d < 0) return !k.bottom && d > -2 && x % 8 === 3 ? P.tip : null; // 위쪽 밖으로 풀 끝
    if (d < 1) return P.outline;
    if (d < 2 && k.bottom) return P.dark;
    const t = tuft(x, y);
    return t === 'gap' ? P.outline : P[t];
  });
}

// ---- 벽: 들판은 숲(이어지는 둥근 수관 + 아래 줄기), 동굴은 암벽 ----
function treeSet(P) {
  const leaves = clusterCenters('tree', 7, 6.5);
  return quadSet(2, 7, (d, x, y, k) => {
    if (d < 0) {
      // 숲 아래쪽 가장자리: 줄기와 그림자
      if (k.bottom && (k.type === QUAD.EDGE_H || k.type === QUAD.OUTER) && d > -2.5) {
        if (x >= 10 && x <= 13) return x === 10 ? P.trunk : P.trunkL;
        return 'rgba(0,0,0,0.22)';
      }
      return null;
    }
    if (d < 1) return P.outline;
    if (d < 2.5 && k.bottom) return P.dark; // 아래 그늘
    return clusterColor(clusterAt(x, y, leaves), P, P.outline);
  });
}
function caveWallSet(P) {
  const stones = clusterCenters('cave', 6, 7);
  return quadSet(1, 4, (d, x, y, k) => {
    if (d < 0) return k.bottom && d > -2 ? 'rgba(0,0,0,0.25)' : null;
    if (d < 1) return P.outline;
    return clusterColor(clusterAt(x, y, stones), P, P.outline);
  });
}

// ---- 바위·언덕: 둥근 큰 바위, 위 왼쪽 빛, 금, 발밑 그림자 ----
function rockTile(P) {
  return paint(TILE, TILE, (x, y) => {
    const dx = (x - 11.5) / 10, dy = (y - 12) / 8.5;
    const r = Math.hypot(dx, dy);
    if (r > 1) {
      const sy = (y - 20) / 2.2, sx = (x - 12) / 10;
      return sx * sx + sy * sy <= 1 && y >= 19 ? 'rgba(0,0,0,0.22)' : null;
    }
    if (r > 0.88) return P.outline;
    const lit = -dx * 0.7 - dy;
    if ((x === 14 && y >= 8 && y <= 11) || (x === 15 && y === 12) || (x === 9 && y >= 13 && y <= 15)) return P.dark; // 금
    if (lit > 0.75) return P.hl;
    if (lit > 0.25) return P.light;
    if (lit < -0.45) return P.dark;
    return P.mid;
  });
}

// ---- 위로 솟는 스프라이트 (나무·풀숲·바위): 칸보다 위로 OVER px 튀어나와 윗칸을 살짝 덮는다 ----
const TREE_OVER = 10, GRASS_OVER = 6, ROCK_OVER = 6;

// 외곽선 붙이기: 모양 함수(색 또는 null) → 바깥 1px 를 outline 으로
function withOutline(w, h, fn, outline) {
  const px = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(fn(x, y));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : px[y * w + x]);
  return paint(w, h, (x, y) => {
    const c = at(x, y);
    if (c) return c;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy)) ? outline : null;
  });
}

// 나무 한 그루: 잎 덩어리가 울퉁불퉁한 둥근 수관 + 줄기 + 발밑 그림자
function treeSprite(P, v) {
  const H = TILE + TREE_OVER, cx = 11.5, cy = 14, R = 12.5;
  const bumps = Array.from({ length: 9 }, (_, i) => hash('tb', v, i) * 1.8);
  const leaves = clusterCenters(`tree${v}`, 6, 5.5).map(([x, y, r]) => [x * 0.9 + 1, y * 0.85 + 2, r]);
  return withOutline(TILE, H, (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
    const k = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 9) % 9;
    const r = R - bumps[k] + Math.sin(a * 9 + v) * 0.8; // 가장자리 잎사귀 요철
    if (Math.hypot(dx, dy * 1.1) <= r && y < 28) {
      if (dy > 5 && -dx * 0.5 - dy < -7) return P.dark; // 아래쪽 그늘
      return clusterColor(clusterAt(x, y, leaves), P, P.dark);
    }
    if (x >= 10 && x <= 13 && y >= 25 && y <= 30) return x === 10 ? P.trunk : x === 13 ? shadeHex(P.trunk) : P.trunkL; // 줄기
    if (y >= 30 && y <= 32 && Math.abs(x + 0.5 - 12) <= 9 - (y - 30) * 2) return 'rgba(0,0,0,0.22)'; // 그림자
    return null;
  }, P.outline);
}
const shadeHex = (hex) => { const n = parseInt(hex.slice(1), 16), f = (c) => Math.round(c * 0.7); return `#${((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`; };

// 긴 풀숲 한 칸: 풀 다발 4개(2×2), 다발마다 위로 삐죽한 잎 끝
function grassSprite(P, v) {
  const H = TILE + GRASS_OVER;
  const tufts = [[6, 13], [18, 12], [6, 25], [18, 26]].map(([x, y], i) => [x + (hash('gt', v, i) - 0.5) * 2, y + GRASS_OVER - 6]);
  return withOutline(TILE, H, (x, y) => {
    for (const [tx, ty] of [...tufts].reverse()) { // 아래 다발이 앞
      const lx = x + 0.5 - tx, ly = y + 0.5 - ty;
      if (ly > 0 || ly < -14 || Math.abs(lx) > 7) continue;
      // 잎 끝: 2px 간격의 뾰족한 톱니, 가운데가 더 높다
      const tooth = 3 + (Math.abs(Math.round(lx)) % 2) * 3 + Math.abs(lx) * 0.7;
      if (-ly > 14 - tooth) continue;
      const blade = Math.round(lx + 7) % 3;
      if (-ly > 10 - tooth) return blade === 1 ? P.tip : P.light;
      if (ly > -3) return P.dark;
      return blade === 0 ? P.dark : lx < 0 ? P.light : P.mid;
    }
    return null;
  }, P.outline);
}

// 진짜 돌: 각진 큰 돌 + 작은 돌 둘, 면마다 평평한 명암(위 왼쪽 빛), 면 경계 선, 금
function rockSprite(P, v) {
  const H = TILE + ROCK_OVER;
  const stone = (cx, cy, R, n, seed) => {
    const vs = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + hash(seed, i, 'a') * 0.5;
      const r = R * (0.72 + hash(seed, i, 'r') * 0.35);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85];
    });
    return { cx, cy, vs };
  };
  const stones = [stone(12.5, 15 + ROCK_OVER - 4, 11, 6, `rk${v}`), stone(4.5, 22 + ROCK_OVER - 4, 3.6, 5, `rs${v}`), stone(20, 24 + ROCK_OVER - 4, 3.2, 5, `rt${v}`)];
  const inPoly = (vs, x, y) => { let c = false; for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) { const [xi, yi] = vs[i], [xj, yj] = vs[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  return withOutline(TILE, H, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    for (const s of [...stones].reverse()) {
      if (!inPoly(s.vs, px, py)) continue;
      // 어느 면(중심에서 꼭짓점 사이 부채꼴)인지 → 면 방향으로 평평한 명암
      const a = Math.atan2(py - s.cy, px - s.cx), n = s.vs.length;
      const angs = s.vs.map(([vx, vy]) => Math.atan2(vy - s.cy, vx - s.cx));
      let f = 0; for (let i = 0; i < n; i++) { const a0 = angs[i], a1 = angs[(i + 1) % n]; const inside = a0 < a1 ? a >= a0 && a < a1 : a >= a0 || a < a1; if (inside) f = i; }
      const mid = (angs[f] + angs[(f + 1) % n]) / 2 + (angs[f] > angs[(f + 1) % n] ? Math.PI : 0);
      const near = Math.hypot(px - s.cx + 1.5, py - s.cy + 2) < 2.6; // 꼭대기 평평한 면 (위 왼쪽으로 치우침)
      const lit = near ? 0.95 : -Math.cos(mid) * 0.6 - Math.sin(mid);
      // 면 경계: 꼭짓점 방향 선 근처를 어둡게
      const edge = angs.some((ae) => Math.abs(Math.atan2(Math.sin(a - ae), Math.cos(a - ae))) < 0.09) && !near;
      if (edge) return P.dark;
      if ((x * 3 + y * 5 + v) % 23 === 0) return P.dark; // 작은 금
      return lit > 0.85 ? P.hl : lit > 0.3 ? P.light : lit < -0.3 ? P.dark : P.mid;
    }
    if (y >= H - 4 && y <= H - 2 && Math.abs(px - 13) <= 11 - (y - (H - 4)) * 2) return 'rgba(0,0,0,0.22)';
    return null;
  }, P.outline);
}

// ---- 계단: 바닥 구멍 + 내려가는 단 (외곽선) ----
function stairsTile() {
  return paint(TILE, TILE, (x, y) => {
    if (x < 3 || x > 20 || y < 3 || y > 20) return null;
    if (x === 3 || x === 20 || y === 3 || y === 20) return '#302418';
    const step = Math.floor((y - 4) / 4), inset = step * 2;
    if (x < 4 + inset || x > 19 - inset) return '#201810';
    const shades = ['#e0d0b0', '#b8a888', '#907c60', '#6c5a44'];
    return (y - 4) % 4 === 3 ? '#4a3c2c' : shades[Math.min(step, 3)];
  });
}

function build(theme) {
  const P = THEMES[theme] ?? THEMES.field;
  const decos = [null, null, null, null, 'flower', 'pebble', null, 'flower'];
  return {
    ground: decos.map((d, i) => groundTile(P.ground, `${theme}${i}`, d)),
    water: Array.from({ length: WATER_FRAMES }, (_, f) => waterSet(P.water, f)),
    grassTufts: [0, 1].map((v) => grassSprite(P.cover, v)),
    trees: P.wall.kind === 'cave' ? null : [0, 1, 2].map((v) => treeSprite(P.wall, v)),
    caveWall: P.wall.kind === 'cave' ? caveWallSet(P.wall) : null,
    rocks: [0, 1].map((v) => rockSprite(P.rock, v)),
    stairs: stairsTile(),
  };
}

// 보물상자 (월드 좌표 타일)
export function drawChest(ctx, tx, ty) {
  const x = tx * TILE + 5, y = ty * TILE + 7;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 1, y + 13, 14, 2);
  ctx.fillStyle = '#3a2410'; ctx.fillRect(x, y, 14, 13);                // 외곽선
  ctx.fillStyle = '#b87830'; ctx.fillRect(x + 1, y + 1, 12, 11);
  ctx.fillStyle = '#e0a050'; ctx.fillRect(x + 1, y + 1, 12, 2);          // 뚜껑 빛
  ctx.fillStyle = '#8a5420'; ctx.fillRect(x + 1, y + 10, 12, 2);         // 아래 그늘
  ctx.fillStyle = '#3a2410'; ctx.fillRect(x, y + 5, 14, 1);              // 뚜껑 이음새
  ctx.fillStyle = '#f8d040'; ctx.fillRect(x + 6, y + 4, 2, 4);           // 자물쇠
  ctx.fillStyle = '#fff4b0'; ctx.fillRect(x + 6, y + 4, 1, 1);
}

const SAME = { water: (c) => c === '~', bush: (c) => c === '"', wall: (c) => c === '#' };

function drawQuads(ctx, set, grid, x, y, same, px, py) {
  const q = quadrants(grid, x, y, same);
  for (let i = 0; i < 4; i++) ctx.drawImage(set[q[i]][i], px + (i & 1) * Q, py + (i >> 1) * Q);
}

// 보이는 범위만 그린다 (camX/camY = 월드 픽셀, 호출 측에서 translate 한 상태)
export function drawMap(ctx, grid, time, camX = 0, camY = 0, viewW = 256, viewH = 192, theme = 'field') {
  const cache = (caches[theme] ??= build(theme));
  const wf = Math.floor(time / 0.5) % WATER_FRAMES;
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE));
  const y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  // 1) 바닥·물·계단·동굴벽 (칸 안에만)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = grid[y][x], px = x * TILE, py = y * TILE;
      ctx.drawImage(cache.ground[Math.floor(hash(x, y) * cache.ground.length)], px, py); // 모든 칸 바닥 먼저
      if (t === '~') drawQuads(ctx, cache.water[wf], grid, x, y, SAME.water, px, py);
      else if (t === '#' && cache.caveWall) drawQuads(ctx, cache.caveWall, grid, x, y, SAME.wall, px, py);
      else if (t === '>') ctx.drawImage(cache.stairs, px, py);
    }
  }
  // 2) 위로 솟는 것들 (나무·풀숲·돌): 위 줄부터 그려서 아래 줄이 윗줄을 덮는다. 화면 아래 한 줄 더 (솟은 부분)
  for (let y = y0; y <= Math.min(grid.length - 1, y1 + 1); y++) {
    for (let x = x0; x <= x1; x++) {
      const t = grid[y][x], px = x * TILE, py = y * TILE, v = hash(x, y, 'v');
      if (t === '#' && cache.trees) ctx.drawImage(cache.trees[Math.floor(v * 3)], px, py - TREE_OVER);
      else if (t === '"') ctx.drawImage(cache.grassTufts[Math.floor(v * 2)], px, py - GRASS_OVER);
      else if (t === '^') ctx.drawImage(cache.rocks[Math.floor(v * 2)], px, py - ROCK_OVER);
    }
  }
}

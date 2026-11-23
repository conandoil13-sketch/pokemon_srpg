// 마을 건물·흙길 도트 (코드로 그림, 처음 한 번 굽고 캐시) — 2026-11-23 마을 건물
// 포켓몬들이 꾸려 사는 마을: 그루터기 집(편성소) · 볼 무늬 천막(모집소) · 잎 차양 노점(상점) · 지붕 게시판(출격) · 공사터(빈터)
import { TILE } from './tiles.js';

const cache = new Map();

const hash = (...a) => {
  let h = 2166136261;
  for (const c of a.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const rgba = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return hex.length === 9 ? [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

// 픽셀 함수(색 '#rrggbb' / 반투명 '#rrggbbaa' / null) → 캔버스. outline 이 있으면 불투명 모양 바깥 1px 테두리
function bake(key, w, h, fn, outline) {
  if (cache.has(key)) return cache.get(key);
  const px = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = fn(x, y);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[y * w + x] && px[y * w + x].length === 7;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let col = px[y * w + x];
    if (outline && !solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) col = outline;
    if (!col) continue;
    const [r, gg, b, a] = rgba(col), i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

const SHADOW = '#00000040';
const OUT = '#2a1a10';
const inEll = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const dist = (x, y, cx, cy) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy);

// ---- 흙길: = 칸, 풀과 닿는 가장자리는 들쭉날쭉 ----
const DIRT = { base: '#d8b878', dark: '#c09860', light: '#ead098', edge: '#a88050', pebble: '#988868' };
// 꽃밭 한 칸: 잎 위로 작은 꽃 여섯 송이 (자리마다 색이 조금 다름)
const PETALS = [['#f87878', '#f8b0b0'], ['#f8d848', '#fff0a0'], ['#f8f8f0', '#ffffff'], ['#b080f0', '#d8c0ff']];
function flowerPx(fx, fy, x, y) {
  for (let i = 0; i < 6; i++) {
    const cx = 4 + Math.floor(hash('fl', fx, fy, i, 'x') * 16), cy = 6 + Math.floor(hash('fl', fx, fy, i, 'y') * 14);
    const [p, l] = PETALS[Math.floor(hash('fl', fx, fy, i, 'c') * PETALS.length)];
    const dx = x - cx, dy = y - cy;
    if (!dx && !dy) return '#f8e060';
    if (Math.abs(dx) + Math.abs(dy) === 1) return dy < 0 || dx < 0 ? l : p;
    if (dy === 2 && (dx === -1 || dx === 1)) return '#3c8a34';
  }
  return null;
}
export function drawTownPaths(ctx, paths, flowers = []) {
  const rows = paths.length, cols = paths[0].length;
  const fset = new Set(flowers.map((f) => `${f.x},${f.y}`));
  const img = bake(`paths:${paths.join('/')}:${[...fset].join(';')}`, cols * TILE, rows * TILE, (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const isP = (cx, cy) => cy >= 0 && cx >= 0 && cy < rows && cx < cols && paths[cy][cx] === '=';
    if (fset.has(`${tx},${ty}`)) return flowerPx(tx, ty, x % TILE, y % TILE);
    if (!isP(tx, ty)) return null;
    // 가장 가까운 풀 칸까지 거리
    let d = 99;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || isP(tx + dx, ty + dy)) continue;
      const nx0 = (tx + dx) * TILE, ny0 = (ty + dy) * TILE;
      const ex = Math.max(nx0 - (x + 0.5), 0, x + 0.5 - (nx0 + TILE)), ey = Math.max(ny0 - (y + 0.5), 0, y + 0.5 - (ny0 + TILE));
      d = Math.min(d, Math.hypot(ex, ey));
    }
    const j = 2.5 + hash('pj', Math.floor(x / 3), Math.floor(y / 3)) * 2.5;
    if (d < j) return null;
    if (d < j + 1) return DIRT.edge;
    const n = hash('pn', x, y);
    if (n < 0.012) return DIRT.pebble;
    if (n < 0.05) return DIRT.dark;
    if (n > 0.95) return DIRT.light;
    if (d < j + 2.2 && hash('pe', x >> 1, y >> 1) < 0.5) return DIRT.dark;
    return DIRT.base;
  });
  ctx.drawImage(img, 0, 0);
}

// ---- 건물 ----
// 그리는 상자: 발판 + 위로 한 칸(지붕). 왼쪽 위 = (b.x, b.y - 1) 칸
const OVER = TILE;

function stump(W, H) {
  const cx = W / 2;
  const bark = ['#a87040', '#8a5a30', '#6a4020'];
  return (x, y) => {
    // 문 (둥근 나무문 + 테 + 돌 계단)
    const dc = dist(x, y, cx, 70);
    const inDoor = (y >= 70 && y < 89 && Math.abs(x + 0.5 - cx) <= 10) || (y < 70 && dc <= 10);
    const inFrame = (y >= 70 && y < 89 && Math.abs(x + 0.5 - cx) <= 12.5) || (y < 70 && dc <= 12.5);
    if (y >= 89 && y < 92 && Math.abs(x + 0.5 - cx) <= 11) return y === 89 ? '#cac2b4' : '#a89e90';
    if (inDoor) {
      if (x === Math.round(cx + 5) && y >= 77 && y <= 79) return '#f8d848'; // 손잡이
      if (Math.abs(x + 0.5 - cx) > 9 || dc > 9 && y < 70) return '#3a200c';
      return (x - 25) % 5 === 0 ? '#4a2810' : y < 72 ? '#7a4a20' : '#6a3e18';
    }
    if (inFrame) return dc < 11.5 && y < 70 ? '#e8b868' : x < cx ? '#d8a058' : '#b88040';
    // 동그란 창 (오른쪽)
    const wc = dist(x, y, 54, 52);
    if (wc <= 4.5) return Math.abs(x + 0.5 - 54) < 0.6 || Math.abs(y + 0.5 - 52) < 0.6 ? '#5a3418' : wc < 2.5 && x < 54 && y < 52 ? '#fff0b8' : '#f8c858';
    if (wc <= 6.5) return '#d8a058';
    // 장작더미 (왼쪽 아래)
    for (const [lx, ly] of [[6, 86], [13, 86], [9.5, 80.5]]) {
      const ld = dist(x, y, lx, ly);
      if (ld <= 3.6) return ld <= 1.2 ? '#a87040' : ld <= 2.6 ? '#e8c088' : '#c89050';
    }
    // 우편함 (문 오른쪽)
    if (x >= 61 && x <= 62 && y >= 80 && y < 91) return '#6a4020';
    if (x >= 57 && x <= 66 && y >= 73 && y <= 79) return y === 73 ? '#f07060' : x === 66 ? '#a83030' : '#e04848';
    if (x === 65 && y >= 69 && y <= 73) return '#f8d848'; // 깃발
    // 이끼 지붕 + 새싹
    const sprout = (x >= 35 && x <= 36 && y >= 8 && y <= 18) ? '#4a9038'
      : inEll(x, y, 31, 9, 5, 3) ? (y < 9 ? '#a8e070' : '#64b450')
      : inEll(x, y, 41, 6, 5, 3) ? (y < 6 ? '#a8e070' : '#64b450') : null;
    if (sprout) return sprout;
    const drip = [12, 21, 47, 58].some((dx, i) => Math.abs(x + 0.5 - dx) < 2.5 && y < 38 + (i % 2) * 5 + (Math.abs(x + 0.5 - dx) < 1.5 ? 2 : 0));
    if (inEll(x, y, cx, 26, 32, 12) || (drip && y >= 26 && inEll(x, y, cx, 40, 32, 30))) {
      const n = hash('moss', x >> 1, y >> 1);
      if (y < 20 && x < 30) return n < 0.5 ? '#b8f080' : '#90d468';
      if (x > 52 || y > 32) return n < 0.3 ? '#58b040' : '#3c8a34';
      return n < 0.15 ? '#b8f080' : n < 0.6 ? '#64b450' : '#58b040';
    }
    // 줄기 몸통 (아래로 뿌리가 퍼짐)
    const hw = 27 + (y > 78 ? (y - 78) * 0.9 : 0) + (y > 84 ? Math.abs(Math.sin(x * 0.5)) * 2 : 0);
    if (y >= 26 && y < 91 && Math.abs(x + 0.5 - cx) <= hw) {
      const rel = (x + 0.5 - cx) / hw;
      const groove = ((x * 7 + Math.floor(y / 9) * 3) % 11) < 2 && y > 34;
      if (rel < -0.75) return groove ? bark[1] : bark[0];
      if (rel > 0.7) return groove ? '#4a2c14' : bark[2];
      return groove ? bark[2] : hash('bk', x, y >> 2) < 0.12 ? bark[0] : bark[1];
    }
    if (inEll(x, y, cx, 91, 36, 4)) return SHADOW;
    return null;
  };
}

function tent(W, H) {
  const cx = W / 2, cy = 62, rx = 33, ry = 46;
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    // 꼭대기 장대
    if (dist(x, y, cx, 4) <= 2.2) return x < cx ? '#f8e878' : '#e0b830';
    if (x >= 35 && x <= 36 && y >= 6 && y <= 18) return x === 35 ? '#9a6a38' : '#6a4020';
    // 알 바구니 (오른쪽 아래)
    if (inEll(x, y, 62, 80, 3.5, 4.6)) return hash('egg', x, y) < 0.12 || dist(x, y, 63, 79) < 1.2 ? '#78c058' : x < 61 && y < 79 ? '#fffaf0' : '#f8f0d8';
    if (inEll(x, y, 67, 82, 2.6, 3.4)) return dist(x, y, 67, 83) < 1 ? '#f0a0b8' : x < 67 ? '#fffaf0' : '#f0e8d0';
    if (y >= 83 && y <= 90 && Math.abs(px - 64) <= 7 - (y - 83) * 0.3) return (x + y) % 3 === 0 ? '#a87038' : y === 83 ? '#e8b868' : '#c89048';
    const inDome = inEll(x, y, cx, cy, rx, ry) && y <= 90;
    if (inDome) {
      // 입구 (천을 걷어 올린 삼각 입구)
      const half = 3 + (py - 64) * 0.42;
      if (py >= 64 && y <= 90 && Math.abs(px - cx) <= half) {
        if (Math.abs(px - cx) > half - 1.5) return '#d8d0c0';
        return y > 86 ? '#2a1820' : '#402838';
      }
      // 볼 단추
      const bd = dist(x, y, cx, 53);
      if (bd <= 8) {
        if (bd > 6) return '#303038';
        if (bd > 4) return '#f8f8f8';
        return bd < 2.2 && x < cx ? '#ffffff' : '#e0e0e8';
      }
      if (y >= 50 && y <= 55) return '#303038';
      const hwid = rx * Math.sqrt(Math.max(0, 1 - ((py - cy) / ry) ** 2));
      const u = (px - cx) / hwid; // -1..1
      const seam = [-0.55, 0, 0.55].some((k) => Math.abs(u - k) * hwid < 0.6) && y < 50;
      if (y < 50) {
        if (seam) return '#a02830';
        if (u > 0.7) return '#b83038';
        if (u < -0.35 && py < 36 && hash('tr', x >> 1, y >> 1) < 0.85) return '#f07060';
        return '#e04848';
      }
      if (u > 0.72 || y > 86) return '#c8c4b8';
      return '#f0ece0';
    }
    // 바닥 말뚝 줄 (밑단)
    if (y >= 88 && y <= 90 && (Math.abs(px - 4) < 1 || Math.abs(px - 68) < 1)) return '#6a4020';
    if (inEll(x, y, cx, 91, 36, 4)) return SHADOW;
    return null;
  };
}
// 천막 깃발 줄: 장대에서 양쪽으로 늘어진 삼각 깃발 (구운 뒤 위에 그림)
const BUNT = ['#f8d848', '#4888e0', '#58b040', '#f8f8f8'];
function tentBunting(ctx, ox, oy) {
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 34; i++) {
      const x = 36 + side * i, y = 9 + i * 0.9 + Math.sin((i / 34) * Math.PI) * 4;
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(ox + x, oy + Math.round(y), 1, 1);
      if (i > 3 && i % 6 === 0) {
        ctx.fillStyle = BUNT[(i / 6 + (side > 0 ? 2 : 0)) % BUNT.length];
        for (let r = 1; r <= 3; r++) ctx.fillRect(ox + x - (3 - r), oy + Math.round(y) + r, (3 - r) * 2 + 1, 1);
      }
    }
  }
}
function tentFlag(ctx, ox, oy, time) {
  ctx.fillStyle = '#e04848';
  for (let i = 0; i < 9; i++) {
    const wave = Math.round(Math.sin(time * 5 - i * 0.7) * 1.2);
    const h = Math.max(1, 5 - Math.floor(i / 2));
    ctx.fillRect(ox + 37 + i, oy + 1 + wave + (5 - h) / 2, 1, h);
  }
}

function stall(W, H) {
  const cx = W / 2;
  return (x, y) => {
    const px = x + 0.5;
    // 큰 잎 지붕 (반쪽 타원 + 잎맥)
    if (x >= 35 && x <= 36 && y >= 4 && y <= 10) return '#6a4020';
    if (inEll(x, y, cx, 28, 36, 18) && y < 28) {
      const vein = Math.abs(px - cx) < 0.8 || [0, 1, 2].some((k) => Math.abs((y + 0.5) - (12 + k * 6) - Math.abs(px - cx) * 0.45) < 0.6);
      if (vein) return '#90d468';
      return px > cx + 20 || y > 23 ? '#2e7a2a' : px < cx - 14 && y < 20 ? '#58b040' : '#3c8a34';
    }
    // 줄무늬 차양 + 둥근 끝단
    const sx = (x - 2) % 8;
    const lobe = 40 + Math.sqrt(Math.max(0, 16 - (sx - 3.5) ** 2));
    if (x >= 2 && x <= 69 && y >= 28 && y <= lobe) {
      const g = Math.floor((x - 2) / 8) % 2 === 0;
      if (y >= lobe - 1) return g ? '#3c8a34' : '#90c060';
      return g ? (y < 31 ? '#64b450' : '#58b040') : (y < 31 ? '#d0f098' : '#b8e078');
    }
    // 걸린 간판 (나무 열매)
    if (dist(x, y, cx, 51) <= 6) {
      if (dist(x, y, cx - 1, 52) <= 3) return dist(x, y, cx - 2, 51) < 1.2 ? '#80c8ff' : '#4878d8';
      if (x === 37 && y >= 46 && y <= 48) return '#4a9038';
      return dist(x, y, cx, 51) > 5 ? '#a87038' : '#f8ecc8';
    }
    if ((x === 32 || x === 39) && y >= 44 && y <= 46) return '#5a3a20';
    // 기둥
    if ((x >= 7 && x <= 10) || (x >= 61 && x <= 64)) if (y > 40 && y < 91) return x === 7 || x === 61 ? '#c89048' : x === 10 || x === 64 ? '#6a4020' : '#8a5a30';
    // 열매 상자 (계산대 위)
    for (const [bx, c1, c2] of [[13, '#4878d8', '#80b0f0'], [45, '#e05878', '#f8a0b8']]) {
      if (x >= bx && x < bx + 14 && y >= 61 && y < 72) {
        if (y < 66) { const bd = (x - bx) % 4, br = (y - 61) % 4; if (y < 64 + ((x - bx) % 3 === 0 ? 1 : 0)) return bd === 1 && br === 0 ? c2 : c1; }
        return y === 66 ? '#e8b868' : x === bx || x === bx + 13 ? '#6a4020' : '#a87038';
      }
    }
    // 안쪽 선반 (병·열매)
    if (x > 10 && x < 61 && y > 40 && y < 70) {
      if (y === 56 || y === 66) return '#a87038';
      const jar = (row, cols) => { for (const [jx, c] of cols) if (Math.abs(px - jx) <= 2 && y >= row - 5 && y < row) return y === row - 5 ? '#f8f8f8' : c; return null; };
      const j = (y < 56 ? jar(56, [[15, '#e05878'], [22, '#f8d848'], [48, '#58b040'], [55, '#a070e0']]) : jar(66, [[16, '#4878d8'], [52, '#f08838']]));
      if (j) return j;
      return y < 44 ? '#2a1a10' : '#4a2c18';
    }
    // 계산대
    if (x >= 3 && x <= 68 && y >= 70 && y < 90) {
      if (y <= 71) return '#f0c878';
      if (y === 72) return '#c89048';
      if ((y - 73) % 6 === 5) return '#8a5a30';
      return x < 6 ? '#d8a058' : x > 65 ? '#8a5a30' : '#b88040';
    }
    if (inEll(x, y, cx, 90, 37, 4)) return SHADOW;
    return null;
  };
}

// 공사터: 흙바닥 + 말뚝·밧줄 + 무엇이 들어설지 보이는 재료
function lot(W, H, future) {
  const OY = 10, gw = W, gh = H - OY;
  const stakes = [];
  for (let sx = 2; sx < gw - 2; sx += 12) stakes.push([sx, OY + 2], [sx, OY + gh - 6]);
  stakes.push([gw - 4, OY + 2], [gw - 4, OY + gh - 6]);
  for (let sy = OY + 2 + 12; sy < OY + gh - 8; sy += 12) stakes.push([2, sy], [gw - 4, sy]);
  return (x, y) => {
    // 말뚝 (2px 폭, 8px 높이, 끝이 위로 튀어나옴)
    for (const [sx, sy] of stakes) if (x >= sx && x <= sx + 1 && y >= sy - 8 && y <= sy) return y === sy - 8 ? '#e8c088' : x === sx ? '#a87040' : '#6a4020';
    // 밧줄 (위·아래 변, 양 옆)
    const ropeY = (base, xx) => base - 6 + Math.round(Math.sin(((xx - 2) % 12) / 12 * Math.PI) * 1.5);
    if (x >= 2 && x <= gw - 3 && (y === ropeY(OY + 2, x) || y === ropeY(OY + gh - 6, x))) return (x >> 1) % 2 ? '#f0e0b0' : '#d8c088';
    if ((x === 3 || x === gw - 3) && y >= OY - 4 && y <= OY + gh - 12) return (y >> 1) % 2 ? '#f0e0b0' : '#d8c088';
    // 재료
    if (future === 'achieve') {
      // 판자 더미 + 기둥 하나
      for (let k = 0; k < 3; k++) if (y === OY + 26 - k * 3 || y === OY + 27 - k * 3) if (x >= 10 + k * 2 && x <= 36 - k * 2) return y % 3 === 0 ? '#c89048' : x === 10 + k * 2 ? '#6a4020' : '#e8b868';
      if (x >= 12 && x <= 14 && y >= OY + 6 && y <= OY + 21) return x === 12 ? '#c89048' : '#8a5a30';
    } else if (future === 'request') {
      // 상자 셋 + 우편 가방
      for (const [bx, by, s] of [[12, OY + 20, 10], [24, OY + 20, 10], [18, OY + 11, 9], [46, OY + 18, 12]]) {
        if (x >= bx && x < bx + s && y >= by && y < by + s - 1) return y === by ? '#f0c878' : x === bx || y === by + s - 2 ? '#6a4020' : (x - bx === y - by || x - bx === s - 1 - (y - by)) ? '#8a5a30' : '#b88040';
      }
    } else if (future === 'gate') {
      // 돌 기둥 받침 둘 + 바닥 돌판
      for (const bx of [10, gw - 22]) {
        if (x >= bx && x < bx + 12 && y >= OY + 12 && y < OY + 30) {
          const row = Math.floor((y - OY - 12) / 6), off = row % 2 ? 3 : 0;
          if ((y - OY - 12) % 6 === 0 || (x - bx + off) % 6 === 0) return '#5e5852';
          return x < bx + 3 ? '#cac2b4' : x > bx + 9 ? '#847c72' : '#a89e90';
        }
      }
      if (y >= OY + 34 && y < OY + 40 && x >= 24 && x < gw - 24) return (x - 24) % 6 === 0 || y === OY + 34 ? '#847c72' : '#a89e90';
    }
    // 흙바닥
    if (x >= 3 && x <= gw - 4 && y >= OY + 3 && y <= OY + gh - 3) {
      const n = hash('lot', future, x, y);
      if ((x === 3 || x === gw - 4 || y === OY + 3 || y === OY + gh - 3) && n < 0.6) return null;
      return n < 0.06 ? '#988868' : n < 0.2 ? '#b89868' : '#c8a878';
    }
    return null;
  };
}

const KINDS = { stump, tent, stall };

// b: { id, kind, x, y, w, h, future? } — 발판 칸 좌표
export function drawBuilding(ctx, b, time = 0) {
  const W = b.w * TILE;
  if (b.kind === 'lot') {
    const H = b.h * TILE + 10;
    const img = bake(`lot:${b.id}:${b.w}x${b.h}`, W, H, lot(W, H, b.future), null);
    ctx.drawImage(img, b.x * TILE, b.y * TILE - 10);
    return;
  }
  const H = b.h * TILE + OVER;
  const img = bake(`${b.kind}:${b.w}x${b.h}`, W, H, KINDS[b.kind](W, H), OUT);
  const ox = b.x * TILE, oy = b.y * TILE - OVER;
  ctx.drawImage(img, ox, oy);
  if (b.kind === 'tent') { tentBunting(ctx, ox, oy); tentFlag(ctx, ox, oy, time); }
  if (b.kind === 'stump') {
    // 창문 불빛 깜빡임
    const a = 0.12 + Math.sin(time * 2.3) * 0.06;
    ctx.fillStyle = `rgba(255,230,140,${a})`;
    ctx.fillRect(ox + 49, oy + 47, 11, 11);
  }
}

// 출격 게시판: 작은 맞배지붕 + 종이 몇 장 (한 칸, 위로 12px)
export function drawBoard(ctx, tx, ty) {
  const img = bake('board', 28, 38, (x, y) => {
    // 지붕
    if (y >= 0 && y <= 6) {
      const half = 4 + y * 2;
      if (Math.abs(x + 0.5 - 14) <= half) return y === 6 ? '#782820' : (x + y) % 4 === 0 ? '#8a3424' : y < 3 ? '#c85840' : '#a84830';
    }
    // 기둥
    if ((x === 5 || x === 6 || x === 21 || x === 22) && y > 6 && y < 35) return x === 5 || x === 21 ? '#a87040' : '#6a4020';
    // 판
    if (x >= 3 && x <= 24 && y >= 9 && y <= 25) {
      if (y === 9 || y === 25 || x === 3 || x === 24) return '#8a5a30';
      // 종이
      for (const [px, py, w, h, pin] of [[5, 11, 7, 8, '#e04040'], [14, 12, 8, 6, '#4888e0'], [9, 19, 6, 5, '#f8d848'], [17, 19, 5, 5, null]]) {
        if (x >= px && x < px + w && y >= py && y < py + h) {
          if (pin && x === px + (w >> 1) && y === py) return pin;
          return y > py && y < py + h - 1 && (y - py) % 2 === 0 && x > px && x < px + w - 1 ? '#a8a090' : '#f8f4e8';
        }
      }
      return '#c89048';
    }
    if (inEll(x, y, 14, 35, 12, 2.5)) return SHADOW;
    return null;
  }, OUT);
  ctx.drawImage(img, tx * TILE - 2, ty * TILE - 12);
}

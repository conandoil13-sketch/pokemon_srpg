// 맵 타일 도트 (24×24, PMD 와 같은 타일 크기)
import { patternCanvas, hash, shade } from './pixels.js';

export const TILE = 24;
// 테마 팔레트 (그리기만 다르고 규칙은 같다)
const THEMES = {
  field: {
    ground: ['#88d070', '#68b050', '#b0e890'], cover: { base: '#60b048', b: '#307020', m: '#50a030', l: '#98e068' },
    rock: ['#a88860', '#504030'], water: ['#4888e8', '#80b8f8', '#d8f0ff'], shore: '#e8e0a8', wall: 'tree',
  },
  cave: {
    ground: ['#9a8a78', '#7a6a5a', '#b8a894'], cover: { base: '#8a7a68', b: '#3848a0', m: '#7898e0', l: '#d0e8ff' },
    rock: ['#8c8070', '#3c342c'], water: ['#3058a0', '#5888c8', '#a8c8f0'], shore: '#6a5e50', wall: 'cave',
  },
};

const caches = {};

function canvas(fn) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  fn(c.getContext('2d'));
  return c;
}

function grassVariant(seed, [GRASS, GRASS_D, GRASS_L]) {
  return canvas((g) => {
    g.fillStyle = GRASS;
    g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(hash(seed, i, 'x') * 21) + 1;
      const y = Math.floor(hash(seed, i, 'y') * 19) + 3;
      g.fillStyle = GRASS_D;
      g.fillRect(x, y, 1, 2);
      g.fillRect(x + 2, y + 1, 1, 1);
      if (i % 2 === 0) { g.fillStyle = GRASS_L; g.fillRect(x + 1, y - 1, 1, 1); }
    }
  });
}

// 픽셀 함수 → 캔버스 (+ 외곽선)
function shape(base, fn, outline) {
  return canvas((g) => {
    g.drawImage(base, 0, 0);
    const px = [];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px.push(fn(x, y));
    const at = (x, y) => (x < 0 || y < 0 || x >= TILE || y >= TILE ? null : px[y * TILE + x]);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const c = at(x, y);
      if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); continue; }
      if (outline && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy))) {
        g.fillStyle = outline; g.fillRect(x, y, 1, 1);
      }
    }
  });
}

const TUFT = ['........', '.l...l..', '.ml.lm..', 'lmmlmml.', 'bmmmmmb.', 'bbmmmbb.', '.bbbbb..', '........'];

function tallGrass(c) {
  const tuft = patternCanvas(TUFT, { b: c.b, m: c.m, l: c.l });
  return canvas((g) => {
    g.fillStyle = c.base;
    g.fillRect(0, 0, TILE, TILE);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.drawImage(tuft, x * 8, y * 8);
  });
}

function rock(base, [R, outline]) {
  return shape(base, (x, y) => {
    // 봉우리 두 개 바위산
    const peaks = [[9, 5, 9], [16, 9, 7]];
    let inside = false, light = 0;
    for (const [px, py, r] of peaks) {
      const dx = x - px;
      if (y >= py && Math.abs(dx) <= (y - py) * 0.9 + 1 && y <= 21) { inside = true; light += -dx / r; }
    }
    if (!inside) return null;
    if (y >= 20) return shade(R, 0.7);
    return light > 0.35 ? shade(R, 1.35) : light < -0.3 ? shade(R, 0.72) : R;
  }, outline);
}

function tree(base) {
  return shape(base, (x, y) => {
    const dx = x - 11.5, dy = y - 9.5;
    const d = Math.sqrt(dx * dx + dy * dy * 1.1);
    if (d <= 10) {
      const lit = -dx * 0.6 - dy * 0.8;
      const bump = hash(x >> 1, y >> 1) > 0.75 ? 1 : 0;
      if (lit > 4 + bump) return '#78c858';
      if (lit < -3 - bump) return '#286830';
      return '#48a048';
    }
    if (x >= 10 && x <= 13 && y > 18 && y <= 22) return x === 10 ? '#583818' : '#885828';
    return null;
  }, '#183818');
}

function water(frame, [deep, wave, spark]) {
  return canvas((g) => {
    g.fillStyle = deep;
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle = wave;
    const o = frame * 6;
    for (const [y, off] of [[6, 0], [17, 12]]) {
      const x = (off + o) % TILE;
      g.fillRect(x, y, 6, 1);
      g.fillRect((x + 6) % TILE, y - 1, 3, 1);
    }
    g.fillStyle = spark;
    g.fillRect((4 + o) % TILE, 6, 1, 1);
  });
}

// 동굴 벽: 위가 밝고 아래가 어두운 울퉁불퉁한 바위 덩어리
function caveWall() {
  return canvas((g) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const n = hash(x >> 2, y >> 2, 'w');
      g.fillStyle = shade('#5a4e44', 1.25 - y / 40 + (n - 0.5) * 0.25);
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#2e2620';
    for (let x = 0; x < TILE; x += 6) g.fillRect(x + (hash(x, 'c') * 4 | 0), 8 + (hash(x, 'd') * 10 | 0), 3, 1);
  });
}

// 계단: 바닥에 뚫린 구멍 + 내려가는 단
function stairs(base) {
  return canvas((g) => {
    g.drawImage(base, 0, 0);
    g.fillStyle = '#282018'; g.fillRect(3, 3, 18, 18);
    const steps = ['#c8b898', '#a89878', '#887858', '#685838'];
    steps.forEach((c, i) => { g.fillStyle = c; g.fillRect(5 + i * 2, 5 + i * 4, 14 - i * 4, 3); });
    g.fillStyle = '#f8f0d8'; g.fillRect(3, 3, 18, 1);
  });
}

function build(theme) {
  const P = THEMES[theme] ?? THEMES.field;
  const grass = [0, 1, 2, 3].map((i) => grassVariant(`${theme}${i}`, P.ground));
  return {
    shore: P.shore, grass, tall: tallGrass(P.cover), rock: rock(grass[0], P.rock),
    wall: P.wall === 'cave' ? caveWall() : tree(grass[1]),
    water: [water(0, P.water), water(1, P.water)], stairs: stairs(grass[2]),
  };
}

// 보물상자 (월드 좌표 타일)
export function drawChest(ctx, tx, ty) {
  const x = tx * TILE + 5, y = ty * TILE + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 1, y + 11, 14, 2);
  ctx.fillStyle = '#402810'; ctx.fillRect(x, y, 14, 11);
  ctx.fillStyle = '#b87830'; ctx.fillRect(x + 1, y + 1, 12, 9);
  ctx.fillStyle = '#d89848'; ctx.fillRect(x + 1, y + 1, 12, 3);
  ctx.fillStyle = '#402810'; ctx.fillRect(x, y + 4, 14, 1);
  ctx.fillStyle = '#f8d040'; ctx.fillRect(x + 6, y + 4, 2, 3);
}

// 보이는 범위만 그린다 (camX/camY = 월드 픽셀, 호출 측에서 translate 한 상태)
export function drawMap(ctx, grid, time, camX = 0, camY = 0, viewW = 256, viewH = 192, theme = 'field') {
  const cache = (caches[theme] ??= build(theme));
  const wf = Math.floor(time / 0.6) % 2;
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(grid[0].length - 1, Math.floor((camX + viewW) / TILE));
  const y1 = Math.min(grid.length - 1, Math.floor((camY + viewH) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = grid[y][x], px = x * TILE, py = y * TILE;
      if (t === '~') {
        ctx.drawImage(cache.water[wf], px, py);
        ctx.fillStyle = cache.shore;
        const not = (yy, xx) => grid[yy]?.[xx] !== undefined && grid[yy][xx] !== '~';
        if (not(y - 1, x)) ctx.fillRect(px, py, TILE, 2);
        if (not(y + 1, x)) ctx.fillRect(px, py + TILE - 2, TILE, 2);
        if (not(y, x - 1)) ctx.fillRect(px, py, 2, TILE);
        if (not(y, x + 1)) ctx.fillRect(px + TILE - 2, py, 2, TILE);
      } else if (t === '"') ctx.drawImage(cache.tall, px, py);
      else if (t === '^') ctx.drawImage(cache.rock, px, py);
      else if (t === '#') ctx.drawImage(cache.wall, px, py);
      else if (t === '>') ctx.drawImage(cache.stairs, px, py);
      else ctx.drawImage(cache.grass[Math.floor(hash(x, y) * 4)], px, py);
    }
  }
}

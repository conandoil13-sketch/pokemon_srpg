// 스프라이트 등록소: 사용자 스프라이트 팩 → 없으면 오리지널 임시 도트
import { SPECIES } from '../data/species.js';
import { TYPE_COLORS } from '../data/types.js';
import { shade, hash } from './pixels.js';

const KINDS = ['icons', 'front', 'back'];
const images = {}; // `${kind}/${key}` → HTMLImageElement | null
const fallback = {}; // `${kind}/${key}/${size}` → canvas
let warned = false;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadSprites(speciesKeys) {
  const jobs = [];
  for (const key of speciesKeys) {
    for (const kind of KINDS) {
      jobs.push(loadImage(`assets/sprites/${kind}/${SPECIES[key].dex}.png`).then((img) => {
        images[`${kind}/${key}`] = img;
        if (!img && !warned) {
          warned = true;
          console.warn('[sprites] Sprite pack not found (or incomplete) — using placeholder pixel art.');
        }
      }));
    }
  }
  await Promise.all(jobs);
}

// ---------- 오리지널 임시 도트 생성 ----------
// N×N 격자에 타입 색 기반 생물 실루엣을 찍는다. back=true 면 뒷모습(눈 없음).
function makeCreature(key, N, back) {
  const s = SPECIES[key];
  const c1 = TYPE_COLORS[s.types[0]];
  const c2 = s.types[1] ? TYPE_COLORS[s.types[1]] : shade(c1, 1.45);
  const variant = Math.floor(hash(key) * 4);
  const grid = Array.from({ length: N }, () => new Array(N).fill(null));
  const put = (x, y, col) => { if (x >= 0 && y >= 0 && x < N && y < N) grid[y][x] = col; };

  const cx = (N - 1) / 2, cy = N * 0.62, rx = N * 0.32, ry = N * 0.28;
  // 귀/뿔/지느러미
  const earH = Math.round(N * 0.22);
  for (let i = 0; i < earH; i++) {
    const w = variant === 1 ? Math.round(earH * 0.5) : Math.max(1, Math.round((i / earH) * earH * 0.6));
    const top = Math.round(cy - ry) - earH + i + 1;
    if (variant === 2) { // 가운데 뿔
      for (let dx = -Math.floor(w / 2); dx <= Math.floor(w / 2); dx++) put(Math.round(cx) + dx, top, c2);
    } else if (variant === 3) { // 볏
      for (let k = -1; k <= 1; k++) if (i >= Math.abs(k) * 2) put(Math.round(cx + k * N * 0.12), top, c2);
    } else {
      for (let dx = 0; dx < w; dx++) {
        put(Math.round(cx - rx * 0.6) + dx - Math.floor(w / 2), top, c1);
        put(Math.round(cx + rx * 0.6) + dx - Math.floor(w / 2), top, c1);
      }
    }
  }
  // 꼬리
  const tailX = Math.round(cx + rx) - 1, tailY = Math.round(cy);
  for (let i = 0; i < Math.round(N * 0.18); i++) {
    put(tailX + i, tailY - i, c2);
    put(tailX + i, tailY - i - 1, c2);
  }
  // 몸통 (명암 포함)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      let col = c1;
      if (nx * 0.7 + ny * 0.7 > 0.55) col = shade(c1, 0.75);
      else if (nx * nx + (ny + 0.45) ** 2 < 0.08 && nx < 0) col = shade(c1, 1.4);
      put(x, y, col);
    }
  }
  // 배 (앞모습)
  if (!back) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x - cx) / (rx * 0.5), ny = (y - (cy + ry * 0.35)) / (ry * 0.5);
      if (nx * nx + ny * ny <= 1) put(x, y, c2);
    }
  }
  // 발
  const footY = Math.round(cy + ry) - 1;
  for (const fx of [cx - rx * 0.5, cx + rx * 0.5]) {
    for (let dx = -1; dx <= 1; dx++) { put(Math.round(fx) + dx, footY, shade(c1, 0.6)); put(Math.round(fx) + dx, footY + 1, shade(c1, 0.6)); }
  }
  // 외곽선
  const outline = shade(c1, 0.3);
  const filled = grid.map((r) => r.map((v) => v !== null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (filled[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled[y + dy]?.[x + dx])) grid[y][x] = outline;
  }
  // 눈
  if (!back) {
    const ey = Math.round(cy - ry * 0.3), eh = Math.max(2, Math.round(N / 12));
    for (const ex of [Math.round(cx - rx * 0.38), Math.round(cx + rx * 0.38)]) {
      for (let dy = 0; dy < eh; dy++) put(ex, ey + dy, '#202020');
      put(ex, ey, '#ffffff');
    }
  }

  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  grid.forEach((row, y) => row.forEach((col, x) => { if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
  return c;
}

function fallbackCanvas(kind, key, N) {
  const k = `${kind}/${key}/${N}`;
  return (fallback[k] ??= makeCreature(key, N, kind === 'back'));
}

// 맵 아이콘: (px,py) = 칸 왼쪽 위, 발을 칸 하단 중앙에 맞춤
export function drawIcon(ctx, key, px, py, frame) {
  const img = images[`icons/${key}`];
  if (img) {
    const fs = img.height, frames = Math.max(1, Math.floor(img.width / fs));
    const k = fs <= 32 ? 1 : Math.ceil(fs / 32);
    const d = Math.floor(fs / k);
    ctx.drawImage(img, (frame % frames) * fs, 0, fs, fs, px + 8 - d / 2, py + 16 - d, d, d);
    return;
  }
  const c = fallbackCanvas('icons', key, 20);
  ctx.drawImage(c, px - 2, py - 5 + (frame ? 1 : 0));
}

// 원본 크기 h 를 size 이하로 맞춘 정수 배율 결과 크기 (작으면 정수 확대, 크면 정수 축소)
export function battleSpriteSize(h, size) {
  if (h <= size) return h * Math.max(1, Math.floor(size / h));
  return Math.floor(h / Math.ceil(h / size));
}

// 배틀 스프라이트: (cx, bottomY) = 하단 중앙
export function drawBattleSprite(ctx, key, kind, cx, bottomY, size = 96) {
  const img = images[`${kind}/${key}`];
  if (img) {
    const h = battleSpriteSize(img.height, size);
    const w = Math.round(img.width * h / img.height);
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(bottomY - h), w, h);
    return;
  }
  const c = fallbackCanvas(kind, key, 32);
  ctx.drawImage(c, Math.round(cx - 32), Math.round(bottomY - 64), 64, 64);
}

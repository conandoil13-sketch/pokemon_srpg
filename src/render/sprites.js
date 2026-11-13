// 스프라이트 등록소
// 1순위: PMD Sprite Collab 폴더 (assets/sprites/pmd/sprite/0392/AnimData.xml + *-Anim.png,
//        assets/sprites/pmd/portrait/0392/Normal.png …) — 사용자가 직접 받아 넣는다.
// 없으면: 코드로 그린 오리지널 임시 도트.
import { SPECIES } from '../data/species.js';
import { TYPE_COLORS } from '../data/types.js';
import { shade, hash } from './pixels.js';
import { parseAnimData, frameAt, animLength, DIR } from './pmdData.js';

// 앞에서부터 찾는다: 직접 넣은 폴더 → 저장소 통째로 받은 폴더
export const PMD_BASES = ['assets/sprites/pmd', 'SpriteCollab-master'];
const WANT_ANIMS = ['Idle', 'Walk', 'Attack', 'Strike', 'Shoot', 'Hurt'];
const EMOTIONS = ['Normal', 'Determined', 'Pain', 'Happy'];

const pmd = {};       // key → { data, sheets: {sheet: img} } | null
const portraits = {}; // `${key}/${emotion}` → img | null
const fallback = {};
let warned = false;

const pad4 = (n) => String(n).padStart(4, '0');

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadPmd(key) {
  let data, dir, base;
  for (const b of PMD_BASES) {
    const d = `${b}/sprite/${pad4(SPECIES[key].dex)}`;
    try {
      const res = await fetch(`${d}/AnimData.xml`);
      if (!res.ok) continue;
      data = parseAnimData(await res.text());
      dir = d; base = b;
      break;
    } catch { /* 다음 위치 */ }
  }
  if (!data) return null;
  const sheets = {};
  const names = new Set(WANT_ANIMS.map((n) => data.anims[n]?.sheet).filter(Boolean));
  await Promise.all([...names].map(async (s) => { sheets[s] = await loadImage(`${dir}/${s}-Anim.png`); }));
  if (!data.anims.Idle || !sheets[data.anims.Idle.sheet]) return null;
  return { data, sheets, base };
}

// 종족 하나의 PMD 시트·초상화 로드 (기본 로더)
async function loadOne(key) {
  pmd[key] = await loadPmd(key);
  const dir = `${pmd[key]?.base ?? PMD_BASES[0]}/portrait/${pad4(SPECIES[key].dex)}`;
  await Promise.all(EMOTIONS.map(async (e) => { portraits[`${key}/${e}`] = await loadImage(`${dir}/${e}.png`); }));
  if (!pmd[key] && !warned) {
    warned = true;
    console.warn('[sprites] PMD sprite folder not found for some Pokémon — using placeholder pixel art.');
  }
}

// 지연 로딩: 필요한 종족만, 종족마다 한 번만 요청. 로드 전·실패 시엔 임시 도트로 그린다
let loader = loadOne;
const requested = new Map(); // key → Promise
export const setSpriteLoader = (fn) => { loader = fn; requested.clear(); }; // 테스트용

export function requestSprites(keys) {
  return Promise.all([...new Set(keys)].map((key) => {
    if (!requested.has(key)) requested.set(key, Promise.resolve().then(() => loader(key)).catch(() => {}));
    return requested.get(key);
  })).then(() => {});
}

export const loadSprites = requestSprites; // 이전 이름

export const hasPmd = (key) => !!pmd[key];

// 애니메이션이 없으면 대체: Attack ← Strike, Shoot ← Attack, Walk ← Idle
function pickAnim(p, name) {
  const order = { Attack: ['Attack', 'Strike'], Shoot: ['Shoot', 'Attack', 'Strike'], Walk: ['Walk', 'Idle'], Hurt: ['Hurt', 'Idle'] }[name] ?? [name, 'Idle'];
  for (const n of order) {
    const a = p.data.anims[n];
    if (a && p.sheets[a.sheet]) return a;
  }
  return p.data.anims.Idle;
}

// 애니메이션 길이(초)와 타격 시점(초). 임시 도트는 고정값
export function animTiming(key, name) {
  const p = pmd[key];
  if (!p) return { length: 0.45, hit: 0.22 };
  const a = pickAnim(p, name);
  const len = animLength(a) / 60;
  const hitTicks = a.hitFrame === null ? animLength(a) / 2 : a.durations.slice(0, a.hitFrame).reduce((s, d) => s + d, 0);
  return { length: len, hit: hitTicks / 60 };
}

// ---------- 임시 도트 ----------
function makeCreature(key, N) {
  const s = SPECIES[key];
  const c1 = TYPE_COLORS[s.types[0]];
  const c2 = s.types[1] ? TYPE_COLORS[s.types[1]] : shade(c1, 1.45);
  const variant = Math.floor(hash(key) * 4);
  const grid = Array.from({ length: N }, () => new Array(N).fill(null));
  const put = (x, y, col) => { if (x >= 0 && y >= 0 && x < N && y < N) grid[y][x] = col; };
  const cx = (N - 1) / 2, cy = N * 0.62, rx = N * 0.32, ry = N * 0.28;
  const earH = Math.round(N * 0.22);
  for (let i = 0; i < earH; i++) {
    const w = variant === 1 ? Math.round(earH * 0.5) : Math.max(1, Math.round((i / earH) * earH * 0.6));
    const top = Math.round(cy - ry) - earH + i + 1;
    if (variant === 2) for (let dx = -Math.floor(w / 2); dx <= Math.floor(w / 2); dx++) put(Math.round(cx) + dx, top, c2);
    else if (variant === 3) { for (let k = -1; k <= 1; k++) if (i >= Math.abs(k) * 2) put(Math.round(cx + k * N * 0.12), top, c2); }
    else for (let dx = 0; dx < w; dx++) { put(Math.round(cx - rx * 0.6) + dx - Math.floor(w / 2), top, c1); put(Math.round(cx + rx * 0.6) + dx - Math.floor(w / 2), top, c1); }
  }
  const tailX = Math.round(cx + rx) - 1, tailY = Math.round(cy);
  for (let i = 0; i < Math.round(N * 0.18); i++) { put(tailX + i, tailY - i, c2); put(tailX + i, tailY - i - 1, c2); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    let col = c1;
    if (nx * 0.7 + ny * 0.7 > 0.55) col = shade(c1, 0.75);
    else if (nx * nx + (ny + 0.45) ** 2 < 0.08 && nx < 0) col = shade(c1, 1.4);
    put(x, y, col);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = (x - cx) / (rx * 0.5), ny = (y - (cy + ry * 0.35)) / (ry * 0.5);
    if (nx * nx + ny * ny <= 1) put(x, y, c2);
  }
  const footY = Math.round(cy + ry) - 1;
  for (const fx of [cx - rx * 0.5, cx + rx * 0.5]) for (let dx = -1; dx <= 1; dx++) { put(Math.round(fx) + dx, footY, shade(c1, 0.6)); put(Math.round(fx) + dx, footY + 1, shade(c1, 0.6)); }
  const outline = shade(c1, 0.3);
  const filled = grid.map((r) => r.map((v) => v !== null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!filled[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled[y + dy]?.[x + dx])) grid[y][x] = outline;
  }
  const ey = Math.round(cy - ry * 0.3), eh = Math.max(2, Math.round(N / 12));
  for (const ex of [Math.round(cx - rx * 0.38), Math.round(cx + rx * 0.38)]) { for (let dy = 0; dy < eh; dy++) put(ex, ey + dy, '#202020'); put(ex, ey, '#ffffff'); }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  grid.forEach((row, y) => row.forEach((col, x) => { if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
  return c;
}
const creature = (key, N) => (fallback[`${key}/${N}`] ??= makeCreature(key, N));

// ---------- 그리기 ----------
// (cx, cy) = 타일 중심(월드 좌표). anim: 'Idle'|'Walk'|'Attack'|'Shoot'|'Hurt', dir: DIR, t: 경과 초
export function drawUnitSprite(ctx, key, anim, dir, t, cx, cy, loop = true) {
  const p = pmd[key];
  if (p) {
    const a = pickAnim(p, anim);
    const img = p.sheets[a.sheet];
    const rows = Math.max(1, Math.round(img.height / a.frameH));
    const f = frameAt(a, Math.floor(t * 60), loop);
    const row = rows >= 8 ? dir : 0;
    ctx.drawImage(img, f * a.frameW, row * a.frameH, a.frameW, a.frameH,
      Math.round(cx - a.frameW / 2), Math.round(cy - a.frameH / 2), a.frameW, a.frameH);
    return;
  }
  // 임시 도트: 22px, 좌측을 볼 때 좌우 반전, Idle 은 살짝 들썩임
  const c = creature(key, 22);
  const bob = anim === 'Idle' ? (Math.floor(t / 0.5) % 2) : anim === 'Walk' ? (Math.floor(t / 0.12) % 2) : 0;
  const flip = dir === DIR.Left || dir === DIR.UpLeft || dir === DIR.DownLeft;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy + 8 - 22 + bob));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(c, -11, 0);
  ctx.restore();
}

export function drawShadow(ctx, cx, cy, color = 'rgba(0,0,0,0.28)') {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(cx) - 6, Math.round(cy) + 6, 12, 3);
  ctx.fillRect(Math.round(cx) - 8, Math.round(cy) + 7, 16, 1);
}

// 40×40 초상화. emotion 이 없으면 Normal, 그것도 없으면 임시 도트
export function drawPortrait(ctx, key, emotion, x, y) {
  const img = portraits[`${key}/${emotion}`] ?? portraits[`${key}/Normal`];
  if (img) { ctx.drawImage(img, 0, 0, 40, 40, x, y, 40, 40); return; }
  ctx.fillStyle = shade(TYPE_COLORS[SPECIES[key].types[0]], 1.6);
  ctx.fillRect(x, y, 40, 40);
  ctx.drawImage(creature(key, 32), x + 4, y + 6);
}

export { DIR };

// 깊은 동굴 어둠 덮개 (맵 바로 위, 이동 범위·유닛 아래에 그림). 빛은 칸이 아니라 픽셀 거리로 계산해 둥글고 매끈한 경계, 3px 블록 바이어 디더링.
// 보이는 칸 = 그대로 (시야 끝 칸은 살짝 어둡게) · 기억 칸 = 짙은 남색 · 처음 칸 = 검정. 아군 발밑 따뜻한 빛, 보스 주변 붉은 빛,
// 새로 보인 칸은 잠깐 밝아짐. 스펙 docs/superpowers/specs/2026-11-22-deep-cave-design.md
import { seenCells, sightOf, BOSS_LIGHT } from '../core/vision.js';

const T = 24, B = 3, N = T / B; // 3px 블록
const DARK = '#070916';
const BASE = [1, 0.74]; // 처음 칸 · 기억 칸 어둠
const LV = [0, 0.1, 0.22, 0.38, 0.56, 0.74, 1]; // 어둠 단계 (사이는 바이어 디더링)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const P = 1.25; // 마름모와 원 사이 — 맨해튼 시야 모양을 둥글게
const flashes = new WeakMap(); // state → { prev: Set, at: Map<key, time> }
const FLASH = 0.45;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function drawDarkness(ctx, state, time, camX, camY, viewW, viewH) {
  if (!state.dark) return;
  const seen = seenCells(state, 'ally'), ex = state.explored ?? new Set();
  const viewers = state.units.filter((u) => u.side === 'ally' && u.hp > 0);
  const boss = state.units.find((u) => u.boss && u.side === 'enemy' && u.hp > 0);
  // 빛: 칸 중심 기준 반지름 (칸 단위). 밝기 = 반지름 - 거리 → 매끈한 경계
  const lights = viewers.map((v) => ({ x: v.x + 0.5, y: v.y + 0.5, r: sightOf(v) + 0.45 }));
  if (boss) lights.push({ x: boss.x + 0.5, y: boss.y + 0.5, r: BOSS_LIGHT + 0.45 });
  const lightAt = (fx, fy) => {
    let best = -Infinity;
    for (const l of lights) {
      const dx = Math.abs(fx - l.x), dy = Math.abs(fy - l.y);
      if (dx + dy > l.r + 2) continue;
      best = Math.max(best, l.r - (dx ** P + dy ** P) ** (1 / P));
    }
    return best;
  };
  const base = (x, y) => (x < 0 || y < 0 || x >= state.width || y >= state.height ? 1 : ex.has(`${x},${y}`) ? BASE[1] : BASE[0]);

  // 새로 보인 칸 기록
  let f = flashes.get(state);
  if (!f) { f = { prev: new Set(seen), at: new Map() }; flashes.set(state, f); }
  for (const k of seen) if (!f.prev.has(k)) f.at.set(k, time);
  f.prev = new Set(seen);

  const x0 = Math.max(0, Math.floor(camX / T)), y0 = Math.max(0, Math.floor(camY / T));
  const x1 = Math.min(state.width - 1, Math.floor((camX + viewW) / T)), y1 = Math.min(state.height - 1, Math.floor((camY + viewH) / T));
  const rects = LV.map(() => []); // 단계별로 모아 한 번에 칠함
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const b0 = base(x, y);
    let flat = lightAt(x + 0.5, y + 0.5) < -1.6; // 빛이 닿지 않는 칸
    if (flat) for (let j = -1; j <= 1 && flat; j++) for (let i = -1; i <= 1; i++) if (base(x + i, y + j) !== b0) { flat = false; break; }
    if (flat) { rects[LV.indexOf(b0)].push(x * T, y * T, T, T); continue; }
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      const fx = x + (bx + 0.5) / N, fy = y + (by + 0.5) / N;
      // 기억/처음 경계: 칸 중심 사이 쌍선형으로 부드럽게
      const cx = fx - 0.5, cy = fy - 0.5, ix = Math.floor(cx), iy = Math.floor(cy), tx = cx - ix, ty = cy - iy;
      const a0 = (base(ix, iy) * (1 - tx) + base(ix + 1, iy) * tx) * (1 - ty) + (base(ix, iy + 1) * (1 - tx) + base(ix + 1, iy + 1) * tx) * ty;
      const a = a0 * (1 - smooth(-0.25, 0.9, lightAt(fx, fy)));
      let i = 0;
      while (i < LV.length - 2 && a >= LV[i + 1]) i++;
      const t = (a - LV[i]) / (LV[i + 1] - LV[i]);
      const gx = x * N + bx, gy = y * N + by;
      const lv = t > (BAYER[(gy & 3) * 4 + (gx & 3)] + 0.5) / 16 ? i + 1 : i;
      if (lv) rects[lv].push(x * T + bx * B, y * T + by * B, B, B);
    }
  }
  ctx.save();
  ctx.fillStyle = DARK;
  for (let lv = 1; lv < LV.length; lv++) {
    const r = rects[lv];
    if (!r.length) continue;
    ctx.globalAlpha = LV[lv];
    ctx.beginPath();
    for (let k = 0; k < r.length; k += 4) ctx.rect(r[k], r[k + 1], r[k + 2], r[k + 3]);
    ctx.fill();
  }
  // 새로 보인 칸: 잠깐 밝게
  ctx.fillStyle = '#c8d8ff';
  for (const [k, t0] of f.at) {
    const k2 = (time - t0) / FLASH;
    if (k2 >= 1 || k2 < 0) { f.at.delete(k); continue; }
    const [x, y] = k.split(',').map(Number);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    ctx.globalAlpha = 0.18 * (1 - k2);
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) if (((bx + by) & 1) === 0) ctx.fillRect(x * T + bx * B, y * T + by * B, B, B);
  }
  // 빛: 아군 발밑 따뜻한 빛 · 보스 주변 붉은 빛 (4px 블록 계단, 살짝 깜빡임)
  ctx.globalCompositeOperation = 'lighter';
  const glow = (cx, cy, r, color, base) => {
    ctx.fillStyle = color;
    const flick = 0.85 + 0.15 * Math.sin(time * 5 + cx * 0.13);
    for (let by = Math.floor((cy - r) / B); by <= Math.floor((cy + r) / B); by++) for (let bx = Math.floor((cx - r) / B); bx <= Math.floor((cx + r) / B); bx++) {
      const d = Math.hypot(bx * B + B / 2 - cx, (by * B + B / 2 - cy) * 1.3) / r;
      if (d > 1) continue;
      const step = d < 0.35 ? 3 : d < 0.65 ? 2 : 1;
      if (step === 1 && ((bx + by) & 1)) continue; // 바깥 고리는 디더링
      ctx.globalAlpha = base * step * flick;
      ctx.fillRect(bx * B, by * B, B, B);
    }
  };
  for (const v of viewers) glow(v.x * T + T / 2, v.y * T + T - 4, T * (v.ability === 'illuminate' ? 2.2 : 1.4), '#ffb060', 0.035);
  if (boss) glow(boss.x * T + T / 2, boss.y * T + T / 2, T * 2, '#ff3828', 0.03);
  ctx.restore();
}

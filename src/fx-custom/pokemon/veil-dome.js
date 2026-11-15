// Veil dome: a see-through pink veil swells over the 2-tile aura, a glint runs round its rim, and it melts away. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Veil Dome",
  desc: "A soft translucent pink dome grows over a two-tile area, its rim catches a travelling glint and a few sparkles, then it fades.",
  tags: ["shield", "aura", "buff", "translucent", "one-shot"],
  size: [144, 128],
  origin: [72, 72],
  duration: 1.4,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#5a1840", "#a83a7a", "#e070b0", "#f8a8d8", "#ffe0f4"], seed: 2 },
};

const RX = 60, RY = 54, CY = -6, GROW = 0.35, GLINT = [0.4, 0.85], FADE = [0.9, 1.4];

export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed);
  const g = ease.outBack(clamp(t / GROW, 0, 1)), fade = 1 - clamp((t - FADE[0]) / (FADE[1] - FADE[0]), 0, 1);
  if (g <= 0 || fade <= 0) return;
  const rx = RX * g, ry = RY * g;
  const sweep = clamp((t - GLINT[0]) / (GLINT[1] - GLINT[0]), 0, 1) * TAU * 1.0 - Math.PI / 2;
  p.each(-rx - 1, CY - ry - 1, rx + 1, CY + ry + 1, (x, y, sx, sy) => {
    const dx = x / rx, dy = (y - CY) / ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) return;
    const rim = d > 0.93;
    const hi = dx < -0.2 && dy < -0.3 && d > 0.6 && d < 0.8; // 왼쪽 위 하이라이트
    let c = C[2], a = 0.12 + 0.18 * d * d;
    if (rim) { c = C[3]; a = 0.55; }
    if (hi) { c = C[4]; a = 0.35; }
    if (rim && t > GLINT[0] && t < GLINT[1] + 0.1) {
      const ang = Math.atan2(dy, dx), diff = Math.abs(((ang - sweep) % TAU + TAU + Math.PI) % TAU - Math.PI);
      if (diff < 0.25) { c = WHITE; a = 0.9; }
    }
    p.blendPx(sx, sy, c, a * fade);
  });
  for (let i = 0; i < 9; i++) { // 반짝이
    const a = R.range(0, TAU), r = R.range(0.3, 0.9), ph = R.range(0.3, 1.1);
    const k = 1 - Math.abs(t - ph) / 0.12;
    if (k <= 0) continue;
    const x = Math.cos(a) * rx * r, y = CY + Math.sin(a) * ry * r;
    p.dot(x, y, WHITE, fade); if (k > 0.5) { p.dot(x - 1, y, C[4], fade); p.dot(x + 1, y, C[4], fade); p.dot(x, y - 1, C[4], fade); p.dot(x, y + 1, C[4], fade); }
  }
  p.glow(0, CY, rx * 0.7, C[3], 0.08 * fade);
}

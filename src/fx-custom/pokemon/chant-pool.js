// Chant pool: a purple pool spreads under the user's feet and purple droplets lift off it, rise and pop. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Chant Pool",
  desc: "A glossy purple puddle spreads at the feet with a ripple, droplets peel off it one after another, float up swaying and pop into sparkles; the pool then drains away.",
  tags: ["magic", "pool", "drops", "buff", "one-shot"],
  size: [64, 80],
  origin: [32, 68],
  duration: 1.5,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1a0a24", "#3a1450", "#5e2482", "#8a3cb4", "#b46ae0", "#dca8f8", "#f8e8ff"], seed: 5 },
};

const GROW = 0.35, DRAIN = [1.1, 1.5], RX = 15;

export function draw(p, t, o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed);
  const g = ease.outBack(clamp(t / GROW, 0, 1)) * (1 - ease.inQuad(clamp((t - DRAIN[0]) / (DRAIN[1] - DRAIN[0]), 0, 1)));
  const rx = RX * g, ry = rx * 0.38;
  if (rx > 1) {
    p.ellipse(0, 0, rx + 1, ry + 1, C[1]);
    p.ellipse(0, 0, rx, ry, (d) => (d > 0.75 ? C[3] : C[2]));
    p.ellipse(-rx * 0.3, -ry * 0.3, rx * 0.35, Math.max(0.8, ry * 0.3), C[4]); // 윤기
    const rk = ((t * 1.6) % 1); // 잔물결
    p.ring && p.ellipse(0, 0, rx * rk, ry * rk, C[4], (d) => (d > 0.85 ? 0.6 * (1 - rk) : 0));
    p.glow(0, 0, rx, C[3], 0.15);
  }
  for (let i = 0; i < 11; i++) {
    const d = 0.15 + i * 0.05 + R.range(0, 0.04), life = R.range(0.42, 0.55), sx = R.range(-0.7, 0.7) * RX, h = R.range(22, 40), sw = R.range(1.5, 3);
    const u = (t - d) / life;
    if (u <= 0 || u > 1.15) continue;
    if (u <= 1) {
      const x = sx + Math.sin(u * 7 + i) * sw, y = -ease.outQuad(u) * h;
      p.px(x, y - 2, C[4]); p.px(x, y - 1, C[5]); p.px(x - 1, y, C[4]); p.px(x, y, C[5]); p.px(x + 1, y, C[3]); p.px(x - 1, y + 1, C[3]); p.px(x, y + 1, C[3]); p.px(x + 1, y + 1, C[2]);
      p.px(x - 1, y - 1, WHITE);
      p.glow(x, y, 4, C[4], 0.15);
    } else { // 톡
      const x = sx + Math.sin(7 + i) * sw, y = -h, r = 2 + (u - 1) * 20;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.px(x + ax * r, y + ay * r, u < 1.08 ? WHITE : C[5]);
    }
  }
}

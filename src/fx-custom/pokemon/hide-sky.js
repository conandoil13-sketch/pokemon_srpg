// Hide (fly/bounce): a gust kicks up dust and feathers as the body launches straight up, leaving speed lines and a fading streak. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Hide Sky", desc: "Dust puffs blow out from the feet, vertical speed lines shoot upward with a bright streak, and a few feathers drift down after the launch.",
  tags: ["flying", "hide", "fly", "one-shot"], size: [80, 112], origin: [40, 100], duration: 1.0, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#3a4a5a", "#8aa0b8", "#c8d8e8", "#f0f6ff"], feather: ["#8a6a3a", "#e0c890"], seed: 9 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 4), F = fit(o.feather, 2), R = new Rng(o.seed);
  const d = clamp(t / 0.4, 0, 1); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.disc(s * (6 + d * 18 + i * 4), -2 - i, 4 + d * 3, C[2], 0.5 * (1 - d));
  for (let i = 0; i < 9; i++) { const x = R.range(-10, 10), st = R.range(0, 0.25), u = (t - st) / 0.35; if (u <= 0 || u >= 1) continue;
    const y0 = -10 - u * 90, len = 14; p.line(x, y0, x, y0 + len, i % 3 ? C[2] : WHITE, 1 - u); }
  const k = clamp(t / 0.25, 0, 1); if (t < 0.5) p.glow(0, -20 - k * 60, 10, C[3], 0.5 * (1 - t / 0.5));
  for (let i = 0; i < 4; i++) { const u = clamp((t - 0.3) / 0.7, 0, 1); if (u <= 0 || u >= 1) continue; const x = R.range(-16, 16) + Math.sin(u * 8 + i) * 4, y = -60 + u * 50 + i * 6;
    p.dot(x, y, F[1], 1 - u); p.dot(x + 1, y, F[0], 1 - u); }
}

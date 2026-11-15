// Hide (dive): a splash column jumps up as the body plunges, rings ripple out and bubbles rise and pop. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Hide Dive", desc: "A tall splash crown erupts as the body dives under, wide ripples spread on the surface and a trail of bubbles rises and pops.",
  tags: ["water", "hide", "dive", "one-shot"], size: [80, 80], origin: [40, 66], duration: 1.1, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#06142e", "#1656a6", "#2a86e0", "#5ab8f8", "#a8e2ff"], seed: 8 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed);
  for (let i = 0; i < 18; i++) { const a = -Math.PI / 2 + R.range(-0.9, 0.9), sp = R.range(24, 44), u = clamp(t / 0.55, 0, 1); if (u >= 1) continue;
    p.dot(Math.cos(a) * sp * u * 0.6, Math.sin(a) * sp * ease.outQuad(u) + 30 * u * u, i % 3 ? C[3] : WHITE, 1 - u); }
  for (let r = 0; r < 3; r++) { const k = clamp((t - r * 0.15) / 0.7, 0, 1); if (k <= 0 || k >= 1) continue; const rr = 4 + 26 * k;
    for (let s = 0; s < 40; s++) { const a = (s / 40) * TAU; if (s % 2) continue; p.dot(Math.cos(a) * rr, Math.sin(a) * rr * 0.3, C[3], 1 - k); } }
  for (let i = 0; i < 6; i++) { const d = 0.3 + i * 0.08, u = (t - d) / 0.4; if (u <= 0 || u >= 1) continue; const x = R.range(-6, 6), y = -u * 18;
    p.dot(x, y, C[4]); p.dot(x + 1, y, C[3]); p.dot(x, y - 1, WHITE); }
}

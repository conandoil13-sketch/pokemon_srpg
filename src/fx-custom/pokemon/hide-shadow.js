// Hide (shadow force): a dark rift tears open under the body, black tendrils curl up around it and it is swallowed into the shadow, leaving purple motes. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Hide Shadow", desc: "A black rift spreads at the feet, dark tendrils coil up and wrap the body, the shadow collapses inward and a few violet motes drift away.",
  tags: ["ghost", "hide", "shadow", "one-shot"], size: [80, 88], origin: [40, 74], duration: 1.1, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#06020a", "#1a0a24", "#3a1650", "#6a2a8a", "#b070e0"], seed: 10 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), b = body(o);
  const rift = ease.outCubic(clamp(t / 0.3, 0, 1)) * (1 - clamp((t - 0.85) / 0.25, 0, 1));
  if (rift > 0) { p.ellipse(0, 0, 16 * rift, 5 * rift, C[0]); p.ellipse(0, 0, 18 * rift, 6 * rift, C[2], (d) => (d > 0.85 ? 0.8 : 0)); }
  const wrap = clamp((t - 0.2) / 0.5, 0, 1), sink = clamp((t - 0.6) / 0.3, 0, 1);
  for (let k = 0; k < 5; k++) { const a0 = (k / 5) * TAU + t * 4; for (let i = 0; i < 24 * wrap; i++) { const u = i / 24, ang = a0 + u * 3, r = (b.w / 2 + 4) * (1 - 0.5 * sink) * (1 - u * 0.3);
    const y = -u * b.h * (1 - sink); p.dot(Math.cos(ang) * r, y + Math.sin(ang) * r * 0.3, i > 20 ? C[4] : C[1 + (i % 3)], 0.9 * (1 - clamp((t - 0.85) / 0.2, 0, 1))); } }
  if (sink > 0 && sink < 1) p.disc(0, -b.h * 0.4 * (1 - sink), b.w * 0.6 * (1 - sink) + 2, C[0], 0.7);
  for (let i = 0; i < 8; i++) { const d = 0.55 + R.range(0, 0.2), u = (t - d) / 0.3; if (u <= 0 || u >= 1) continue; p.dot(R.range(-12, 12), -u * 24 - 4, C[4], 1 - u); }
}

// Splash hop: the user flops in place and a few sad water droplets plip out and fall; nothing else happens. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Splash Hop", desc: "A couple of small water droplets plip up from the feet in tiny arcs and fall back with a little ripple — a very unimpressive splash.",
  tags: ["water", "splash", "comedy", "one-shot"], size: [64, 64], origin: [32, 44], duration: 0.9, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#1656a6", "#5ab8f8", "#c4ecff"], seed: 7 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 3), R = new Rng(o.seed);
  for (let i = 0; i < 5; i++) { const d = i * 0.05, u = (t - d) / 0.5; if (u <= 0 || u >= 1) continue; const vx = R.range(-14, 14), vy = R.range(18, 28);
    p.dot(vx * u, -vy * u + 40 * u * u, i % 2 ? C[1] : C[2]); }
  const r = clamp((t - 0.45) / 0.4, 0, 1); if (r > 0 && r < 1) for (let s = 0; s < 20; s++) { const a = (s / 20) * 6.283; if (s % 2) continue; p.dot(Math.cos(a) * (3 + r * 10), Math.sin(a) * (1 + r * 3), C[1], 1 - r); }
}

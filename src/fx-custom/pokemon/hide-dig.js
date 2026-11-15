// Hide (dig): claws churn the dirt, a mound of soil sprays up and the body sinks into the hole with clods tumbling after. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Hide Dig", desc: "Dirt sprays up in arcs from the feet, a dark hole opens, the body sinks into it and loose clods roll back in.",
  tags: ["ground", "hide", "dig", "one-shot"], size: [96, 96], origin: [48, 70], duration: 1.0, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#1a0e06", "#3a2210", "#6a4220", "#9a6a38", "#c89a5a"], seed: 7 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), hole = ease.outBack(clamp(t / 0.3, 0, 1)) * (1 - clamp((t - 0.8) / 0.2, 0, 1));
  if (hole > 0) { p.ellipse(0, 0, 12 * hole, 4 * hole, C[0]); p.ellipse(0, -1, 12 * hole, 1.5 * hole, C[2]); }
  for (let i = 0; i < 22; i++) { const d = R.range(0, 0.45), u = (t - d) / 0.45; if (u <= 0 || u >= 1) continue;
    const vx = R.range(-28, 28), vy = R.range(18, 34); p.rect(vx * u, -vy * u + 50 * u * u, 2, 2, i % 3 === 0 ? C[4] : i % 3 === 1 ? C[3] : C[2], 1 - u * 0.5); }
  for (let i = 0; i < 8; i++) { const x = R.range(-14, 14); p.rect(x, -1 - (1 - hole) * 2, 3, 2, C[3], hole); }
}

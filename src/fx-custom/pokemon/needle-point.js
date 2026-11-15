// Needle point: a fine golden needle glints, darts in to a pressure point and a small star-shaped sparkle of energy blooms there. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Needle Point", desc: "A thin golden needle glints in the air, darts into a pressure point on the body, and a crisp four-point sparkle blooms there with tiny glints.",
  tags: ["needle", "buff", "status", "one-shot"], size: [80, 80], origin: [40, 68], duration: 0.9, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#3a2a04", "#a07a10", "#ffd040", "#fff4b0"], seed: 5 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
export function draw(p, t, o) {
  const C = fit(o.palette, 4), R = new Rng(o.seed), b = body(o), tx = b.x + b.w * 0.6, ty = b.y + b.h * 0.45;
  const dart = ease.inQuart(clamp((t - 0.15) / 0.15, 0, 1)), sx = tx + 22, sy = ty - 16;
  if (t < 0.32) { const x = sx + (tx - sx) * dart, y = sy + (ty - sy) * dart; p.line(x, y, x + 9, y - 6, C[2]); p.dot(x, y, WHITE); if (t < 0.15 && Math.floor(t * 30) % 2) p.dot(x + 9, y - 6, WHITE); }
  const bloom = clamp((t - 0.3) / 0.5, 0, 1); if (bloom > 0 && bloom < 1) { const r = 3 + bloom * 9, a = 1 - bloom;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= r; k++) p.dot(tx + dx * k, ty + dy * k, k < r / 2 ? C[3] : C[2], a);
    p.dot(tx, ty, WHITE); p.glow(tx, ty, 10, C[2], 0.5 * a);
    for (let i = 0; i < 5; i++) { const ang = R.range(0, TAU), rr = R.range(6, 14) * bloom; p.dot(tx + Math.cos(ang) * rr, ty + Math.sin(ang) * rr, WHITE, a); } }
}

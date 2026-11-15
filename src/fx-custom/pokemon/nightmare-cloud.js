// Nightmare cloud: a dark cloud gathers over the sleeper's head with a slow purple spiral inside and little jagged flashes, then sinks into the head. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Nightmare Cloud", desc: "Murky puffs gather into a dark cloud over the head, a purple spiral churns inside it with small jagged flashes, then it sinks down into the head.",
  tags: ["nightmare", "dark", "sleep", "one-shot"], size: [80, 96], origin: [40, 84], duration: 1.3, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#0a0610", "#1e1430", "#3a2a5a", "#6a4aa0", "#b090e8"], seed: 6 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
export function draw(p, t, o) {
  const C = fit(o.palette, 5), b = body(o), cx = b.x + b.w / 2;
  const grow = ease.outCubic(clamp(t / 0.35, 0, 1)), sink = ease.inQuad(clamp((t - 0.95) / 0.35, 0, 1)), cy = b.y - 10 + sink * 14;
  if (grow <= 0 || sink >= 1) return; const a = 1 - sink;
  for (const [dx, dy, r] of [[-8, 1, 6], [0, -2, 8], [8, 1, 6], [-3, 3, 6], [4, 3, 6]]) p.disc(cx + dx * grow, cy + dy, r * grow, C[1], 0.85 * a);
  for (let s = 0; s < 30; s++) { const u = s / 30, ang = u * TAU * 2 + t * 6, r = u * 7 * grow; p.dot(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.5, s % 3 ? C[3] : C[4], a); }
  if (Math.floor(t * 8) % 3 === 0 && t > 0.3) { const x = cx + ((t * 37) % 12) - 6; p.line(x, cy + 6, x + 2, cy + 10, C[4], a); p.line(x + 2, cy + 10, x, cy + 13, WHITE, a); }
}

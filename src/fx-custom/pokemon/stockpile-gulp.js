// Stockpile gulp: three dense energy orbs condense in front of the mouth, get gulped in, and the body briefly swells with a firm golden outline. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Stockpile Gulp", desc: "Energy specks gather into a dense orb before the mouth, it is gulped down, and the body swells once inside a firm golden outline that settles.",
  tags: ["stockpile", "buff", "status", "one-shot"], size: [80, 80], origin: [40, 68], duration: 1.1, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#3a2a04", "#8a6a10", "#d0a828", "#ffe070", "#fff6c0"], seed: 2 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
export function draw(p, t, o) {
  const C = fit(o.palette, 5), b = body(o), cx = b.x + b.w / 2, my = b.y + b.h * 0.35, ox = cx + b.w / 2 + 4;
  const gather = clamp(t / 0.4, 0, 1), gulp = clamp((t - 0.4) / 0.2, 0, 1), swell = clamp((t - 0.6) / 0.5, 0, 1);
  if (gulp < 1) { for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + t * 5, r = 14 * (1 - gather); p.dot(ox + Math.cos(a) * r, my + Math.sin(a) * r, C[3], gather); }
    const x = ox + (cx - ox) * ease.inQuad(gulp); p.circle(x, my, 3.5 * (1 - gulp * 0.6), C[3]); p.circle(x, my, 2 * (1 - gulp * 0.6), C[4]); p.glow(x, my, 10, C[2], 0.4); }
  if (swell > 0 && swell < 1) { const k = Math.sin(Math.PI * swell), rx = b.w / 2 + 2 + k * 4, ry = b.h / 2 + 1 + k * 3;
    for (let s = 0; s < 60; s++) { const a = (s / 60) * TAU; p.dot(cx + Math.cos(a) * rx, b.y + b.h / 2 + Math.sin(a) * ry, s % 3 ? C[3] : WHITE, 1 - swell); } p.glow(cx, b.y + b.h / 2, b.w, C[2], 0.25 * (1 - swell)); }
}

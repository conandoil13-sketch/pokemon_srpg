// Drum beat: the belly is struck three times, each beat throwing a red shockwave ring and a burst of heat, ending with a fierce rising red aura. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { fit, WHITE, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Drum Beat", desc: "Three heavy beats on the belly each send out a red shock ring and a flash, then a fierce red aura flares upward around the whole body.",
  tags: ["drum", "buff", "rage", "one-shot"], size: [96, 96], origin: [48, 80], duration: 1.3, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#3a0404", "#8a1010", "#e02a1a", "#ff7a4a", "#ffd0a0"], seed: 3 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
export function draw(p, t, o) {
  const C = fit(o.palette, 5), b = body(o), cx = b.x + b.w / 2, by = b.y + b.h * 0.6;
  for (let k = 0; k < 3; k++) { const u = (t - k * 0.22) / 0.35; if (u <= 0 || u >= 1) continue; const r = 4 + u * 22;
    for (let s = 0; s < 40; s++) { const a = (s / 40) * TAU; p.dot(cx + Math.cos(a) * r, by + Math.sin(a) * r * 0.6, s % 2 ? C[3] : C[2], 1 - u); }
    if (u < 0.2) p.glow(cx, by, 14, C[4], 0.7); }
  const aura = clamp((t - 0.7) / 0.6, 0, 1); if (aura > 0 && aura < 1) for (let i = 0; i < 14; i++) { const x = cx + (i - 7) * (b.w / 12), ph = (aura * 2 + i * 0.13) % 1;
    p.line(x, b.y + b.h - ph * b.h * 1.2, x, b.y + b.h - ph * b.h * 1.2 - 6, i % 3 ? C[2] : C[3], 1 - aura); }
}

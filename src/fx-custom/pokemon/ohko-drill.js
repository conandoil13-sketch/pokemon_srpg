// OHKO Horn Drill: a spinning drill bit spirals in, bores into the target with grinding sparks and shaking rings, then punches through in a burst. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = {
  name: "OHKO Drill", desc: "A huge spinning drill cone flies in from the left, grinds into the body throwing sparks and spiral rings, then blasts out the far side with a shockwave.",
  tags: ["drill", "ohko", "finisher", "directional", "one-shot"], size: [176, 112], origin: [100, 88], duration: 1.4, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#201608", "#5a3a14", "#a07028", "#e0b050", "#fff0a0", "#ffffff"], seed: 4 },
};
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
const IN = 0.3, GRIND = 0.85, OUT = 1.0;
export function draw(p, t, o) {
  const C = fit(o.palette, 6), R = new Rng(o.seed), b = body(o), cy = b.y + b.h / 2, cx = b.x + b.w / 2;
  const tip = t < IN ? -50 + (cx - 4 + 50) * ease.outCubic(t / IN) : t < GRIND ? cx - 4 + 8 * ((t - IN) / (GRIND - IN)) : cx + 4 + 50 * ease.inQuad(clamp((t - GRIND) / (OUT - GRIND), 0, 1));
  const shake = t > IN && t < GRIND ? Math.round(Math.sin(t * 70)) : 0;
  if (t < OUT + 0.05) { const L = 44, H = 15; // 드릴 원뿔: 줄무늬가 돌아감
    for (let i = 0; i < L; i++) { const x = tip - i, h = (i / L) * H; const ph = (i * 0.5 - t * 40) % 4;
      for (let j = -h; j <= h; j++) { const c = (Math.floor(ph + j * 0.3 + 40) % 4) < 2 ? C[3] : C[2]; p.px(x, cy + j + shake, j < -h + 1 ? C[4] : j > h - 1 ? C[1] : c); } }
    p.px(tip + 1, cy + shake, WHITE); }
  if (t > IN && t < GRIND + 0.1) { // 갈리는 불꽃 + 나선 고리
    for (let i = 0; i < 10; i++) { const a = R.range(-2.6, 2.6) + Math.PI, sp = R.range(10, 30), u = ((t * 6 + i * 0.37) % 1);
      p.dot(cx - 4 + Math.cos(a) * sp * u, cy + Math.sin(a) * sp * u, i % 2 ? WHITE : C[4], 1 - u); }
    for (let r = 0; r < 3; r++) { const rr = 6 + ((t * 30 + r * 6) % 18); for (let s = 0; s < 24; s++) { const a = (s / 24) * TAU; if (s % 2) continue; p.dot(cx - 2 + Math.cos(a) * rr * 0.35, cy + Math.sin(a) * rr, C[3], 1 - rr / 24); } }
    p.glow(cx - 2, cy, 14, C[4], 0.35); }
  if (t >= OUT - 0.05) { const u = clamp((t - OUT) / (meta.duration - OUT), 0, 1), k = 1 - u;
    if (u < 0.15) p.glow(cx, cy, 50, WHITE, 0.8);
    for (let s = 0; s < 48; s++) { const a = (s / 48) * TAU, r = 6 + 40 * ease.outQuad(u); p.dot(cx + 6 + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r, s % 3 ? C[4] : WHITE, k); }
    for (let i = 0; i < 14; i++) { const a = R.range(-0.8, 0.8), sp = R.range(30, 60); p.rect(cx + Math.cos(a) * sp * u, cy + Math.sin(a) * sp * u, 2, 1, i % 2 ? C[4] : C[3], k); } }
}

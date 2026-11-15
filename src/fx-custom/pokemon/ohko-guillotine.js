// OHKO Guillotine: two huge pincer blades open wide on either side of the target, then snap shut in an X with a white flash and a lingering cross scar. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = {
  name: "OHKO Guillotine", desc: "Giant pincer blades swing open around the target, hang for a beat, then slam shut into an X-shaped cut with a flash, sparks and a glowing cross that fades.",
  tags: ["slash", "ohko", "finisher", "one-shot"], size: [144, 128], origin: [72, 104], duration: 1.3, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#1a1420", "#4a4458", "#8a84a0", "#c4c0d8", "#f0eeff", "#ffffff"], cut: ["#5a0a14", "#b01828", "#ff4a5a", "#ffb0b8"], seed: 2 },
};
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
const OPEN = 0.35, HOLD = 0.55, SNAP = 0.65;
function blade(p, x0, y0, ang, len, C) { // 굵은 낫 모양 날
  for (let i = 0; i < len; i++) { const u = i / len, w = 5 * (1 - u * 0.7), a = ang + u * 0.5;
    const x = x0 + Math.cos(ang) * i, y = y0 + Math.sin(ang) * i;
    for (let j = -w; j <= w; j++) p.px(x - Math.sin(a) * j, y + Math.cos(a) * j, j < -w + 1.5 ? C[5] : j > w - 1.5 ? C[1] : C[3]); }
}
export function draw(p, t, o) {
  const C = fit(o.palette, 6), K = fit(o.cut, 4), R = new Rng(o.seed), b = body(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (t > 0.03 && t < SNAP + 0.05) { const op = ease.outCubic(clamp(t / OPEN, 0, 1)), sn = ease.inQuart(clamp((t - HOLD) / (SNAP - HOLD), 0, 1));
    const spread = 1.1 * (1 - sn), L = 44, out = (1 - op) * 24; // 바깥에서 날아와 벌어진 채로 → 닫힘
    blade(p, cx - 34 - out, cy - 30 - out, 0.75 + spread, L, C);
    blade(p, cx + 34 + out, cy - 30 - out, Math.PI - 0.75 - spread, L, C);
    if (t > OPEN && t < HOLD) p.glow(cx, cy - 20, 16, C[4], 0.2); }
  if (t >= SNAP) { const u = (t - SNAP) / (meta.duration - SNAP), k = 1 - u;
    if (u < 0.12) { p.glow(cx, cy, 60, WHITE, 0.9); p.disc(cx, cy, 26, WHITE, 0.6); }
    for (const s of [1, -1]) for (let i = -30; i <= 30; i++) { const x = cx + i, y = cy + s * i * 0.9; const w = (1 - Math.abs(i) / 30) * 3 * k + 0.5;
      for (let j = -w; j <= w; j++) p.dot(x, y + j, Math.abs(j) < w * 0.4 ? K[3] : K[2], k); }
    p.glow(cx, cy, 30, K[2], 0.35 * k);
    for (let i = 0; i < 16; i++) { const a = R.range(0, 6.28), sp = R.range(20, 50); p.dot(cx + Math.cos(a) * sp * u * 1.5, cy + Math.sin(a) * sp * u, i % 2 ? WHITE : C[4], k); } }
}

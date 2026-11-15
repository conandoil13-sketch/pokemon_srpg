// Wish star: a little star twinkles above the head, sparkles gather to it, then it shoots up into the sky leaving a glittering trail. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Wish Star", desc: "A five-point star appears over the head and twinkles while sparkles drift into it, then it shoots straight up into the sky with a glittering trail.",
  tags: ["wish", "star", "heal", "one-shot"], size: [64, 128], origin: [32, 116], duration: 1.3, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#3a3010", "#a08020", "#ffd040", "#fff090", "#ffffff"], seed: 4 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
const STAR = ["..x..", "..x..", "xxxxx", ".xxx.", "x...x"];
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), b = body(o), cx = b.x + b.w / 2;
  const up = ease.inQuad(clamp((t - 0.7) / 0.5, 0, 1)), y = b.y - 10 - up * 70, tw = Math.floor(t * 12) % 2;
  if (t < 1.15) { STAR.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x') p.px(cx + i - 2, y + j - 2, (i === 2 && j === 2) || tw ? C[4] : C[3]); })); p.glow(cx, y, 10, C[2], 0.5); }
  for (let i = 0; i < 8; i++) { const u = clamp(t / 0.6 - i * 0.05, 0, 1); if (u <= 0 || u >= 1) continue; const a = R.range(0, 6.28), r = 16 * (1 - u); p.dot(cx + Math.cos(a) * r, y + Math.sin(a) * r, C[3], 1 - u * 0.5); }
  if (up > 0 && up < 0.95) for (let k = 1; k < 10; k++) p.dot(cx + (k % 2 ? 1 : -1), y + k * 4, k < 4 ? C[3] : C[2], 1 - k / 10);
}

// Counter stance: the body sinks into a guard, angular reflect-chevrons snap into place around it pointing outward, and a hard outline flickers like a spring about to release. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Counter Stance", desc: "Sharp outward-pointing chevrons lock in around the body at four angles, a jagged outline pulses twice, and a low ground ring tightens like a coiled spring.",
  tags: ["counter", "stance", "buff", "one-shot"], size: [80, 80], origin: [40, 68], duration: 1.1, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#3a1004", "#8a2a08", "#d0500c", "#ff8a2a", "#ffc080"], seed: 1 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
const CHEV = ["x...", "xx..", ".xx.", "..xx", ".xx.", "xx..", "x..."];
export function draw(p, t, o) {
  const C = fit(o.palette, 5), b = body(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const fade = 1 - clamp((t - 0.8) / 0.3, 0, 1), snap = ease.outBack(clamp(t / 0.25, 0, 1));
  if (fade <= 0) return;
  // 바닥 스프링 고리 (조여듦)
  const rr = (b.w / 2 + 10) * (1.4 - 0.4 * snap);
  for (let s = 0; s < 40; s++) { const a = (s / 40) * TAU; if (s % 4 === 3) continue; p.dot(cx + Math.cos(a) * rr, b.y + b.h + Math.sin(a) * rr * 0.3, s % 2 ? C[2] : C[3], fade); }
  // 바깥을 향한 꺾쇠 4개 (좌·우·좌상·우상)
  const spots = [[-1, 0, 0], [1, 0, Math.PI], [-0.8, -0.8, 0.5], [0.8, -0.8, Math.PI - 0.5]];
  for (const [sx, sy] of spots) { const d = (b.w / 2 + 6) + (1 - snap) * 14, x0 = cx + sx * d, y0 = cy + sy * (b.h / 2) * 0.8;
    CHEV.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== 'x') return; const px = sx < 0 ? x0 - i : x0 + i; p.dot(px, y0 + j - 3, i === 0 ? WHITE : C[3], fade); })); }
  // 몸 테두리 깜빡 (두 번)
  const pulse = (Math.floor(t / 0.12) % 2 === 0 && t < 0.6) ? 1 : 0;
  if (pulse) for (let s = 0; s < 60; s++) { const a = (s / 60) * TAU; p.dot(cx + Math.cos(a) * (b.w / 2 + 3), cy + Math.sin(a) * (b.h / 2 + 2), s % 3 ? C[4] : WHITE, 0.8 * fade); }
  p.glow(cx, cy, b.w, C[2], 0.18 * fade);
}

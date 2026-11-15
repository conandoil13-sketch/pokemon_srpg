// Bind coil: a thick band winds up round the body from the feet, squeezes tight with a few strain marks, then slackens and fades. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Bind Coil",
  desc: "A chunky band spirals up around the body in three turns, cinches in hard with strain ticks popping off, holds, then loosens and fades away.",
  tags: ["status", "bind", "wrap", "trap", "one-shot"],
  size: [72, 72],
  origin: [36, 64],
  duration: 1.25,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#2a1c10", "#5a4024", "#9a7040", "#d0a868", "#f4e0b0"], seed: 1 },
};

const WIND = 0.45, SQUEEZE = [0.5, 0.7], FADE = [0.95, 1.25], TURNS = 3;
const bodyOf = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });

export function draw(p, t, o) {
  const C = fit(o.palette, 5), b = bodyOf(o);
  const cx = b.x + b.w / 2, y0 = b.y + b.h - 2, y1 = b.y + b.h * 0.22;
  const grow = ease.outCubic(clamp(t / WIND, 0, 1));
  const sq = ease.outBack(clamp((t - SQUEEZE[0]) / (SQUEEZE[1] - SQUEEZE[0]), 0, 1));
  const fade = 1 - clamp((t - FADE[0]) / (FADE[1] - FADE[0]), 0, 1);
  if (fade <= 0 || grow <= 0) return;
  const rx = (b.w / 2 + 5) * (1 - 0.18 * sq) * (1 + 0.15 * (1 - fade));
  const n = 120;
  for (let pass = 0; pass < 2; pass++) { // 0: 뒤쪽(어둡게) 먼저, 1: 앞쪽
    for (let s = 0; s <= n * grow; s++) {
      const u = s / n, ang = u * TURNS * TAU + t * 2;
      const front = Math.sin(ang) > 0;
      if ((pass === 1) !== front) continue;
      const x = cx + Math.cos(ang) * rx, y = y0 + (y1 - y0) * u + Math.sin(ang) * rx * 0.3;
      const c = front ? (Math.cos(ang) < -0.3 ? C[4] : C[3]) : C[1];
      p.dot(x, y, c, fade); p.dot(x, y + 1, front ? C[2] : C[0], fade); p.dot(x, y + 2, front ? C[1] : C[0], fade);
      if (front && s % 9 === 0) p.dot(x, y + 1, C[4], fade); // 비늘 무늬
    }
  }
  // 조일 때 튀는 힘 표시
  const k = clamp((t - SQUEEZE[0]) / 0.25, 0, 1);
  if (k > 0 && k < 1) for (const [sx, sy, dx, dy] of [[-1, -0.5, -1, -1], [1, -0.4, 1, -1], [-1, 0.3, -1, 0], [1, 0.4, 1, 0]]) {
    const x = cx + sx * (rx + 3 + k * 4), y = b.y + b.h * (0.5 + sy * 0.5);
    p.dot(x, y, WHITE, 1 - k); p.dot(x + dx, y + dy, C[4], 1 - k);
  }
}

// Leaf burst: a leaf pile bursts open, leaves fly out in every direction, flutter and drop. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Leaf Burst", desc: "A pile of autumn leaves bursts: a puff of leaves flies out in every direction, flutters and falls, gone within 0.7 s.",
  tags: ["nature", "autumn", "leaf", "one-shot"], size: [80, 72], origin: [40, 56], duration: 0.7, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#5a140c", "#c83c22", "#e07e26", "#f4d84a", "#fff4a8"], seed: 3 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed);
  const puff = 1 - clamp(t / 0.25, 0, 1); // 처음 잠깐 둥근 더미가 부풀었다 사라짐
  if (puff > 0) p.ellipse(0, -7, 11 * (1 + (1 - puff) * 0.4), 7 * puff, C[2], puff);
  for (let i = 0; i < 14; i++) {
    const d = R.range(0, 0.1), u = clamp((t - d) / (0.6 - d), 0, 1); if (u <= 0 || u >= 1) continue;
    const ang = R.range(-Math.PI, 0), sp = R.range(14, 30), fx = Math.cos(ang) * sp, fy = Math.sin(ang) * sp - 10;
    const e = ease.outQuart(u), x = fx * e + Math.sin(u * 9 + i) * 2, y = -7 + fy * e + 26 * u * u;
    const c = C[1 + (i % 4)], flip = Math.sin(u * 12 + i) > 0, a = 1 - clamp((u - 0.7) / 0.3, 0, 1);
    p.rect(x, y, flip ? 3 : 2, flip ? 2 : 3, c, a); p.rect(x + 1, y, 1, 1, C[0], a * 0.6);
  }
}

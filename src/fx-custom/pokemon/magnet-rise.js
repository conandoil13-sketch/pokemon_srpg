// Magnet rise: a glowing electromagnetic disc forms under the feet, crackling arcs ring it and blue hover waves pulse upward. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Magnet Rise", desc: "A glowing disc of magnetism forms under the feet, little lightning arcs crackle round its rim and blue hover waves pulse upward.",
  tags: ["electric", "levitate", "status", "one-shot"], size: [80, 80], origin: [40, 68], duration: 1.1, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#0a2040", "#2a6ac8", "#60c8ff", "#fff070", "#ffffff"], seed: 4 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed + Math.floor(t * 20)), grow = ease.outBack(clamp(t / 0.3, 0, 1)), fade = 1 - clamp((t - 0.85) / 0.25, 0, 1);
  p.ellipse(0, 1, 15 * grow, 4.5 * grow, C[1], 0.7 * fade); p.ellipse(0, 1, 11 * grow, 3 * grow, C[2], 0.8 * fade); p.ellipse(0, 1, 5 * grow, 1.5 * grow, C[4], 0.9 * fade);
  p.glow(0, 0, 18, C[2], 0.45 * fade);
  for (let i = 0; i < 4; i++) { const u = ((t * 1.6 + i / 4) % 1), y = -2 - 26 * u, r = 13 - 4 * u; // 위로 오르는 부양 물결
    for (let k = 0; k < 32; k++) { const ang = (k / 32) * Math.PI * 2; if (Math.sin(ang) < -0.2) continue; p.dot(Math.cos(ang) * r, y + Math.sin(ang) * r * 0.28, C[2], (1 - u) * 0.8 * fade * clamp(t / 0.2, 0, 1)); } }
  if (t > 0.15) for (let i = 0; i < 3; i++) { const ang = R.range(0, Math.PI * 2); let x = Math.cos(ang) * 14, y = 1 + Math.sin(ang) * 4; // 테두리 번개
    for (let k = 0; k < 5; k++) { const nx = x + R.range(-3, 3), ny = y - R.range(1, 3); p.line(x, y, nx, ny, k % 2 ? C[3] : C[4], fade); x = nx; y = ny; } }
}

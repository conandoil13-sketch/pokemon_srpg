// Present box: a ribboned gift box drops onto the target, bounces, the lid pops off and green healing sparkles and hearts float out. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Present Box", desc: "A wrapped present falls in, bounces once, the lid flips open and a fountain of green sparkles and little plus signs rises out.",
  tags: ["gift", "heal", "item", "one-shot"], size: [64, 80], origin: [32, 70], duration: 1.3, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#5a0a1a", "#b01a30", "#ff4a5a"], ribbon: ["#a07010", "#ffd040"], heal: ["#0e4a1e", "#3ec85a", "#b0ffb0"], seed: 2 } };
export function draw(p, t, o) {
  const B = fit(o.palette, 3), Rb = fit(o.ribbon, 2), H = fit(o.heal, 3), R = new Rng(o.seed);
  const fall = clamp(t / 0.3, 0, 1), bounce = clamp((t - 0.3) / 0.2, 0, 1), y = -40 * (1 - ease.inQuad(fall)) - Math.sin(Math.PI * bounce) * 5;
  const open = clamp((t - 0.55) / 0.15, 0, 1), gone = clamp((t - 1.05) / 0.25, 0, 1);
  if (gone < 1) { const a = 1 - gone;
    p.rect(-8, y - 12, 16, 12, B[1], a); p.rect(-8, y - 12, 16, 2, B[2], a); p.rect(-1, y - 12, 2, 12, Rb[1], a); // 상자 + 리본
    const ly = y - 14 - open * 10, lx = open * 8;
    p.rect(-9 + lx, ly, 18, 3, B[2], a); p.rect(-1 + lx, ly, 2, 3, Rb[1], a); p.px(-2 + lx, ly - 1, Rb[1]); p.px(1 + lx, ly - 1, Rb[1]); } // 뚜껑
  if (open > 0) for (let i = 0; i < 14; i++) { const d = 0.6 + i * 0.025, u = (t - d) / 0.45; if (u <= 0 || u >= 1) continue;
    const x = R.range(-7, 7) + Math.sin(u * 6 + i) * 3, yy = -14 - ease.outQuad(u) * R.range(20, 34);
    if (i % 3 === 0) { p.dot(x, yy, H[1], 1 - u); p.dot(x - 1, yy, H[1], 1 - u); p.dot(x + 1, yy, H[1], 1 - u); p.dot(x, yy - 1, H[1], 1 - u); p.dot(x, yy + 1, H[1], 1 - u); }
    else p.dot(x, yy, u < 0.3 ? WHITE : H[2], 1 - u); }
  if (open > 0 && t < 1.1) p.glow(0, -16, 14, H[1], 0.3);
}

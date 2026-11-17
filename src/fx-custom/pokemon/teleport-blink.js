// Teleport blink: a pink psychic ring opens at the feet, a light column swallows the body, squeezes to a thin line and pops into sparkles. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Teleport Blink", desc: "A psychic ring opens at the feet, a light column swallows the body, squeezes to a thin line, then pops into rising sparkles.",
  tags: ["psychic", "teleport", "status", "one-shot"], size: [72, 88], origin: [36, 76], duration: 0.9, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#5a1a6a", "#b03ab8", "#f070d8", "#ffb8f0", "#ffffff"], seed: 5 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed);
  const ring = ease.outCubic(clamp(t / 0.3, 0, 1)), fade = 1 - clamp((t - 0.55) / 0.3, 0, 1);
  p.ellipse(0, 0, 14 * ring, 4 * ring, C[1], 0.7 * fade); p.ellipse(0, 0, 10 * ring, 2.5 * ring, C[3], 0.6 * fade);
  const squeeze = clamp((t - 0.2) / 0.35, 0, 1), w = 9 * (1 - ease.inCubic(squeeze)) + 1, colA = clamp(t / 0.15, 0, 1) * (1 - clamp((t - 0.55) / 0.1, 0, 1));
  if (colA > 0) { for (let y = -40; y < 0; y++) for (let x = Math.ceil(-w); x < w; x++) { const k = Math.abs(x + 0.5) / w; p.blend(x, y, k < 0.35 ? C[4] : C[2], (k < 0.35 ? 0.85 : 0.5) * colA * (0.6 + 0.4 * (y + 40) / 40)); } p.glow(0, -16, 18, C[3], 0.5 * colA); }
  if (t > 0.5) for (let i = 0; i < 14; i++) { const u = clamp((t - 0.5 - R.range(0, 0.1)) / 0.35, 0, 1); if (u <= 0 || u >= 1) { R.next(); R.next(); continue; }
    const ang = R.range(0, Math.PI * 2), sp = R.range(8, 20), x = Math.cos(ang) * sp * ease.outQuart(u), y = -16 + Math.sin(ang) * sp * 0.6 * ease.outQuart(u) - 10 * u;
    p.dot(x, y, i % 3 ? C[3] : C[4], 1 - u); if (i % 4 === 0) { p.dot(x - 1, y, C[2], 1 - u); p.dot(x + 1, y, C[2], 1 - u); p.dot(x, y - 1, C[2], 1 - u); p.dot(x, y + 1, C[2], 1 - u); } }
}

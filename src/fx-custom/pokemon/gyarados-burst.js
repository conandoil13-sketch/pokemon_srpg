// Gyarados burst: the ground rumbles, a huge water geyser erupts, spray rings crash outward and a roar shockwave rolls across. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Gyarados Burst", desc: "Ripples spread on the ground, then a towering water geyser bursts up with spray, crashes down in a wide splash ring, and a roar shockwave rolls out.",
  tags: ["water", "summon", "geyser", "one-shot"], size: [128, 128], origin: [64, 104], duration: 1.6, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#06142e", "#0c2c5e", "#1656a6", "#2a86e0", "#5ab8f8", "#a8e2ff", "#ffffff"], seed: 6 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed);
  // 1) 바닥 물결
  if (t < 0.4) for (let r = 0; r < 3; r++) { const rr = 6 + ((t * 40 + r * 8) % 24); for (let s = 0; s < 30; s++) { const a = (s / 30) * TAU; if (s % 2) continue; p.dot(Math.cos(a) * rr, Math.sin(a) * rr * 0.3, C[4], 1 - rr / 30); } }
  // 2) 물기둥
  const up = ease.outCubic(clamp((t - 0.3) / 0.25, 0, 1)), down = ease.inQuad(clamp((t - 0.85) / 0.3, 0, 1)), h = 80 * up * (1 - down);
  if (h > 2) { for (let y = 0; y < h; y++) { const w = 15 + Math.sin(y * 0.25 + t * 30) * 3 - y * 0.05; p.rect(-w, -y, w * 2, 1, y > h - 6 ? C[6] : C[3 + (Math.floor(y / 6 + t * 10) % 2)]); p.dot(-w, -y, C[2]); p.dot(w - 1, -y, C[5]); }
    p.glow(0, -h / 2, 40, C[4], 0.35); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i - 4.5) * 0.3; p.line(0, -h, Math.cos(a) * 14, -h + Math.sin(a) * 10, C[5]); } // 물보라 왕관
    for (let i = 0; i < 16; i++) { const a = R.range(-2.8, -0.3), sp = R.range(20, 46), u = ((t * 2 + i * 0.13) % 1); p.dot(Math.cos(a) * sp * u, -h + Math.sin(a) * sp * u + 40 * u * u, i % 2 ? WHITE : C[5], 1 - u); } }
  // 3) 떨어지며 퍼지는 물보라 고리
  const sp = (t - 0.95) / 0.5; if (sp > 0 && sp < 1) for (let s = 0; s < 56; s++) { const a = (s / 56) * TAU, r = 10 + 46 * ease.outQuad(sp); p.dot(Math.cos(a) * r, Math.sin(a) * r * 0.35 - 2, s % 3 ? C[4] : WHITE, 1 - sp); }
  // 4) 포효 충격파
  const sh = (t - 1.05) / 0.45; if (sh > 0 && sh < 1) for (let s = 0; s < 72; s++) { const a = (s / 72) * TAU, r = 14 + 50 * sh; if (s % 2) continue; p.dot(Math.cos(a) * r, -26 + Math.sin(a) * r * 0.8, C[5], 0.8 * (1 - sh)); }
}

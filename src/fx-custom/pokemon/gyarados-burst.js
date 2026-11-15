// Gyarados burst: the ground bulges and cracks, then a colossal water gusher blows out like a struck well, blasting heavy blobs high that rain back down in wide arcs, with foam and a crashing splash ring. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Gyarados Burst", desc: "The ground swells and cracks, a massive gusher blasts water blobs skyward that rain back in a wide fountain, foam churns and a splash ring crashes out.",
  tags: ["water", "summon", "geyser", "fountain", "one-shot"], size: [160, 160], origin: [80, 132], duration: 1.9, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#06142e", "#0c2c5e", "#1656a6", "#2a86e0", "#5ab8f8", "#a8e2ff", "#ffffff"], seed: 6 } };
const BULGE = 0.35, BLOW = 0.4, STOP = 0.95, G = 170;
export function draw(p, t, o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed);
  // 1) 땅이 부풀고 갈라짐
  if (t < BLOW + 0.1) { const k = clamp(t / BULGE, 0, 1), sh = Math.round(Math.sin(t * 70) * k * 1.5);
    p.ellipse(sh, -1, 10 + 6 * k, 3 + 2 * k, C[1], 0.7); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; p.line(sh, 0, sh + Math.cos(a) * (6 + 12 * k), Math.sin(a) * (2 + 4 * k), C[0]); }
    for (let i = 0; i < 8; i++) { const a = R.range(0, TAU), r = R.range(4, 14) * k; p.dot(Math.cos(a) * r, -1 + Math.sin(a) * r * 0.3 - k * 2, C[4], k); } }
  // 2) 분출: 물덩어리 수백 개가 솟구쳤다 포물선으로 떨어짐
  for (let i = 0; i < 220; i++) {
    const t0 = BLOW + R.range(0, STOP - BLOW), u = t - t0; if (u <= 0) { R.next(); R.next(); R.next(); continue; }
    const vx = R.range(-1, 1) * 62, vy = R.range(120, 190) * (1 - Math.abs(vx) / 140), sz = R.next();
    const x = vx * u * (0.35 + 0.65 * clamp(u / 0.4, 0, 1)), y = -vy * u + 0.5 * G * u * u;
    if (y > 2) continue; // 땅에 떨어짐
    const life = clamp(1 - (t - 1.65) / 0.25, 0, 1); if (life <= 0) continue;
    const rising = -vy + G * u < 0, c = rising ? (sz > 0.75 ? WHITE : sz > 0.4 ? C[5] : C[4]) : (sz > 0.6 ? C[4] : C[3]);
    const r = sz > 0.85 ? 2.5 : sz > 0.5 ? 1.5 : 0.8;
    if (r > 1) p.circle(x, y, r, c, life); else p.dot(x, y, c, life);
  }
  // 3) 중심 분출 기둥 (하얀 심) — 분출 동안만
  const core = clamp((t - BLOW) / 0.1, 0, 1) * (1 - clamp((t - STOP) / 0.2, 0, 1));
  if (core > 0) { const h = 100 * core; // 위로 갈수록 넓어지는 굵은 분출 (가장자리는 출렁임)
    for (let y = 0; y < h; y++) { const f = y / h, w = (6 + 16 * f) * core + Math.sin(y * 0.4 + t * 40) * 2 * f;
      for (let x = -w; x <= w; x++) { const v = Math.abs(x) / w; p.dot(x, -y, v < 0.3 ? WHITE : v < 0.65 ? C[5] : C[4], (v > 0.85 ? 0.55 : 0.95) * core); } }
    p.glow(0, -h * 0.6, 50, C[4], 0.4 * core); }
  // 4) 바닥 거품
  const foam = clamp((t - BLOW) / 0.2, 0, 1) * (1 - clamp((t - 1.5) / 0.4, 0, 1));
  if (foam > 0) for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + t * 3, r = 12 + Math.sin(t * 9 + i) * 3; p.disc(Math.cos(a) * r, Math.sin(a) * r * 0.3 - 1, 4 + (i % 3), i % 2 ? C[6] : C[5], 0.55 * foam); }
  // 5) 쏟아진 물보라 고리
  const ring = (t - 0.9) / 0.8; if (ring > 0 && ring < 1) for (let s = 0; s < 80; s++) { const a = (s / 80) * TAU, r = 16 + 56 * ease.outQuad(ring); if (s % 2) continue; p.dot(Math.cos(a) * r, Math.sin(a) * r * 0.32, s % 4 ? C[4] : WHITE, 1 - ring); }
}

// Baton swap: a striped baton spins up out of the hands, two curved arrows chase each other round the body, and coloured stat sparks rise. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Baton Swap", desc: "A red and white baton spins up over the head while two curved arrows circle the body like a swap sign, with stat sparks rising.",
  tags: ["normal", "swap", "status", "one-shot"], size: [72, 80], origin: [36, 68], duration: 1.0, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#3a1810", "#d8302a", "#ffffff", "#ffd040", "#60c8ff"], seed: 2 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), fade = 1 - clamp((t - 0.75) / 0.25, 0, 1);
  // 배턴: 위로 솟으며 돎
  const by = -18 - 18 * ease.outCubic(clamp(t / 0.45, 0, 1)) + 8 * clamp((t - 0.6) / 0.4, 0, 1) ** 2, ang = t * 14;
  for (let k = -5; k <= 5; k++) { const x = Math.cos(ang) * k, y = by + Math.sin(ang) * k * 0.5; p.dot(x, y, Math.abs(k) > 3 ? C[1] : (k + 6) % 3 === 0 ? C[1] : C[2], fade); p.dot(x, y + 1, C[0], 0.6 * fade); }
  p.glow(0, by, 8, C[3], 0.35 * fade);
  // 바꾸기 화살표 두 개 (몸 둘레)
  const rot = ease.outQuad(clamp(t / 0.8, 0, 1)) * Math.PI * 2;
  for (const [off, c] of [[0, C[3]], [Math.PI, C[4]]]) {
    const a0 = rot + off, a1 = a0 + 2.2;
    p.arc(0, -12, 15, 2, a0, a1, c, 0.9 * fade);
    const hx = Math.cos(a1) * 14, hy = -12 + Math.sin(a1) * 14; // 화살촉
    p.poly([[hx + Math.cos(a1 + 1.57) * 4, hy + Math.sin(a1 + 1.57) * 4], [hx - Math.cos(a1) * 3, hy - Math.sin(a1) * 3], [hx + Math.cos(a1) * 3, hy + Math.sin(a1) * 3]], c, 0.9 * fade);
  }
  for (let i = 0; i < 8; i++) { const u = clamp((t - 0.3 - i * 0.05) / 0.5, 0, 1); const x = R.range(-12, 12); if (u <= 0 || u >= 1) continue; p.dot(x, -4 - 30 * u, i % 2 ? C[3] : C[4], 1 - u); p.dot(x, -5 - 30 * u, C[2], (1 - u) * 0.6); }
}

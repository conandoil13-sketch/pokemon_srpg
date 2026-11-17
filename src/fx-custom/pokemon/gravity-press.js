// Gravity press: heavy violet rings slam down from above onto the ground one after another, downward chevrons and dust push out along the floor. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Gravity Press", desc: "Wide violet rings drop from above and slam flat onto the ground one by one, downward chevrons fall and dust rolls out along the floor.",
  tags: ["psychic", "gravity", "field", "one-shot"], size: [160, 112], origin: [80, 92], duration: 1.2, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#1a0a2a", "#4a2470", "#8a4ac8", "#c8a0ff", "#ffffff"], seed: 9 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), fade = 1 - clamp((t - 0.9) / 0.3, 0, 1);
  const sh = 0.4 * clamp(t / 0.2, 0, 1) * fade; for (let y = -14; y <= 14; y++) for (let x = -70; x <= 70; x++) { const d = (x / 70) ** 2 + (y / 14) ** 2; if (d <= 1) p.blend(x, y, C[1], sh * (1 - d)); } // 눌린 땅 (반투명 보라)
  for (let i = 0; i < 3; i++) { const u = clamp((t - i * 0.18) / 0.4, 0, 1); if (u <= 0) continue;
    const drop = ease.inQuad(clamp(u / 0.6, 0, 1)), y = -70 * (1 - drop), r = 30 + i * 14 + (u > 0.6 ? (u - 0.6) * 40 : 0), squash = u > 0.6 ? 0.22 : 0.3, a = (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 0.9) * fade;
    p.arc(0, y, r, 2.5, 0, Math.PI * 2, C[i === 0 ? 3 : 2], 0); p.ellipse(0, y, r, r * squash, C[2], 0);
    for (let k = 0; k < 96; k++) { const ang = (k / 96) * Math.PI * 2, cx = Math.cos(ang) * r, cy = y + Math.sin(ang) * r * squash; p.dot(cx, cy, k % 8 ? C[3] : C[4], a); p.dot(cx, cy + 1, C[2], a); p.blend(cx, cy - 1, C[3], a * 0.5); } p.glow(0, y, r * 0.6, C[2], 0.25 * a); }
  for (let i = 0; i < 10; i++) { const x = R.range(-60, 60), d = R.range(0, 0.5), u = clamp((t - d) / 0.35, 0, 1); if (u <= 0 || u >= 1) continue; const y = -60 + 56 * ease.inQuad(u); // 아래로 떨어지는 화살 무늬
    for (let k = 0; k < 3; k++) { p.dot(x - k, y - k, C[3], 1 - u * 0.5); p.dot(x + k, y - k, C[3], 1 - u * 0.5); } } // V 모양 (아래로)
  for (let i = 0; i < 12; i++) { const side = i % 2 ? 1 : -1, u = clamp((t - 0.35 - R.range(0, 0.15)) / 0.6, 0, 1); if (u <= 0 || u >= 1) continue; // 먼지
    p.disc(side * (10 + 50 * ease.outQuart(u)), -2 - R.range(0, 4), 2 + 3 * u, C[1], 0.45 * (1 - u)); }
}

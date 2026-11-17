// Follow me: a spotlight falls on the body, beckoning rings shrink in toward it and a bouncing "!" pops above the head. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { fit, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Follow Me", desc: "A warm spotlight falls on the body, three beckoning rings shrink in toward it, and an exclamation mark bounces above the head.",
  tags: ["normal", "taunt", "status", "one-shot"], size: [96, 88], origin: [48, 76], duration: 1.1, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#5a2a08", "#c86a18", "#ffa830", "#ffe070", "#fffbe0"], seed: 1 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 5), fade = 1 - clamp((t - 0.85) / 0.25, 0, 1), on = clamp(t / 0.15, 0, 1) * fade;
  for (let y = -60; y < 0; y++) { const w = 6 + (y + 60) * 0.22; for (let x = Math.ceil(-w); x < w; x++) p.blend(x, y, C[3], 0.22 * on * (1 - Math.abs(x) / w * 0.6)); } // 위에서 떨어지는 조명 (반투명)
  p.disc(0, 0, 0, C[3], 0); for (let y = -5; y <= 5; y++) for (let x = -17; x <= 17; x++) { const d = (x / 17) ** 2 + (y / 5) ** 2; if (d <= 1) p.blend(x, y, d < 0.4 ? C[4] : C[3], 0.4 * on * (1 - d * 0.5)); }
  for (let i = 0; i < 3; i++) { const u = clamp((t - i * 0.18) / 0.55, 0, 1); if (u <= 0 || u >= 1) continue;
    const r = 34 * (1 - ease.inQuad(u)) + 6; for (let k = 0; k < 56; k++) { const ang = (k / 56) * Math.PI * 2; p.dot(Math.cos(ang) * r, -1 + Math.sin(ang) * r * 0.3, k % 7 ? C[2] : C[4], (1 - u) * 0.95 * fade); } } // 안으로 좁혀 오는 고리
  const pop = ease.outBack(clamp((t - 0.25) / 0.2, 0, 1)), bob = Math.sin(t * 18) * 1.5 * clamp((t - 0.45) / 0.1, 0, 1), y0 = -44 + bob;
  if (pop > 0) { p.rect(-1.5, y0 - 9 * pop, 3, 7 * pop, C[2], fade); p.rect(-0.5, y0 - 9 * pop, 1, 6 * pop, C[4], fade); p.rect(-1.5, y0, 3, 2.5 * pop, C[2], fade); p.glow(0, y0 - 4, 9, C[3], 0.4 * fade); }
}

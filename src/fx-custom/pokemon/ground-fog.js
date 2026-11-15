// Ground fog: low banks of fog roll out from the user's feet along the floor until they blanket the 2-tile area, linger, then thin away. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Ground Fog",
  desc: "Flat translucent fog puffs spill out from the feet and roll along the ground to cover a two-tile area, hang there drifting, then thin out.",
  tags: ["fog", "mist", "smoke", "aura", "ground", "one-shot"],
  size: [160, 112],
  origin: [80, 64],
  duration: 1.7,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#6a6a7a", "#9a9aac", "#c4c4d4", "#e2e2ee", "#f8f8ff"], seed: 7 },
};

const OUT = 0.7, HOLD = 1.15, END = 1.7;
function puff(p, cx, cy, rx, ry, C, a) {
  p.each(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, sx, sy) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d2 = dx * dx + dy * dy;
    if (d2 > 1) return;
    const c = dy < -0.35 ? C[4] : dy < 0.2 ? C[3] : C[2]; // 위가 밝고 아래가 어두움
    p.blendPx(sx, sy, c, a * (1 - d2 * d2));
  });
}

export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed);
  const puffs = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * TAU * 3 + R.range(-0.3, 0.3), r = Math.sqrt(R.range(0.04, 1)) * 52;
    return { tx: Math.cos(a) * r * 1.08, ty: -8 + Math.sin(a) * r * 0.85, d: R.range(0, 0.15) + r / 52 * 0.2, size: R.range(14, 20), drift: R.range(-6, 6) };
  }).sort((a, b) => a.ty - b.ty);
  for (const f of puffs) {
    const k = clamp((t - f.d) / OUT, 0, 1);
    if (k <= 0) continue;
    const e = ease.outQuart(k), thin = clamp((t - HOLD) / (END - HOLD), 0, 1);
    const x = f.tx * e + f.drift * thin, y = f.ty * e;
    const rx = f.size * (0.4 + 0.6 * e) * (1 + 0.3 * thin), ry = rx * 0.45;
    const a = 0.24 * clamp(k * 3, 0, 1) * (1 - thin);
    if (a <= 0.01) continue;
    puff(p, x, y, rx, ry, C, a);
  }
  // 발밑에서 솟는 첫 뭉치
  const k0 = clamp(t / 0.3, 0, 1), f0 = 1 - clamp((t - 0.3) / 0.4, 0, 1);
  if (k0 > 0 && f0 > 0) puff(p, 0, -6, 6 + 10 * k0, (6 + 10 * k0) * 0.5, C, 0.5 * f0);
}

// Bind vortex: a swirling column (fire, water, sand...) rises from the floor round the body, spins hard with flecks flying off, then sinks back down. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Bind Vortex",
  desc: "Curling streaks spiral up from the ground into a spinning column that wraps the body, flinging flecks outward, before it collapses back into the floor.",
  tags: ["status", "bind", "vortex", "trap", "one-shot"],
  size: [80, 80],
  origin: [40, 70],
  duration: 1.3,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#06142e", "#0c2c5e", "#1656a6", "#2a86e0", "#5ab8f8", "#a8e2ff", "#e6f8ff"], seed: 3 },
};

const RISE = 0.35, SINK = [0.95, 1.3];
const bodyOf = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });

export function draw(p, t, o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), b = bodyOf(o);
  const cx = b.x + b.w / 2, top = b.y - 4, base = b.y + b.h;
  const rise = ease.outCubic(clamp(t / RISE, 0, 1)), sink = ease.inQuad(clamp((t - SINK[0]) / (SINK[1] - SINK[0]), 0, 1));
  const h = (base - top) * rise * (1 - sink);
  if (h <= 1) return;
  const levels = Math.max(2, Math.round(h / 5)); // 높이 5px 마다 도는 호 하나 → 나선 기둥
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < levels; j++) {
    const u = j / Math.max(1, levels - 1), y = base - 2 - u * (h - 3);
    const r = (b.w / 2 + 3) * (0.7 + 0.45 * u);
    const a0 = t * 11 + j * 0.9, arc = 3.6; // 호 길이(rad)
    for (let s2 = 0; s2 < 30; s2++) {
      const ang = a0 + (s2 / 30) * arc, front = Math.sin(ang) > 0;
      if ((pass === 1) !== front) continue;
      const head = s2 > 24, c = front ? (head ? WHITE : s2 > 14 ? C[5] : C[4]) : (s2 > 14 ? C[3] : C[2]);
      if (!front && s2 % 2) continue;
      const x = cx + Math.cos(ang) * r, yy = y + Math.sin(ang) * r * 0.28;
      p.dot(x, yy, c, 1);
      if (front && s2 > 10) p.dot(x, yy + 1, C[3], 1);
    }
  }
  p.glow(cx, base - h / 2, b.w * 0.8, C[3], 0.15);
  for (let i = 0; i < 10; i++) { // 튀는 티끌
    const d = R.range(0.1, 0.9), life = 0.3, u = (t - d) / life;
    if (u <= 0 || u >= 1) continue;
    const ang = R.range(0, TAU), y = base - R.range(0.2, 0.9) * (base - top), r = b.w / 2 + 4 + u * 14;
    p.dot(cx + Math.cos(ang) * r, y - u * 6, u < 0.4 ? WHITE : C[5], 1 - u);
  }
  // 바닥 고리
  for (let s = 0; s < 36; s++) { const ang = (s / 36) * TAU + t * 6; p.dot(cx + Math.cos(ang) * (b.w / 2 + 6), base + Math.sin(ang) * 2.5, s % 3 ? C[3] : C[5], 1 - sink); }
}

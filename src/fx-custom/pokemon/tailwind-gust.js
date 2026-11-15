// Tailwind gust: wind streaks sweep in from the edge of the 2-tile aura and curl into the user, with a few leaves riding along. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Tailwind Gust",
  desc: "Pale wind streaks blow in from all around a two-tile area and curl round into the user, leaves tumbling along, then the air settles.",
  tags: ["wind", "aura", "buff", "flying", "one-shot"],
  size: [144, 128],
  origin: [72, 72],
  duration: 1.3,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1a3a5a", "#3a78a8", "#6ab4e0", "#a8dcf8", "#e0f4ff"], leaf: ["#1e5a1e", "#3a9a32", "#7ad04a"], seed: 3 },
};

const R0 = 62, CY = -10, FLAT = 0.72, LIFE = 0.6, TRAIL = 0.4;
const at = (s, u) => { // 나선: 바깥에서 돌며 안으로
  const r = R0 * (1 - 0.85 * u), a = s.a0 + s.dir * 1.4 * u;
  return [Math.cos(a) * r, CY + Math.sin(a) * r * FLAT];
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), L = fit(o.leaf, 3), R = new Rng(o.seed);
  const streaks = Array.from({ length: 14 }, (_, i) => ({ a0: (i / 14) * TAU + R.range(-0.2, 0.2), dir: 1, d: R.range(0, 0.55), life: LIFE * R.range(0.85, 1.15), w: R.next() }));
  const leaves = Array.from({ length: 4 }, (_, i) => ({ a0: R.range(0, TAU), dir: 1, d: 0.1 + i * 0.14, life: LIFE * 1.2, spin: R.range(6, 12) }));
  for (const s of streaks) {
    const head = (t - s.d) / s.life;
    if (head <= 0 || head - TRAIL >= 1) continue;
    const n = 22;
    for (let k = 0; k <= n; k++) {
      const u = head - TRAIL * (k / n);
      if (u < 0 || u > 1) continue;
      const [x, y] = at(s, ease.outQuad(u));
      const f = k / n, fade = 1 - clamp((u - 0.75) / 0.25, 0, 1);
      if (fade <= 0) continue;
      const c = k === 0 ? WHITE : f < 0.3 ? C[4] : f < 0.65 ? C[3] : C[2];
      if (f > 0.75 && k % 2) continue; // 꼬리는 성기게
      p.dot(x, y, c, fade);
      if (f < (s.w > 0.5 ? 0.6 : 0.35)) p.dot(x, y + 1, f < 0.2 ? C[4] : C[2], fade); // 굵은 줄기
    }
    const [hx, hy] = at(s, ease.outQuad(clamp(head, 0, 1)));
    p.glow(hx, hy, 5, C[3], 0.15);
  }
  for (const l of leaves) {
    const u = (t - l.d) / l.life;
    if (u <= 0 || u >= 1) continue;
    const [x, y] = at(l, ease.outQuad(u)), ph = Math.sin(t * l.spin);
    const a = 1 - clamp((u - 0.8) / 0.2, 0, 1);
    p.dot(x, y, L[1], a); p.dot(x + (ph > 0 ? 1 : -1), y, L[2], a); p.dot(x, y + 1, L[0], a);
  }
  // 다 모인 뒤 몸 주위에 한 번 휙
  const k = clamp((t - 0.85) / 0.35, 0, 1);
  if (k > 0 && k < 1) {
    const r = 14 + 4 * k;
    for (let s = 0; s < 40; s++) {
      const a = (s / 40) * TAU;
      if (Math.abs(((a - k * 7) % TAU + TAU) % TAU - Math.PI) > 1.6) continue;
      p.dot(Math.cos(a) * r, -14 + Math.sin(a) * r * 0.45, s % 3 ? C[3] : C[4], 1 - k);
    }
  }
}

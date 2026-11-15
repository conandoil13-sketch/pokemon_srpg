// Heal glow: a band of light sweeps up the body, green plus marks pop out and float up, sparkles twinkle. Short and readable. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Lights, P, Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Heal Glow",
  desc: "A band of light sweeps up the body tinting it, chunky plus marks pop out round it and float up as they fade, with twinkling sparkles. Short and clear.",
  tags: ["heal", "buff", "plus", "status", "one-shot"],
  size: [80, 88],
  origin: [40, 72],
  duration: 1.0,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#06200e", "#0e4a1e", "#1e8a34", "#3ec85a", "#8af08a", "#d4ffd0", "#ffffff"], seed: 3 },
};

const SWEEP = 0.35;

function bodyOf(o) {
  const a = o.actor;
  return a ? { x: a.x, y: a.y, w: a.w, h: a.h, m: a.mask } : { x: -12, y: -38, w: 24, h: 38, m: null };
}
const inBody = (b, x, y) => {
  const i = Math.floor(x - b.x), j = Math.floor(y - b.y);
  if (i < 0 || j < 0 || i >= b.w || j >= b.h) return false;
  return b.m ? !!b.m.data[j * b.m.w + i] : true;
};

// 5x5 "+" (테두리 포함 7x7)
function plus(p, x, y, C, s) {
  x = Math.round(x); y = Math.round(y);
  const arm = s >= 1 ? 2 : 1;
  for (let d = -arm - 1; d <= arm + 1; d++) for (const [u, v] of [[d, -1], [d, 0], [d, 1], [-1, d], [0, d], [1, d]]) p.px(x + u, y + v, C[1]);
  for (let d = -arm; d <= arm; d++) { p.px(x + d, y, C[4]); p.px(x, y + d, C[4]); }
  p.px(x, y, WHITE); p.px(x - 1, y, C[5]); p.px(x, y - 1, C[5]);
}

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), b = bodyOf(o);
  const cx = b.x + b.w / 2;
  const marks = [[-0.55, 0.55], [0.6, 0.35], [-0.15, 0.1], [0.3, 0.75], [-0.6, 0.2]].map(([u, v], i) => ({ x: cx + u * (b.w / 2 + 4), y: b.y + b.h * v, d: 0.12 + i * 0.07, rise: R.range(14, 22), big: i % 2 === 0 }));
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[5], C[4]] });
  const lights = new Lights();
  lights.add(cx, b.y + b.h * 0.5, 30, C[4], 0.45, 0.5);
  let t = 0, tw = 0;
  return {
    update(dt) {
      t += dt;
      if (t < 0.7 && (tw += dt) > 0.05) { // 반짝임
        tw = 0;
        ps.spawn(P.SPARK, R.range(b.x - 2, b.x + b.w + 2), R.range(b.y, b.y + b.h), R.range(-5, 5), R.range(-40, -15), R.range(0.15, 0.3), WHITE, 1);
      }
      ps.update(dt); lights.update(dt);
    },
    draw(p) {
      // 1) 빛 띠가 발밑에서 머리로 훑으며 몸을 물들임
      const k = clamp(t / SWEEP, 0, 1);
      if (k < 1 || t < SWEEP + 0.15) {
        const band = b.y + b.h - (b.h + 6) * ease.outQuad(k);
        const fade = t < SWEEP ? 1 : 1 - (t - SWEEP) / 0.15;
        p.shade(b.x - 1, b.y - 1, b.x + b.w + 1, b.y + b.h + 1, (x, y, out) => {
          if (!inBody(b, x, y)) return;
          const d = y - band;
          if (d < -1 || d > 8) return;
          out.c = d < 1.5 ? WHITE : d < 4 ? C[5] : C[4];
          out.a = (d < 1.5 ? 0.9 : d < 4 ? 0.6 : 0.3) * fade;
        });
        p.glowLine?.(b.x - 2, band, b.x + b.w + 2, band, C[5], 0.25 * fade);
      }
      // 2) + 표시가 통 튀어나와 떠오르며 사라짐
      for (const m of marks) {
        const u = (t - m.d) / 0.55;
        if (u <= 0 || u >= 1) continue;
        const y = m.y - m.rise * ease.outQuad(u);
        if (u > 0.7 && Math.floor(t * 30) % 2) continue;
        plus(p, m.x, y, C, m.big && u > 0.12 ? 1 : 0);
      }
      ps.draw(p); lights.draw(p);
    },
  };
}

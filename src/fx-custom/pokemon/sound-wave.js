// Sound wave: arcs of sound pulse out from the mouth one after another. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Lights, Rng, fit, WHITE, ease } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Sound wave",
  desc: "A small burst at the mouth, then three arcs of sound pulse forward in a row: each one opens wide, thins and fades as it travels, with a few glints riding the fronts.",
  tags: ["sound", "wave", "cast", "directional", "one-shot"],
  size: [96, 72],
  origin: [20, 50],
  duration: 0.8,
  loop: false,
  fps: 30,
  bg: "ground",
  // spread: half-angle of each arc (rad); reach: how far the arcs travel (px)
  options: { palette: ["#0e1830", "#1e3460", "#3a62a0", "#68a0dc", "#a8d4f8", "#e0f4ff", "#ffffff"], height: 20, spread: 0.6, reach: 46, seed: 2 },
};

const WAVES = [0.0, 0.12, 0.24], LIFE = 0.48;

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), Y = -o.height;
  const lights = new Lights();
  lights.add(4, Y, 18, C[4], 0.35, 0.12);
  // glints that ride along each wave front
  const glints = WAVES.map(() => Array.from({ length: 3 }, () => ({ a: R.range(-o.spread, o.spread) * 0.85, d: R.range(0, 0.25) })));
  let t = 0;
  return {
    update(dt) { t += dt; lights.update(dt); },
    draw(p) {
      // mouth burst: a short white pop with three tiny rays
      if (t < 0.08) {
        const k = 1 - t / 0.08;
        p.glow(4, Y, 8, WHITE, 0.5 * k);
        for (const a of [-0.5, 0, 0.5]) p.line(5, Y, 5 + Math.cos(a) * 7 * k, Y + Math.sin(a) * 7 * k, C[5]);
      }
      WAVES.forEach((t0, i) => {
        const u = (t - t0) / LIFE;
        if (u < 0 || u >= 1) return;
        const r = 6 + o.reach * ease.outCubic(u);
        const w = u < 0.25 ? 3 : u < 0.6 ? 2 : 1;
        const col = u < 0.07 ? WHITE : u < 0.35 ? C[5] : C[4]; // 흰색은 막 나온 순간만 (팔레트 색이 보이게)
        const a = 1 - ease.inQuad(u);
        // 끝으로 갈수록 호가 짧아지며 사라진다 (점묘로 흐려지지 않게)
        const sp = o.spread * (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45);
        if (sp > 0.05) {
          p.arc(0, Y, r, w, -sp, sp, col);
          if (r > 10 && u < 0.7) p.arc(0, Y, r - w - 1, 1, -sp * 0.85, sp * 0.85, C[3]);
          p.glow(r * 0.9, Y, 10, C[4], 0.12 * a);
        }
        for (const g of glints[i]) {
          if (u < g.d || Math.abs(g.a) > sp) continue;
          const gx = Math.cos(g.a) * r, gy = Y + Math.sin(g.a) * r;
          p.px(gx, gy, WHITE);
          if (u < 0.5) { p.px(gx - 1, gy, C[5]); p.px(gx + 1, gy, C[5]); p.px(gx, gy - 1, C[5]); p.px(gx, gy + 1, C[5]); }
          p.glow(gx, gy, 4, C[5], 0.25 * a);
        }
      });
      lights.draw(p);
    },
  };
}

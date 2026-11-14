// Kick: a curved swoosh sweeps in, a foot stamps the target with a white flash and a shock ring. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Lights, P, Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Kick",
  desc: "A foot slides in trailing speed lines, stamps the target white-hot, a shock ring pops out, sparks and dust spray, the foot shrinks away.",
  tags: ["impact", "kick", "melee", "directional", "one-shot"],
  size: [112, 84],
  origin: [56, 64],
  duration: 0.6,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1e1408", "#4e3410", "#8e5e1a", "#d49a2e", "#ffd060", "#fff0b0", "#ffffff"], height: 20, seed: 7 },
};

const IMPACT = 0.1, HOLD = 0.26, GONE = 0.38;

// a foot (sole + a row of toes) pointing right, outlined dark, filled with the hot ramp. scale k shrinks it away
function foot(p, x, y, C, k, heat) {
  const fill = (dx, dy, r) => r;
  const sole = (cx, cy, rx, ry, col) => p.shade(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (px, py) => {
    const u = (px - cx) / rx, v = (py - cy) / ry, d = u * u + v * v;
    if (d <= 1) return col(u, v, d);
  });
  const rx = 7.5 * k, ry = 5.5 * k;
  if (rx < 1) return;
  // sole: dark outline then lit fill (top brighter, white-hot core while heat is high)
  sole(x - 3, y, rx + 1, ry + 1, () => C[1]);
  sole(x - 3, y, rx, ry, (u, v, d) => (heat > 0.6 && d < 0.5 ? WHITE : v < -0.25 ? C[5] : d > 0.75 ? C[3] : C[4]));
  // toes: four separate pads on an arc in front of the sole, each outlined on its own so gaps stay dark
  const toes = [[-0.92, 1.0], [-0.32, 1.2], [0.32, 1.2], [0.92, 1.0]];
  for (const [v, r] of toes) {
    const tx = x + (5.5 + (1 - Math.abs(v)) * 2.5) * k, ty = y + v * 6 * k, tr = 1.7 * r * k;
    sole(tx, ty, tr + 1, tr + 1, () => C[1]);
    sole(tx, ty, tr, tr, (u, vv) => (heat > 0.6 ? WHITE : vv < 0 ? C[5] : C[4]));
  }
}

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), Y = -o.height, floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [WHITE, C[5], C[4], C[2]] });
  const lights = new Lights();
  let t = 0, hit = false;
  return {
    update(dt) {
      t += dt;
      if (!hit && t >= IMPACT) {
        hit = true;
        lights.add(0, Y, 34, C[4], 0.5, 0.22);
        lights.add(0, Y, 14, WHITE, 0.7, 0.08);
        for (let i = 0; i < 12; i++) { // sparks thrown forward in a cone
          const a = R.range(-0.9, 0.9), v = R.range(140, 280);
          ps.spawn(P.SPARK, 4, Y, Math.cos(a) * v, Math.sin(a) * v - 30, R.range(0.15, 0.32), WHITE, 1, i > 8 ? 0.02 : 0);
        }
        for (let i = 0; i < 5; i++) ps.spawn(P.DUST, R.range(-6, 6), -1, R.range(-40, 40), R.range(-30, -10), R.range(0.3, 0.45), C[2], R.range(2, 3));
      }
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // 1) the foot slides in at body height from behind, trailing speed lines; 2) stamps white-hot, then shrinks away
      if (t < GONE) {
        const inK = clamp(t / IMPACT, 0, 1), fx = -22 * (1 - ease.inQuad(inK));
        const k = t < HOLD ? 1 : 1 - (t - HOLD) / (GONE - HOLD);
        if (t < IMPACT + 0.02) for (let i = 0; i < 4; i++) { // speed lines behind the foot
          const ly = Y - 4 + i * 2.7, len = 10 + (i % 2) * 6;
          p.line(fx - 9 - len, ly, fx - 9, ly, i % 2 ? C[3] : C[5], 0.9);
        }
        foot(p, fx, Y, C, k, t >= IMPACT && t < IMPACT + 0.06 ? 1 : 0.3);
      }
      // 3) shock ring: an ellipse standing across the blow, expanding and thinning
      if (t >= IMPACT && t < IMPACT + 0.26) {
        const k = (t - IMPACT) / 0.26, r = 8 + 16 * ease.outQuart(k);
        p.ring(6, Y, r, k < 0.4 ? 2 : 1, k < 0.2 ? WHITE : C[4], 1 - k);
        p.glowRing(6, Y, r, 2, C[4], 0.18 * (1 - k));
      }
      if (t >= IMPACT && t < IMPACT + 0.04) p.glow(4, Y, 14, WHITE, 0.35);
      ps.draw(p);
      lights.draw(p);
    },
  };
}

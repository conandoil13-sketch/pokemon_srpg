// Drain orbs: glowing orbs lift off the target and arc home into the user with comet tails, each landing in a little flash. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
// 원점 = 사용자 발밑. o.fromX, o.fromY = 대상 몸(발밑 기준)의 상대 위치
import { Particles, Lights, P, Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Drain Orbs",
  desc: "Glowing orbs bubble off the target, hang a beat, then arc home into the user with comet tails, each landing in a little flash.",
  tags: ["drain", "heal", "absorb", "orb", "one-shot"],
  size: [128, 80],
  origin: [24, 68],
  duration: 1.0,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#06200e", "#0e4a1e", "#1e8a34", "#3ec85a", "#8af08a", "#d4ffd0", "#ffffff"], fromX: 72, fromY: 0, seed: 5 },
};

const LIFT = 0.18, FLY = 0.32;

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed);
  const sx = o.fromX ?? 72, sy = (o.fromY ?? 0) - 16, hx = 0, hy = -14; // 대상 몸 / 사용자 몸 (발밑 위)
  const orbs = Array.from({ length: 6 }, (_, i) => {
    const a = R.range(-Math.PI, 0), r = R.range(4, 9);
    return { ox: sx + Math.cos(a) * r, oy: sy + Math.sin(a) * r * 0.7 - 2, d: i * 0.045, bend: R.range(-16, -6), s: R.next() < 0.5 ? 2 : 1, arrived: false };
  });
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[5], C[4]] });
  const lights = new Lights();
  let t = 0;
  const pos = (m, u) => { // 포물선 (위로 휘며 사용자에게)
    const e = ease.inOutQuad(u);
    return [m.ox + (hx - m.ox) * e, m.oy + (hy - m.oy) * e + m.bend * Math.sin(Math.PI * u)];
  };
  return {
    update(dt) {
      t += dt;
      for (const m of orbs) if (!m.arrived && t >= m.d + LIFT + FLY) {
        m.arrived = true;
        lights.add(hx, hy, 14, C[4], 0.4, 0.1);
        for (let i = 0; i < 3; i++) ps.spawn(P.SPARK, hx, hy, R.range(-40, 40), R.range(-50, 10), R.range(0.1, 0.2), WHITE, 1);
      }
      ps.update(dt); lights.update(dt);
    },
    draw(p) {
      for (const m of orbs) {
        const lt = t - m.d;
        if (lt < 0 || m.arrived) continue;
        let x, y;
        if (lt < LIFT) { x = m.ox; y = m.oy - 3 * ease.outQuad(lt / LIFT); } // 대상에서 떠오름
        else {
          const u = clamp((lt - LIFT) / FLY, 0, 1);
          [x, y] = pos(m, u);
          for (let k = 1; k <= 4; k++) { // 꼬리
            const [tx, ty] = pos(m, Math.max(0, u - k * 0.06));
            p.px(tx, ty, k < 2 ? C[5] : k < 3 ? C[4] : C[3]);
          }
        }
        p.circle(x, y, m.s, C[3]);
        p.px(x, y, WHITE);
        p.glow(x, y, 6, C[4], 0.35);
      }
      ps.draw(p); lights.draw(p);
    },
  };
}

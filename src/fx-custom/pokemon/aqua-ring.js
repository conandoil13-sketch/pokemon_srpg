// Aqua ring: a few watery rings orbit the body at different heights, tighten and sink into it with a glint. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Lights, P, Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Aqua Ring",
  desc: "Three thin water rings rise around the body, spin round it at different heights with drips and glints, then tighten and sink into the body in a soft blue flash.",
  tags: ["status", "water", "heal", "ring", "buff", "one-shot"],
  size: [80, 80],
  origin: [40, 68],
  duration: 1.45,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#06142e", "#0c2c5e", "#1656a6", "#2a86e0", "#5ab8f8", "#a8e2ff", "#e6f8ff"], seed: 4 },
};

const IN = 0.25, SPIN = 0.85, SINK = 1.05;

function bodyOf(o) {
  const a = o.actor;
  return a ? { x: a.x, y: a.y, w: a.w, h: a.h } : { x: -12, y: -38, w: 24, h: 38 };
}

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), b = bodyOf(o);
  const cx = b.x + b.w / 2, rx0 = b.w / 2 + 7;
  // 고리 3개: 높이(몸 위쪽·가운데·아래), 도는 방향과 빠르기, 시작 각
  const rings = [0.25, 0.55, 0.85].map((f, i) => ({ y: b.y + b.h * f, spin: (i % 2 ? -1 : 1) * R.range(7, 10), a0: R.range(0, 6.28), d: i * 0.06 }));
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[5], C[4]] });
  const lights = new Lights();
  let t = 0, sunk = false, drip = 0;
  return {
    update(dt) {
      t += dt;
      if (t > IN && t < SPIN && (drip += dt) > 0.07) { // 고리에서 떨어지는 물방울
        drip = 0;
        const r = rings[Math.floor(R.range(0, 3))], a = R.range(0, 6.28);
        ps.spawn(P.SPARK, cx + Math.cos(a) * rx0, r.y + Math.sin(a) * 2, 0, R.range(10, 30), R.range(0.2, 0.35), C[4], 1);
      }
      if (!sunk && t >= SINK) {
        sunk = true;
        lights.add(cx, b.y + b.h * 0.5, 28, C[4], 0.5, 0.25);
        for (let i = 0; i < 10; i++) { const a = R.range(0, 6.28); ps.spawn(P.SPARK, cx + Math.cos(a) * 4, b.y + b.h * 0.5 + Math.sin(a) * 6, Math.cos(a) * 50, Math.sin(a) * 40 - 20, R.range(0.15, 0.3), WHITE, 1); }
      }
      ps.update(dt); lights.update(dt);
    },
    draw(p) {
      if (t < SINK) for (const r of rings) {
        const k = clamp((t - r.d) / IN, 0, 1);
        if (k <= 0) continue;
        // 들어올 때: 아래에서 떠오르며 커짐 / 끝에서: 조여들며 몸 가운데로
        const sink = clamp((t - SPIN) / (SINK - SPIN), 0, 1);
        const rx = rx0 * (0.6 + 0.4 * ease.outBack(k)) * (1 - 0.8 * ease.inQuad(sink));
        const ry = Math.max(1.5, rx * 0.28);
        const y = r.y + (1 - ease.outQuart(k)) * 10 + (b.y + b.h * 0.5 - r.y) * ease.inQuad(sink);
        const rot = r.a0 + t * r.spin;
        // 고리: 짧은 호들로. 앞쪽 반(아래)은 밝고 굵게, 뒤쪽 반(위)은 어둡게 — 몸을 감싸는 느낌
        const n = Math.ceil(rx * 7);
        for (let s = 0; s < n; s++) {
          const a = (s / n) * Math.PI * 2;
          const px = cx + Math.cos(a) * rx, py = y + Math.sin(a) * ry;
          const front = Math.sin(a) > 0;
          const gl = (Math.cos(a - rot) + 1) / 2; // 돌아가는 반짝임
          const c = gl > 0.92 ? WHITE : front ? (gl > 0.6 ? C[5] : C[4]) : C[2];
          if (front) p.px(px, py, c); else if (s % 2 === 0) p.px(px, py, c); // 뒤쪽은 성기게
        }
        p.glow(cx, y, rx * 0.8, C[3], 0.06);
        // 고리 위 물방울 하나가 같이 돈다
        const bx = cx + Math.cos(rot) * rx, by = y + Math.sin(rot) * ry;
        p.px(bx, by - 1, WHITE); p.px(bx, by, C[5]);
      }
      if (t >= SINK && t < SINK + 0.12) p.glow(cx, b.y + b.h * 0.5, 12, C[5], 0.5 * (1 - (t - SINK) / 0.12));
      ps.draw(p); lights.draw(p);
    },
  };
}

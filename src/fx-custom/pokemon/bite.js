// Bite: two rows of fangs open wide around the target and snap shut. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Lights, P, Rng, fit, WHITE, ease } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Bite",
  desc: "Upper and lower jaws of white fangs gape above and below the target, snap shut with a white flash and a crack of light, chips fly out, the jaws hold a beat then dither away.",
  tags: ["impact", "bite", "fang", "melee", "one-shot"],
  size: [104, 80],
  origin: [52, 60],
  duration: 0.6,
  loop: false,
  fps: 30,
  bg: "ground",
  // palette: tint of the gums/rims and sparks (elemental fangs use the type ramp), dark to bright
  options: { palette: ["#2a0a10", "#5e1422", "#a0283a", "#d8505a", "#f49a8a", "#ffd8cc", "#ffffff"], height: 20, width: 15, seed: 3 },
};

const OPEN = 0.16, SNAP = 0.22, HOLD = 0.36, GONE = 0.46; // gape, shut (fast), hold, pull apart and vanish

// one jaw: an arc of gum with fangs pointing at the bite line. dir = 1 upper jaw (fangs point down), -1 lower
function jaw(p, cx, y, w, dir, C, a, n, shift = 0, len = 1) {
  // gum: a shallow arc, dark rim outside, tint inside
  for (let x = -w; x <= w; x += 0.5) {
    const u = x / w, curve = (1 - u * u) * 3.5 * -dir;
    p.px(cx + x, y + curve - dir * 1.5, C[1]);
    p.px(cx + x, y + curve - dir * 0.5, C[3]);
  }
  // fangs: triangles, the two outer ones longer (canines)
  for (let i = 0; i < n; i++) {
    // 윗니: 4개 고르게(양끝 송곳니), 아랫니(shift): 윗니 사이사이 3개
    const u = shift ? (i + 1) / (n + 1) * 2 - 1 : (i + 0.5) / n * 2 - 1, fx = cx + u * w * 0.92, base = y + (1 - u * u) * 3.5 * -dir;
    const canine = !shift && (i === 0 || i === n - 1);
    const L = (canine ? 7 : 4.5) * len, hw = canine ? 2.2 : 1.8;
    for (let d = 0; d <= L; d += 0.5) {
      const ww = hw * (1 - d / L);
      for (let e = -ww; e <= ww; e += 0.5) {
        const edge = Math.abs(e) > ww - 0.6;
        p.px(fx + e, base + dir * d, edge ? C[4] : (d < 1 ? C[5] : WHITE));
      }
    }
  }
}

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), Y = -o.height, W = o.width, floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [WHITE, C[5], C[4], C[2]] });
  const lights = new Lights();
  let t = 0, snapped = false;
  return {
    update(dt) {
      t += dt;
      if (!snapped && t >= SNAP) {
        snapped = true;
        lights.add(0, Y, 30, C[4], 0.45, 0.2);
        lights.add(0, Y, 14, WHITE, 0.6, 0.08);
        // chips and sparks thrown sideways out of the bite line
        for (let i = 0; i < 10; i++) {
          const side = i % 2 ? 1 : -1, a = (side > 0 ? 0 : Math.PI) + R.range(-0.5, 0.5), v = R.range(110, 220);
          ps.spawn(P.SPARK, side * W * 0.6, Y, Math.cos(a) * v, Math.sin(a) * v - 50, R.range(0.18, 0.34), WHITE, 1);
        }
        for (let i = 0; i < 5; i++) {
          const a = R.range(-2.6, -0.5), v = R.range(50, 120);
          ps.spawn(P.GRIT, R.range(-W, W) * 0.5, Y, Math.cos(a) * v, Math.sin(a) * v, R.range(0.3, 0.36), R.pick([C[5], C[4], C[3]]), 1); // 0.6 초 안에 끝나게
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // gap between the jaws: wide while gaping, closes fast on the snap
      // 열림 → 빠르게 닫힘(이빨 끝이 서로 엇갈려 파고듦, 살짝 튕김) → 잠깐 물고 → 벌어지며 사라짐
      let gap, len = 1;
      if (t < OPEN) { gap = 6 + 9 * ease.outQuart(t / OPEN); len = 0.6 + 0.4 * (t / OPEN); }
      else if (t < SNAP) gap = 15 - 18 * ease.inQuart((t - OPEN) / (SNAP - OPEN));
      else if (t < SNAP + 0.04) gap = -3 + 2 * ((t - SNAP) / 0.04); // 튕김
      else if (t < HOLD) gap = -1;
      else { const k = (t - HOLD) / (GONE - HOLD); gap = -1 + 6 * ease.outQuart(k); len = 1 - k; }
      if (t < GONE) {
        jaw(p, 0, Y - 2 - gap, W, 1, C, 1, 4, 0, len);
        jaw(p, 0, Y + 2 + gap, W, -1, C, 1, 3, 0.5, len); // 아래 이빨은 사이사이에
        p.glow(0, Y, 16, C[3], t < SNAP ? 0.1 : 0.2);
      }
      // the snap: a white flash bar and a short crack of light across the bite line
      if (t >= SNAP && t < SNAP + 0.05) {
        const k = 1 - (t - SNAP) / 0.05;
        p.line(-W - 4, Y, W + 4, Y, WHITE);
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.line(s * (W + 3 + i * 3), Y - 6 + i * 6, s * (W + 8 + i * 3), Y - 6 + i * 6, C[5]); // 물리는 순간 속도선
        p.line(-W - 1, Y - 1, W + 1, Y - 1, C[5], k);
        p.line(-W - 1, Y + 1, W + 1, Y + 1, C[5], k);
        p.glowLine(-W - 6, Y, W + 6, Y, 3, WHITE, 0.7 * k);
      }
      ps.draw(p);
      lights.draw(p);
    },
  };
}

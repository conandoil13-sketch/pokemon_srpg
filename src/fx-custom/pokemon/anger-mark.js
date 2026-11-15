// Anger mark: the body flashes red, a throbbing cross-vein mark pops above the head and steam puffs out. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, P, Rng, fit, hex, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Anger Mark",
  desc: "The body flashes red twice, a four-hook vein mark pops out beside the head with a bounce and throbs, and little puffs of steam blow off the head before it all fades.",
  tags: ["status", "anger", "taunt", "emote", "one-shot"],
  size: [80, 80],
  origin: [40, 66],
  duration: 1.3,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#3a0606", "#7a0e0e", "#c41e1e", "#f04030", "#ff8a6a", "#ffd0c0"], seed: 2 },
};

const POP = 0.18, THROB = [0.45, 0.75], FADE = 1.0, END = 1.15;

function bodyOf(o) {
  const a = o.actor;
  return a ? { x: a.x, y: a.y, w: a.w, h: a.h, m: a.mask } : { x: -12, y: -38, w: 24, h: 38, m: null };
}

// 💢: 가운데를 향해 볼록한 갈고리 넷. s = 크기 배율
function vein(p, x, y, s, C, a) {
  const r = 4 * s, off = 5.2 * s;
  for (const pass of [0, 1, 2]) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = x + sx * off, cy = y + sy * off, dir = Math.atan2(-sy, -sx);
    // 갈고리 = 가운데 쪽 호를 굵은 점으로 찍는다 (테두리 → 빨강 → 밝은 줄)
    for (let u = -1.1; u <= 1.1; u += 0.08) {
      const px = cx + Math.cos(dir + u) * r, py = cy + Math.sin(dir + u) * r;
      if (pass === 0) p.circle(px, py, 1.9 * s, C[0], a);
      else if (pass === 1) p.circle(px, py, 1.1 * s, C[3], a);
      else if (u < -0.2 && u > -0.8) p.px(px, py - 0.5, C[5]);
    }
  }
}

export function create(o) {
  const C = fit(o.palette, 6), R = new Rng(o.seed), b = bodyOf(o);
  const head = { x: b.x + b.w / 2, y: b.y };
  const mark = { x: head.x + b.w * 0.35 + 3, y: head.y - 4 };
  const ps = new Particles({ rng: R, ground: () => 0 });
  const steam = hex("#e8e8f0");
  let t = 0, puffs = 0;
  return {
    update(dt) {
      t += dt;
      if (t > POP && t < FADE && (puffs += dt) > 0.12) { // 머리에서 김
        puffs = 0;
        const s = R.next() < 0.5 ? -1 : 1;
        ps.spawn(P.VAPOUR, head.x + s * R.range(2, 6), head.y + 1, s * R.range(10, 25), R.range(-35, -20), R.range(0.3, 0.45), steam, R.range(2, 3));
      }
      ps.update(dt);
    },
    draw(p) {
      if (t >= END) return;
      // 몸이 붉게 두 번 번쩍 (테두리)
      if (b.m && (t < 0.12 || (t > THROB[0] && t < THROB[0] + 0.08))) {
        p.outline(b.m, b.x, b.y, C[3], 0.9);
        p.mask(b.m, b.x, b.y, C[2], 0.25);
      }
      // 💢: 튀어나옴(통통) → 두 번 욱신 → 작아지며 사라짐
      if (t >= POP * 0.5) {
        const k = clamp((t - POP * 0.5) / POP, 0, 1);
        let s = ease.outBack(k);
        for (const th of THROB) if (t > th && t < th + 0.12) s *= 1 + 0.25 * Math.sin(Math.PI * (t - th) / 0.12);
        const f = clamp((t - FADE) / (END - FADE), 0, 1);
        s *= 1 - 0.5 * f;
        if (s > 0.2) vein(p, mark.x, mark.y, s, C, f > 0.5 && Math.floor(t * 30) % 2 ? 0.5 : 1);
        if (k < 1) p.glow(mark.x, mark.y, 8, C[4], 0.3);
      }
      ps.draw(p);
    },
  };
}

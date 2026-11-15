// Chain bind: heavy chains whip across the body one after another, clank tight with sparks, hold, then burst into falling links. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Lights, P, Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Chain Bind",
  desc: "Three heavy chains whip across the body one after another, clank tight with sparks and a glint running along them, hold, then burst into links that tumble and blink out.",
  tags: ["status", "chain", "bind", "seal", "metal", "one-shot"],
  size: [120, 120],
  origin: [60, 96],
  duration: 1.45,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#10141c", "#2a323e", "#4c5868", "#7a8a9c", "#b4c2d0", "#eef4fa"], seed: 8 },
};

const SWEEP = 0.12, GAP = 0.09, HOLD = 0.95, GONE = 1.3, STEP = 6;

function bodyOf(o) {
  const a = o.actor;
  return a ? { x: a.x, y: a.y, w: a.w, h: a.h } : { x: -12, y: -38, w: 24, h: 38 };
}

// 고리 하나: 정면 고리(속이 빈 타원) / 옆으로 선 고리(굵은 막대)
function link(p, x, y, ang, face, C, glint) {
  x = Math.round(x); y = Math.round(y);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const at = (u, v) => [Math.round(x + u * ca - v * sa), Math.round(y + u * sa + v * ca)];
  if (face) { // 8x6 고리: 검은 테두리 + 2px 쇠 + 가운데 구멍
    for (let u = -4; u <= 4; u++) for (let v = -3; v <= 3; v++) {
      const d = (u / 4.4) ** 2 + (v / 3.4) ** 2;
      if (d > 1) continue;
      const [px, py] = at(u, v);
      const hole = (u / 2) ** 2 + (v / 1.2) ** 2 <= 1;
      if (hole) { p.px(px, py, C[0]); continue; }
      const rim = d > 0.72;
      p.px(px, py, rim ? C[0] : glint ? WHITE : v < -0.5 ? C[4] : v > 0.5 ? C[2] : C[3]);
    }
  } else { // 옆으로 선 고리: 8x3 굵은 막대
    for (let u = -4; u <= 4; u++) for (let v = -1; v <= 1; v++) {
      const [px, py] = at(u, v);
      const rim = Math.abs(u) === 4 || Math.abs(v) === 1 && Math.abs(u) === 3;
      p.px(px, py, rim ? C[0] : glint ? WHITE : v === -1 ? C[5] : v === 0 ? C[3] : C[1]);
    }
  }
}

export function create(o) {
  const C = fit(o.palette, 6), R = new Rng(o.seed), b = bodyOf(o);
  const cx = b.x + b.w / 2, half = b.w / 2 + 6;
  // 사슬 3줄: 높이, 기울기(번갈아), 감겨 오는 쪽
  const chains = [0.3, 0.55, 0.8].map((f, i) => {
    const slope = (i % 2 ? -1 : 1) * 0.28, from = i % 2 ? 1 : -1;
    const n = Math.floor((half * 2) / STEP) + 1;
    const links = Array.from({ length: n }, (_, k) => {
      const u = -half + k * STEP;
      return { x: cx + u, y: b.y + b.h * f + u * slope + (1 - (u / half) ** 2) * 3, face: k % 2 === 0, vx: R.range(-40, 40), vy: R.range(-70, -20), spin: R.range(-8, 8) };
    });
    return { links, ang: Math.atan(slope), from, t0: i * GAP, done: false };
  });
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[5], C[4]] });
  const lights = new Lights();
  let t = 0, broke = false;
  return {
    update(dt) {
      t += dt;
      for (const c of chains) if (!c.done && t >= c.t0 + SWEEP) { // 쨍: 끝에서 불꽃
        c.done = true;
        const e = c.from < 0 ? c.links.at(-1) : c.links[0];
        lights.add(e.x, e.y, 16, C[5], 0.4, 0.12);
        for (let i = 0; i < 5; i++) ps.spawn(P.SPARK, e.x, e.y, -c.from * R.range(40, 120), R.range(-80, 0), R.range(0.12, 0.25), WHITE, 1);
      }
      if (!broke && t >= HOLD) {
        broke = true;
        lights.add(cx, b.y + b.h * 0.55, 30, C[5], 0.4, 0.15);
      }
      ps.update(dt); lights.update(dt);
    },
    draw(p) {
      if (t >= GONE) { ps.draw(p); lights.draw(p); return; }
      for (const c of chains) {
        const k = clamp((t - c.t0) / SWEEP, 0, 1);
        if (k <= 0) continue;
        const n = c.links.length, shown = Math.ceil(n * ease.outQuad(k));
        const tight = t > c.t0 + SWEEP && t < c.t0 + SWEEP + 0.08 ? 1 : 0; // 조일 때 살짝 안으로
        const glintAt = (t - c.t0 - SWEEP - 0.1) * 60; // 반짝임이 사슬을 따라 지나감
        for (let i = 0; i < n; i++) {
          const idx = c.from < 0 ? i : n - 1 - i;
          if (i >= shown) break;
          const L = c.links[idx];
          let x = L.x, y = L.y + tight, ang = c.ang;
          if (t > HOLD) { // 끊어져 흩어짐
            const u = t - HOLD;
            x += L.vx * u; y = Math.min(-2, y + L.vy * u + 300 * u * u); ang += L.spin * u; // 바닥에 떨어져 멈춤
            if (u / (GONE - HOLD) > 0.55 && Math.floor(t * 30) % 2) continue;
          }
          link(p, x, y, ang, L.face, C, Math.abs(idx - glintAt) < 0.8);
        }
      }
      ps.draw(p); lights.draw(p);
    },
  };
}

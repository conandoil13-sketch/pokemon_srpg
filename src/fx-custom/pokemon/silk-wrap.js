// Silk wrap: threads shoot in and wind round the body into a cocoon, which loosens and falls away. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Lights, P, Rng, fit, WHITE, ease, clamp, smooth } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Silk Wrap",
  desc: "Silk threads whip in from above, catch the body and wind round it bottom to top into a cocoon with strands to the floor; it holds, then loosens and drifts apart.",
  tags: ["status", "trap", "silk", "web", "bug", "bind", "one-shot"],
  size: [96, 84],
  origin: [48, 70],
  duration: 1.3,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#2a2a36", "#55556a", "#8a8aa0", "#bcbcce", "#e2e2ec", "#f6f6fb", "#ffffff"], seed: 3 },
};

const SHOOT = 0.16, WRAP = 0.55, HOLD = 0.85, GONE = 1.15;

// 몸 영역 (o.actor 가 없으면 기본 24x38 몸)
function bodyOf(o) {
  const a = o.actor;
  if (a?.mask) return { x: a.x, y: a.y, w: a.w, h: a.h, m: a.mask };
  return { x: -12, y: -38, w: 24, h: 38, m: null };
}
const inBody = (b, x, y) => {
  const i = Math.floor(x - b.x), j = Math.floor(y - b.y);
  if (i < 0 || j < 0 || i >= b.w || j >= b.h) return false;
  if (!b.m) { const u = (i + 0.5 - b.w / 2) / (b.w / 2), v = (j + 0.5 - b.h / 2) / (b.h / 2); return u * u + v * v <= 1; }
  return !!b.m.data[j * b.m.w + i];
};

export function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), b = bodyOf(o);
  const top = b.y, mid = b.y + b.h * 0.45;
  const ps = new Particles({ rng: R, ground: () => 0, sparks: [WHITE, C[5], C[4]] });
  const lights = new Lights();
  // 실이 날아오는 곳 (왼쪽 위 · 위 · 오른쪽 위), 몸의 어디에 붙는지
  const shots = [[-40, top - 18, b.x + 2, mid], [6, top - 30, 0, top + 4], [44, top - 10, b.x + b.w - 2, mid + 4]].map(([sx, sy, ex, ey], i) => ({ sx, sy, ex, ey, d: i * 0.04 }));
  // 감기는 줄: 비스듬한 띠, 아래에서 위로 차례로 감긴다
  const tilt = 0.5, period = 5; // 띠 폭 3 + 이음매 1 + 비침 1
  // 늘어진 실 몇 가닥 (몸 → 바닥)
  const strands = [[-1, R.range(10, 16)], [1, R.range(10, 16)], [-1, R.range(4, 8)]].map(([s, dx]) => ({ x0: s < 0 ? b.x + 2 : b.x + b.w - 2, y0: R.range(mid, b.y + b.h - 4), x1: s * (b.w / 2 + dx), y1: 0 }));
  let t = 0, caught = false, done = false;
  return {
    update(dt) {
      t += dt;
      if (!caught && t >= SHOOT) {
        caught = true;
        lights.add(0, mid, 26, C[5], 0.35, 0.2);
        for (let i = 0; i < 8; i++) ps.spawn(P.SPARK, R.range(b.x, b.x + b.w), R.range(top, mid), R.range(-60, 60), R.range(-80, -20), R.range(0.12, 0.25), WHITE, 1);
      }
      if (!done && t >= HOLD) { // 풀리면서 실 조각이 흩어진다
        done = true;
        for (let i = 0; i < 14; i++) ps.spawn(P.DUST, R.range(b.x, b.x + b.w), R.range(top, b.y + b.h), R.range(-30, 30), R.range(-40, -5), R.range(0.25, 0.4), C[5], R.range(1, 2));
      }
      ps.update(dt); lights.update(dt);
    },
    draw(p) {
      // 1) 날아오는 실: 앞쪽 끝이 빠르게 몸으로, 지나간 자리는 가는 실로 남았다가 감기면서 사라짐
      for (const s of shots) {
        const k = clamp((t - s.d) / SHOOT, 0, 1);
        if (k <= 0 || t > WRAP) continue;
        const e = ease.outQuart(k), hx = s.sx + (s.ex - s.sx) * e, hy = s.sy + (s.ey - s.sy) * e;
        const fade = t < SHOOT + s.d ? 1 : 1 - (t - SHOOT - s.d) / (WRAP - SHOOT);
        p.line(s.sx, s.sy, hx, hy, (u) => (u > 0.85 ? WHITE : C[4]), 0.9 * fade);
        if (k < 1) p.px(hx, hy, WHITE);
      }
      if (t < SHOOT || t >= GONE) { ps.draw(p); lights.draw(p); return; }
      // 2) 고치: 아래에서 위로 감긴다 (wrapK), 풀릴 때는 위에서부터 띠가 성겨진다 (loose)
      const wrapK = smooth(SHOOT, WRAP, t);
      const loose = clamp((t - HOLD) / (GONE - HOLD), 0, 1);
      const reach = b.y + b.h - (b.h + 2) * wrapK; // 감긴 높이
      const turn = t * 18; // 감는 동안 띠가 돌아가는 느낌
      p.shade(b.x - 2, b.y - 2, b.x + b.w + 2, b.y + b.h + 1, (x, y) => {
        if (y < reach) return;
        const inside = inBody(b, x, y);
        const near = !inside && (inBody(b, x - 1, y) || inBody(b, x + 1, y) || inBody(b, x, y - 1) || inBody(b, x, y + 1));
        if (!inside && !near) return;
        const ph = (((x - b.x) * tilt + (y - b.y) + (t < WRAP ? turn : 0)) % period + period) % period;
                const gap = 1 - loose;
        // 띠: ph 0~3 실 다발 (가운데 밝고 가장자리 어두움), 3~4 어두운 이음매, 4~5 몸이 비침
        if (loose > 0 && (((Math.floor(x) * 5 + Math.floor(y) * 11) % 7) + 7) % 7 < loose * 9) return undefined; // 풀리며 성겨짐
        if (near) return ph < 3 && gap > 0.3 ? C[2] : undefined; // 고치 테두리 (몸보다 1px 두툼)
        if (ph >= 4) return undefined;
        if (ph >= 3) return C[1];
        const lit = x < b.x + b.w * 0.45 ? 1 : x > b.x + b.w * 0.75 ? -1 : 0; // 왼쪽이 밝게
        const c = ph < 1 ? 5 : ph < 2 ? 4 : 3;
        return C[Math.max(2, Math.min(6, c + lit))];
      });
      // 반짝이는 실 끝 (감기는 맨 위)
      if (t < WRAP) { const gx = b.x + b.w / 2 + Math.sin(t * 30) * b.w * 0.45; p.px(gx, reach, WHITE); p.glow(gx, reach, 5, C[5], 0.4); }
      // 3) 바닥까지 늘어진 실
      if (t >= SHOOT + 0.08) for (const s of strands) {
        const k = clamp((t - SHOOT - 0.08) / 0.12, 0, 1) * (1 - loose);
        if (k > 0) p.line(s.x0, s.y0, s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k, C[3], 0.7 * (1 - loose));
      }
      ps.draw(p); lights.draw(p);
    },
  };
}

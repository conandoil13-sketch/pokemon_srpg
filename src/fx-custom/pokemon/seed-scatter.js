// Seed scatter: a handful of seeds arcs in, some stick to the body and some bounce on the floor, then tiny sprouts pop out and wilt away. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Rng, fit, hex, WHITE, ease, clamp, P } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Seed Scatter",
  desc: "Seeds arc in from both sides; some stick to the body, some bounce and settle on the floor. Tiny two-leaf sprouts pop from each, wiggle, then shrink away.",
  tags: ["status", "grass", "seed", "plant", "one-shot"],
  size: [96, 96],
  origin: [48, 80],
  duration: 1.4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  // palette: 씨앗 색 (어두움→밝음), leaf: 싹 색. head: 씨앗이 모두 머리 위에 떨어짐 (고민씨)
  options: { palette: ["#2a1606", "#5a3410", "#8e5a1e", "#c48a3a", "#ecc070"], leaf: ["#0e2a10", "#1e5a22", "#3a9a34", "#7ad85a", "#c8f8a0"], head: false, seed: 6 },
};

const FLY = 0.32, SPROUT = 0.55, WILT = 1.05, GONE = 1.3;

function bodyOf(o) {
  const a = o.actor;
  return a ? { x: a.x, y: a.y, w: a.w, h: a.h, m: a.mask } : { x: -12, y: -38, w: 24, h: 38, m: null };
}
const solid = (b, x, y) => {
  if (!b.m) return true;
  const i = Math.floor(x - b.x), j = Math.floor(y - b.y);
  return i >= 0 && j >= 0 && i < b.w && j < b.h && !!b.m.data[j * b.m.w + i];
};

// 씨앗 하나 (3x4 물방울 모양, 위가 뾰족) — 어두운 테두리, 왼쪽 위 밝게
function seed(p, x, y, S, tilt) {
  x = Math.round(x); y = Math.round(y);
  const rows = tilt ? [[0, 0], [-1, 1], [-1, 1], [0, 0]] : [[0, 0], [-1, 1], [-1, 1], [-1, 0]];
  rows.forEach(([a, b2], j) => { for (let i = a - 1; i <= b2 + 1; i++) p.px(x + i, y + j - 3, S[0]); });
  rows.forEach(([a, b2], j) => { for (let i = a; i <= b2; i++) p.px(x + i, y + j - 3, j === 1 && i === a ? S[4] : j < 2 ? S[3] : S[2]); });
}
// 떡잎 둘: 줄기 + 좌우 잎
function sprout(p, x, y, L, h, wig) {
  x = Math.round(x); y = Math.round(y);
  for (let j = 1; j <= h; j++) p.px(x, y - 3 - j, L[2]);
  if (h < 2) return;
  const ty = y - 3 - h, w = wig;
  p.px(x - 1 + w, ty, L[3]); p.px(x - 2 + w, ty - 1, L[3]); p.px(x - 2 + w, ty, L[2]);
  p.px(x + 1 + w, ty, L[4]); p.px(x + 2 + w, ty - 1, L[4]); p.px(x + 2 + w, ty, L[3]);
}

export function create(o) {
  const S = fit(o.palette, 5), L = fit(o.leaf ?? meta.options.leaf, 5), R = new Rng(o.seed), b = bodyOf(o);
  const cx = b.x + b.w / 2;
  // 떨어질 곳: 몸 위 (마스크 안) 몇 개 + 바닥 몇 개. 고민씨는 머리 위에만
  const spots = [];
  const tries = o.head ? 5 : 4;
  for (let i = 0, n = 0; n < tries && i < 80; i++) {
    const x = R.range(b.x + 3, b.x + b.w - 3), y = o.head ? b.y + R.range(1, 4) : R.range(b.y + b.h * 0.25, b.y + b.h * 0.8);
    if (o.head ? solid(b, x, y + 2) : solid(b, x, y)) { spots.push({ x, y, body: true }); n++; }
  }
  if (!o.head) for (const s of [-1, 1, -1]) spots.push({ x: cx + s * R.range(b.w / 2 + 3, b.w / 2 + 12), y: 0, body: false });
  const seeds = spots.map((sp, i) => {
    const from = i % 2 ? 1 : -1;
    return { ...sp, sx: cx + from * R.range(30, 40), sy: b.y - R.range(4, 10), d: i * 0.035, h: R.range(8, 14), tilt: R.next() < 0.5, bounce: !sp.body, wig: R.next() < 0.5 ? 0 : 1 };
  });
  const ps = new Particles({ rng: R, ground: () => 0 });
  const dust = hex("#b8a888");
  let t = 0;
  const landed = new Set();
  return {
    update(dt) {
      t += dt;
      for (const s of seeds) if (!landed.has(s) && t >= s.d + FLY) {
        landed.add(s);
        if (!s.body) for (let i = 0; i < 2; i++) ps.spawn(P.DUST, s.x, 0, R.range(-15, 15), R.range(-12, -4), R.range(0.2, 0.3), dust, 1);
      }
      ps.update(dt);
    },
    draw(p) {
      if (t >= GONE) { ps.draw(p); return; }
      for (const s of seeds) {
        const k = (t - s.d) / FLY;
        if (k < 0) continue;
        if (k < 1) { // 포물선으로 날아옴
          const e = ease.inOutQuad(k);
          const x = s.sx + (s.x - s.sx) * e, y = s.sy + (s.y - s.sy) * e - s.h * Math.sin(Math.PI * k);
          seed(p, x, y, S, Math.floor(k * 8) % 2);
          continue;
        }
        let y = s.y;
        const after = t - s.d - FLY;
        if (s.bounce && after < 0.14) y -= Math.round(4 * Math.sin(Math.PI * after / 0.14)); // 바닥에서 한 번 튐
        const fade = clamp((t - WILT) / (GONE - WILT), 0, 1);
        if (fade > 0.5 && Math.floor(t * 30) % 2) continue; // 깜빡이며 사라짐
        seed(p, s.x, y, S, s.tilt);
        if (!o.head && t >= SPROUT + s.d) { // 싹: 쑥 올라왔다가 시들며 줄어듦
          const g = clamp((t - SPROUT - s.d) / 0.12, 0, 1), h = Math.round((ease.outBack(g) * 3) * (1 - fade));
          const wig = Math.floor(t * 8) % 2 ? s.wig : 0;
          sprout(p, s.x, y, L, h, wig);
        }
      }
      if (o.head && t >= SPROUT && t < WILT) { // 고민씨: 머리 위에 걱정 표시 (작은 소용돌이 점)
        const a = t * 10;
        for (let i = 0; i < 3; i++) p.px(cx + Math.cos(a + i * 2.1) * 4, b.y - 6 + Math.sin(a + i * 2.1) * 1.5, i ? S[3] : WHITE);
      }
      ps.draw(p);
    },
  };
}

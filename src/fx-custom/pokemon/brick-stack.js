// Brick stack: toy bricks with studs drop one by one and stack into a pen around the target, then pop apart. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Particles, Lights, P, Rng, fit, hex, WHITE, ease } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Brick Stack",
  desc: "Studded toy bricks drop one by one, land with a squash and a puff of dust, stack into columns beside the target with a lid on top, then pop off and blink away.",
  tags: ["status", "trap", "block", "bricks", "bind", "one-shot"],
  size: [112, 136],
  origin: [56, 118],
  duration: 1.4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  // palette 를 주면 모든 벽돌을 그 색으로 (타입 색). 없으면 빨강·노랑·파랑·초록 장난감 색
  options: { palette: null, seed: 5 },
};

const TOY_HEX = [
  ["#3a0c0c", "#7a1818", "#c42a2a", "#ee5a4a", "#ffb0a0"],
  ["#3a2a06", "#8a6410", "#e0a81c", "#ffd84a", "#fff4b0"],
  ["#0a1a3a", "#1a3e86", "#2e6ad8", "#5a9cff", "#b8dcff"],
  ["#0a2a12", "#16602c", "#28a64a", "#5ad87a", "#bff4c8"],
];
const TOY = TOY_HEX.map((r) => r.map(hex));
const DUST = hex("#c8b898");
const BW = 10, BH = 5, FALL = 0.16, GAP = 0.07, HOLD = 1.0, GONE = 1.3;

function bodyOf(o) {
  const a = o.actor;
  return a ? { x: a.x, y: a.y, w: a.w, h: a.h } : { x: -12, y: -38, w: 24, h: 38 };
}

// 벽돌 하나: 어두운 테두리, 위·왼쪽 밝게, 위에 돌기 2개
function brick(p, x, y, c, sq = 0) {
  const w = BW + sq, h = BH - sq, x0 = Math.round(x - w / 2), y0 = Math.round(y - h);
  p.rect(x0, y0, w, h, c[0]);
  p.rect(x0 + 1, y0 + 1, w - 2, h - 2, c[2]);
  p.rect(x0 + 1, y0 + 1, w - 2, 1, c[3]);
  p.rect(x0 + 1, y0 + 1, 1, h - 2, c[3]);
  p.rect(x0 + 1, y0 + h - 2, w - 2, 1, c[1]);
  for (const sx of [2, w - 4]) { // 돌기
    p.rect(x0 + sx, y0 - 2, 2, 2, c[0]);
    p.px(x0 + sx, y0 - 2, c[4]);
    p.px(x0 + sx + 1, y0 - 2, c[3]);
    p.px(x0 + sx, y0 - 1, c[3]);
  }
}

export function create(o) {
  const R = new Rng(o.seed), b = bodyOf(o);
  const pal = o.palette ? fit(o.palette, 5) : null;
  const side = Math.ceil(b.w / 2) + BW / 2 - 1; // 몸 옆에 붙는 기둥 중심
  const rows = Math.max(2, Math.min(5, Math.round(b.h / BH / 1.6)));
  // 쌓는 순서: 왼쪽·오른쪽 번갈아 아래부터, 마지막에 머리 위 뚜껑 2개
  const slots = [];
  for (let r = 0; r < rows; r++) slots.push([-side, -r * BH], [side, -r * BH]);
  const lidY = Math.min(-rows * BH, b.y - 1);
  slots.push([-BW / 2, lidY], [BW / 2, lidY]);
  const bricks = slots.map(([x, y], i) => ({ x, y, t0: i * GAP, c: pal ?? TOY[(i + (i >> 1)) % TOY.length], landed: false, popV: [R.range(-60, 60), R.range(-90, -40)] }));
  const ps = new Particles({ rng: R, ground: () => 0 });
  const lights = new Lights();
  let t = 0;
  const endT = bricks.at(-1).t0 + FALL;
  return {
    update(dt) {
      t += dt;
      for (const k of bricks) if (!k.landed && t >= k.t0 + FALL) {
        k.landed = true;
        for (let i = 0; i < 3; i++) ps.spawn(P.DUST, k.x + R.range(-4, 4), k.y, R.range(-25, 25), R.range(-15, -5), R.range(0.2, 0.35), DUST, R.range(1, 2));
        if (k === bricks.at(-1)) lights.add(0, lidY, 20, WHITE, 0.3, 0.15);
      }
      ps.update(dt); lights.update(dt);
    },
    draw(p) {
      for (const k of bricks) {
        if (t < k.t0) continue;
        let x = k.x, y = k.y, sq = 0;
        const f = (t - k.t0) / FALL;
        if (f < 1) y = k.y - 70 * (1 - ease.inQuad(f)); // 위에서 떨어짐
        else if (t < k.t0 + FALL + 0.05) sq = 1; // 착지 찌그러짐
        if (t > HOLD) { // 튕겨 나가며 사라짐
          const u = t - HOLD;
          x += k.popV[0] * u; y += k.popV[1] * u + 260 * u * u;
          if (u / (GONE - HOLD) > 0.6 && Math.floor(t * 30) % 2) continue; // 깜빡이며 사라짐
        }
        if (t >= GONE) continue;
        brick(p, x, y, k.c, sq);
      }
      if (t >= endT && t < endT + 0.05) p.glow(0, lidY - 2, 10, WHITE, 0.3);
      ps.draw(p); lights.draw(p);
    },
  };
}

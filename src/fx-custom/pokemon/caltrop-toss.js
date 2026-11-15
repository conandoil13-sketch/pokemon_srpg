// Caltrop toss: one spiky caltrop is lobbed from the user, tumbles through the air and lands on the tile with a little bounce and dust. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
// 원점 = 떨어질 칸의 발밑. o.fromX, o.fromY = 던진 포켓몬 발밑의 상대 위치
import { fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Caltrop Toss",
  desc: "A spiky caltrop flies from the thrower's hand in a high arc, spinning, drops onto the tile, bounces once and kicks up a puff of dust.",
  tags: ["trap", "throw", "spikes", "projectile", "one-shot"],
  size: [224, 160],
  origin: [112, 108],
  duration: 0.75,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#202028", "#4a4a58", "#8a8a9c", "#c8c8d8", "#f0f0f8"], fromX: -60, fromY: 0, seed: 1 },
};

export const FLIGHT = 0.45; // 게임의 TOSS_FLIGHT 와 같아야 함
const LAND_Y = -4, BOUNCE = 0.14, GONE = 0.7;
// 압정 두 모양 (돌면서 번갈아)
const A = ["...o...", "...x...", "..oxo..", ".oxhxo.", "oxxxxxo", "x.o.o.x", "o.....o"];
const B = ["o.....o", "x.o.o.x", "oxxxxxo", ".oxhxo.", "..oxo..", "...x...", "...o..."];

export function draw(p, t, o) {
  const C = fit(o.palette, 5), fx = o.fromX ?? -60, fy = o.fromY ?? 0;
  let x, y, shape = A;
  if (t < FLIGHT) {
    const u = t / FLIGHT, sx = fx, sy = fy - 18; // 손 높이에서
    const peak = 22 + Math.hypot(fx, fy) * 0.18;
    x = sx + (0 - sx) * u;
    y = sy + (LAND_Y - sy) * ease.inQuad(u) * 0.6 + (LAND_Y - sy) * u * 0.4 - Math.sin(Math.PI * u) * peak;
    shape = Math.floor(t * 20) % 2 ? A : B;
    for (let k = 1; k <= 3; k++) { // 짧은 꼬리
      const v = Math.max(0, u - k * 0.04), tx = sx + (0 - sx) * v, ty = sy + (LAND_Y - sy) * ease.inQuad(v) * 0.6 + (LAND_Y - sy) * v * 0.4 - Math.sin(Math.PI * v) * peak;
      p.dot(tx, ty - 3, C[3], 0.5 - k * 0.12);
    }
    p.dot(x, LAND_Y + 1, C[0], 0.35 * u); p.dot(x + 1, LAND_Y + 1, C[0], 0.35 * u); // 그림자
  } else {
    const b = clamp((t - FLIGHT) / BOUNCE, 0, 1);
    x = 0; y = LAND_Y - Math.sin(Math.PI * b) * 3;
  }
  if (t < GONE) {
    const fade = t > GONE - 0.1 ? (GONE - t) / 0.1 : 1;
    shape.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === ".") return;
      p.dot(x + i - 3, y + j - 6, ch === "o" ? C[1] : ch === "h" ? (t < FLIGHT ? C[4] : WHITE) : C[3], fade);
    }));
  }
  const d = (t - FLIGHT) / 0.25; // 먼지
  if (d > 0 && d < 1) {
    for (const s of [-1, 1]) {
      p.dot(s * (3 + d * 7), LAND_Y - d * 3, C[3], 1 - d);
      p.dot(s * (2 + d * 5), LAND_Y - 1 - d * 5, C[2], 1 - d);
    }
    if (d < 0.3) p.glow(0, LAND_Y - 2, 6, C[4], 0.4);
  }
}

// Gust blast: a hard blast of wind streaks rushes from the user toward the target and whips into a little whirl where it hits. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
// 원점 = 쓴 포켓몬 발밑, 오른쪽을 향함. o.reach = 대상까지 거리(px)
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Gust Blast",
  desc: "Thick white-blue wind streaks shoot forward in a tight bundle, slamming into a spot ahead where they curl into a short whirlwind with flying specks, then blow away.",
  tags: ["wind", "gust", "push", "directional", "one-shot"],
  size: [128, 72],
  origin: [16, 48],
  duration: 0.8,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#1a3048", "#3a6a98", "#6aa8d8", "#a8d8f8", "#e8f8ff"], height: 14, reach: 48, seed: 4 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), Y = -o.height, reach = o.reach ?? 48;
  // 1) 바람 줄기: 앞으로 빠르게, 꼬리가 길게
  for (let i = 0; i < 12; i++) {
    const d = R.range(0, 0.3), life = R.range(0.28, 0.38), off = R.range(-9, 9), len = R.range(14, 26), thick = R.next() > 0.5;
    const u = (t - d) / life;
    if (u <= 0 || u >= 1.3) continue;
    const head = 2 + (reach + 6) * ease.outQuad(Math.min(1, u));
    const fade = u > 1 ? 1 - (u - 1) / 0.3 : 1;
    const bend = (x) => off * (1 - 0.6 * x / reach) + Math.sin(x * 0.25 + i) * 0.8; // 끝으로 갈수록 모임
    for (let k = 0; k < len; k++) {
      const x = head - k;
      if (x < 2) break;
      const f = k / len, c = k < 2 ? WHITE : f < 0.4 ? C[4] : f < 0.75 ? C[3] : C[2];
      if (f > 0.75 && k % 2) continue;
      p.dot(x, Y + bend(x), c, fade);
      if (thick && f < 0.5) p.dot(x, Y + bend(x) + 1, C[3], fade * 0.8);
    }
  }
  // 2) 대상 앞 소용돌이
  const w = clamp((t - 0.25) / 0.5, 0, 1);
  if (w > 0 && w < 1) {
    const cx = reach, a = 1 - w;
    for (let r = 0; r < 4; r++) {
      const rr = 7 + r * 4, sp = 15 - r * 3;
      for (let s = 0; s < 18; s++) {
        const ang = (s / 18) * TAU + t * sp;
        if (s % 6 > 4) continue; // 끊긴 호
        p.dot(cx + Math.cos(ang) * rr * 0.6, Y + 2 - r * 4 + Math.sin(ang) * rr * 0.35, r === 0 ? C[4] : C[3], a);
      }
    }
    for (let k = 0; k < 6; k++) { // 날리는 티끌
      const ang = R.range(0, TAU) + t * 10, rr = 6 + w * 14;
      p.dot(cx + Math.cos(ang) * rr, Y - 2 + Math.sin(ang) * rr * 0.5 - w * 6, k % 2 ? WHITE : C[3], a);
    }
    p.glow(cx, Y, 10, C[3], 0.2 * a);
  }
}

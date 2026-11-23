// Dash trail: a kick-off puff at the feet, a bundle of speed lines with a long tail that chases the runner's head, and a wedge-shaped impact flash where it arrives. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
// 원점 = 출발 칸 발밑, 오른쪽을 향함. o.reach = 머리가 가는 거리(px), o.travel = 닿는 데 걸리는 시간(초), o.faint = 돌아오기용 옅은 꼬리만
import { Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Dash Trail",
  desc: "Speed lines streak forward from a dust puff at the feet, their tails dithering into the dark end of the palette, and end in a bright chevron flash with a few sparks ahead of the runner.",
  tags: ["dash", "charge", "speed", "directional", "one-shot"],
  size: [96, 48],
  origin: [16, 36],
  duration: 1.6, // 긴 대시(물 위 폭포오르기)도 도착 섬광까지 (travel 최대 1.2 + 0.4)
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#3a1a08", "#8a3a10", "#d86a18", "#f8a838", "#fff0a0"], height: 10, reach: 32, travel: 0.25, faint: false, light: 1, seed: 7 },
};

const FADE = 0.3; // 머리가 닿은 뒤 꼬리가 따라붙어 사라지는 시간

export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = new Rng(o.seed), Y = -(o.height ?? 10);
  const reach = Math.max(4, o.reach ?? 32), travel = Math.max(0.05, o.travel ?? 0.25), faint = !!o.faint, L = o.light ?? 1;
  const u = t / travel, head = reach * clamp(u, 0, 1); // 스프라이트가 같은 빠르기로 미끄러짐
  const BODY = 7; // 선은 몸 뒤에서 끝남 (앞 층에 그려도 스프라이트를 덮지 않게)
  const after = clamp((t - travel) / FADE, 0, 1); // 0 → 1: 꼬리가 머리 쪽으로 줄어듦
  if (after >= 1 && (faint || t > travel + 0.4)) return;
  const A = faint ? 0.45 : 1;

  // 1) 출발 먼지: 발밑에서 뒤·위로 튀는 덩어리 (타입 색, 밝은 쪽에서 어두운 쪽으로)
  if (!faint && t < 0.4) {
    for (let i = 0; i < 12; i++) {
      const life = R.range(0.22, 0.4), k = t / life;
      const vx = -R.range(4, 18), vy = -R.range(1, 10), big = R.next() > 0.5;
      if (k >= 1) continue;
      const x = vx * ease.outQuad(k), y = -1 + vy * ease.outQuad(k) + 6 * k * k;
      const c = k < 0.3 ? C[3] : k < 0.6 ? C[2] : C[1];
      if (big && k < 0.6) p.rect(x - 1, y - 1, 2, 2, c, 1 - k * 0.8); else p.dot(x, y, c, 1 - k);
    }
  }

  // 2) 속도선: 가운데 굵은 줄기 하나 + 위아래로 들쭉날쭉한 가는 선. 머리는 밝게, 꼬리는 어두운 색으로 디더 페이드
  const LINES = [[0, 0, 2], [-4, 2, 2], [4, 2, 2], [-8, 6, 1], [7, 5, 1], [-11, 9, 1]]; // [높이, 뒤처짐, 굵기]
  LINES.forEach(([off0, lag0, thick], i) => {
    const off = off0 + R.range(-0.7, 0.7), lag = lag0 + R.range(0, 3);
    const tip = head - BODY - lag;
    const len = (i === 0 ? reach + 10 : R.range(8, 14) + reach * R.range(0.4, 0.8)) * (1 - after);
    if (tip < -BODY - 3 || len < 1) return; // 런지(짧은 거리)도 몸 뒤로 선이 남게
    const from = Math.max(-BODY - 14, tip - len);
    for (let x = Math.floor(tip); x >= from; x--) {
      const f = (tip - x) / Math.max(1, tip - from); // 0 머리 → 1 꼬리
      if (f > 0.5 && (x + i) % 2) continue; // 꼬리는 디더
      const c = f < 0.06 && i === 0 && !faint ? WHITE : f < 0.25 ? C[4] : f < 0.6 ? C[3] : C[2];
      const a = A * (1 - f * 0.4) * (1 - after * 0.6);
      p.dot(x, Y + off, c, a);
      if (thick === 2 && f < 0.8) p.dot(x, Y + off + 1, f < 0.3 ? C[3] : C[2], a);
    }
  });
  if (!faint && after < 1) p.glow(head - BODY, Y, 8, C[3], 0.3 * L * (1 - after)); // 몸 뒤 빛

  // 3) 도착 섬광: 머리 앞 쐐기(>) + 앞으로 튀는 불똥
  if (!faint && u >= 1) {
    const k = clamp((t - travel) / 0.2, 0, 1);
    if (k < 1) {
      const x0 = head + 6 + k * 3, w = 5 + k * 4, h = 6 + k * 5, a = 1 - k;
      const c = k < 0.35 ? WHITE : C[4];
      p.line(x0, Y - h, x0 + w, Y, c, a); p.line(x0 + w, Y, x0, Y + h, c, a);
      p.line(x0 - 2, Y - h + 2, x0 + w - 2, Y, C[3], a * 0.8); p.line(x0 + w - 2, Y, x0 - 2, Y + h - 2, C[3], a * 0.8);
      for (let s = 0; s < 6; s++) {
        const ang = R.range(-0.9, 0.9), d = 4 + k * R.range(8, 16);
        p.dot(x0 + w + Math.cos(ang) * d, Y + Math.sin(ang) * d, s % 2 ? WHITE : C[4], a);
      }
      p.glow(x0 + w / 2, Y, 10, C[4], 0.35 * L * a);
    }
  }
}

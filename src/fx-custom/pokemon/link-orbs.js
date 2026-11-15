// Link orbs: glowing orbs travel between the user and the target along arcs; in swap mode one orb goes each way and they cross, in one-way mode a stream flows from source to destination. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
// 원점 = 대상 발밑. o.fromX, o.fromY = 사용자 발밑의 상대 위치. o.mode: 'swap' | 'take' (사용자→대상 쪽으로 받음) | 'give' (사용자→대상)
import { fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Link Orbs", desc: "Bright orbs rise from one body and the other, arc across the gap and land, swapping places or streaming one way, each trailing sparks and flaring on arrival.",
  tags: ["swap", "link", "status", "one-shot"], size: [224, 128], origin: [112, 96], duration: 1.2, loop: false, fps: 30, bg: "ground",
  options: { palette: ["#3a0a0a", "#8a1a1a", "#e04040", "#ff9a8a", "#ffe0d8"], fromX: -72, fromY: 0, mode: "swap", seed: 1 } };
const H = 18;
function orb(p, ax, ay, bx, by, u, C, lift) {
  const e = ease.inOutCubic ? ease.inOutCubic(u) : u * u * (3 - 2 * u);
  const x = ax + (bx - ax) * e, y = ay + (by - ay) * e - Math.sin(Math.PI * u) * lift;
  for (let k = 1; k <= 8; k++) { const v = Math.max(0, u - k * 0.03), ev = v * v * (3 - 2 * v); p.circle(ax + (bx - ax) * ev, ay + (by - ay) * ev - Math.sin(Math.PI * v) * lift, 3.5 - k * 0.35, C[2], 0.8 - k * 0.09); }
  p.circle(x, y, 5.5, C[1]); p.circle(x, y, 4.5, C[3]); p.circle(x, y, 2.5, C[4]); p.dot(x - 2, y - 2, WHITE); p.dot(x - 1, y - 2, WHITE); p.glow(x, y, 16, C[2], 0.55);
}
export function draw(p, t, o) {
  const C = fit(o.palette, 5), fx = o.fromX ?? -72, fy = (o.fromY ?? 0), mode = o.mode ?? 'swap';
  const S = [fx, fy - H], T = [0, -H];
  const rise = clamp(t / 0.2, 0, 1), u = clamp((t - 0.2) / 0.7, 0, 1), land = clamp((t - 0.9) / 0.3, 0, 1);
  if (rise < 1) { for (const [x, y] of mode === 'give' ? [S] : mode === 'take' ? [T] : [S, T]) { p.circle(x, y + 4 - rise * 4, 5 * rise, C[3]); p.circle(x, y + 4 - rise * 4, 2.5 * rise, C[4]); p.glow(x, y, 14, C[2], 0.5 * rise); } return; }
  if (u < 1) {
    if (mode !== 'take') orb(p, S[0], S[1], T[0], T[1], u, C, 22); // 사용자 → 대상
    if (mode !== 'give') orb(p, T[0], T[1], S[0], S[1], u, C, -14); // 대상 → 사용자 (아래 호)
  }
  if (land > 0 && land < 1) for (const [x, y] of mode === 'give' ? [T] : mode === 'take' ? [S] : [S, T]) {
    p.glow(x, y, 16, C[3], 0.6 * (1 - land)); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283, r = 4 + land * 12; p.dot(x + Math.cos(a) * r, y + Math.sin(a) * r, i % 2 ? WHITE : C[3], 1 - land); } }
}

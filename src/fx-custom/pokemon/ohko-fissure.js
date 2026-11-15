// OHKO Fissure: the ground shudders, a jagged crack races under the target and tears open into a deep glowing chasm that swallows it, then grinds shut in a burst of dust. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp } from "../../vendor/pixelfx/core/index.js";
export const meta = {
  name: "OHKO Fissure", desc: "A zig-zag crack tears across the ground, splits into a deep chasm glowing with magma light, rocks crumble in, the target sinks, and the earth slams shut with dust.",
  tags: ["earth", "ohko", "finisher", "one-shot"], size: [144, 112], origin: [72, 76], duration: 1.7, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#120804", "#2e1a0a", "#5a3818", "#8a5a2c", "#c08a50", "#f0c080"], seed: 5 },
};
const RACE = 0.3, OPEN = 0.65, HOLD = 1.05, SHUT = 1.2;
const LAVA = ["#5a1004", "#b02a08", "#ff6a1a", "#ffc060"];
export function draw(p, t, o) {
  const C = fit(o.palette, 6), R = new Rng(o.seed), L = fit(LAVA, 4);
  const xs = []; for (let i = 0; i <= 18; i++) xs.push([-63 + i * 7, R.range(-2.5, 2.5)]);
  const race = clamp(t / RACE, 0, 1), open = ease.outBack(clamp((t - RACE) / (OPEN - RACE), 0, 1)) * (1 - ease.inQuart(clamp((t - HOLD) / (SHUT - HOLD), 0, 1)));
  const sh = t < SHUT + 0.2 ? Math.round(Math.sin(t * 55) * (t > RACE ? 2 : 1)) : 0;
  const n = Math.floor(race * (xs.length - 1));
  const half = (x) => open * 14 * Math.max(0, 1 - Math.abs(x) / 66) ** 0.7; // 가운데가 가장 넓게
  if (open > 0.02) {
    // 아래·위 가장자리 다각형으로 틈
    const top = xs.map(([x, y]) => [x + sh, y - half(x)]), bot = xs.map(([x, y]) => [x + sh, y + half(x) * 0.7]).reverse();
    p.poly([...top, ...bot], C[0]);
    // 안쪽 마그마 빛 (깊이)
    p.poly(xs.map(([x, y]) => [x + sh, y - half(x) * 0.35]).concat(xs.map(([x, y]) => [x + sh, y + half(x) * 0.25]).reverse()), L[1]);
    p.poly(xs.map(([x, y]) => [x + sh, y - half(x) * 0.12]).concat(xs.map(([x, y]) => [x + sh, y + half(x) * 0.08]).reverse()), L[2]);
    p.glow(sh, 0, 40 * open, L[2], 0.45 * open);
    // 가장자리 바위 테
    for (const [x, y] of top) { p.px(x, y - 1, C[4]); p.px(x + 1, y - 1, C[3]); }
    for (const [x, y] of bot) p.px(x, y + 1, C[2]);
  }
  for (let i = 0; i < n; i++) p.line(xs[i][0] + sh, xs[i][1], xs[i + 1][0] + sh, xs[i + 1][1], i === n - 1 ? L[3] : C[1], t > SHUT ? 1 - clamp((t - SHUT) / 0.3, 0, 1) : 1);
  // 무너지는 바위 (틈으로 떨어짐)
  for (let i = 0; i < 12; i++) { const d = OPEN + R.range(-0.2, 0.3), u = (t - d) / 0.4; if (u <= 0 || u >= 1) continue;
    const x = R.range(-40, 40), y = -half(x) - 6 + u * 14; p.rect(x + sh, y, 3, 2, i % 2 ? C[3] : C[4], 1 - u); }
  // 튀는 흙 (열릴 때)
  for (let i = 0; i < 16; i++) { const d = RACE + R.range(0, 0.25), u = (t - d) / 0.55; if (u <= 0 || u >= 1) continue;
    const x = R.range(-50, 50), vx = R.range(-18, 18); p.rect(x + vx * u, -ease.outQuad(u) * R.range(18, 36) + 22 * u * u, 2, 2, i % 3 ? C[3] : C[5], 1 - u); }
  // 닫힐 때 먼지 + 번쩍
  const dd = (t - SHUT) / 0.45; if (dd > 0 && dd < 1) for (let i = 0; i < 20; i++) { const x = -60 + i * 6.3; p.disc(x + R.range(-3, 3), -5 - dd * 12, 5 + dd * 7, C[4], 0.5 * (1 - dd)); }
  if (t > SHUT && t < SHUT + 0.07) p.glow(0, 0, 60, L[3], 0.7);
}

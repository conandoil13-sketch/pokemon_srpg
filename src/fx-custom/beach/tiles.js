// Beach tile set (static): sand ground, shallow and deep sea, palm trees, shore rock and wet reef, dune grass, sand pile, sand stairs. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
// 칸 = 24×24, 로컬 좌표 x −12..11, y −24..−1 (원점 = 칸 아래 가운데). 야자수·풀·바위·더미는 위로 튀어나온다.
import { Rng, hex } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Beach Tiles", desc: "Static beach pieces: sand variants, shallow and deep water, palms, rocks and reefs, dune grass, a sand pile and sand stairs.",
  tags: ["tile", "beach", "sea", "static"], size: [40, 64], origin: [20, 56], duration: 0.1, loop: true, fps: 10, bg: "none",
  options: { piece: "sand", variant: 0, seed: 1 } };
const H = (a) => a.map(hex);
const S = H(['#c8a868', '#dcc084', '#ead29a', '#f6e4b4', '#a88a52']); // 모래: 그늘 · 바탕 · 밝음 · 빛 · 젖은 모래
const SHALLOW = H(['#3aa0b0', '#52bcc6', '#7ad6d8', '#c8f2ee']);
const DEEP = H(['#123a6a', '#1a4e86', '#24649e', '#5a9ccc']);
const OUT = hex('#3a2a14');
function px(p, x, y, c) { if (c != null) p.px(x, y, c); }
const shadow = (p, w = 10, a = 0.3) => { for (let y = -4; y < 0; y++) for (let x = -w; x < w; x++) if (Math.abs(x + 0.5) < w - (y + 4) * 1.5) p.dot(x, y, OUT, a); };

function sand(p, v, R, wx = 0, wy = 0) { // 모래: 바람 물결 무늬 + 조개·자갈 조금
  for (let y = -24; y < 0; y++) for (let x = -12; x < 12; x++) {
    const X = x + wx * 24, Y = y + wy * 24, n = Math.sin(X * 0.09 + Y * 0.31) + Math.sin(X * 0.04 - Y * 0.11 + 1.3) * 0.7;
    px(p, x, y, n > 1.2 ? S[2] : n < -1.2 ? S[0] : S[1]);
    if (Math.sin(X * 0.13 + Y * 0.55) > 0.985 && Math.sin(X * 0.05 + Y * 0.02) > 0) px(p, x, y, S[3]); // 바람 물결 결 (군데군데만)
  }
  for (let i = 0; i < 1 + v; i++) { const x = Math.floor(R.range(-10, 8)), y = Math.floor(R.range(-20, -4)); px(p, x, y, S[4]); px(p, x + 1, y, S[0]); } // 자갈
  if (v === 2) { const x = Math.floor(R.range(-8, 6)), y = Math.floor(R.range(-18, -6)), C = H(['#f8c8c0', '#e8908a', '#ffffff']); // 조개
    px(p, x, y, C[2]); px(p, x + 1, y, C[0]); px(p, x - 1, y + 1, C[0]); px(p, x, y + 1, C[1]); px(p, x + 1, y + 1, C[0]); px(p, x + 2, y + 1, C[1]); }
}
function water(p, v, R, wx, wy, W) { // 얕은 물 / 깊은 물: 칸 경계를 넘어 이어지는 물결
  for (let y = -24; y < 0; y++) for (let x = -12; x < 12; x++) {
    const X = x + wx * 24, Y = y + wy * 24, w = Math.sin(X * 0.19 + Y * 0.07 + v) + Math.sin(Y * 0.23 - X * 0.06 + 2);
    px(p, x, y, w > 1.6 ? W[3] : w > 0.5 ? W[2] : w > -1.0 ? W[1] : W[0]);
  }
  for (let i = 0; i < 2; i++) { const x = Math.floor(R.range(-9, 5)), y = Math.floor(R.range(-20, -4)); // 반짝이는 물결 선
    for (let k = 0; k < 4; k++) px(p, x + k, y + (k === 1 || k === 2 ? -1 : 0), W[3]); }
}
function palm(p, v, R) { // 야자수: 휘어진 줄기 + 늘어진 잎 5장 + 열매
  const T = H(['#4a2e14', '#7a5228', '#a07038', '#c49454']), L = H(['#1e4a1a', '#2e6e24', '#48943a', '#78bc56', '#a8dc7a']);
  shadow(p, 9, 0.28);
  const bend = v === 1 ? -0.18 : 0.2;
  let tx = 0, ty = -2;
  for (let y = -2; y > -34; y--) { tx = Math.round((y + 2) * (y + 2) * bend * 0.012 * (v === 2 ? 1.4 : 1)); ty = y;
    px(p, tx - 2, y, T[0]); px(p, tx - 1, y, T[(y & 3) === 0 ? 1 : 2]); px(p, tx, y, T[(y & 3) === 0 ? 1 : 3]); px(p, tx + 1, y, T[1]); }
  const fronds = [[-1, -0.25], [1, -0.25], [-1, 0.35], [1, 0.35], [0.15, -1]];
  for (const [dx, droop] of fronds) for (let k = 0; k < 13; k++) {
    const x = tx + Math.round(dx * k), y = ty + Math.round(droop * k + k * k * 0.035);
    px(p, x, y, L[k < 3 ? 3 : 2]); px(p, x, y + 1, L[1]); if (k > 2 && k % 2) { px(p, x, y + 2, L[0]); px(p, x, y - 1, L[4]); }
  }
  for (const [cx, cy] of [[-1, 2], [1, 2], [0, 3]]) { px(p, tx + cx, ty + cy, hex('#6a4a1e')); px(p, tx + cx, ty + cy + 1, hex('#3a2610')); } // 열매
}
function rock(p, v, R, wet = false) { // 바위(모래 위) / 암초(물에 젖은 바위 + 흰 물보라)
  const C = wet ? H(['#1a2228', '#2e3c44', '#46585e', '#62767a', '#8aa0a2']) : H(['#3a3228', '#5e5244', '#80725e', '#a49478', '#c8b898']);
  shadow(p, 11, 0.3);
  const P = v % 2 ? [[-10, -2], [-11, -8], [-6, -15], [2, -16], [9, -11], [10, -2]] : [[-9, -2], [-10, -10], [-3, -17], [6, -14], [10, -6], [9, -2]];
  const inPoly = (x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const ins = (x, y) => inPoly(x + 0.5, y + 0.5);
  for (let y = -20; y < 0; y++) for (let x = -12; x < 12; x++) {
    if (!ins(x, y)) continue;
    if (!ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1)) { px(p, x, y, C[0]); continue; }
    const lit = -(x + 1) * 0.08 - (y + 9) * 0.1;
    px(p, x, y, lit > 0.6 ? C[4] : lit > 0.1 ? C[3] : lit > -0.5 ? C[2] : C[1]);
  }
  if (wet) for (let x = -11; x < 11; x++) if ((x + v) % 3) { px(p, x, -2, SHALLOW[3]); if (x % 2) px(p, x, -3, hex('#ffffff')); } // 물보라
  else for (let i = 0; i < 2; i++) { const x = Math.floor(R.range(-6, 4)), y = Math.floor(R.range(-12, -6)); if (ins(x, y)) px(p, x, y, C[0]); } // 금
}
function grass(p, v, R) { // 해변 풀(갯그령): 가늘고 휜 잎 다발
  const G = H(['#5a6a2a', '#7a8c3a', '#9cae52', '#c4d07a']);
  for (let k = 0; k < 8; k++) { const bx = -9 + k * 2.6 + R.range(-1, 1), top = -14 - Math.floor(R.range(0, 9)), lean = R.range(-0.45, 0.45);
    for (let y = -1; y > top; y--) { const x = Math.round(bx + (y + 1) * (y + 1) * lean * 0.04); px(p, x, y, y > top + 4 ? G[k % 2 ? 1 : 2] : G[3]); }
    px(p, Math.round(bx), -1, G[0]); }
}
function pile(p, v, R) { // 모래더미: 볼록한 모래 언덕 + 조개·해초 조금
  shadow(p, 12, 0.3);
  const O = hex('#7a5a2a');
  const inside = (x, y) => { const dx = (x + 0.5) / 11, dy = (y + 8.5) / 9; return dx * dx + dy * dy <= 1 && y <= -2; };
  for (let y = -19; y < 0; y++) for (let x = -12; x < 12; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) { px(p, x, y, O); continue; }
    const lit = -(x + 0.5) / 11 * 0.5 - (y + 8.5) / 9, n = Math.sin(x * 1.3 + y * 2.1 + v);
    px(p, x, y, lit > 0.55 ? S[3] : lit > 0.05 ? S[2] : lit > -0.45 ? S[1] : S[0]);
    if (n > 1.3) px(p, x, y, S[4]);
  }
  const C = H(['#f8c8c0', '#e8908a', '#3a8a5a']);
  for (let i = 0; i < 2 + v; i++) { const x = Math.floor(R.range(-7, 6)), y = Math.floor(R.range(-15, -5)); if (inside(x, y) && inside(x + 1, y)) { px(p, x, y, C[i % 2]); px(p, x + 1, y, i === 2 ? C[2] : C[0]); } }
}
function stairs(p, v, R) { // 모래 계단: 젖은 모래 구덩이로 내려가는 판자
  sand(p, 0, R);
  const D = H(['#3a2410', '#5a3a1c', '#7a5428', '#a07438']);
  for (let y = -20; y < -3; y++) for (let x = -9; x < 9; x++) { const step = Math.floor((y + 20) / 4); px(p, x, y, (y + 20) % 4 === 0 ? D[3] : D[Math.max(0, 2 - step)]); }
  for (let x = -10; x < 10; x++) { px(p, x, -21, S[4]); px(p, x, -3, S[4]); }
}
export function draw(p, t, o) {
  const R = new Rng(o.seed * 31 + (o.variant ?? 0)), v = o.variant ?? 0, wx = o.wx ?? 0, wy = o.wy ?? 0;
  ({ sand: () => sand(p, v, R, wx, wy), shallow: () => water(p, v, R, wx, wy, SHALLOW), deep: () => water(p, v, R, wx, wy, DEEP), palm: () => palm(p, v, R),
    rock: () => rock(p, v, R), reef: () => rock(p, v, R, true), grass: () => grass(p, v, R), pile: () => pile(p, v, R), stairs: () => stairs(p, v, R) })[o.piece]?.();
}

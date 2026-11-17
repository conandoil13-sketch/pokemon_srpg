// Autumn forest tile set (static): fallen-leaf ground, pampas grass, mossy rock, leaf pond, maple trees, root stairs. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
// 칸 = 24×24, 로컬 좌표 x −12..11, y −24..−1 (원점 = 칸 아래 가운데). 나무·수풀·바위는 위로 튀어나온다.
import { Rng, hex } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Autumn Tiles", desc: "Static autumn forest pieces: leafy ground variants, a leaf pile, pampas grass, a mossy rock, a leaf-dotted pond, three maple trees and root stairs.",
  tags: ["tile", "autumn", "forest", "static"], size: [40, 64], origin: [20, 56], duration: 0.1, loop: true, fps: 10, bg: "none",
  options: { piece: "ground", variant: 0, seed: 1 } };
const H = (a) => a.map(hex);
const LEAF = H(['#c0301e', '#e0602a', '#f0a030', '#f0d048', '#8a4a24']);
const G = H(['#5e5a2c', '#74703a', '#8a8446', '#9e9654', '#6a4e2c']); // 가을 바닥: 그늘·바탕·밝음·빛·흙 (차분한 올리브)
const OUT = hex('#2e1a10');
function px(p, x, y, c) { if (c != null) p.px(x, y, c); }
function ground(p, v, R, dense = false, wx = 0, wy = 0) { // wx, wy: 맵 칸 좌표 (무늬가 칸 경계를 넘어 이어지게)
  for (let y = -24; y < 0; y++) for (let x = -12; x < 12; x++) {
    const X = x + wx * 24, Y = y + wy * 24;
    const n = Math.sin(X * 0.11 + Y * 0.07) + Math.sin(X * 0.05 - Y * 0.13 + 2) * 0.8; // 큰 얼룩 (부드럽게)
    px(p, x, y, n > 1.1 ? G[2] : n < -1.1 ? G[0] : G[1]);
  }
  for (let i = 0; i < 3; i++) { const x = Math.floor(R.range(-10, 8)), y = Math.floor(R.range(-20, -4)); // 풀포기 (ㅅ 모양)
    px(p, x, y, G[3]); px(p, x - 1, y + 1, G[2]); px(p, x + 1, y + 1, G[2]); px(p, x, y + 1, G[0]); }
  if (R.next() > 0.6) { const x = Math.floor(R.range(-9, 7)), y = Math.floor(R.range(-18, -5)); px(p, x, y, G[4]); px(p, x + 1, y, G[4]); px(p, x, y + 1, G[0]); } // 흙
  const leaves = dense ? 18 : 2 + v * 2;
  for (let i = 0; i < leaves; i++) { const x = Math.floor(R.range(-11, 10)), y = Math.floor(R.range(-23, -2)), c = LEAF[Math.floor(R.range(0, 5))];
    px(p, x, y, c); if (R.next() > 0.4) px(p, x + 1, y, c); if (dense && R.next() > 0.5) px(p, x, y - 1, LEAF[(Math.floor(R.range(0, 4)))]); }
}
// 단풍길: 잎 한 장 한 장을 겹쳐 깐 융단. 변형 5종 (0 빨강 · 1 주황 · 2 노랑 은행 · 3 흙이 비치는 성긴 길 · 4 잔가지·도토리)
// spill = 길 옆 칸 (바닥 + 흩날린 잎 몇 장)
const LP = { red: H(['#5a140c', '#9a2616', '#c83c22', '#e8603a', '#ff9a6a']), orange: H(['#6a2e0c', '#b05418', '#e07e26', '#f8a840', '#ffd890']),
  yellow: H(['#6a520c', '#a8861a', '#dcb42a', '#f4d84a', '#fff4a8']), brown: H(['#3e2412', '#62381a', '#8a5426', '#ae7438', '#d09a5a']) };
const SOIL = H(['#4a2c16', '#5c3a1e', '#704a28']);
const MIX = [['red', 'red', 'red', 'orange', 'brown'], ['orange', 'orange', 'red', 'yellow', 'brown'], ['yellow', 'yellow', 'yellow', 'orange', 'brown'],
  ['red', 'orange', 'yellow', 'brown', 'brown'], ['orange', 'red', 'yellow', 'brown', 'brown']];
const LEAF_SHAPES = [ // 칸 안 잎 모양 (x, y, 명암: 2 밝음 1 바탕 0 그늘 -1 잎맥)
  [[0, -2, 2], [-2, -1, 2], [-1, -1, 2], [0, -1, 1], [1, -1, 1], [2, -1, 1], [-1, 0, 1], [0, 0, -1], [1, 0, 0], [0, 1, 0]], // 단풍잎 (손바닥, 5폭)
  [[1, -2, 2], [0, -1, 2], [1, -1, 1], [2, -1, 1], [-1, 0, 2], [0, 0, 1], [1, 0, 0], [-1, 1, 1], [0, 1, 0]], // 비스듬한 타원 잎
  [[-1, -1, 2], [0, -1, 2], [1, -1, 1], [-1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 1, -1]], // 은행잎 (부채)
  [[0, -1, 2], [1, -1, 1], [0, 0, 1], [1, 0, 0]], // 작은 잎
];
function leafpath(p, v, R, wx = 0, wy = 0, spill = false) {
  v = ((v % 5) + 5) % 5;
  const W = (x, y) => { const X = x + wx * 24, Y = y + wy * 24; return Math.sin(X * 0.37 + Y * 0.23) + Math.sin(X * 0.19 - Y * 0.31 + 1.3); };
  if (spill) ground(p, 0, R, false, wx, wy);
  else for (let y = -24; y < 0; y++) for (let x = -12; x < 12; x++) px(p, x, y, SOIL[W(x, y) > 0.9 ? 2 : W(x, y) < -0.9 ? 0 : 1]); // 흙 바탕
  const mix = MIX[v].map((k) => LP[k]);
  const count = spill ? 12 : v === 3 ? 34 : 64; // 성긴 길은 흙이 비침
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(R.range(-12, 12)), cy = Math.floor(R.range(-24, 0)), C = mix[Math.floor(R.range(0, mix.length))];
    const shape = LEAF_SHAPES[v === 2 && R.next() < 0.6 ? 2 : Math.floor(R.range(0, LEAF_SHAPES.length))], mirror = R.next() < 0.5 ? -1 : 1;
    const tone = R.next() < 0.25 ? -1 : 0; // 한 장씩 밝기 다르게 (같은 색 잎끼리 구분)
    for (const [dx, dy, k] of shape) { const x = cx + dx * mirror, y = cy + dy;
      if (x < -12 || x > 11 || y < -24 || y > -1) continue;
      px(p, x, y, k < 0 ? C[1] : C[Math.max(1, Math.min(4, 1 + k + tone))]); } // 가장 어두운 색은 잎맥·그림자에만
    if (!spill && R.next() < 0.15) px(p, cx + mirror, cy + 2, C[0]); // 잎 아래 그림자 한 점
  }
  if (v === 4 && !spill) { // 잔가지 + 도토리
    const B = H(['#2e1a0c', '#5a3818', '#7a5028']);
    let x = Math.floor(R.range(-9, -2)), y = Math.floor(R.range(-18, -8));
    for (let k = 0; k < 9; k++) { px(p, x, y, B[1]); px(p, x, y + 1, B[0]); if (k === 4) { px(p, x + 1, y - 1, B[2]); px(p, x + 2, y - 2, B[1]); } x++; if (k % 3 === 1) y += 1; }
    for (const [ax, ay] of [[4, -6], [6, -5]]) { px(p, ax, ay, B[0]); px(p, ax + 1, ay, B[0]); px(p, ax, ay + 1, hex('#a0682a')); px(p, ax + 1, ay + 1, hex('#c88a3e')); px(p, ax, ay + 2, hex('#7a4a1c')); px(p, ax + 1, ay + 2, hex('#a0682a')); }
  }
}
function pile(p, v, R) { // 낙엽더미: 바닥 위로 볼록 솟은 잎 무더기 (위 왼쪽 빛, 아래 그늘), 겉에 잎 몇 장
  ground(p, 0, R);
  const C = [LP.red, LP.orange, LP.red][v % 3], D = LP.orange, O = hex('#3a1608');
  const inside = (x, y) => { const dx = (x + 0.5) / 11, dy = (y + 9.5) / 10; return dx * dx + dy * dy <= 1 && y <= -2; };
  for (let y = -4; y < 0; y++) for (let x = -12; x < 12; x++) if (Math.abs(x + 0.5) < 12 - (y + 4) * 1.5) p.dot(x, y, OUT, 0.3); // 발밑 그림자
  for (let y = -21; y < 0; y++) for (let x = -12; x < 12; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) { px(p, x, y, O); continue; } // 외곽선
    const lit = -(x + 0.5) / 11 * 0.5 - (y + 9.5) / 10, n = Math.sin(x * 1.7 + y * 2.3 + v) + Math.sin(x * 0.9 - y * 1.3);
    const k = lit > 0.55 ? 4 : lit > 0.1 ? 3 : lit > -0.45 ? 2 : 1;
    px(p, x, y, (n > 1.2 ? D : C)[Math.max(1, Math.min(4, k + (n < -1.1 ? -1 : 0)))]);
  }
  for (let i = 0; i < 9; i++) { const x = Math.floor(R.range(-8, 7)), y = Math.floor(R.range(-17, -5)); if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
    const c = [LP.red, LP.orange, LP.yellow][i % 3]; px(p, x, y, c[3]); px(p, x + 1, y, c[2]); px(p, x, y + 1, c[2]); px(p, x + 1, y + 1, c[1]); } // 위에 얹힌 잎
}
function bush(p, v, R) { // 억새: 줄기 다발 + 연한 이삭
  ground(p, v, R);
  const S = H(['#5a4a1e', '#8a7034', '#b89a50', '#e8dcac', '#fff6dc']);
  for (let k = 0; k < 9; k++) { const bx = -10 + k * 2.5 + R.range(-1, 1), top = -26 - Math.floor(R.range(0, 8)), lean = R.range(-0.25, 0.25);
    for (let y = -2; y > top; y--) { const x = Math.round(bx + (y + 2) * lean); px(p, x, y, y > top + 6 ? (k % 2 ? S[1] : S[2]) : S[3]); if (y < top + 6) px(p, x + 1, y, (y + k) % 2 ? S[4] : S[3]); }
    px(p, Math.round(bx + (top + 2) * lean), top, S[4]); }
  for (let x = -11; x < 12; x++) { px(p, x, -1, S[0]); if (x % 3) px(p, x, -2, S[1]); }
}
function rock(p, v, R) { // 바위: 각진 큰 돌 + 옆 작은 돌. 위 면 밝음 · 왼 면 중간 · 오른 면 어두움, 굵은 외곽선과 금
  const C = H(['#2a2622', '#4e4840', '#6e665a', '#948a7a', '#bcb2a0', '#ddd4c2']), M = H(['#3a5a24', '#5a7a30']);
  const big = v % 2 ? [[-9, -2], [-11, -9], [-7, -17], [0, -20], [7, -17], [10, -10], [9, -2]] : [[-10, -2], [-10, -11], [-5, -18], [3, -19], [9, -13], [10, -2]];
  const small = [[5, -1], [5, -5], [8, -8], [11, -6], [11, -1]];
  const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (let y = -4; y < 0; y++) for (let x = -12; x < 12; x++) if (Math.abs(x + 0.5) < 12 - (y + 4) * 1.5) p.dot(x, y, OUT, 0.35); // 발밑 그림자
  const paint = (P, cx, top) => {
    const inside = (x, y) => inPoly(P, x + 0.5, y + 0.5);
    for (let y = -22; y < 0; y++) for (let x = -12; x < 12; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) { px(p, x, y, C[0]); continue; } // 외곽선
      const h = (y - top) / (0 - top); // 0 = 꼭대기, 1 = 바닥
      const face = h < 0.32 ? 4 : x < cx - 1 ? 3 : x < cx + 3 ? 2 : 1; // 위 면 / 왼 면 / 가운데 / 오른 면 (빛은 위 왼쪽)
      px(p, x, y, C[face]);
      if (h < 0.32 && x < cx - 2 && ((x + y) & 3) === 0) px(p, x, y, C[5]); // 위 면 반짝
      if (h >= 0.32 && h < 0.4) px(p, x, y, C[Math.max(1, face - 1)]); // 위 면과 옆면 사이 각
    }
  };
  paint(big, 0, v % 2 ? -20 : -19);
  paint(small, 8, -8);
  // 금: 위에서 아래로 갈라짐 한 줄 + 가지
  let x = v % 2 ? 2 : -1;
  for (let y = -16; y < -6; y++) { px(p, x, y, C[0]); if (y % 3 === 0) x += v % 2 ? 1 : -1; }
  px(p, x + 1, -9, C[0]); px(p, x + 2, -8, C[0]);
  for (let i = 0; i < 3; i++) { const mx = -8 + i * 2 + (v % 2), my = -14 + i; px(p, mx, my, M[i & 1]); } // 왼쪽 위에 이끼 조금
  for (let i = 0; i < 3; i++) { const lx = Math.floor(R.range(-7, 4)), ly = Math.floor(R.range(-18, -13)); if (inPoly(big, lx + 0.5, ly + 0.5) && inPoly(big, lx + 1.5, ly + 0.5)) { px(p, lx, ly, LEAF[i % 4]); px(p, lx + 1, ly, LEAF[(i + 1) % 4]); } } // 위에 떨어진 잎
}
function pond(p, v, R, wx = 0, wy = 0) {
  const W = H(['#1a3a52', '#24587a', '#2e6a8e', '#7ab4cc']);
  for (let y = -24; y < 0; y++) for (let x = -12; x < 12; x++) { const X = x + wx * 24, Y = y + wy * 24, w = Math.sin(X * 0.21 + Y * 0.05) + Math.sin(Y * 0.17 - X * 0.08 + 1);
    px(p, x, y, w > 1.55 ? W[3] : w > 0.4 ? W[2] : w > -1.1 ? W[1] : W[0]); }
  for (let i = 0; i < 1 + (v % 2); i++) { const x = Math.floor(R.range(-9, 7)), y = Math.floor(R.range(-20, -4)), c = LEAF[Math.floor(R.range(0, 4))];
    px(p, x, y, c); px(p, x + 1, y, c); px(p, x + 1, y - 1, c); px(p, x + 2, y, LEAF[4]); px(p, x - 1, y + 1, W[3]); px(p, x + 3, y + 1, W[3]); } // 떠 있는 잎 + 물결
}
function tree(p, v, R) { // 단풍나무: 수관 덩어리 3~4개 겹침, 위 왼쪽 빛, 줄기 + 그림자
  const PAL = [H(['#5a120c', '#9a2214', '#d23e22', '#f87a44', '#ffb07a']), H(['#6a2c08', '#b25814', '#ea8a24', '#ffbe52', '#ffe2a0']), H(['#6a5208', '#ae8a14', '#e8c42a', '#fbe468', '#fff6b8'])][v % 3];
  const blobs = [[0, -24, 12], [-7, -18, 8], [7, -18, 8], [-4, -31, 8], [5, -31, 7]]; // 큰 수관 (칸 너비를 살짝 넘침)
  const inC = (x, y) => blobs.some(([bx, by, r]) => Math.hypot(x + 0.5 - bx, (y + 0.5 - by) * 1.08) <= r);
  for (let y = -10; y < -2; y++) for (let x = -2; x <= 1; x++) px(p, x, y, x === -2 ? hex('#3a2010') : x === 1 ? hex('#4a2a14') : hex('#7a4a28')); // 짧은 줄기
  for (let y = -4; y < 0; y++) for (let x = -10; x < 10; x++) if (Math.abs(x) < 10 - (y + 4) * 2) p.dot(x, y, OUT, 0.3); // 발밑 그림자
  for (let y = -44; y < -6; y++) for (let x = -16; x < 16; x++) {
    if (!inC(x, y)) { if (inC(x + 1, y) || inC(x - 1, y) || inC(x, y + 1) || inC(x, y - 1)) px(p, x, y, OUT); continue; }
    const lit = -(x + 3) * 0.07 - (y + 28) * 0.08 + Math.sin(x * 0.9 + y * 0.6 + v) * 0.3 + (((x * 7 + y * 3) & 3) === 0 ? 0.25 : 0); // 위 왼쪽 빛 + 잎 결
    px(p, x, y, lit > 0.9 ? PAL[4] : lit > 0.35 ? PAL[3] : lit > -0.3 ? PAL[2] : lit > -0.9 ? PAL[1] : PAL[0]);
  }
  for (let i = 0; i < 6; i++) { const x = Math.floor(R.range(-10, 10)), y = Math.floor(R.range(-36, -14)); if (inC(x, y)) px(p, x, y, PAL[4]); } // 반짝 잎
}
function stairs(p, v, R) {
  ground(p, 0, R);
  const D = H(['#1e120a', '#3a2414', '#5a3a20', '#7a5230']);
  for (let y = -20; y < -3; y++) for (let x = -9; x < 9; x++) { const step = Math.floor((y + 20) / 4); px(p, x, y, (y + 20) % 4 === 0 ? D[3] : D[Math.max(0, 2 - step)]); }
  for (const [x0, y0, len] of [[-10, -21, 8], [3, -21, 7], [-10, -4, 6]]) for (let k = 0; k < len; k++) { px(p, x0 + k, y0 + (k % 3 === 0 ? 1 : 0), D[2]); px(p, x0 + k, y0 - 1, D[3]); } // 뿌리
}
export function draw(p, t, o) {
  const R = new Rng(o.seed * 31 + (o.variant ?? 0)), v = o.variant ?? 0;
  ({ ground: () => ground(p, v, R, false, o.wx ?? 0, o.wy ?? 0), leafpath: () => leafpath(p, v, R, o.wx ?? 0, o.wy ?? 0), leafspill: () => leafpath(p, v, R, o.wx ?? 0, o.wy ?? 0, true), pile: () => pile(p, v, R), leafpile: () => ground(p, v, R, true, o.wx ?? 0, o.wy ?? 0), bush: () => bush(p, v, R), rock: () => rock(p, v, R), pond: () => pond(p, v, R, o.wx ?? 0, o.wy ?? 0), tree: () => tree(p, v, R), stairs: () => stairs(p, v, R) })[o.piece]?.();
}

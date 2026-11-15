// Move marker: a bouncing arrow over a pulsing floor ring that marks the tile a unit is walking to. Seamless loop. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { fit, WHITE, TAU } from "../../vendor/pixelfx/core/index.js";

export const meta = {
  name: "Move Marker",
  desc: "A chunky down arrow bobs above the destination tile while a flat ring on the floor pulses outward and fades, with four corner glints; loops seamlessly.",
  tags: ["ui", "marker", "destination", "cursor", "loop"],
  size: [48, 48],
  origin: [24, 38],
  duration: 0.8,
  loop: true,
  fps: 30,
  bg: "ground",
  options: { palette: ["#0a1a2e", "#14406a", "#2a78c8", "#58b8f8", "#a8e4ff", "#ffffff"], seed: 1 },
};

// 아래 화살표 (테두리 포함): 7x6 머리 + 3x3 꼬리
const ARROW = [
  "..ooooo..",
  "..oxhxo..",
  "..oxhxo..",
  "oooxhxooo",
  "oxxxhxxxo",
  ".oxxhxxo.",
  "..oxxxo..",
  "...oxo...",
  "....o....",
];

export function draw(p, t, o) {
  const C = fit(o.palette, 6);
  const ph = (t % meta.duration) / meta.duration;
  // 1) 바닥 고리: 칸 크기(지름 ~20px) 납작한 타원이 퍼지며 옅어짐 + 고정 테두리
  const r = 7 + 6 * ph, a = 1 - ph;
  if (ph > 0.12 && ph < 0.8) for (let s = 0; s < 64; s++) { // 퍼지는 고리는 고리 안에서 생겨나 다 퍼지기 전에 사라짐 (이음매 없음)
    const ang = (s / 64) * TAU;
    const x = Math.cos(ang) * r, y = Math.sin(ang) * r * 0.45 - 2;
    if (a > 0.5 || s % 2 === 0) p.px(x, y, a > 0.6 ? C[4] : C[3]);
  }
  for (let s = 0; s < 48; s++) { // 고정 테두리 (칸 안쪽)
    const ang = (s / 48) * TAU, x = Math.cos(ang) * 8, y = Math.sin(ang) * 3.6 - 2;
    p.px(x, y, Math.sin(ang) > 0 ? C[3] : C[2]);
  }
  p.glow(0, -2, 10, C[3], 0.25);
  // 2) 네 귀퉁이 반짝 (돌아가며)
  for (let k = 0; k < 4; k++) {
    const on = Math.floor(ph * 4) === k;
    const [cx, cy] = [[-10, -2], [0, -7], [10, -2], [0, 3]][k];
    p.px(cx, cy, on ? WHITE : C[2]);
  }
  // 3) 화살표: 위아래로 통통 (끝에서 살짝 눌림)
  const bob = Math.round(Math.abs(Math.sin(ph * Math.PI)) * 4);
  const top = -24 - bob;
  ARROW.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    p.px(i - 4, top + j, ch === 'o' ? C[1] : ch === 'h' ? WHITE : C[3]);
  }));
  p.glow(0, top + 3, 6, C[4], 0.2);
}

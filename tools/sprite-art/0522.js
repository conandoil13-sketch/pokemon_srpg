// 줄뮤마 (522) — 포니타(77) 대기·걷기 시트를 뼈대로: 불꽃 갈기·꼬리 → 흰 번개 갈기, 크림색 몸 → 검정, 파란 발굽 → 흰 발목 띠,
// 눈 → 파랑, 몸통에 흰 줄무늬(몸 윗선 기준이라 프레임이 흔들려도 같이 움직임)
const rgb = (h) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
const hexAt = (d, i) => [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');

const MANE = { fff700: 'f8f8f8', dfb700: 'c8ccc0', ff875f: '6c6c74', d73f00: '4c4a54', '9f0000': '383640' }; // 불꽃 속(노랑)만 흰 갈기, 겉불꽃은 몸 색
const BODY = { ffe79f: '6c6c74', dfaf67: '4c4a54', bf7727: '383640', a76f00: '2a2630' };
const HOOF = { '0067b7': 'b8bcb0', '1f9fe7': 'e8ece0' };
const STRIPE = { '6c6c74': 'f0f0e8', '4c4a54': 'd0d8c0', '383640': 'a0a098', '2a2630': 'a0a098' };
const EYE = rgb('77c7d7'), IRIS = rgb('306078');

// 갈기·꼬리를 번개처럼: 흰 부분 위쪽 선에서 4칸마다 가는 가시(2칸, 얼굴 반대쪽으로 기움)를 세우고 테두리를 두른다
const WHITE = new Set(['f8f8f8', 'c8ccc0']);
const LEAN = [0, -1, -1, -1, 0, 1, 1, 1]; // 방향(시트 줄)별 가시가 기우는 쪽 — 0 이면 가운데서 바깥으로
function jag(d, at, op, fw, fh, dir) {
  const isW = (x, y) => op(x, y) && WHITE.has(hexAt(d, at(x, y)));
  let left = fw, right = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (isW(x, y)) { left = Math.min(left, x); right = Math.max(right, x); }
  if (right < 0) return;
  const mid = (left + right) / 2, spikes = [];
  for (let x = left; x <= right; x++) {
    if ((x - left) % 4 !== 1) continue;
    let y = 0; while (y < fh && !isW(x, y)) y++;
    if (y >= fh || y < 3) continue;
    const lean = LEAN[dir] || (x < mid ? -1 : 1);
    spikes.push([x, y - 2], [x + lean, y - 3]);
    if (y >= 4) spikes.push([x + lean, y - 4]);
  }
  const W = rgb('f8f8f8'), painted = [];
  for (const [x, y] of spikes) if (x >= 1 && y >= 1 && x < fw - 1) { const i = at(x, y); d[i] = W[0]; d[i + 1] = W[1]; d[i + 2] = W[2]; d[i + 3] = 255; painted.push([x, y]); }
  for (const [x, y] of spikes) if (x >= 1 && y >= 1 && x < fw - 1) { const i = at(x, y + 1); if (d[i + 3] && hexAt(d, i) === '000000') { d[i] = W[0]; d[i + 1] = W[1]; d[i + 2] = W[2]; } } // 뿌리 쪽 테두리를 열어 갈기와 잇기
  for (const [x, y] of painted) for (const [a, b] of [[1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]]) {
    const X = x + a, Y = y + b; if (X >= 0 && Y >= 0 && X < fw && !op(X, Y)) { const i = at(X, Y); d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; }
  }
}

export function paint(img, fw, fh) {
  const d = img.data, W = img.w;
  for (let fy = 0; fy < img.h; fy += fh) for (let fx0 = 0; fx0 < W; fx0 += fw) {
    const at = (x, y) => ((fy + y) * W + fx0 + x) * 4;
    const op = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && d[at(x, y) + 3] > 0;
    const set = (x, y, c) => { const i = at(x, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; };
    // 눈: 흰 하이라이트 → 밝은 파랑, 옆 검은 눈동자(테두리 아님) → 짙은 파랑
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (!op(x, y) || hexAt(d, at(x, y)) !== 'ffffff') continue;
      set(x, y, EYE);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + a, Y = y + b;
        if (op(X, Y) && hexAt(d, at(X, Y)) === '000000' && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([p, q]) => op(X + p, Y + q))) set(X, Y, IRIS);
      }
    }
    // 불꽃(테두리 없음) 가장자리 → 검은 테두리 (갈기·꼬리 실루엣을 또렷하게)
    const edge = [];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++)
      if (op(x, y) && MANE[hexAt(d, at(x, y))] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !op(x + a, y + b))) edge.push([x, y]);
    for (const [x, y] of edge) set(x, y, [0, 0, 0]);
    // 색 바꾸기 + 몸 윗선
    let bodyTop = fh, bodyLeft = fw;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (!op(x, y)) continue;
      const h = hexAt(d, at(x, y)), to = MANE[h] ?? BODY[h] ?? HOOF[h];
      if (BODY[h]) { bodyTop = Math.min(bodyTop, y); bodyLeft = Math.min(bodyLeft, x); }
      if (to) set(x, y, rgb(to));
    }
    jag(d, at, op, fw, fh, (fy / fh) % 8);
    // 줄무늬: 몸 색 픽셀 중 (몸 기준) 대각 띠, 머리 쪽 윗부분은 빼고
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (!op(x, y) || y < bodyTop + 3) continue;
      const h = hexAt(d, at(x, y)), to = STRIPE[h];
      if (!to) continue;
      const u = (x - bodyLeft) + Math.floor((y - bodyTop) / 2);
      if (((u % 5) + 5) % 5 === 0) set(x, y, rgb(to));
    }
  }
  return img;
}

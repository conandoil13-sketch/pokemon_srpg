// 버프론 (626) — 켄타로스(128) 대기·걷기 시트를 뼈대로, 프레임마다 몸 색을 바꾸고 머리(아프로·뿔·얼굴)를 새로 그린다
// 머리 위치: 프레임 윗부분의 뿔(회색) 픽셀 무게중심. 방향: 시트의 줄 (0 아래 · 1 오른아래 · 2 오른 · 3 오른위 · 4 위 · 5 왼위 · 6 왼 · 7 왼아래)
const rgb = (h) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
const hexAt = (d, i) => [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');

const BODY = { dfaf67: 'b06830', ffe79f: 'c88850', bf7727: '885838', df771f: '9a5a2a', '773f00': '583020', a75f1f: '6e3c22' };
const HORN = { ffffff: 'f8e098', d7dfdf: 'f8e098', afb7bf: 'd8c088', '7f8f97': 'b8a088', '47676f': '806848' }; // 윗부분 회색 → 크림색 뿔
const HOOF = { ffffff: 'a0a0a0', d7dfdf: 'a0a0a0', afb7bf: '707070', '7f8f97': '505050', '47676f': '303030' }; // 아랫부분 회색 → 어두운 발굽
const GREY = new Set(Object.keys(HORN));
const AFRO = { light: rgb('888078'), fill: rgb('685850'), shade: rgb('584848'), dark: rgb('483840') };
const MUZ = { [rgb('b06830').join()]: 'a09080', [rgb('c88850').join()]: 'b8a088', [rgb('885838').join()]: '888078', [rgb('9a5a2a').join()]: '888078' };
const EYE = rgb('f8e048'), NOSE = rgb('889898'), OUT = [0, 0, 0];

// 방향별 머리(아프로 중심) — 켄타로스 대기 첫 프레임(32×56) 기준, 손으로 읽은 값. 5·6·7 은 3·2·1 의 좌우 반전
// face: 얼굴 쪽 (0 정면, 1 오른쪽, -1 왼쪽, null 뒷모습)
const HEAD = { 0: [15, 21, 0], 1: [21, 20, 1], 2: [22, 18, 1], 3: [21, 12, null], 4: [15, 12, null] };
for (const [a, b] of [[5, 3], [6, 2], [7, 1]]) { const [x, y, f] = HEAD[b]; HEAD[a] = [30 - x, y, f === null ? null : -f]; }
const AFRO_C = [[0, 0, 4.6], [-3.6, 1.2, 3.6], [3.6, 1.2, 3.6], [-2, -2.6, 3.4], [2, -2.6, 3.4]];

const HORNISH = new Set(['ffffff', 'd7dfdf', 'afb7bf', '7f8f97', '47676f']);
// 머리 근처(반경 7) 뿔 픽셀 무게중심 — 프레임마다 머리가 얼마나 움직였는지 재는 데 쓴다 (색을 바꾸기 전 원본에서)
function hornCentroid(d, W, at, fw, fh, cx, cy) {
  let sx = 0, sy = 0, n = 0;
  for (let y = Math.max(0, Math.floor(cy - 7)); y <= Math.min(fh - 1, cy + 7); y++) for (let x = Math.max(0, Math.floor(cx - 7)); x <= Math.min(fw - 1, cx + 7); x++) {
    const i = at(x, y); if (d[i + 3] && HORNISH.has(hexAt(d, i))) { sx += x; sy += y; n++; }
  }
  return n ? [sx / n, sy / n] : null;
}

let REF = null; // 방향별 기준 무게중심 (켄타로스 대기 첫 프레임)
export function reference(idle) {
  REF = {};
  for (let dir = 0; dir < 8; dir++) {
    const at = (x, y) => ((dir * 56 + y) * idle.w + x) * 4, [hx, hy] = HEAD[dir];
    REF[dir] = hornCentroid(idle.data, idle.w, at, 32, 56, hx, hy);
  }
}

export function paint(img, fw, fh) {
  const d = img.data, W = img.w, ox = (fw - 32) / 2;
  for (let fy = 0; fy < img.h; fy += fh) for (let fx0 = 0; fx0 < W; fx0 += fw) {
    const dir = (fy / fh) % 8, [bx, by, face] = HEAD[dir];
    const at = (x, y) => ((fy + y) * W + fx0 + x) * 4;
    const op = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && d[at(x, y) + 3] > 0;
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= fw || y >= fh) return; const i = at(x, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
    let bot = -1, top = fh;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (op(x, y)) { top = Math.min(top, y); bot = y; }
    if (bot < 0) continue;
    // 머리 위치 = 기준값 + (이 프레임 뿔 무게중심 − 기준 무게중심)
    const c = hornCentroid(d, W, at, fw, fh, bx + ox, by), ref = REF?.[dir];
    const ax = Math.round(bx + ox + (c && ref ? c[0] - ox - ref[0] : 0)), ay = Math.round(by + (c && ref ? c[1] - ref[1] : 0));
    const mid = top + (bot - top) * 0.55;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (!op(x, y)) continue;
      const h = hexAt(d, at(x, y)), to = BODY[h] ?? (HORNISH.has(h) ? (y < mid ? HORN : HOOF)[h] : null);
      if (to) set(x, y, rgb(to));
    }
    // 얼굴: 아프로 아래 회색 주둥이
    if (face !== null) {
      const mx = ax + face * 3, my = ay + 6, rx = face ? 3.5 : 4.2, ry = 3;
      for (let y = Math.floor(my - ry); y <= my + ry; y++) for (let x = Math.floor(mx - rx); x <= mx + rx; x++) {
        if (!op(x, y) || ((x - mx) / rx) ** 2 + ((y - my) / ry) ** 2 > 1) continue;
        const to = MUZ[[...d.subarray(at(x, y), at(x, y) + 3)].join()];
        if (to) set(x, y, rgb(to));
      }
    }
    // 아프로
    const inA = (x, y) => AFRO_C.some(([cx, cy, r]) => (x - ax - cx) ** 2 + (y - ay - cy) ** 2 <= r * r);
    const cells = [];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (inA(x, y)) cells.push([x, y]);
    for (const [x, y] of cells) {
      const t = !inA(x, y - 1) || !inA(x - 1, y - 1), b = !inA(x, y + 1) || !inA(x + 1, y + 1);
      const curl = ((x - ax + 20) % 4 === 0 && (y - ay + 20) % 3 === 1) || ((x - ax + 22) % 4 === 0 && (y - ay + 20) % 3 === 2);
      set(x, y, t ? AFRO.light : b ? AFRO.shade : curl ? AFRO.dark : AFRO.fill);
    }
    const painted = new Set(cells.map(([x, y]) => y * fw + x));
    for (const k of painted) { const x = k % fw, y = (k / fw) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!op(x + a, y + b) && x + a >= 0 && y + b >= 0 && x + a < fw && y + b < fh) set(x + a, y + b, OUT); }
    // 눈·코 (아프로 아래 가장자리에서 살짝 보이게)
    if (face === 0) { for (const s of [-2, 2]) { set(ax + s, ay + 4, EYE); set(ax + s, ay + 5, OUT); } for (const s of [-1, 0, 1]) set(ax + s, ay + 8, NOSE); }
    else if (face !== null) { set(ax + face * 3, ay + 4, EYE); set(ax + face * 3, ay + 5, OUT); for (const k of [4, 5, 6]) if (op(ax + face * k, ay + 7) && op(ax + face * (k + 1), ay + 7)) set(ax + face * k, ay + 7, NOSE); }
  }
  return img;
}

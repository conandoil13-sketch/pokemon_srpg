// 스프라이트 시트 모양 손질 (tools/derive-sprite.js 에서 씀) — 프레임마다 코드로 같은 규칙을 적용한다
const key = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
const rgb = (h) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));

// 머리 볏 바꾸기: 프레임마다 볏 꼭대기(hair 색의 가장 윗줄)를 찾아, 그 둘레에 원 여러 개를 합친 새 볏을 그린다.
// 얼굴(hair 아닌 안쪽 색)은 덮지 않고, 투명·바깥 테두리·볏 윗부분만 칠한 뒤 바깥에 검은 테두리를 두른다.
// spec = { hair: [hex...] 볏 색, circles: [[dx, dy, r]...] (꼭대기 기준), keepRows, fill, light, dark, tips?: [[dx,dy,hex]...] }
export function reshapeCrest(img, fw, fh, spec) {
  const d = img.data, W = img.w, hair = new Set(spec.hair.map((h) => parseInt(h, 16)));
  const [F, L, D] = [spec.fill, spec.light, spec.dark].map(rgb), OUT = [0, 0, 0];
  for (let fy = 0; fy < img.h; fy += fh) for (let fx = 0; fx < W; fx += fw) {
    const at = (x, y) => ((fy + y) * W + fx + x) * 4;
    const op = (x, y) => x >= 0 && y >= 0 && x < fw && y < fh && d[at(x, y) + 3] > 0;
    let top = -1;
    for (let y = 0; y < fh && top < 0; y++) for (let x = 0; x < fw; x++) if (op(x, y) && hair.has(key(d, at(x, y)))) { top = y; break; }
    if (top < 0) continue;
    let sx = 0, n = 0;
    for (let y = top; y < top + 3; y++) for (let x = 0; x < fw; x++) if (op(x, y)) { sx += x; n++; }
    const cx = sx / n;
    const inM = (x, y) => spec.circles.some(([dx, dy, r]) => (x - (cx + dx)) ** 2 + (y - (top + dy)) ** 2 <= r * r);
    const edge = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !op(x + a, y + b));
    const paint = [];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (!inM(x, y)) continue;
      const i = at(x, y), c = key(d, i);
      const ok = !op(x, y) || (c === 0 && edge(x, y)) || (hair.has(c) && y < top + spec.keepRows);
      if (ok) paint.push([x, y, !inM(x, y - 1) ? L : !inM(x + 1, y + 1) || !inM(x + 1, y) ? D : F]);
    }
    const painted = new Set(paint.map(([x, y]) => y * fw + x));
    for (const [x, y, c] of paint) { const i = at(x, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    for (const [x, y, h] of spec.tips ?? []) { const X = Math.round(cx + x), Y = top + y; if (painted.has(Y * fw + X)) { const i = at(X, Y), c = rgb(h); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; } }
    const ring = [];
    for (const k of painted) { const x = k % fw, y = (k / fw) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + a, Y = y + b; if (X >= 0 && Y >= 0 && X < fw && Y < fh && !op(X, Y)) ring.push([X, Y]); } }
    for (const [x, y] of ring) { const i = at(x, y); d[i] = OUT[0]; d[i + 1] = OUT[1]; d[i + 2] = OUT[2]; d[i + 3] = 255; }
  }
  return img;
}

// 가운데 n 줄 띠를 한 번 더 복사해 몸을 n 픽셀 넓힌다 (프레임 폭도 n 만큼 넓어짐, n 짝수). Offsets·Shadow 에도 같은 규칙을 쓰면 위치가 맞는다.
// headRows > 0 이면 프레임마다 맨 위 headRows 줄(머리)은 넓히지 않고 n/2 만큼 옮겨 가운데에 둔다 (머리가 둘로 갈라져 보이지 않게).
export function widen(img, fw, n, headRows = 0, fh = img.h) {
  const cols = img.w / fw, nw = fw + n, a = fw / 2 - n / 2, out = { w: cols * nw, h: img.h, data: Buffer.alloc(cols * nw * img.h * 4) };
  for (let c = 0; c < cols; c++) for (let fy = 0; fy < img.h; fy += fh) {
    let top = fh;
    if (headRows) for (let y = 0; y < fh && top === fh; y++) for (let x = 0; x < fw; x++) if (img.data[((fy + y) * img.w + c * fw + x) * 4 + 3]) { top = y; break; }
    for (let y = 0; y < fh; y++) for (let x = 0; x < nw; x++) {
      const head = y >= top && y < top + headRows, sx = head ? x - n / 2 : x < a + n ? x : x - n;
      if (sx < 0 || sx >= fw) continue;
      const s = ((fy + y) * img.w + c * fw + sx) * 4;
      img.data.copy(out.data, ((fy + y) * out.w + c * nw + x) * 4, s, s + 4);
    }
  }
  return out;
}

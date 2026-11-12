// 도트 그리기 공용 헬퍼

// 문자열 패턴 → 오프스크린 캔버스 ('.' = 투명)
export function patternCanvas(rows, palette) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

// hex 색을 f 배 밝기로 (f<1 어둡게, f>1 밝게)
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1))));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// 결정적 해시 (좌표/문자열 → 0..1)
export function hash(...vals) {
  let h = 2166136261;
  for (const v of vals.join(',')) h = Math.imul(h ^ v.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

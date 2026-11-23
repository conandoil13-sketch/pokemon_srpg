// 갈무리(Galmuri, OFL) 픽셀 폰트 텍스트 렌더러
// 캔버스 fillText 는 안티에일리어싱을 하므로, 한 번 그린 뒤 알파를 임계값으로 잘라
// 완전한 도트로 만든다. (문자열·색 조합별 캐시)

export const FONTS = {
  main: { family: 'Galmuri11', file: 'Galmuri11', size: 12, ascent: 11, height: 14 },
  small: { family: 'Galmuri9', file: 'Galmuri9', size: 10, ascent: 9, height: 12 },
};
export const LINE_H = 14;

const hasDom = typeof document !== 'undefined';
let measureCtx = null;
const cache = new Map();

export async function loadFonts(base = 'assets/fonts/galmuri') {
  if (!hasDom) return;
  await Promise.all(Object.values(FONTS).map(async (f) => {
    const face = new FontFace(f.family, `url(${base}/${f.file}.woff2)`);
    await face.load();
    document.fonts.add(face);
  }));
  cache.clear();
}

// DOM 이 없을 때(테스트)의 근사 폭
function estimate(text, f) {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x1100 ? f.size : Math.round(f.size * 0.6);
  return w;
}

export function textWidth(text, style = 'main') {
  const f = FONTS[style];
  if (!hasDom) return estimate(text, f);
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${f.size}px ${f.family}`;
  return Math.ceil(measureCtx.measureText(text).width);
}

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

function render(text, style, color, shadow) {
  const key = `${style}|${color}|${shadow}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const f = FONTS[style];
  const w = Math.max(1, textWidth(text, style)) + 2, h = f.height + 1;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const g = src.getContext('2d');
  g.font = `${f.size}px ${f.family}`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  g.fillText(text, 0, f.ascent);
  const mask = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[(y * w + x) * 4 + 3] >= 128;
  const [cr, cg, cb] = rgb(color);
  const [sr, sg, sb] = shadow ? rgb(shadow) : [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (on(x, y)) { out.data.set([cr, cg, cb, 255], i); continue; }
      if (shadow && (on(x - 1, y) || on(x, y - 1) || on(x - 1, y - 1))) out.data.set([sr, sg, sb, 255], i);
    }
  }
  g.clearRect(0, 0, w, h);
  g.putImageData(out, 0, 0);
  if (cache.size > 600) cache.clear();
  cache.set(key, src);
  return src;
}

// 디버그: 켜면 그린 글자 칸을 모은다 (글자 넘침 점검용, __app.textProbe)
export const textProbe = { on: false, texts: [], boxes: [] };
export function drawText(ctx, text, x, y, color = '#383838', shadow = '#d8d8d0', style = 'main') {
  if (!text) return;
  if (textProbe.on) textProbe.texts.push({ text: String(text), x: Math.round(x), y: Math.round(y), w: textWidth(String(text), style), h: FONTS[style].height });
  ctx.drawImage(render(String(text), style, color, shadow), Math.round(x), Math.round(y));
}

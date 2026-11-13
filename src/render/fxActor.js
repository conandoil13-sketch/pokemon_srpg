// pixelfx 의 actor(몸 모양) 를 우리 유닛 스프라이트로 만든다. 발밑 원점, 종족별 캐시.
// src: { img, sx, sy, w, h } (Idle 첫 프레임 정면) 또는 null(아직 로드 전 → 타원)
const cache = new Map();

function fromMask(w, h, data, pixels) {
  // 불투명 영역으로 잘라 발밑 원점에 맞춘다
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return ellipse();
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const md = new Uint8Array(cw * ch), px = new Uint32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { md[y * cw + x] = data[(y + y0) * w + x + x0]; px[y * cw + x] = pixels[(y + y0) * w + x + x0]; }
  return actorOf(cw, ch, md, px);
}

function actorOf(w, h, data, pixels) {
  const x = -Math.floor(w / 2), y = -h;
  return { mask: { w, h, data }, pixels, x, y, w, h, k: 2, head: [0, y], chest: [0, y + Math.floor(h * 0.4)] };
}

function ellipse(w = 16, h = 20) {
  const data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2);
    if (dx * dx + dy * dy <= 1) { data[y * w + x] = 1; pixels[y * w + x] = 0xff8a8a8a; }
  }
  return actorOf(w, h, data, pixels);
}

export function actorFor(species, src) {
  const key = `${species}:${src ? 'img' : 'none'}`;
  if (cache.has(key)) return cache.get(key);
  let actor = ellipse();
  if (src && typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas'); c.width = src.w; c.height = src.h;
      const g = c.getContext('2d');
      g.drawImage(src.img, src.sx, src.sy, src.w, src.h, 0, 0, src.w, src.h);
      const rgba = g.getImageData(0, 0, src.w, src.h).data;
      const pixels = new Uint32Array(rgba.buffer.slice(0)); // RGBA 바이트 = pixelfx 의 ABGR 정수 (리틀 엔디언)
      const data = new Uint8Array(src.w * src.h);
      for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3] > 0 ? 1 : 0;
      actor = fromMask(src.w, src.h, data, pixels);
    } catch { /* 그대로 타원 */ }
  }
  cache.set(key, actor);
  return actor;
}

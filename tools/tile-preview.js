// 브라우저 없이 tiles.js 를 그려 PNG 로 저장 (타일 그림 확인용).
// 사용: node tools/tile-preview.js <out.png> [field|cave] [map|town|test]
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const parse = (s) => {
  if (s.startsWith('#')) { const n = parseInt(s.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255, 255]; }
  const m = s.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], Math.round((p[3] ?? 1) * 255)];
};
function makeCanvas() {
  const c = { width: 0, height: 0, data: null };
  const ensure = () => { if (!c.data || c.data.length !== c.width * c.height * 4) c.data = new Uint8ClampedArray(c.width * c.height * 4); };
  const blend = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
    const i = (y * c.width + x) * 4, k = a / 255, d = c.data;
    d[i] = r * k + d[i] * (1 - k); d[i + 1] = g * k + d[i + 1] * (1 - k); d[i + 2] = b * k + d[i + 2] * (1 - k); d[i + 3] = Math.min(255, a + d[i + 3] * (1 - k));
  };
  let tx = 0, ty = 0, fill = [0, 0, 0, 255];
  const ctx = {
    set fillStyle(v) { fill = parse(v); }, get fillStyle() { return ''; },
    translate(x, y) { tx += x; ty += y; },
    fillRect(x, y, w, h) { ensure(); for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) blend(Math.round(x + tx) + xx, Math.round(y + ty) + yy, fill); },
    drawImage(src, ...a) {
      ensure();
      let [sx, sy, sw, sh, dx, dy] = a.length === 2 ? [0, 0, src.width, src.height, a[0], a[1]] : a;
      for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) {
        const si = ((sy + yy) * src.width + sx + xx) * 4, s = src.data;
        if (!s || !s[si + 3]) continue;
        blend(Math.round(dx + tx) + xx, Math.round(dy + ty) + yy, [s[si], s[si + 1], s[si + 2], s[si + 3]]);
      }
    },
  };
  c.getContext = () => { ensure(); return ctx; };
  return c;
}
globalThis.document = { createElement: () => makeCanvas() };
function png(c, scale, file) {
  const W = c.width * scale, H = c.height * scale, raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; for (let x = 0; x < W; x++) { const si = (Math.floor(y / scale) * c.width + Math.floor(x / scale)) * 4; raw.set(c.data.subarray(si, si + 4), y * (W * 4 + 1) + 1 + x * 4); } }
  const crcT = Array.from({ length: 256 }, (_, n) => { let k = n; for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1; return k >>> 0; });
  const crc = (b) => { let r = 0xffffffff; for (const x of b) r = crcT[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const [, , out, theme = 'field', which = 'map'] = process.argv;
const root = new URL('../src/', import.meta.url).href;
const { drawMap } = await import(root + 'render/tiles.js');
const grid = which === 'town' ? (await import(root + 'data/town.js')).TOWN.tiles : which === 'test'
  ? ['..........', '.~~~..##..', '.~~~..###.', '.~....##..', '...""".^..', '..""""..^.', '.......>..', '.##...~...']
  : (await import(root + 'data/map.js')).MAP.tiles;
const c = makeCanvas(); c.width = Math.min(256, grid[0].length * 24); c.height = Math.min(192, grid.length * 24);
drawMap(c.getContext('2d'), grid, 0.2, 0, 0, c.width, c.height, theme);
png(c, 3, out);
console.log('wrote', out, c.width, c.height);

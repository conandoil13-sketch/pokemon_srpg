// 기술 연출을 게임과 같은 순서로 오프라인 렌더해 컨택트 시트 PNG 로 (브라우저 없이 눈으로 확인)
// 사용: node tools/move-fx-sheet.js <out.png> <기술id[:거리]> ...
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createFxManager } from '../src/render/fx.js';
import { fxForMove } from '../src/data/moveFx.js';
import { MOVES } from '../src/data/moves.js';
import { actorFor } from '../src/render/fxActor.js';

const W = 112, H = 64, FRAMES = [0.1, 0.2, 0.3, 0.38, 0.45, 0.55, 0.65, 0.8], S = 3;
const [out, ...ids] = process.argv.slice(2);
const rows = ids.map((arg) => {
  const [id, d = '1'] = arg.split(':'), dist = Number(d), mv = MOVES[id];
  if (!mv) { console.error(`없는 기술: ${id}`); process.exit(1); }
  const A = { x: 24, y: 48 }, T = { x: 24 + 16 * dist, y: 48 };
  const spec = fxForMove(mv, { distance: dist });
  const m = createFxManager({ w: W, h: H }), actor = actorFor('pikachu', null);
  const events = [];
  if (spec.cast) events.push([0, () => m.spawn(spec.cast, A, { dir: 'right' })]);
  let shot = null;
  if (spec.travel) events.push([0.18, () => { shot = m.spawn(spec.travel, { x: A.x, y: A.y - 6 }, { dir: 'right', ...(spec.travel.clip ? { clipTo: T.x - A.x } : {}) }); }]);
  const hitAt = spec.travel ? 0.43 : 0.18;
  if (spec.hit) events.push([hitAt, () => m.spawn(spec.hit, T, { dir: 'right', actor })]);
  if (spec.hit2) events.push([hitAt + 0.08, () => m.spawn(spec.hit2, T, { dir: 'right', actor })]);
  if (spec.burst) events.push([hitAt, () => m.spawn(spec.burst, T, { dir: 'right' })]);
  const frames = [];
  let t = 0;
  for (const ft of FRAMES) {
    while (t < ft) {
      for (const e of events) if (!e.done && t >= e[0]) { e[1](); e.done = true; }
      if (shot && !spec.travel.clip && t >= 0.18 && t <= 0.43) { const k = (t - 0.18) / 0.25; shot.fx.options.x = A.x + (T.x - A.x) * k; shot.fx.options.y = A.y - 6; }
      m.update(1 / 60); t += 1 / 60;
    }
    const back = m.draw(null, 'back', { x: 0, y: 0 }), front = m.draw(null, 'front', { x: 0, y: 0 });
    const px = new Uint8Array(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      let r = 58, g = 90, b = 58; // 풀밭 바탕
      if (Math.abs((i % W) - A.x) <= 5 && Math.abs(Math.floor(i / W) - (A.y - 6)) <= 5) [r, g, b] = [232, 208, 112]; // 사용자
      if (Math.abs((i % W) - T.x) <= 5 && Math.abs(Math.floor(i / W) - (T.y - 6)) <= 5) [r, g, b] = [224, 224, 240]; // 대상
      for (const f of [back, front]) {
        const c = f.color[i];
        if (c) { const a = ((c >>> 24) & 255) / 255; r = r * (1 - a) + (c & 255) * a; g = g * (1 - a) + ((c >>> 8) & 255) * a; b = b * (1 - a) + ((c >>> 16) & 255) * a; }
        const l = f.light?.[i];
        if (l) { r = Math.min(255, r + (l & 255) * 0.6); g = Math.min(255, g + ((l >>> 8) & 255) * 0.6); b = Math.min(255, b + ((l >>> 16) & 255) * 0.6); }
      }
      px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b;
    }
    frames.push(px);
  }
  return frames;
});
// 시트: 행 = 기술, 열 = 시간, 1px 간격, S 배 확대
const SW = (W + 1) * FRAMES.length * S, SH = (H + 1) * rows.length * S;
const raw = Buffer.alloc((SW * 3 + 1) * SH);
for (let y = 0; y < SH; y++) {
  raw[y * (SW * 3 + 1)] = 0;
  for (let x = 0; x < SW; x++) {
    const r = Math.floor(y / S / (H + 1)), fy = Math.floor(y / S) % (H + 1), c = Math.floor(x / S / (W + 1)), fx = Math.floor(x / S) % (W + 1);
    const o = y * (SW * 3 + 1) + 1 + x * 3;
    if (fy === H || fx === W) { raw[o] = raw[o + 1] = raw[o + 2] = 20; continue; }
    const p = rows[r][c], i = (fy * W + fx) * 3;
    raw[o] = p[i]; raw[o + 1] = p[i + 1]; raw[o + 2] = p[i + 2];
  }
}
const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${ids.length} moves × ${FRAMES.length} frames → ${out}`);

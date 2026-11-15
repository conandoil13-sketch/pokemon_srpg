// OHKO Sheer Cold: the air goes still, ice crystals shoot up and seal the body in a block of ice, a white flash, then it shatters into shards. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU } from "../../vendor/pixelfx/core/index.js";
export const meta = {
  name: "OHKO Freeze", desc: "Frost rings close in, jagged ice spikes erupt and lock the body inside a glittering block, a blinding flash, then the block bursts into spinning shards.",
  tags: ["ice", "ohko", "finisher", "one-shot"], size: [128, 128], origin: [64, 100], duration: 1.6, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { palette: ["#0a1a3a", "#1a4a8a", "#3a86d0", "#7ac4f4", "#c4ecff", "#ffffff"], seed: 3 },
};
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
const RING = 0.35, LOCK = 0.75, FLASH = 0.95, SHATTER = 1.0;
export function draw(p, t, o) {
  const C = fit(o.palette, 6), R = new Rng(o.seed), b = body(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  // 1) 냉기 고리가 바깥에서 조여 옴
  if (t < LOCK) { const k = ease.inQuad(clamp(t / RING, 0, 1)); const r = 50 - 34 * k;
    for (let s = 0; s < 72; s++) { const a = (s / 72) * TAU + t * 3; if (s % 3 === 0) continue; p.dot(cx + Math.cos(a) * r, b.y + b.h - 2 + Math.sin(a) * r * 0.35, s % 2 ? C[4] : C[3], 0.9); } }
  // 2) 얼음 가시 솟음 → 얼음 덩어리
  const g = ease.outBack(clamp((t - RING) / (LOCK - RING), 0, 1)), shatter = t >= SHATTER;
  if (g > 0 && !shatter) {
    const w = b.w / 2 + 6, top = b.y - 8;
    p.poly([[cx - w, b.y + b.h], [cx - w - 3, cy], [cx - w + 4, top + 6], [cx, top - 6 * g], [cx + w - 3, top + 4], [cx + w + 3, cy + 2], [cx + w, b.y + b.h]].map(([x, y]) => [cx + (x - cx) * g, b.y + b.h + (y - b.y - b.h) * g]), C[3], 0.55);
    p.line(cx - w * g + 3, b.y + b.h - 4, cx - 2, top + 4, C[5], 0.8); p.line(cx + 4, top, cx + w * g - 4, cy, C[4], 0.7);
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + R.range(-1.2, 1.2), L = R.range(10, 22) * g; const sx = cx + R.range(-w, w) * 0.8, sy = b.y + b.h;
      p.line(sx, sy, sx + Math.cos(a) * L * 0.5, sy + Math.sin(a) * L, C[4]); p.dot(sx + Math.cos(a) * L * 0.5, sy + Math.sin(a) * L, WHITE); }
    p.glow(cx, cy, b.w, C[3], 0.25 * g);
  }
  // 3) 번쩍
  if (t >= FLASH - 0.05 && t < SHATTER + 0.1) { const k = 1 - Math.abs(t - FLASH) / 0.1; p.glow(cx, cy, 56, WHITE, 0.9 * clamp(k, 0, 1)); p.disc(cx, cy, 30 * clamp(k, 0, 1), WHITE, 0.5 * clamp(k, 0, 1)); }
  // 4) 산산조각
  if (shatter) { const u = (t - SHATTER) / (meta.duration - SHATTER);
    for (let i = 0; i < 26; i++) { const a = R.range(0, TAU), sp = R.range(30, 70), x = cx + Math.cos(a) * sp * u, y = cy + Math.sin(a) * sp * u * 0.8 + 18 * u * u, sz = R.next() > 0.6 ? 2 : 1;
      const c = i % 3 === 0 ? WHITE : i % 3 === 1 ? C[4] : C[3]; p.rect(x, y, sz + 1, sz, c, 1 - u); }
    if (u < 0.5) p.glow(cx, cy, 30, C[4], 0.4 * (1 - u * 2)); }
}

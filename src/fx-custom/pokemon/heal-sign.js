// Heal sign: a short signature motif for each healing move (egg, milk, feathers, sun, moon, star, bees, bell...) that plays before the common heal glow. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU, hex } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Heal Sign", desc: "A short signature motif per healing move — cracking egg, tipping milk, falling feathers, rising sun, crescent moon, falling star, bees, a ringing bell.",
  tags: ["heal", "signature", "status", "one-shot"], size: [96, 128], origin: [48, 112], duration: 0.9, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { motif: "star", seed: 3 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
const H = (a) => a.map(hex);
const SPR = (p, rows, pal, x, y, a = 1) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.' && pal[ch] !== undefined) p.dot(x + i, y + j, pal[ch], a); }));
const MOTIF = {
  cross(p, t, b, R) { const C = H(['#1e8a34', '#3ec85a', '#b0ffb0']), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let k = 0; k < 2; k++) { const u = clamp((t - k * 0.25) / 0.5, 0, 1); if (u <= 0 || u >= 1) continue; const r = 6 + u * 14;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = r - 3; i < r; i++) p.dot(cx + dx * i, cy + dy * i, C[1], 1 - u); } p.glow(cx, cy, 14, C[1], 0.3); },
  egg(p, t, b) { const C = H(['#c8b890', '#fff6e0', '#ffd860']), cx = b.x + b.w / 2, y = b.y - 14, c = clamp((t - 0.35) / 0.3, 0, 1);
    if (c < 1) { p.ellipse(cx - c * 3, y, 5, 6, C[1]); p.ellipse(cx + c * 3, y, 5, 6, C[1]); p.dot(cx - 2, y - 3, WHITE); if (c > 0) p.line(cx - 4, y, cx + 4, y - 1, C[0]); }
    if (c > 0) { p.circle(cx, y + 1, 2.5, C[2]); p.glow(cx, y, 14 * c, C[2], 0.5 * (1 - c)); } },
  milk(p, t, b) { const C = H(['#8aa0b0', '#ffffff', '#4a90d8']), cx = b.x + b.w / 2 + 8, y = b.y - 16, tilt = clamp(t / 0.3, 0, 1);
    for (let j = 0; j < 9; j++) for (let i = 0; i < 5; i++) { const xx = i - 2, yy = j - 4, a = tilt * 0.9; p.dot(cx + xx * Math.cos(a) - yy * Math.sin(a), y + xx * Math.sin(a) + yy * Math.cos(a), j < 2 ? C[2] : i === 0 ? C[0] : C[1]); }
    for (let k = 0; k < 4; k++) { const u = (t - 0.3 - k * 0.08) / 0.3; if (u > 0 && u < 1) p.dot(cx - 6 - u * 4, y + u * 14, WHITE); } },
  feather(p, t, b, R) { const C = H(['#8a7a6a', '#e8e0d0', '#ffffff']);
    for (let i = 0; i < 4; i++) { const u = clamp((t - i * 0.08) / 0.8, 0, 1); if (u >= 1) continue; const x = b.x + R.range(0, b.w) + Math.sin(u * 9 + i) * 5, y = b.y - 20 + u * (b.h + 10);
      p.line(x - 3, y + 1, x + 3, y - 1, C[1]); p.dot(x - 3, y + 1, C[0]); p.dot(x + 2, y - 1, C[2]); } },
  leaf(p, t, b, R) { const C = H(['#1e6a1e', '#5ac84a', '#fff4a0']), cx = b.x + b.w / 2;
    for (let i = 0; i < 5; i++) p.line(cx - 10 + i * 5, b.y - 34, cx - 6 + i * 3, b.y - 8, C[2], 0.35 * (1 - t));
    for (let i = 0; i < 10; i++) { const a = R.range(0, TAU), r = 26 * (1 - clamp(t / 0.8, 0, 1)), u = t; p.dot(cx + Math.cos(a + u * 3) * r, b.y + b.h / 2 + Math.sin(a + u * 3) * r * 0.6, i % 2 ? C[1] : C[0]); } },
  sun(p, t, b) { const C = H(['#e08010', '#ffc030', '#fff4b0']), cx = b.x + b.w / 2, y = b.y - 10 - ease.outCubic(clamp(t / 0.5, 0, 1)) * 14;
    p.circle(cx, y, 6, C[1]); p.circle(cx, y, 4, C[2]); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 2; p.line(cx + Math.cos(a) * 8, y + Math.sin(a) * 8, cx + Math.cos(a) * 12, y + Math.sin(a) * 12, C[1]); } p.glow(cx, y, 20, C[1], 0.5); },
  moon(p, t, b) { const C = H(['#8a90c0', '#d8dcff', '#ffffff']), cx = b.x + b.w / 2, y = b.y - 18;
    p.arc(cx, y, 9, 4, Math.PI * 0.55, Math.PI * 1.95, C[1]); p.arc(cx, y, 9, 1, Math.PI * 0.6, Math.PI * 1.2, C[2]); p.glow(cx, y, 18, C[1], 0.45); // 초승달
    for (let i = 0; i < 3; i++) { const x = cx - 6 + i * 6; p.line(x, y + 8, x, b.y + b.h, C[1], 0.3 * (1 - t)); } },
  zzz(p, t, b) { const C = H(['#8aa0c8', '#e0e8ff']), x0 = b.x + b.w / 2 + 6, y0 = b.y - 4;
    for (let k = 0; k < 3; k++) { const u = clamp((t - k * 0.2) / 0.6, 0, 1); if (u <= 0 || u >= 1) continue; const s = 2 + k, x = x0 + k * 5 + u * 4, y = y0 - k * 7 - u * 6;
      p.line(x, y, x + s, y, C[1], 1 - u); p.line(x + s, y, x, y + s, C[1], 1 - u); p.line(x, y + s, x + s, y + s, C[1], 1 - u); }
    p.disc(b.x + b.w / 2 - 6, b.y + 6, 4 * clamp(t / 0.4, 0, 1), C[1], 0.5 * (1 - t)); },
  bees(p, t, b, R) { const C = H(['#3a2a04', '#ffd030', '#ffffff']), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + t * 8, r = 26 * (1 - ease.inQuad(clamp(t / 0.85, 0, 1))) + 3; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6;
      p.dot(x, y, C[1]); p.dot(x + 1, y, C[0]); p.dot(x, y - 1, C[2]); } },
  drops(p, t, b, R) { const C = H(['#2a86e0', '#a8e2ff']); for (let i = 0; i < 10; i++) { const u = clamp((t - i * 0.05) / 0.5, 0, 1); if (u <= 0 || u >= 1) continue; const x = b.x + R.range(0, b.w), y = b.y - 10 + u * (b.h + 10); p.dot(x, y, C[1]); p.dot(x, y + 1, C[0]); } },
  petals(p, t, b, R) { const C = H(['#e05a9a', '#ffb0d8', '#ffffff']), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + t * 5, r = 10 + 16 * (1 - t) + Math.sin(i) * 3; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6 - t * 6; p.dot(x, y, i % 3 ? C[1] : C[0]); p.dot(x + 1, y, C[1]); } },
  bell(p, t, b) { const C = H(['#8a6010', '#ffd040', '#fff4b0']), cx = b.x + b.w / 2, y = b.y - 16, sw = Math.sin(t * 20) * 2;
    SPR(p, ['..yy..', '.yhyy.', '.yyyy.', 'yyyyyy', 'dddddd', '..dd..'], { y: C[1], h: C[2], d: C[0] }, cx - 3 + sw, y - 3);
    for (let k = 0; k < 3; k++) { const u = clamp((t - k * 0.2) / 0.5, 0, 1); if (u <= 0 || u >= 1) continue; const r = 6 + u * 18; for (let s = 0; s < 20; s++) { const a = (s / 20) * Math.PI; p.dot(cx + Math.cos(a) * r, y + 4 + Math.sin(a) * r * 0.5, C[1], 1 - u); } } },
  star(p, t, b) { const C = H(['#a08020', '#ffe060', '#ffffff']), cx = b.x + b.w / 2, f = ease.inQuad(clamp(t / 0.55, 0, 1)), y = b.y - 60 + f * 50;
    if (t < 0.6) { SPR(p, ['...w...', '...y...', '..yyy..', 'ywwwwwy', '.yywyy.', '.yy.yy.', 'y.....y'], { w: C[2], y: C[1] }, cx - 3, y - 3); p.glow(cx, y, 12, C[1], 0.6);
      for (let k = 1; k < 12; k++) { p.dot(cx, y - 3 - k * 3, C[1], 1 - k / 12); if (k % 3 === 0) p.dot(cx + (k % 2 ? 2 : -2), y - 3 - k * 3, WHITE, 1 - k / 12); } }
    const u = clamp((t - 0.55) / 0.35, 0, 1); if (u > 0 && u < 1) { p.glow(cx, b.y, 22, C[1], 0.7 * (1 - u)); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p.dot(cx + Math.cos(a) * u * 16, b.y + Math.sin(a) * u * 10, i % 2 ? WHITE : C[1], 1 - u); } } },
  crescent(p, t, b, R) { const C = H(['#6a5ab8', '#c8c0ff', '#ffffff']), cx = b.x + b.w / 2, f = ease.outCubic(clamp(t / 0.5, 0, 1)), y = b.y - 40 + f * 26, rot = t * 6;
    for (let s = 0; s < 40; s++) { const a = (s / 40) * Math.PI * 1.3 + rot; p.dot(cx + Math.cos(a) * 7, y + Math.sin(a) * 7, s % 4 ? C[1] : C[2]); }
    p.glow(cx, y, 16, C[1], 0.5); for (let i = 0; i < 10; i++) { const u = clamp((t - 0.3 - i * 0.03) / 0.5, 0, 1); if (u <= 0 || u >= 1) continue; p.dot(cx + R.range(-12, 12), y + u * 24, i % 2 ? WHITE : C[1], 1 - u); } },
};
export function draw(p, t, o) { const f = MOTIF[o.motif] ?? MOTIF.star; f(p, t, body(o), new Rng(o.seed)); }

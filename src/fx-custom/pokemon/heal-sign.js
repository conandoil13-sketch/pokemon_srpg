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
  leaf(p, t, b, R) { // 광합성: 해에서 빛기둥이 비스듬히 쏟아지고 잎사귀가 빙글 돌며 빨려 듦, 몸에 초록 맥동
    const G = H(['#0e4a1e', '#2a8a2a', '#5ac84a', '#a8f070']), Y = H(['#c08010', '#ffc030', '#fff4b0']), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const sx = cx - 22, sy = b.y - 38, sun = ease.outCubic(clamp(t / 0.25, 0, 1)), fade = 1 - clamp((t - 0.7) / 0.2, 0, 1);
    p.circle(sx, sy, 5 * sun, Y[1], fade); p.circle(sx, sy, 3 * sun, Y[2], fade); p.glow(sx, sy, 14, Y[1], 0.5 * sun * fade);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + t * 2; p.line(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7, sx + Math.cos(a) * 10, sy + Math.sin(a) * 10, Y[1], sun * fade); }
    const beam = clamp((t - 0.1) / 0.25, 0, 1) * fade; // 해 → 몸으로 쏟아지는 빛기둥 (반투명 띠 여러 줄)
    for (let k = -3; k <= 3; k++) { const ex = cx + k * 3, ey = b.y + b.h; p.line(sx + k, sy + 4, sx + (ex - sx) * beam, sy + 4 + (ey - sy - 4) * beam, k % 2 ? Y[1] : Y[2], 0.35 * beam); }
    for (let i = 0; i < 7; i++) { const a0 = (i / 7) * TAU, u = clamp((t - 0.15 - i * 0.04) / 0.55, 0, 1); if (u <= 0 || u >= 1) continue; // 잎사귀 나선
      const r = 28 * (1 - ease.inQuad(u)), a = a0 + u * 5, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.55, fl = Math.sin(u * 20 + i) > 0;
      p.dot(x, y, G[2]); p.dot(x + 1, y, fl ? G[3] : G[1]); p.dot(x - 1, y + 1, G[1]); p.dot(x + 1, y - 1, G[3]); p.dot(x, y + 1, G[0]); }
    const pul = clamp((t - 0.55) / 0.35, 0, 1); if (pul > 0 && pul < 1) { const r = 4 + pul * 14; for (let s2 = 0; s2 < 40; s2++) { const a = (s2 / 40) * TAU; p.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, s2 % 2 ? G[3] : G[2], 1 - pul); } p.glow(cx, cy, 16, G[2], 0.5 * (1 - pul)); }
    for (let i = 0; i < 6; i++) { const u = clamp((t - 0.5 - i * 0.04) / 0.4, 0, 1); if (u <= 0 || u >= 1) continue; p.dot(b.x + R.range(0, b.w), b.y + b.h - u * b.h * 1.2, i % 2 ? WHITE : G[3], 1 - u); } },
  sun(p, t, b) { const C = H(['#e08010', '#ffc030', '#fff4b0']), cx = b.x + b.w / 2, y = b.y - 10 - ease.outCubic(clamp(t / 0.5, 0, 1)) * 14;
    p.circle(cx, y, 6, C[1]); p.circle(cx, y, 4, C[2]); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 2; p.line(cx + Math.cos(a) * 8, y + Math.sin(a) * 8, cx + Math.cos(a) * 12, y + Math.sin(a) * 12, C[1]); } p.glow(cx, y, 20, C[1], 0.5); },
  moon(p, t, b, R) { // 달의불빛: 후광 두른 초승달이 떠오르고 은빛 달빛 기둥이 내려옴, 별 반짝 · 은빛 가루
    const M = H(['#3a3a6a', '#7a80c0', '#c8ccff', '#eef0ff']), cx = b.x + b.w / 2, rise = ease.outCubic(clamp(t / 0.35, 0, 1)), fade = 1 - clamp((t - 0.72) / 0.18, 0, 1);
    const my = b.y - 26 - rise * 8;
    p.glow(cx, my, 22, M[2], 0.45 * rise * fade); for (let s2 = 0; s2 < 36; s2++) { const a = (s2 / 36) * TAU; if (s2 % 3) continue; p.dot(cx + Math.cos(a) * 13, my + Math.sin(a) * 13, M[1], 0.6 * rise * fade); } // 후광 고리
    p.arc(cx, my, 9, 4, Math.PI * 0.55, Math.PI * 1.95, M[2], rise * fade); p.arc(cx, my, 9, 1.5, Math.PI * 0.6, Math.PI * 1.3, M[3], rise * fade); p.dot(cx - 7, my - 2, WHITE, fade);
    const beam = clamp((t - 0.2) / 0.3, 0, 1) * fade; // 달빛 기둥 (아래로 넓어지는 반투명)
    if (beam > 0) p.each(cx - 16, my + 8, cx + 16, b.y + b.h, (x, y, sx, sy) => { const f = (y - my - 8) / (b.y + b.h - my - 8); if (f > beam) return; const w = 5 + f * 11; if (Math.abs(x - cx) > w) return;
      p.blendPx(sx, sy, Math.abs(x - cx) < w * 0.4 ? M[3] : M[2], (0.28 - f * 0.12) * fade); });
    for (let i = 0; i < 5; i++) { const x = cx + R.range(-24, 24), y = my + R.range(-10, 16), tw = Math.floor(t * 10 + i * 3) % 4 === 0; if (t < 0.15 + i * 0.05) continue; // 별 반짝
      p.dot(x, y, tw ? WHITE : M[2], fade); if (tw) { p.dot(x - 1, y, M[2], fade); p.dot(x + 1, y, M[2], fade); p.dot(x, y - 1, M[2], fade); p.dot(x, y + 1, M[2], fade); } }
    for (let i = 0; i < 12; i++) { const u = clamp((t - 0.3 - i * 0.03) / 0.5, 0, 1); if (u <= 0 || u >= 1) continue; p.dot(cx + R.range(-8, 8) + Math.sin(u * 6 + i) * 2, my + 10 + u * (b.y + b.h - my - 10), i % 3 ? M[3] : WHITE, 1 - u); } },
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

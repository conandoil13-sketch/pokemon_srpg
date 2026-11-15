// Heal sign: a short signature motif for each healing move (egg, milk, feathers, sun, moon, star, bees, bell...) that plays before the common heal glow. Original design for 포켓몬 택틱스 (MIT, same as pixelfx).
import { Rng, fit, WHITE, ease, clamp, TAU, hex } from "../../vendor/pixelfx/core/index.js";
export const meta = { name: "Heal Sign", desc: "A short signature motif per healing move — cracking egg, tipping milk, falling feathers, rising sun, crescent moon, falling star, bees, a ringing bell.",
  tags: ["heal", "signature", "status", "one-shot"], size: [96, 128], origin: [48, 112], duration: 0.9, loop: false, fps: 30, bg: "ground", actor: 2,
  options: { motif: "star", seed: 3 } };
const body = (o) => (o.actor ? { x: o.actor.x, y: o.actor.y, w: o.actor.w, h: o.actor.h } : { x: -12, y: -38, w: 24, h: 38 });
const H = (a) => a.map(hex);
const SPR = (p, rows, pal, x, y, a = 1) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.' && pal[ch] !== undefined) p.dot(x + i, y + j, pal[ch], a); }));
// 속이 찬 초승달: 원 A 안 · 원 B(오른쪽 위로 비킨) 밖. 바깥 가장자리 밝게, 안쪽은 은은하게 (반투명)
function crescentFill(p, cx, cy, r, tilt, M, a) {
  const ox = Math.cos(tilt) * r * 0.55, oy = Math.sin(tilt) * r * 0.55;
  p.each(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y, sx, sy) => {
    const dx = x - cx, dy = y - cy, da = Math.hypot(dx, dy), db = Math.hypot(dx - ox, dy - oy);
    if (da > r || db < r * 0.92) return;
    const edge = r - da, inner = db - r * 0.92;
    const c = edge < 1.2 ? M[3] : inner < 1.2 ? M[1] : M[2];
    p.blendPx(sx, sy, c, a * (edge < 1.2 ? 0.95 : 0.75));
  });
}
const MOTIF = {
  cross(p, t, b, R) { const C = H(['#1e8a34', '#3ec85a', '#b0ffb0']), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let k = 0; k < 2; k++) { const u = clamp((t - k * 0.25) / 0.5, 0, 1); if (u <= 0 || u >= 1) continue; const r = 6 + u * 14;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = r - 3; i < r; i++) p.dot(cx + dx * i, cy + dy * i, C[1], 1 - u); } p.glow(cx, cy, 14, C[1], 0.3); },
  egg(p, t, b) { const C = H(['#c8b890', '#fff6e0', '#ffd860']), cx = b.x + b.w / 2, y = b.y - 14, c = clamp((t - 0.35) / 0.3, 0, 1);
    if (c < 1) { p.ellipse(cx - c * 3, y, 5, 6, C[1]); p.ellipse(cx + c * 3, y, 5, 6, C[1]); p.dot(cx - 2, y - 3, WHITE); if (c > 0) p.line(cx - 4, y, cx + 4, y - 1, C[0]); }
    if (c > 0) { p.circle(cx, y + 1, 2.5, C[2]); p.glow(cx, y, 14 * c, C[2], 0.5 * (1 - c)); } },
  milk(p, t, b) { // 우유마시기: 유리 우유병이 입가로 기울어 꿀꺽꿀꺽 — 우유가 줄어들며 하얀 김(만족) 한 번
    const C = H(['#4a5868', '#9ab0c4', '#dce8f2', '#ffffff', '#3a7ad0', '#e0503a']), cx = b.x + b.w / 2 + 12, my = b.y - 2;
    const tip = ease.outCubic(clamp(t / 0.25, 0, 1)), fade = 1 - clamp((t - 0.72) / 0.18, 0, 1), level = 1 - clamp((t - 0.25) / 0.45, 0, 1) * 0.8;
    const ang = -tip * 0.75; // 입 쪽으로 기울임
    const BOT = ['.cc.', '.cc.', 'gwwg', 'gwwg', 'gwwg', 'gLLg', 'gLLg', 'gwwg', 'gwwg', '.gg.']; // c 뚜껑 · g 유리 · w 우유 · L 상표
    // 화면 픽셀마다 거꾸로 돌려서 병 그림을 읽는다 (돌려도 빈 픽셀이 생기지 않게)
    const ca = Math.cos(ang), sa = Math.sin(ang);
    p.each(cx - 14, my - 14, cx + 14, my + 14, (x, y, sx, sy) => {
      const dx = x - cx, dy = y - my, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca; // 병 기준 좌표 (2배 크기)
      const q = Math.floor(lx / 2 + 2), j = Math.floor(ly / 2 + 5);
      const ch = BOT[j]?.[q]; if (!ch || ch === '.') return;
      const milkHere = ch === 'w' && (j - 2) / 7 > 1 - level;
      const col = ch === 'c' ? C[4] : ch === 'L' ? C[5] : ch === 'w' ? (milkHere ? C[3] : C[1]) : q === 0 ? C[2] : C[0];
      p.put(sx, sy, col, fade);
    });
    for (const [hx, hy] of [[-3, -4], [-3, -2], [-3, 0]]) p.dot(cx + hx * Math.cos(ang) - hy * Math.sin(ang), my + hx * Math.sin(ang) + hy * Math.cos(ang), C[3], 0.85 * fade); // 유리 반짝
    const gulp = Math.floor((t - 0.3) / 0.12); if (t > 0.3 && t < 0.7 && gulp % 2 === 0) { p.blend(b.x + b.w / 2 + 3, my + 4, C[3], 0.7); p.blend(b.x + b.w / 2 + 4, my + 4, C[3], 0.5); } // 꿀꺽
    const sat = clamp((t - 0.62) / 0.28, 0, 1); if (sat > 0 && sat < 1) for (let k = 0; k < 3; k++) { p.disc(b.x + b.w / 2 - 4 + k * 3, b.y - 4 - sat * 10 - k, 2 + sat * 2, C[3], 0.5 * (1 - sat)); p.glow(b.x + b.w / 2, b.y - 6 - sat * 10, 6, C[3], 0.2 * (1 - sat)); } }, // 하아~ 김
  feather(p, t, b, R) { const C = H(['#8a7a6a', '#e8e0d0', '#ffffff']);
    for (let i = 0; i < 4; i++) { const u = clamp((t - i * 0.08) / 0.8, 0, 1); if (u >= 1) continue; const x = b.x + R.range(0, b.w) + Math.sin(u * 9 + i) * 5, y = b.y - 20 + u * (b.h + 10);
      p.line(x - 3, y + 1, x + 3, y - 1, C[1]); p.dot(x - 3, y + 1, C[0]); p.dot(x + 2, y - 1, C[2]); } },
  leaf(p, t, b, R) { // 광합성: 은은하게 — 반투명 해와 햇살 줄기, 잎맥 있는 잎사귀가 천천히 감돌며 스며들고 엽록 빛이 맥동
    const G = H(['#0a3a14', '#1e6a24', '#3ea83a', '#7ad860', '#c8f4a0']), Y = H(['#a86a10', '#f0b030', '#ffe08a', '#fff8dc']), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const fin = clamp(t / 0.3, 0, 1), fade = 1 - clamp((t - 0.72) / 0.18, 0, 1), a = fin * fade, sx = cx - 20, sy = b.y - 34;
    p.disc(sx, sy, 12, Y[1], 0.12 * a); p.disc(sx, sy, 6, Y[2], 0.55 * a); p.disc(sx, sy, 3.5, Y[3], 0.8 * a); p.glow(sx, sy, 16, Y[1], 0.3 * a); // 해 (번짐)
    for (let k = 0; k < 4; k++) { const w = 2 + k * 2.5, al = 0.08 + (3 - k) * 0.025; // 햇살 줄기: 바깥으로 갈수록 옅게
      p.each(Math.min(sx, cx) - 18, sy, Math.max(sx, cx) + 18, b.y + b.h, (x, y, px, py) => { const f = (y - sy) / (b.y + b.h - sy), lx = sx + (cx - sx) * f, ww = w * (0.6 + f * 1.4);
        if (Math.abs(x - lx) <= ww && f > 0.08) p.blendPx(px, py, Y[2], al * a * (1 - f * 0.5)); }); }
    const LEAF = ['..gg', '.gLg', 'gLg.', 'dg..']; // 잎 (L = 잎맥)
    for (let i = 0; i < 6; i++) { const u = clamp((t - 0.1 - i * 0.05) / 0.6, 0, 1); if (u <= 0 || u >= 1) continue;
      const ang = (i / 6) * TAU + u * 3.2, r = 30 * (1 - ease.inQuad(u)) + 4, x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.55 - Math.sin(u * 9 + i) * 2;
      const al = Math.sin(Math.PI * u) * 0.9, flip = Math.sin(u * 12 + i) > 0;
      LEAF.forEach((row, j) => [...row].forEach((ch, q) => { if (ch === '.') return; const xx = flip ? x + q - 2 : x - q + 2; p.blend(xx, y + j - 2, ch === 'L' ? G[4] : ch === 'd' ? G[1] : (q + j) % 2 ? G[2] : G[3], al); })); }
    const pul = clamp((t - 0.5) / 0.4, 0, 1); if (pul > 0 && pul < 1) { const k = Math.sin(Math.PI * pul); p.glow(cx, cy, b.w * 0.8, G[3], 0.3 * k); p.disc(cx, cy, b.w * 0.45, G[3], 0.1 * k); }
    for (let i = 0; i < 10; i++) { const u = clamp((t - 0.35 - i * 0.03) / 0.45, 0, 1); if (u <= 0 || u >= 1) continue; p.blend(b.x + R.range(0, b.w), b.y + b.h - u * b.h * 1.1, i % 3 ? G[4] : Y[3], 0.7 * Math.sin(Math.PI * u)); } },
  sun(p, t, b) { const C = H(['#e08010', '#ffc030', '#fff4b0']), cx = b.x + b.w / 2, y = b.y - 10 - ease.outCubic(clamp(t / 0.5, 0, 1)) * 14;
    p.circle(cx, y, 6, C[1]); p.circle(cx, y, 4, C[2]); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 2; p.line(cx + Math.cos(a) * 8, y + Math.sin(a) * 8, cx + Math.cos(a) * 12, y + Math.sin(a) * 12, C[1]); } p.glow(cx, y, 20, C[1], 0.5); },
  moon(p, t, b, R) { // 달의불빛: 은은하게 — 꽉 찬 초승달이 천천히 떠오르고 옅은 달빛이 내려와 감쌈
    const M = H(['#2a2e5a', '#6a74b0', '#b8c0f0', '#f4f6ff']), cx = b.x + b.w / 2, k = ease.inOutCubic ? ease.inOutCubic(clamp(t / 0.45, 0, 1)) : clamp(t / 0.45, 0, 1);
    const fade = 1 - clamp((t - 0.7) / 0.2, 0, 1), a = k * fade, my = b.y - 22 - k * 6;
    p.disc(cx, my, 15, M[1], 0.12 * a); p.glow(cx, my, 20, M[2], 0.22 * a); // 옅은 달무리
    crescentFill(p, cx, my, 8, -0.7, M, a);
    const beam = clamp((t - 0.25) / 0.35, 0, 1) * fade;
    if (beam > 0) p.each(cx - 16, my + 6, cx + 16, b.y + b.h + 2, (x, y, sx, sy) => { const f = (y - my - 6) / (b.y + b.h - my - 4); if (f > beam) return; const w = 4 + f * 12, d = Math.abs(x - cx) / w; if (d > 1) return;
      p.blendPx(sx, sy, M[3], 0.13 * (1 - d * d) * (1 - f * 0.4) * fade); });
    p.glow(cx, b.y + b.h / 2, b.w * 0.7, M[2], 0.15 * beam);
    for (let i = 0; i < 4; i++) { const x = cx + R.range(-22, 22), y = my + R.range(-12, 10), tw = (Math.sin(t * 8 + i * 2) + 1) / 2; p.blend(x, y, M[3], 0.6 * tw * a); }
    for (let i = 0; i < 10; i++) { const u = clamp((t - 0.3 - i * 0.035) / 0.55, 0, 1); if (u <= 0 || u >= 1) continue; p.blend(cx + R.range(-9, 9) + Math.sin(u * 5 + i) * 2, my + 8 + u * (b.y + b.h - my - 8), M[3], 0.55 * Math.sin(Math.PI * u)); } },
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
  crescent(p, t, b, R) { // 초승달춤: 꽉 찬 초승달이 살짝 흔들리며 내려와 은빛 깃 가루를 은은하게 흩뿌림
    const M = H(['#3a2a6a', '#7a6ac0', '#c8bcff', '#f6f2ff']), cx = b.x + b.w / 2, k = clamp(t / 0.5, 0, 1), e = 1 - (1 - k) ** 3;
    const fade = 1 - clamp((t - 0.7) / 0.2, 0, 1), a = clamp(t / 0.2, 0, 1) * fade, y = b.y - 40 + e * 22, sway = Math.sin(t * 7) * 3;
    p.disc(cx + sway, y, 14, M[1], 0.12 * a); p.glow(cx + sway, y, 18, M[2], 0.25 * a);
    crescentFill(p, cx + sway, y, 8, -0.7 + Math.sin(t * 5) * 0.25, M, a);
    for (let i = 0; i < 14; i++) { const u = clamp((t - 0.2 - i * 0.03) / 0.6, 0, 1); if (u <= 0 || u >= 1) continue; const x = cx + sway + R.range(-14, 14) + Math.sin(u * 6 + i) * 3, yy = y + 6 + u * (b.y + b.h - y);
      p.blend(x, yy, i % 3 ? M[2] : M[3], 0.65 * Math.sin(Math.PI * u)); }
    const land = clamp((t - 0.5) / 0.4, 0, 1); if (land > 0 && land < 1) { p.glow(cx, b.y + b.h / 2, b.w * 0.8, M[2], 0.25 * Math.sin(Math.PI * land)); } },
};
export function draw(p, t, o) { const f = MOTIF[o.motif] ?? MOTIF.star; f(p, t, body(o), new Rng(o.seed)); }

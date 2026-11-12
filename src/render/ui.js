// DS풍 UI 위젯
import { drawText, textWidth, LINE_H } from './font.js';
import { TYPE_COLORS } from '../data/types.js';
import { SPECIES } from '../data/species.js';
import { shade } from './pixels.js';
import { W } from './screen.js';

const BORDER = '#384050', INNER = '#a8c0d8', FILL = '#f8f8f8';

export function drawWindow(ctx, x, y, w, h, fill = FILL) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = BORDER;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = INNER;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
}

export function hpColor(hp, maxHp) {
  const r = hp / maxHp;
  return r > 0.5 ? '#40c840' : r > 0.2 ? '#f8c800' : '#f04040';
}

export function drawHpBar(ctx, x, y, w, hp, maxHp) {
  ctx.fillStyle = '#404040';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(x + 1, y + 1, w - 2, 3);
  const fw = Math.ceil((w - 2) * Math.max(0, hp) / maxHp);
  const c = hpColor(hp, maxHp);
  ctx.fillStyle = c;
  ctx.fillRect(x + 1, y + 1, fw, 3);
  ctx.fillStyle = shade(c, 0.7);
  ctx.fillRect(x + 1, y + 3, fw, 1);
}

export function drawTypeBadge(ctx, type, x, y) {
  const label = type.slice(0, 4).toUpperCase();
  const w = 28;
  const c = TYPE_COLORS[type];
  ctx.fillStyle = shade(c, 0.55);
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = c;
  ctx.fillRect(x + 1, y + 1, w - 2, 8);
  drawText(ctx, label, x + Math.floor((w - textWidth(label)) / 2), y + 1, '#f8f8f8', shade(c, 0.5));
}

function cursorArrow(ctx, x, y) {
  ctx.fillStyle = '#e04040';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i, y + i, 1, 7 - i * 2);
}

const ROW = LINE_H + 2;

// 반환: 메뉴 사각형 (마우스 판정용)
export function menuRect(items, x, y, minW = 104) {
  const w = Math.max(minW, Math.max(...items.map((i) => textWidth(i.label))) + 22);
  return { x, y, w, h: items.length * ROW + 8 };
}

export function drawMenu(ctx, items, selected, x, y) {
  const r = menuRect(items, x, y);
  drawWindow(ctx, r.x, r.y, r.w, r.h);
  items.forEach((it, i) => {
    const ty = y + 5 + i * ROW;
    drawText(ctx, it.label, x + 14, ty, it.enabled ? '#303030' : '#a0a0a0', it.enabled ? '#d0d0d0' : null);
    if (i === selected) cursorArrow(ctx, x + 6, ty);
  });
  return r;
}

export const menuIndexAt = (items, x, y, py) => Math.floor((py - y - 4) / ROW);

export function drawUnitInfo(ctx, unit, cursorX) {
  const s = SPECIES[unit.species];
  const w = 104, h = 40;
  const x = cursorX < 8 ? W - w - 2 : 2, y = 2;
  drawWindow(ctx, x, y, w, h);
  const tag = unit.side === 'ally' ? '#3870f8' : '#f83838';
  ctx.fillStyle = tag;
  ctx.fillRect(x + 4, y + 5, 3, 8);
  drawText(ctx, s.name, x + 10, y + 5);
  s.types.forEach((t, i) => drawTypeBadge(ctx, t, x + 6 + i * 31, y + 16));
  drawText(ctx, 'HP', x + 6, y + 29, '#f8a000', '#d0d0d0');
  drawHpBar(ctx, x + 20, y + 30, 40, unit.hp, unit.maxHp);
  const hpTxt = `${unit.hp}/${unit.maxHp}`;
  drawText(ctx, hpTxt, x + w - 6 - textWidth(hpTxt), y + 28);
}

// 페이즈 배너: t 0..1 (슬라이드 인 → 정지 → 슬라이드 아웃)
export function drawBanner(ctx, text, sub, color, t) {
  const ease = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
  const h = sub ? 44 : 34, y = sub ? 74 : 79;
  ctx.fillStyle = 'rgba(16,16,24,0.55)';
  ctx.fillRect(0, y, W, h * ease);
  const x = Math.round(-W + ease * W);
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 4, W, 2);
  ctx.fillRect(x, y + h - 6, W, 2);
  ctx.save();
  ctx.translate(x + Math.floor((W - textWidth(text) * 2) / 2), y + 8);
  ctx.scale(2, 2);
  drawText(ctx, text, 0, 0, '#f8f8f8', '#303040');
  ctx.restore();
  if (sub) drawText(ctx, sub, x + Math.floor((W - textWidth(sub)) / 2), y + 27, '#f8f8f8', null);
}

export function drawHighlights(ctx, tiles, color) {
  ctx.fillStyle = color;
  for (const t of tiles) ctx.fillRect(t.x * 16 + 1, t.y * 16 + 1, 14, 14);
}

export function drawCursor(ctx, x, y, time) {
  const o = Math.floor(time * 3) % 2;
  const px = x * 16, py = y * 16;
  const corners = [[px - o, py - o, 1, 1], [px + 16 + o, py - o, -1, 1], [px - o, py + 16 + o, 1, -1], [px + 16 + o, py + 16 + o, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.fillStyle = '#303030';
    ctx.fillRect(sx > 0 ? cx - 1 : cx - 4, sy > 0 ? cy - 1 : cy - 2, 5, 3);
    ctx.fillRect(sx > 0 ? cx - 1 : cx - 2, sy > 0 ? cy - 1 : cy - 4, 3, 5);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(sx > 0 ? cx : cx - 3, sy > 0 ? cy : cy - 1, 3, 1);
    ctx.fillRect(sx > 0 ? cx : cx - 1, sy > 0 ? cy : cy - 3, 1, 3);
  }
}

// 하단 메시지 창
export function drawMessage(ctx, lines) {
  drawWindow(ctx, 2, 144, W - 4, 46);
  lines.slice(0, 2).forEach((l, i) => drawText(ctx, l, 12, 154 + i * 14));
}

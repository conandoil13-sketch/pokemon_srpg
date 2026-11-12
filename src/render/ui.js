// DS풍 UI 위젯 (화면 좌표)
import { drawText, textWidth } from './font.js';
import { TYPE_COLORS } from '../data/types.js';
import { TYPE_KO } from '../data/text.js';
import { SPECIES } from '../data/species.js';
import { shade } from './pixels.js';
import { W, H } from './screen.js';
import { TILE } from './tiles.js';
import { drawPortrait } from './sprites.js';

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
  const label = TYPE_KO[type];
  const w = 32, c = TYPE_COLORS[type];
  ctx.fillStyle = shade(c, 0.55);
  ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = c;
  ctx.fillRect(x + 1, y + 1, w - 2, 10);
  drawText(ctx, label, x + Math.floor((w - textWidth(label, 'small')) / 2), y + 1, '#f8f8f8', shade(c, 0.45), 'small');
}

function cursorArrow(ctx, x, y) {
  ctx.fillStyle = '#e04040';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i, y + i, 1, 7 - i * 2);
}

const ROW = 16;

export function menuRect(items, x, y, minW = 120) {
  const w = Math.max(minW, Math.max(...items.map((i) => textWidth(i.label))) + 24);
  return { x, y, w, h: items.length * ROW + 8 };
}

export function drawMenu(ctx, items, selected, x, y) {
  const r = menuRect(items, x, y);
  drawWindow(ctx, r.x, r.y, r.w, r.h);
  items.forEach((it, i) => {
    const ty = y + 5 + i * ROW;
    drawText(ctx, it.label, x + 15, ty, it.enabled ? '#383838' : '#a8a8a8', it.enabled ? '#d8d8d0' : null);
    if (i === selected) cursorArrow(ctx, x + 6, ty + 3);
  });
  return r;
}

export const menuIndexAt = (items, x, y, py) => Math.floor((py - y - 4) / ROW);

// 커서 위 유닛 정보: 초상화 + 이름 + 타입 + HP
export function drawUnitInfo(ctx, unit, onLeftHalf) {
  const s = SPECIES[unit.species];
  const w = 140, h = 52;
  const x = onLeftHalf ? W - w - 2 : 2, y = 2;
  drawWindow(ctx, x, y, w, h);
  ctx.fillStyle = unit.side === 'ally' ? '#3870f8' : '#f83838';
  ctx.fillRect(x + 4, y + 4, 44, 44);
  drawPortrait(ctx, unit.species, 'Normal', x + 6, y + 6);
  drawText(ctx, s.name, x + 52, y + 4);
  s.types.forEach((t, i) => drawTypeBadge(ctx, t, x + 52 + i * 34, y + 20));
  drawText(ctx, 'HP', x + 52, y + 35, '#f8a000', '#d8d8d0', 'small');
  drawHpBar(ctx, x + 66, y + 37, 34, unit.hp, unit.maxHp);
  const hpTxt = `${unit.hp}/${unit.maxHp}`;
  drawText(ctx, hpTxt, x + w - 5 - textWidth(hpTxt, 'small'), y + 35, '#383838', '#d8d8d0', 'small');
}

export function bigText(ctx, text, cx, y, color, shadowColor) {
  ctx.save();
  ctx.translate(Math.round(cx - textWidth(text)), y);
  ctx.scale(2, 2);
  drawText(ctx, text, 0, 0, color, shadowColor);
  ctx.restore();
}

// 페이즈 배너: t 0..1
export function drawBanner(ctx, text, sub, color, t) {
  const ease = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
  const h = sub ? 50 : 38, y = (H - h) / 2;
  ctx.fillStyle = 'rgba(16,16,24,0.55)';
  ctx.fillRect(0, y, W, h * ease);
  const x = Math.round(-W + ease * W);
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 3, W, 2);
  ctx.fillRect(x, y + h - 5, W, 2);
  bigText(ctx, text, x + W / 2, y + 7, '#f8f8f8', '#303040');
  if (sub) drawText(ctx, sub, x + Math.floor((W - textWidth(sub)) / 2), y + 33, '#f8f8f8', null);
}

// 월드 좌표 (호출 측에서 카메라 translate)
export function drawHighlights(ctx, tiles, color) {
  ctx.fillStyle = color;
  for (const t of tiles) ctx.fillRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
}

export function drawCursor(ctx, x, y, time) {
  const o = Math.floor(time * 3) % 2;
  const px = x * TILE, py = y * TILE;
  const corners = [[px - o, py - o, 1, 1], [px + TILE + o, py - o, -1, 1], [px - o, py + TILE + o, 1, -1], [px + TILE + o, py + TILE + o, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.fillStyle = '#303030';
    ctx.fillRect(sx > 0 ? cx - 1 : cx - 5, sy > 0 ? cy - 1 : cy - 2, 6, 3);
    ctx.fillRect(sx > 0 ? cx - 1 : cx - 2, sy > 0 ? cy - 1 : cy - 5, 3, 6);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(sx > 0 ? cx : cx - 4, sy > 0 ? cy : cy - 1, 4, 1);
    ctx.fillRect(sx > 0 ? cx : cx - 1, sy > 0 ? cy : cy - 4, 1, 4);
  }
}

// 하단 대사 창 (초상화 선택)
export function drawMessage(ctx, text, portrait, blink) {
  const y = H - 50;
  drawWindow(ctx, 2, y, W - 4, 48);
  let tx = 12;
  if (portrait) {
    ctx.fillStyle = portrait.side === 'ally' ? '#3870f8' : '#f83838';
    ctx.fillRect(5, y + 3, 42, 42);
    drawPortrait(ctx, portrait.species, portrait.emotion ?? 'Normal', 6, y + 4);
    tx = 54;
  }
  const lines = Array.isArray(text) ? text : [text];
  lines.slice(0, 2).forEach((l, i) => drawText(ctx, l, tx, y + 9 + i * 16));
  if (blink) {
    ctx.fillStyle = '#e04040';
    ctx.fillRect(W - 18, y + 38, 5, 1); ctx.fillRect(W - 17, y + 39, 3, 1); ctx.fillRect(W - 16, y + 40, 1, 1);
  }
}

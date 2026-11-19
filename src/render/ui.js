// DS풍 UI 위젯 (화면 좌표)
import { HELD_ITEMS } from '../data/heldItems.js';
import { drawText, textWidth } from './font.js';
import { TYPE_COLORS } from '../data/types.js';
import { TYPE_KO } from '../data/text.js';
import { SPECIES } from '../data/species.js';
import { shade } from './pixels.js';
import { W, H } from './screen.js';
import { TILE } from './tiles.js';
import { drawPortrait } from './sprites.js';
import { STAT_KEYS } from '../core/stages.js';
import { STATUS_KO } from '../core/status.js';
import { ABILITIES } from '../data/abilities.js';
import { genderSymbol, GENDER_COLOR } from '../core/individual.js';

export const STATUS_COLOR = { paralysis: '#e0b818', burn: '#e07030', poison: '#a050c0', toxic: '#702890', sleep: '#909090', freeze: '#60b8e8', confusion: '#d060a0', infatuation: '#f070b0' };

// 상태 배지 (작은 글씨, 색 바탕)
// 이름 + 성별 기호(♂ 파랑 · ♀ 빨강, 니드런처럼 이름에 기호가 있으면 생략). 끝 x 를 돌려준다
export function drawNameWithGender(ctx, species, gender, x, y, color = '#383838', shadow = '#d8d8d0', font) {
  const name = SPECIES[species].name;
  drawText(ctx, name, x, y, color, shadow, font);
  let end = x + textWidth(name, font);
  const sym = genderSymbol(species, gender);
  if (sym) { drawText(ctx, sym, end + 1, y, GENDER_COLOR[gender], null, font); end += 1 + textWidth(sym, font); }
  return end;
}

export function drawStatusBadge(ctx, ailment, x, y) {
  const label = STATUS_KO[ailment], w = textWidth(label, 'small') + 6, c = STATUS_COLOR[ailment];
  ctx.fillStyle = shade(c, 0.55); ctx.fillRect(x, y, w, 11);
  ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1, w - 2, 9);
  drawText(ctx, label, x + 3, y, '#f8f8f8', shade(c, 0.45), 'small');
  return w;
}

// 맵 유닛 발밑 상태 점 (월드 좌표)
export function drawStatusDot(ctx, unit, cx, cy) {
  const list = [unit.status, unit.confusion > 0 ? 'confusion' : null, unit.infatuation > 0 ? 'infatuation' : null].filter(Boolean);
  list.forEach((a, i) => {
    ctx.fillStyle = '#202020'; ctx.fillRect(Math.round(cx + 6 + i * 5), Math.round(cy + 6), 6, 6);
    ctx.fillStyle = STATUS_COLOR[a]; ctx.fillRect(Math.round(cx + 7 + i * 5), Math.round(cy + 7), 4, 4);
  });
}

export const STAT_SHORT = { atk: '공', def: '방', spa: '특공', spd: '특방', spe: '스피', acc: '명중', eva: '회피' };

// 포켓몬에 붙는 효과 (변화기 묶음 1차): 짧은 이름 + 남은 턴
const TAG_TURNS = { taunt: '도발', noMove: '이동불가', torment: '트집', healBlock: '회복봉인' };
const TAG_LOCK = { encore: '앙코르', disable: '사슬묶기' };
const TAG_FLAG = { focusEnergy: '기충전', aquaRing: '아쿠아링', rooted: '뿌리박기', cursed: '저주', leechBy: '씨뿌리기', yawnBy: '하품', identNormal: '꿰뚫림', identPsychic: '꿰뚫림', abilityOff: '특성꺼짐', bond: '길동무' };
export function volatileTags(unit) {
  const out = [];
  if (unit.guard === 'protect') out.push('방어');
  if (unit.guard === 'endure') out.push('버티기');
  for (const [k, name] of Object.entries(TAG_TURNS)) if (unit[k] > 0) out.push(`${name}${unit[k]}`);
  for (const [k, name] of Object.entries(TAG_LOCK)) if (unit[k]) out.push(`${name}${unit[k].turns}`);
  if (unit.bound) out.push(`속박${unit.bound.turns}`);
  for (const [k, name] of Object.entries(TAG_FLAG)) if (unit[k] && !out.includes(name)) out.push(name);
  return out;
}

// "공+2(3) 방-1(2)" — 0 단계는 생략, 괄호는 남은 턴. 뒤에 붙는 효과 표시
export function stageLine(unit) {
  return ((unit.confusion > 0 ? '혼란 ' : '') + STAT_KEYS.filter((k) => unit.stages?.[k]).map((k) => `${STAT_SHORT[k]}${unit.stages[k] > 0 ? '+' : '-'}${Math.abs(unit.stages[k])}(${unit.turns[k] > 999 ? "층" : unit.turns[k]})`)
    .concat(volatileTags(unit)).join(' ')).trim();
}

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
  const w = Math.max(minW, Math.max(...items.map((i) => textWidth(i.label) + (i.tag ? textWidth(i.tag, 'small') + 6 : 0))) + 24);
  return { x, y, w, h: items.length * ROW + 8 };
}

export function drawMenu(ctx, items, selected, x, y) {
  const r = menuRect(items, x, y);
  drawWindow(ctx, r.x, r.y, r.w, r.h);
  items.forEach((it, i) => {
    const ty = y + 5 + i * ROW;
    drawText(ctx, it.label, x + 15, ty, it.enabled ? '#383838' : '#a8a8a8', it.enabled ? '#d8d8d0' : null);
    if (it.tag) drawText(ctx, it.tag, x + r.w - 8 - textWidth(it.tag, 'small'), ty + 2, it.enabled ? '#7868a8' : '#c0c0c0', null, 'small');
    if (i === selected) cursorArrow(ctx, x + 6, ty + 3);
  });
  return r;
}

export const menuIndexAt = (items, x, y, py) => Math.floor((py - y - 4) / ROW);

// 커서 위 유닛 정보: 초상화 + 이름 + 타입 + HP
export function drawUnitInfo(ctx, unit, onLeftHalf, { hidden = false, warn = null } = {}) {
  const s = SPECIES[unit.species];
  if (hidden) { // 안개 속: 정체 숨김
    const w = 140, h = 52, x = onLeftHalf ? W - w - 2 : 2, y = 2;
    drawWindow(ctx, x, y, w, h);
    ctx.fillStyle = '#585858'; ctx.fillRect(x + 4, y + 4, 44, 44);
    drawText(ctx, '???', x + 52, y + 4);
    drawText(ctx, '안개 속이라 잘 보이지 않는다', x + 52, y + 22, '#707070', null, 'small');
    drawText(ctx, 'HP ???', x + 52, y + 35, '#f8a000', '#d8d8d0', 'small');
    return;
  }
  const stages = stageLine(unit);
  const w = 140, h = 64 + (stages ? 12 : 0) + (warn ? 12 : 0);
  const x = onLeftHalf ? W - w - 2 : 2, y = 2;
  drawWindow(ctx, x, y, w, h);
  const ab = ABILITIES[unit.ability];
  if (ab) drawText(ctx, `특성 ${ab.name}`, x + 6, y + 51, ab.inactive ? '#909090' : '#305830', null, 'small');
  const it = unit.held ? HELD_ITEMS[unit.held] : null; // 지닌 도구 (특성 줄 오른쪽)
  if (it) drawText(ctx, it.name, x + w - 6 - textWidth(it.name, 'small'), y + 51, '#8a5418', null, 'small');
  if (stages) drawText(ctx, stages, x + 6, y + 63, '#5848a0', null, 'small');
  if (warn) drawText(ctx, warn, x + 6, y + h - 13, '#e03030', '#f8d0d0', 'small');
  ctx.fillStyle = unit.side === 'ally' ? '#3870f8' : '#f83838';
  ctx.fillRect(x + 4, y + 4, 44, 44);
  drawPortrait(ctx, unit.species, 'Normal', x + 6, y + 6);
  const nameEnd = drawNameWithGender(ctx, unit.species, unit.gender, x + 52, y + 4);
  if (unit.boss) drawText(ctx, '보스', nameEnd + 4, y + 6, '#e03030', '#f8d0d0', 'small');
  if (unit.status) drawStatusBadge(ctx, unit.status, x + w - 6 - textWidth(STATUS_KO[unit.status], 'small') - 6, y + 5);
  (unit.types ?? s.types).forEach((t, i) => drawTypeBadge(ctx, t, x + 52 + i * 34, y + 20)); // 유닛 타입 (메타몽 빌드)
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
  if (sub) { const f = textWidth(sub) > W - 8 ? 'small' : undefined; drawText(ctx, sub, x + Math.floor((W - textWidth(sub, f)) / 2), y + (f ? 35 : 33), '#f8f8f8', null, f); } // 길면 작은 글씨
}

// 월드 좌표 (호출 측에서 카메라 translate)
// ---- 변화기 묶음 2차: 전장 표시 (월드 좌표) ----
const within2 = (cx, cy) => { const out = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2) out.push({ x: cx + dx, y: cy + dy }); return out; };
const AURA_TINT = { tailwind: 'rgba(120,200,255,0.16)', safeguard: 'rgba(255,140,200,0.16)', mist: 'rgba(235,235,255,0.18)', luckyChant: 'rgba(170,120,255,0.16)' };
const ZONE_EDGE = { reflect: '#f08830', lightScreen: '#f8d040', mudSport: '#a87040', waterSport: '#4890f0' };
// 오라: 쓴 포켓몬 주변 2칸을 종류별 옅은 색으로 (따라다님)
export function drawAuras(ctx, state) {
  for (const a of state.auras ?? []) {
    const o = state.units.find((u) => u.id === a.ownerId);
    if (!o) continue;
    ctx.fillStyle = AURA_TINT[a.kind];
    for (const t of within2(o.x, o.y)) ctx.fillRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
  }
}
// 장판: 덮인 칸 묶음의 바깥 테두리 (종류별 색)
export function drawZones(ctx, state) {
  for (const z of state.zones ?? []) {
    const tiles = within2(z.x, z.y), inside = (x, y) => Math.abs(x - z.x) + Math.abs(y - z.y) <= 2;
    ctx.fillStyle = ZONE_EDGE[z.kind];
    for (const t of tiles) {
      const px = t.x * TILE, py = t.y * TILE;
      if (!inside(t.x, t.y - 1)) ctx.fillRect(px, py, TILE, 2);
      if (!inside(t.x, t.y + 1)) ctx.fillRect(px, py + TILE - 2, TILE, 2);
      if (!inside(t.x - 1, t.y)) ctx.fillRect(px, py, 2, TILE);
      if (!inside(t.x + 1, t.y)) ctx.fillRect(px + TILE - 2, py, 2, TILE);
    }
  }
}
// 압정: 아군 것과 드러난 적 것만 (shown: 까는 연출 중이라 잠깐 보이는 칸). 그린 칸 목록을 돌려준다
// hidden: 던진 압정이 아직 안 떨어진 칸 (그리지 않음)
export function drawTraps(ctx, state, shown = [], hidden = []) {
  const vis = (state.spikes ?? []).filter((t) => (t.side === 'ally' || t.revealed || shown.some((p) => p.x === t.x && p.y === t.y)) && !hidden.some((p) => p.x === t.x && p.y === t.y && (!p.kind || p.kind === t.kind)));
  for (const t of vis) {
    const [rim, body, tip] = t.kind === 'spikes' ? ['#30303a', '#9898a8', '#e8e8f0'] : ['#2a1032', '#8a3aa8', '#e0a8f0'];
    for (const [ox, oy] of [[6, 17], [12, 12], [17, 18]]) { // 작은 가시 셋
      const px = t.x * TILE + ox, py = t.y * TILE + oy;
      ctx.fillStyle = rim; ctx.fillRect(px - 2, py, 5, 2); ctx.fillRect(px - 1, py - 2, 3, 2); ctx.fillRect(px, py - 4, 1, 2);
      ctx.fillStyle = body; ctx.fillRect(px - 1, py, 3, 1); ctx.fillRect(px, py - 2, 1, 2);
      ctx.fillStyle = tip; ctx.fillRect(px, py - 3, 1, 1);
    }
  }
  return vis;
}

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

// 기술 범위 모양 설명 (정보창)
export function shapeLabel(move) {
  const s = move.shape;
  if (!s) return '';
  const span = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}~${r[1]}`);
  switch (s.type) {
    case 'line': return `직선 ${s.length ?? 3}`;
    case 'cone': return '앞 부채꼴';
    case 'around': return move.friendlyFire ? '주변 (아군도)' : '주변';
    case 'blast': return `착탄 ${span(s.range ?? [2, 3])} 십자`;
    default: return `단일 ${span(s.range ?? move.range)}`;
  }
}

// 칸 테두리 (월드 좌표) — 범위에 휘말리는 아군 표시
export function drawOutline(ctx, x, y, color) {
  ctx.fillStyle = color;
  const px = x * TILE, py = y * TILE;
  ctx.fillRect(px + 1, py + 1, TILE - 2, 2); ctx.fillRect(px + 1, py + TILE - 3, TILE - 2, 2);
  ctx.fillRect(px + 1, py + 1, 2, TILE - 2); ctx.fillRect(px + TILE - 3, py + 1, 2, TILE - 2);
}

// 숨기 표시 (칸 좌상단 px,py, 월드 좌표): 구멍파기 흙더미 · 다이빙 물웅덩이 · 공중날기 구름 · 섀도다이브 그림자(유닛 위)
export function drawBurrowMark(ctx, unit, px, py) {
  const kind = unit.burrow?.kind;
  if (!kind) return;
  const blob = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(px + x, py + y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  if (kind === 'ground') { // 흙더미 + 구멍
    blob(12, 18, 10, 4.5, '#5a3a1c'); blob(12, 17, 8, 3.2, '#8a5a2c'); blob(12, 18, 5, 2, '#24140a');
    for (const [x, y] of [[3, 14], [20, 15], [6, 21], [18, 21]]) { ctx.fillStyle = '#a8743a'; ctx.fillRect(px + x, py + y, 2, 2); }
  } else if (kind === 'water') { // 물웅덩이 + 물결
    blob(12, 18, 11, 4.5, '#1a4a90'); blob(12, 17.5, 9, 3.2, '#3a80d8');
    ctx.fillStyle = '#c0e4ff'; ctx.fillRect(px + 6, py + 16, 4, 1); ctx.fillRect(px + 14, py + 18, 4, 1);
  } else if (kind === 'sky') { // 머리 위 구름
    for (const [x, y, r] of [[7, 3, 4], [12, 1, 5], [17, 3, 4]]) blob(x, y, r, r * 0.7, '#e8eef8');
    ctx.fillStyle = '#b0bcd0'; ctx.fillRect(px + 4, py + 5, 16, 1);
  } else if (kind === 'shadow') { // 포켓몬 위 검은 반투명 그림자
    ctx.save(); ctx.globalAlpha = 0.55;
    blob(12, 10, 10, 12, '#0a0610');
    ctx.restore();
  }
}

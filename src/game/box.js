// 편성소 박스: 아이콘 격자(6×5) + 왼쪽 패널 + 아래 출전 줄. 확인 = 동료 메뉴(출전·자세히 보기·진화의돌·특성)
import { SPECIES } from '../data/species.js';
import { ABILITIES } from '../data/abilities.js';
import { abilityOf, typesOfMember } from '../core/progress.js';
import { stoneEvolutionOptions } from '../core/evolution.js';
import { deployed, toggleSortie } from '../core/roster.js';
import { SORTIE_SIZE } from '../core/save.js';
import { sortMembers, boxesOf, SORT_KEYS, SORT_KO, BOX_SIZE } from '../core/box.js';
import { lineRoot } from '../core/gacha.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { drawPortrait } from '../render/sprites.js';
import { W, H } from '../render/screen.js';
import { createSummary } from './summary.js';
import { createDittoBuild } from './dittoBuild.js';
import { fitLines } from './memberText.js';

const COLS = 6, CELL = 24, GX = 108, GY = 16, PANEL_W = 104, DY = 140, SLOT_X = 38, SLOT_W = 43;
const NEXT_X = GX + 50, SORT_X = GX + 68; // 머리줄: ◀ 1/2 ▶ (고정 위치) · 정렬
const REASON = { full: ['출전 자리가 꽉 찼다.', '먼저 다른 동료를 빼자.'], last: ['최소 1마리는', '출전해야 한다.'], ditto: ['메타몽은 항상 출전한다.'] };

// 실행 중 기억 (저장하지 않음): 정렬, 박스 번호, 커서 동료 — 진화 뒤 다시 열어도 그대로
const remembered = { sort: 'joined', box: 0, species: null };
export const resetBoxMemory = () => Object.assign(remembered, { sort: 'joined', box: 0, species: null }); // 테스트용

export function createBox({ game, onBack, onEvolve, onSave = () => {} }) {
  let sort = remembered.sort, box = 0, cell = 0, slot = 0, area = 'grid';
  let mode = 'grid', menu = null, menuSel = 0, msg = null, summary = null;
  const list = () => sortMembers(game.party, sort);
  const boxes = () => boxesOf(list());
  const team = () => deployed(game); // 메타몽 + 출전
  const isOut = (m) => m.species === 'ditto' || game.sortie.includes(m.species);
  const current = () => (area === 'grid' ? boxes()[box]?.[cell] : team()[slot]) ?? null;
  const remember = () => Object.assign(remembered, { sort, box, species: current()?.species ?? remembered.species });

  // 그 동료(또는 같은 계열)에 커서를 둔다
  function focusOn(species) {
    const l = list();
    let k = l.findIndex((m) => m.species === species);
    if (k < 0 && species) k = l.findIndex((m) => lineRoot(m.species) === lineRoot(species)); // 진화로 이름이 바뀐 경우
    if (k < 0) { box = Math.min(remembered.box, boxes().length - 1); cell = 0; return; }
    area = 'grid'; box = Math.floor(k / BOX_SIZE); cell = k % BOX_SIZE;
  }
  focusOn(remembered.species);
  remember();

  const say = (lines) => { msg = lines; mode = 'msg'; };
  const back = () => { mode = area; menu = null; };

  function openMenu() {
    const m = current();
    if (!m) return;
    const canStone = stoneEvolutionOptions(SPECIES[m.species], m.gender ?? null).length > 0 && game.items.evoStone > 0;
    menu = [
      { label: isOut(m) ? '출전에서 빼기' : '출전에 넣기', enabled: true, act: 'sortie' },
      { label: '자세히 보기', enabled: true, act: 'summary' },
      { label: `진화의돌 (${game.items.evoStone}개)`, enabled: canStone, act: 'stone' },
      ...(m.species === 'ditto' ? [{ label: '메타몽 빌드', enabled: true, act: 'build' }] : [{ label: '특성', enabled: true, act: 'ability' }]),
      { label: '그만둔다', enabled: true, act: 'close' },
    ];
    menuSel = 0; mode = 'menu';
  }

  function openSummary(page) {
    const l = list(), m = current(), from = area;
    summary = createSummary({
      game, list: l, index: Math.max(0, l.indexOf(m)), page, onSave,
      onClose: (last) => { // 연 곳으로 돌아감 (출전 줄에서 열었고 그 동료가 출전 중이면 출전 줄)
        summary = null;
        const k = team().findIndex((x) => x.species === last.species);
        if (from === 'deploy' && k >= 0) { area = 'deploy'; slot = k; } else focusOn(last.species);
        remember(); mode = area;
      },
    });
    mode = 'summary';
  }

  function act(item) {
    const m = current();
    if (!item.enabled || !m) return;
    if (item.act === 'close') { back(); return; }
    if (item.act === 'summary') { openSummary(0); return; }
    if (item.act === 'ability') { openSummary(3); return; }
    if (item.act === 'build') { // 메타몽 빌드 화면 (닫으면 박스로)
      summary = createDittoBuild({ game, onSave, onClose: () => { summary = null; mode = area; } });
      mode = 'summary';
      return;
    }
    if (item.act === 'stone') { remember(); onEvolve(m, stoneEvolutionOptions(SPECIES[m.species], m.gender ?? null)); return; } // 돌은 실제로 진화할 때 차감 (main)
    const r = toggleSortie(game, m.species);
    if (!r.ok) { say(REASON[r.reason]); return; }
    onSave();
    if (area === 'deploy') slot = Math.min(slot, team().length - 1);
    back();
  }

  function moveGrid(dx, dy) {
    const len = boxes()[box].length, last = boxes().length - 1;
    const col = cell % COLS, row = Math.floor(cell / COLS);
    if (dx < 0) {
      if (col > 0) cell -= 1;
      else if (box > 0) { box -= 1; cell = Math.min(boxes()[box].length - 1, row * COLS + COLS - 1); }
    } else if (dx > 0) {
      if (col < COLS - 1 && cell + 1 < len) cell += 1;
      else if (box < last) { box += 1; cell = Math.min(boxes()[box].length - 1, row * COLS); }
    } else if (dy > 0) {
      if (cell + COLS < len) cell += COLS;
      else if (row < Math.floor((len - 1) / COLS)) cell = len - 1; // 아래 줄이 짧으면 마지막 동료로
      else { area = 'deploy'; mode = 'deploy'; slot = Math.min(team().length - 1, Math.round(col * (SORTIE_SIZE) / (COLS - 1))); }
    } else if (dy < 0 && cell - COLS >= 0) cell -= COLS;
  }
  function moveDeploy(dx, dy) {
    if (dx) slot = Math.max(0, Math.min(team().length - 1, slot + dx));
    if (dy < 0) {
      const len = boxes()[box].length;
      if (!len) return;
      const start = Math.floor((len - 1) / COLS) * COLS;
      cell = Math.min(len - 1, start + Math.round(slot * (COLS - 1) / SORTIE_SIZE));
      area = 'grid'; mode = 'grid';
    }
  }
  function cycleSort() {
    const keep = current()?.species;
    sort = SORT_KEYS[(SORT_KEYS.indexOf(sort) + 1) % SORT_KEYS.length];
    if (area === 'grid' && keep) focusOn(keep); // 출전 줄 순서는 정렬과 무관 → 그대로
    mode = area;
  }

  // 마우스: 화면 좌표 → 격자 칸 / 출전 자리 / 머리줄
  function hit(px, py) {
    if (px >= GX && px < GX + COLS * CELL && py >= GY && py < GY + 5 * CELL) {
      const k = Math.floor((py - GY) / CELL) * COLS + Math.floor((px - GX) / CELL);
      return k < boxes()[box].length ? { area: 'grid', k } : null;
    }
    if (py >= DY + 2 && py < DY + 46 && px >= SLOT_X) {
      const k = Math.floor((px - SLOT_X) / SLOT_W);
      return k < team().length ? { area: 'deploy', k } : null;
    }
    if (py < GY && px >= GX) {
      if (px < GX + 12) return { area: 'prev' };
      if (px >= NEXT_X - 2 && px < NEXT_X + 12) return { area: 'next' };
      if (px >= SORT_X) return { area: 'sort' };
    }
    return null;
  }
  const place = (h) => { if (h.area === 'grid') { area = mode = 'grid'; cell = h.k; } else { area = mode = 'deploy'; slot = h.k; } };

  return {
    get mode() { return mode; },
    get box() { return box; },
    get boxCount() { return boxes().length; },
    get sort() { return sort; },
    get cursorMember() { return current(); },
    get summary() { return summary; },
    get message() { return msg; },
    get menuLabels() { return menu?.map((i) => i.label) ?? []; },
    handle(ev) {
      if (mode === 'summary') { summary.handle(ev); return; }
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') { if (pick || ev.type === 'cancel') { msg = null; mode = area; } return; }
      if (mode === 'menu') {
        if (ev.type === 'cancel') { back(); return; }
        if (ev.type === 'dir' && ev.dy) menuSel = (menuSel + ev.dy + menu.length) % menu.length;
        if (ev.type === 'click') {
          const r = menuBox();
          if (ev.px < r.x || ev.px >= r.x + r.w || ev.py < r.y || ev.py >= r.y + r.h) { back(); return; }
          const k = ui.menuIndexAt(menu, r.x, r.y, ev.py);
          if (k < 0 || k >= menu.length) return;
          menuSel = k;
        }
        if (pick) act(menu[menuSel]);
        return;
      }
      if (ev.type === 'cancel') { remember(); onBack(); return; }
      if (ev.type === 'sort') { cycleSort(); remember(); return; }
      if (ev.type === 'dir') { if (area === 'grid') moveGrid(ev.dx, ev.dy); else moveDeploy(ev.dx, ev.dy); remember(); return; }
      if (ev.type === 'cursor' && ev.px !== undefined) { const h = hit(ev.px, ev.py); if (h && (h.area === 'grid' || h.area === 'deploy')) { place(h); remember(); } return; }
      if (ev.type === 'click' && ev.px !== undefined) {
        const h = hit(ev.px, ev.py);
        if (!h) return;
        if (h.area === 'prev') { if (box > 0) { box -= 1; cell = Math.min(cell, boxes()[box].length - 1); } remember(); return; }
        if (h.area === 'next') { if (box < boxes().length - 1) { box += 1; cell = Math.min(cell, boxes()[box].length - 1); } remember(); return; }
        if (h.area === 'sort') { cycleSort(); remember(); return; }
        place(h); remember();
      }
      if (pick) openMenu();
    },
    update(dt) { summary?.update(dt); },
    draw(ctx, time) {
      if (mode === 'summary') { summary.draw(ctx, time); return; }
      ctx.fillStyle = '#1c2840';
      ctx.fillRect(0, 0, W, H);
      drawPanel(ctx, current(), isOut);
      // 머리줄
      const b = boxes();
      const count = `${box + 1}/${b.length}`;
      drawText(ctx, '◀', GX, 2, box > 0 ? '#f8f8f8' : '#58607a', '#384868', 'small');
      drawText(ctx, count, GX + 12 + Math.round((NEXT_X - GX - 12 - textWidth(count, 'small')) / 2), 2, '#f8f8f8', '#384868', 'small');
      drawText(ctx, '▶', NEXT_X, 2, box < b.length - 1 ? '#f8f8f8' : '#58607a', '#384868', 'small');
      drawText(ctx, `정렬: ${SORT_KO[sort]}`, SORT_X, 2, '#a8b8d8', null, 'small');
      // 격자
      for (let k = 0; k < BOX_SIZE; k++) {
        const x = GX + (k % COLS) * CELL, y = GY + Math.floor(k / COLS) * CELL, m = b[box][k];
        ctx.fillStyle = (k + Math.floor(k / COLS)) % 2 ? '#2c3a5c' : '#324268';
        ctx.fillRect(x, y, CELL, CELL);
        if (!m) continue;
        drawIcon(ctx, m.species, x, y, CELL);
        if (isOut(m)) drawDeployMark(ctx, x, y, CELL);
        if (area === 'grid' && k === cell && mode !== 'deploy') drawCursor(ctx, x, y, CELL, time);
      }
      // 출전 줄
      ui.drawWindow(ctx, 2, DY, W - 4, H - DY - 2);
      drawText(ctx, '출전', 8, DY + 18, '#384868', null, 'small');
      const t = team();
      for (let k = 0; k < 1 + SORTIE_SIZE; k++) {
        const x = SLOT_X + k * SLOT_W, y = DY + 4, m = t[k];
        ctx.fillStyle = '#c8d0e0'; ctx.fillRect(x, y, 40, 40);
        if (m) drawPortrait(ctx, m.species, 'Normal', x, y);
        if (area === 'deploy' && k === slot) drawCursor(ctx, x, y, 40, time);
      }
      if (mode === 'menu') { const r = menuBox(); ui.drawMenu(ctx, menu, menuSel, r.x, r.y); }
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
    },
  };

  function menuBox() { const r = ui.menuRect(menu, 0, 0); return { x: GX + 4, y: Math.max(2, DY - r.h - 2), w: r.w, h: r.h }; }
}

// 왼쪽 패널: 초상화 · 이름 · Lv · 타입 · 특성 · 출전 여부
function drawPanel(ctx, m, isOut) {
  ui.drawWindow(ctx, 2, 2, PANEL_W, DY - 4);
  if (!m) { drawText(ctx, '비어 있음', 10, 12, '#909090', null, 'small'); return; }
  const s = SPECIES[m.species];
  ctx.fillStyle = isOut(m) ? '#3870f8' : '#7880a0';
  ctx.fillRect(8, 8, 44, 44);
  drawPortrait(ctx, m.species, 'Normal', 10, 10);
  drawText(ctx, `Lv.${m.level}`, 56, 10, '#383838', null, 'small');
  drawText(ctx, isOut(m) ? '출전 중' : '대기', 56, 24, isOut(m) ? '#2860c8' : '#808080', null, 'small');
  drawText(ctx, s.name, 8, 56);
  typesOfMember(m).forEach((t, k) => ui.drawTypeBadge(ctx, t, 8 + k * 34, 72)); // 메타몽은 빌드 타입
  const ab = ABILITIES[abilityOf(m)];
  fitLines(`특성 ${ab?.name ?? '-'}`, PANEL_W - 14).slice(0, 2).forEach((l, k) => drawText(ctx, l, 8, 90 + k * 11, ab?.inactive ? '#909090' : '#305830', null, 'small'));
  drawText(ctx, '확인: 메뉴 · S: 정렬', 8, 120, '#909090', null, 'small');
}

// 아이콘: 초상화 가운데를 칸 크기로 잘라 그림
function drawIcon(ctx, species, x, y, size) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 1, y + 1, size - 2, size - 2); ctx.clip();
  drawPortrait(ctx, species, 'Normal', x - Math.round((40 - size) / 2), y - Math.round((40 - size) / 2) + 2);
  ctx.restore();
}

// 출전 표시: 파란 테두리 + 오른쪽 위 깃발 (★ 은 이로치용으로 남김)
function drawDeployMark(ctx, x, y, size) {
  ctx.fillStyle = '#4890f8';
  ctx.fillRect(x, y, size, 2); ctx.fillRect(x, y + size - 2, size, 2);
  ctx.fillRect(x, y, 2, size); ctx.fillRect(x + size - 2, y, 2, size);
  ctx.fillStyle = '#202838'; ctx.fillRect(x + size - 10, y + 2, 8, 8); // 깃발 바탕
  ctx.fillStyle = '#f8f8f8'; ctx.fillRect(x + size - 9, y + 3, 1, 6); // 깃대
  ctx.fillStyle = '#58a8f8'; ctx.fillRect(x + size - 8, y + 3, 5, 3); // 깃발
}

function drawCursor(ctx, x, y, size, time) {
  ctx.fillStyle = Math.floor(time * 4) % 2 ? '#f8d050' : '#f8f8a0';
  ctx.fillRect(x, y, size, 2); ctx.fillRect(x, y + size - 2, size, 2);
  ctx.fillRect(x, y, 2, size); ctx.fillRect(x + size - 2, y, 2, size);
}

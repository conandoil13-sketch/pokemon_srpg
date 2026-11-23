// 메타몽 빌드 화면: 위 = 지금 빌드(타입·특성·능력치·기술), 아래 = 가방(캡슐·파우더). 캡슐: 설명 → (칸, 기술은 옛·새 비교) → 확인 → 적용·저장
// 지금 기술·특성은 '살펴보기' 항목이나 위쪽 칸을 눌러 설명을 본다
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { ABILITIES } from '../data/abilities.js';
import { TYPE_KO, josa } from '../data/text.js';
import {
  STATS, POWDER_KO, POWDER_STEP, SECOND_TYPE_LEVEL, statCap, effectiveBase, canPowder, applyPowder,
  capsuleUse, applyCapsule, clearSecondType,
} from '../core/dittoBuild.js';
import { statsAt } from '../core/stats.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';
import { drawMoveCard } from './moveInfo.js';
import { fitLines } from './memberText.js';

const STAT_LABEL = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' };
const KIND_KO = { move: '기술', type: '타입', ability: '특성' };
const ROWS = 5, LIST_Y = 122, ROW_H = 12;

const valueName = (c) => (c.kind === 'move' ? MOVES[c.value]?.name : c.kind === 'type' ? TYPE_KO[c.value] : ABILITIES[c.value]?.name) ?? c.value;
const REFUSE = {
  same: ['이미 같은 것이 있다.'],
  max: ['그 능력치는 더 올릴 수 없다.'],
  none: ['파우더가 없다.'],
};

export function createDittoBuild({ game, onSave = () => {}, onClose }) {
  const d = game.party.find((m) => m.species === 'ditto');
  let mode = 'list', sel = 0, top = 0, slotSel = 0, pending = null, msg = null, t = 0, view = 0;
  const viewList = () => [...d.moves.map((value) => ({ kind: 'move', value })), { kind: 'ability', value: d.build.ability }]; // 살펴보기: 기술들 + 특성

  // 가방 목록: 캡슐(최근 순) · 파우더(종류별) · 둘째 타입 비우기
  function items() {
    const caps = game.items.capsules ?? [];
    const out = caps.map((c, index) => {
      const use = capsuleUse(d, c);
      return { kind: 'capsule', index, capsule: c, use, enabled: use.ok, label: `${KIND_KO[c.kind]} 캡슐: ${valueName(c)} (${SPECIES[c.from]?.name ?? '?'})` };
    }).reverse();
    for (const s of STATS) {
      const n = game.items.powders?.[s] ?? 0;
      if (n > 0) out.push({ kind: 'powder', stat: s, enabled: canPowder(d, s).ok, label: `${POWDER_KO[s]} ×${n}` });
    }
    if (d.build.types.length > 1) out.push({ kind: 'clear', enabled: true, label: `둘째 타입(${TYPE_KO[d.build.types[1]]}) 비우기` });
    out.push({ kind: 'view', enabled: true, label: '지금 기술·특성 살펴보기' });
    return out;
  }
  const say = (lines) => { msg = lines; mode = 'msg'; t = 0; };

  function refuse(it) {
    if (it.kind === 'powder') {
      const r = canPowder(d, it.stat);
      if (r.reason === 'cap') say([`능력치 합계가 상한(${statCap(d.level)})에 닿았다.`, '레벨을 올리면 상한이 오른다.']);
      else say(REFUSE[r.reason] ?? ['쓸 수 없다.']);
    } else say(REFUSE[it.use?.reason] ?? ['쓸 수 없다.']);
  }

  function question(p) {
    const it = p.item;
    if (it.kind === 'powder') return [`${josa(POWDER_KO[it.stat], '으로/로')} ${STAT_LABEL[it.stat]} +${POWDER_STEP}?`, '확인: 예 · 취소: 아니오'];
    if (it.kind === 'clear') return [`${TYPE_KO[d.build.types[1]]} 타입을 비울까?`, '확인: 예 · 취소: 아니오'];
    const c = it.capsule, name = valueName(c);
    if (c.kind === 'move') {
      const old = d.moves[p.slot];
      return [old ? `${josa(MOVES[old].name, '을/를')} 잊고 ${josa(name, '을/를')} 넣을까?` : `${josa(name, '을/를')} 넣을까?`, '확인: 예 · 취소: 아니오'];
    }
    if (c.kind === 'type') {
      const old = d.build.types[p.slot];
      return [old ? `타입을 ${TYPE_KO[old]}에서 ${josa(name, '으로/로')} 바꿀까?` : `${name} 타입을 더할까?`, '확인: 예 · 취소: 아니오'];
    }
    return [`특성을 ${ABILITIES[d.build.ability]?.name}에서 ${josa(name, '으로/로')} 바꿀까?`, '확인: 예 · 취소: 아니오'];
  }

  function choose(it) {
    if (it.kind === 'view') { view = 0; mode = 'view'; return; }
    if (!it.enabled) { refuse(it); return; }
    if (it.kind === 'capsule') { pending = { item: it }; mode = 'preview'; t = 0; return; } // 쓰기 전에 설명
    toSlot(it);
  }
  function toSlot(it) {
    if (it.kind === 'capsule' && it.use.slots.length > 1) { pending = { item: it }; slotSel = 0; mode = 'slot'; return; }
    pending = { item: it, slot: it.kind === 'capsule' ? it.use.slots[0] : 0 };
    mode = 'confirm'; t = 0;
  }

  function commit() {
    const { item: it, slot } = pending;
    pending = null;
    let r;
    if (it.kind === 'powder') r = applyPowder(game, it.stat);
    else if (it.kind === 'clear') r = clearSecondType(game);
    else r = applyCapsule(game, it.index, slot);
    if (!r.ok) { refuse(it); return; }
    onSave();
    sel = Math.min(sel, Math.max(0, items().length - 1));
    say(it.kind === 'powder' ? [`${josa(STAT_LABEL[it.stat], '이/가')} 올랐다!`] : it.kind === 'clear' ? ['둘째 타입을 비웠다.'] : ['메타몽이 캡슐의 힘을 받아들였다!']);
  }

  // 아래 창 설명: 캡슐 설명 / 기술 칸 고르기(옛·새) / 지금 기술·특성
  function drawDetail(ctx) {
    const y0 = 108, hint = (s) => drawText(ctx, s, 8, H - 14, '#384868', null, 'small');
    ui.drawWindow(ctx, 2, y0, W - 4, H - y0 - 2);
    const abilityBlock = (id, title, y, color) => {
      const a = ABILITIES[id];
      drawText(ctx, `${title} ${a?.name ?? '-'}`, 8, y, a?.inactive ? '#909090' : color, null, 'small');
      fitLines(a?.desc ?? '', W - 22).slice(0, 2).forEach((l, k) => drawText(ctx, l, 8, y + 11 + k * 10, '#606060', null, 'small'));
    };
    if (mode === 'view') {
      const v = viewList()[view];
      if (v.kind === 'move') drawMoveCard(ctx, v.value, 8, y0 + 5, W - 18, { label: '지금 기술', maxLines: 3 });
      else abilityBlock(v.value, '지금 특성', y0 + 6, '#305830');
      hint('방향키: 다른 칸 · 취소: 돌아가기');
      return;
    }
    const c = pending.item.capsule;
    if (mode === 'slot') { // 기술: 바꿀 칸의 옛 기술 | 캡슐 기술
      const old = d.moves[pending.item.use.slots[slotSel]];
      if (old) drawMoveCard(ctx, old, 8, y0 + 5, 116, { label: '잊는다', labelColor: '#a04040' });
      else drawText(ctx, '— 빈 칸 —', 8, y0 + 6, '#a0a0a0', null, 'small');
      ctx.fillStyle = '#c8c8c0'; ctx.fillRect(W / 2, y0 + 6, 1, 54);
      drawMoveCard(ctx, c.value, W / 2 + 6, y0 + 5, 116, { label: '넣는다', labelColor: '#2860c8' });
      hint('넣을 칸을 고르자 · 방향키: 칸 · 확인 · 취소');
      return;
    }
    if (c.kind === 'move') drawMoveCard(ctx, c.value, 8, y0 + 5, W - 18, { label: `${KIND_KO[c.kind]} 캡슐`, maxLines: 3 });
    else if (c.kind === 'ability') { abilityBlock(c.value, '새 특성', y0 + 4, '#c06010'); abilityBlock(d.build.ability, '지금 특성', y0 + 34, '#305830'); }
    else {
      drawText(ctx, '새 타입', 8, y0 + 7, '#c06010', null, 'small'); ui.drawTypeBadge(ctx, c.value, 50, y0 + 6);
      drawText(ctx, '지금 타입', 8, y0 + 25, '#305830', null, 'small');
      d.build.types.forEach((ty, k) => ui.drawTypeBadge(ctx, ty, 50 + k * 34, y0 + 24));
      if (pending.item.use.level) drawText(ctx, `둘째 타입 칸은 Lv.${SECOND_TYPE_LEVEL}부터 열린다.`, 8, y0 + 43, '#808080', null, 'small');
    }
    hint('확인: 쓴다 · 취소: 돌아가기');
  }

  // 위쪽 빌드 영역: 특성 글자 / 기술 2×2 칸 → 살펴보기 번호 (없으면 null)
  function topHit(px, py) {
    if (py >= 19 && py < 34 && px >= 82 && px < 200) return d.moves.length;
    if (py >= 81 && py < 104) { const k = Math.floor((py - 81) / 11) * 2 + (px >= 128 ? 1 : 0); return k < d.moves.length ? k : null; }
    return null;
  }

  return {
    get mode() { return mode; },
    get preview() {
      if (mode !== 'preview') return null;
      const c = pending.item.capsule;
      return c.kind === 'move' ? { kind: 'move', value: c.value } : { kind: c.kind, value: c.value, current: c.kind === 'type' ? d.build.types : d.build.ability };
    },
    get compare() { return mode === 'slot' && pending.item.capsule.kind === 'move' ? { old: d.moves[pending.item.use.slots[slotSel]] ?? null, new: pending.item.capsule.value } : null; },
    get viewing() { return mode === 'view' ? viewList()[view] : null; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') { if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) mode = 'list'; return; }
      if (mode === 'preview') {
        if (ev.type === 'cancel') { pending = null; mode = 'list'; return; }
        if (ev.type === 'click' && ev.py !== undefined && ev.py < 108) return; // 위쪽 빌드 영역을 눌러도 넘어가지 않음
        if (pick && t >= CHOICE_LOCK) toSlot(pending.item);
        return;
      }
      if (mode === 'view') {
        const n = viewList().length;
        if (ev.type === 'cancel') { mode = 'list'; return; }
        if (ev.type === 'dir' && (ev.dx || ev.dy)) view = (view + (ev.dx || ev.dy) + n) % n;
        if (ev.type === 'click' && ev.py !== undefined) { const k = topHit(ev.px, ev.py); if (k !== null) view = k; else if (ev.py >= 108) mode = 'list'; }
        return;
      }
      if (mode === 'confirm') {
        if (ev.type === 'cancel') { pending = null; mode = 'list'; return; }
        if (pick && t >= CHOICE_LOCK) commit();
        return;
      }
      if (mode === 'slot') {
        const slots = pending.item.use.slots;
        if (ev.type === 'cancel') { pending = null; mode = 'list'; return; }
        if (ev.type === 'dir' && (ev.dx || ev.dy)) slotSel = (slotSel + (ev.dx || ev.dy) + slots.length) % slots.length;
        if (pick) { pending.slot = slots[slotSel]; mode = 'confirm'; t = 0; }
        return;
      }
      // list
      const list = items();
      if (ev.type === 'cancel') { onClose(); return; }
      if (ev.type === 'dir' && ev.dy && list.length) {
        sel = (sel + ev.dy + list.length) % list.length;
        if (sel < top) top = sel;
        if (sel >= top + ROWS) top = sel - ROWS + 1;
      }
      if (ev.type === 'click' && ev.py !== undefined && topHit(ev.px, ev.py) !== null) { view = topHit(ev.px, ev.py); mode = 'view'; return; } // 위쪽 기술·특성 칸
      if (ev.type === 'click' && ev.py !== undefined) { // 목록 줄을 누른 경우만
        const row = Math.floor((ev.py - LIST_Y) / ROW_H), k = top + row;
        if (ev.py < LIST_Y || row >= ROWS || k >= list.length) return;
        sel = k;
      }
      if (pick && list[sel]) choose(list[sel]);
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      ctx.fillStyle = '#1c2840';
      ctx.fillRect(0, 0, W, H);
      const b = d.build, base = effectiveBase(b), stats = statsAt(base, d.level);
      const total = Object.values(base).reduce((a, v) => a + v, 0), cap = statCap(d.level);
      const slotOn = (kind, k) => mode === 'slot' || mode === 'confirm' ? pending?.item.capsule?.kind === kind && (mode === 'slot' ? pending.item.use.slots[slotSel] : pending.slot) === k : false;
      // 위: 빌드
      ui.drawWindow(ctx, 2, 2, W - 4, 104);
      drawText(ctx, `메타몽 Lv.${d.level}`, 8, 5);
      const sum = `합계 ${total}/${cap}`;
      drawText(ctx, sum, W - 10 - textWidth(sum, 'small'), 7, total >= cap ? '#c06010' : '#384868', null, 'small');
      for (let k = 0; k < 2; k++) {
        const x = 8 + k * 36, y = 21;
        if (b.types[k]) ui.drawTypeBadge(ctx, b.types[k], x, y);
        else drawText(ctx, d.level >= SECOND_TYPE_LEVEL ? '—' : `Lv.${SECOND_TYPE_LEVEL}`, x + 6, y + 1, '#a0a0a0', null, 'small');
        if (slotOn('type', k)) outline(ctx, x - 1, y - 1, 34, 14);
      }
      const ab = ABILITIES[b.ability];
      drawText(ctx, `특성 ${ab?.name ?? '-'}`, 84, 22, ab?.inactive ? '#909090' : '#305830', null, 'small');
      if (slotOn('ability', 0) || (mode === 'view' && view === d.moves.length)) outline(ctx, 82, 20, textWidth(`특성 ${ab?.name ?? '-'}`, 'small') + 4, 13);
      STATS.forEach((s, k) => {
        const x = 8 + (k % 2) * 122, y = 36 + Math.floor(k / 2) * 11;
        drawText(ctx, `${STAT_LABEL[s]} ${base[s]}`, x, y, b.bonus[s] ? '#c06010' : '#383838', null, 'small');
        ctx.fillStyle = '#d8d8d0'; ctx.fillRect(x + 56, y + 4, 56, 4);
        ctx.fillStyle = '#e0a040'; ctx.fillRect(x + 56, y + 4, Math.round(56 * base[s] / 255), 4);
      });
      drawText(ctx, `Lv.${d.level} 능력치  ${stats.hp}/${stats.atk}/${stats.def}/${stats.spa}/${stats.spd}/${stats.spe}`, 8, 70, '#707070', null, 'small');
      for (let k = 0; k < 4; k++) { // 기술 2×2
        const x = 8 + (k % 2) * 122, y = 82 + Math.floor(k / 2) * 11, mv = d.moves[k];
        drawText(ctx, mv ? MOVES[mv].name : '— 빈 칸 —', x, y, mv ? '#383838' : '#a0a0a0', null, 'small');
        if (slotOn('move', k) || (mode === 'view' && view === k)) outline(ctx, x - 2, y - 1, 118, 11);
      }
      // 아래: 설명 (캡슐 설명·기술 비교·살펴보기) 또는 가방
      if (mode === 'preview' || mode === 'view' || (mode === 'slot' && pending.item.capsule.kind === 'move')) { drawDetail(ctx); return; }
      const list = items();
      ui.drawWindow(ctx, 2, 108, W - 4, H - 110);
      const caps = (game.items.capsules ?? []).length, pw = Object.values(game.items.powders ?? {}).reduce((a, n) => a + n, 0);
      drawText(ctx, `가방 · 캡슐 ${caps} · 파우더 ${pw}`, 8, 110, '#384868', null, 'small');
      if (list.length === 1) drawText(ctx, '가방이 비어 있다. 던전에서 캡슐·파우더를 모으자.', 10, LIST_Y + 2 + ROW_H, '#909090', null, 'small');
      list.slice(top, top + ROWS).forEach((it, i) => {
        const y = LIST_Y + 2 + i * ROW_H, on = top + i === sel;
        if (on && mode === 'list') { ctx.fillStyle = '#fff0b0'; ctx.fillRect(5, y - 1, W - 10, ROW_H); }
        drawText(ctx, it.label, 10, y, it.enabled ? '#383838' : '#a8a8a8', null, 'small');
      });
      if (mode === 'confirm' && pending) ui.drawMessage(ctx, question(pending), null, Math.floor(time * 3) % 2 === 0);
      if (mode === 'slot' && pending.item.capsule.kind !== 'move') ui.drawMessage(ctx, ['넣을 칸을 고르자.', '방향키: 칸 · 확인 · 취소'], null, false);
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
    },
  };
}

function outline(ctx, x, y, w, h) {
  ctx.fillStyle = '#f8a020';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

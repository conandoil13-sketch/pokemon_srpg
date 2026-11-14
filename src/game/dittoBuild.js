// 메타몽 빌드 화면: 위 = 지금 빌드(타입·특성·능력치·기술), 아래 = 가방(캡슐·파우더). 고르기 → (칸) → 확인 → 적용·저장
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
  let mode = 'list', sel = 0, top = 0, slotSel = 0, pending = null, msg = null, t = 0;

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
    if (!it.enabled) { refuse(it); return; }
    if (it.kind === 'capsule' && it.use.slots.length > 1) { pending = { item: it }; slotSel = 0; mode = 'slot'; return; }
    pending = { item: it, slot: it.kind === 'capsule' ? it.use.slots[0] : 0 };
    mode = 'confirm';
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

  return {
    get mode() { return mode; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') { if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) mode = 'list'; return; }
      if (mode === 'confirm') {
        if (ev.type === 'cancel') { pending = null; mode = 'list'; return; }
        if (pick) commit();
        return;
      }
      if (mode === 'slot') {
        const slots = pending.item.use.slots;
        if (ev.type === 'cancel') { pending = null; mode = 'list'; return; }
        if (ev.type === 'dir' && (ev.dx || ev.dy)) slotSel = (slotSel + (ev.dx || ev.dy) + slots.length) % slots.length;
        if (pick) { pending.slot = slots[slotSel]; mode = 'confirm'; }
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
      if (ev.type === 'click' && ev.py !== undefined && ev.py >= LIST_Y) {
        const k = top + Math.floor((ev.py - LIST_Y) / ROW_H);
        if (k >= list.length) return;
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
      if (slotOn('ability', 0)) outline(ctx, 82, 20, textWidth(`특성 ${ab?.name ?? '-'}`, 'small') + 4, 13);
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
        if (slotOn('move', k)) outline(ctx, x - 2, y - 1, 118, 11);
      }
      // 아래: 가방
      const list = items();
      ui.drawWindow(ctx, 2, 108, W - 4, H - 110);
      const caps = (game.items.capsules ?? []).length, pw = Object.values(game.items.powders ?? {}).reduce((a, n) => a + n, 0);
      drawText(ctx, `가방 · 캡슐 ${caps} · 파우더 ${pw}`, 8, 110, '#384868', null, 'small');
      if (!list.length) drawText(ctx, '가방이 비어 있다. 던전에서 캡슐·파우더를 모으자.', 10, LIST_Y + 4, '#909090', null, 'small');
      list.slice(top, top + ROWS).forEach((it, i) => {
        const y = LIST_Y + 2 + i * ROW_H, on = top + i === sel;
        if (on && mode === 'list') { ctx.fillStyle = '#fff0b0'; ctx.fillRect(5, y - 1, W - 10, ROW_H); }
        drawText(ctx, it.label, 10, y, it.enabled ? '#383838' : '#a8a8a8', null, 'small');
      });
      if (mode === 'confirm' && pending) ui.drawMessage(ctx, question(pending), null, Math.floor(time * 3) % 2 === 0);
      if (mode === 'slot') ui.drawMessage(ctx, ['넣을 칸을 고르자.', '방향키: 칸 · 확인 · 취소'], null, false);
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
    },
  };
}

function outline(ctx, x, y, w, h) {
  ctx.fillStyle = '#f8a020';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

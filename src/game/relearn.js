// 기술 떠올리기 (편성소): 후보 목록(아래에 설명) → 빈 칸이면 "배울까?" / 꽉 찼으면 잊을 기술 고르기(옛·새 나란히) → 확인
import { MOVES } from '../data/moves.js';
import { SPECIES } from '../data/species.js';
import { josa } from '../data/text.js';
import { relearnCandidates, relearn } from '../core/relearn.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';
import { drawMoveCard } from './moveInfo.js';

const LIST_Y = 24, ROW = 14, ROWS = 6, DETAIL_Y = 120;
const YN = '확인: 예 · 취소: 아니오';

export function createRelearn({ member: m, onSave = () => {}, onClose }) {
  let mode = 'list', sel = 0, top = 0, slot = 0, msg = null, t = 0;
  const cands = () => relearnCandidates(m);
  const name = (id) => MOVES[id].name;
  const picked = () => cands()[sel];
  const enter = (md) => { mode = md; t = 0; };
  const say = (lines) => { msg = lines; enter('msg'); };

  function commit(target) {
    const move = picked(), old = target === null ? null : m.moves[target];
    const r = relearn(m, move, target);
    if (!r.ok) { say(['떠올릴 수 없다.']); return; }
    onSave();
    sel = Math.min(sel, Math.max(0, cands().length - 1)); top = Math.min(top, sel);
    say(old ? [`${josa(name(old), '을/를')} 잊고`, `${josa(name(move), '을/를')} 떠올렸다!`] : [`${josa(SPECIES[m.species].name, '은/는')}`, `${josa(name(move), '을/를')} 떠올렸다!`]);
  }

  return {
    get mode() { return mode; },
    get candidates() { return cands(); },
    get compare() { return mode === 'forget' || mode === 'confirm' ? { old: m.moves[slot], new: picked() } : null; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') {
        if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) { msg = null; mode = 'list'; if (!cands().length) onClose(); }
        return;
      }
      if (mode === 'learn') {
        if (ev.type === 'cancel') mode = 'list';
        else if (pick && t >= CHOICE_LOCK) commit(null);
        return;
      }
      if (mode === 'confirm') {
        if (ev.type === 'cancel') mode = 'forget';
        else if (pick && t >= CHOICE_LOCK) commit(slot);
        return;
      }
      if (mode === 'forget') {
        if (ev.type === 'cancel') { mode = 'list'; return; }
        if (ev.type === 'dir' && ev.dy) slot = (slot + ev.dy + m.moves.length) % m.moves.length;
        if (ev.type === 'click' || ev.type === 'cursor') {
          const k = Math.floor((ev.py - LIST_Y - 4) / ROW);
          if (k < 0 || k >= m.moves.length) return;
          slot = k;
        }
        if (pick) enter('confirm');
        return;
      }
      const list = cands();
      if (ev.type === 'cancel') { onClose(); return; }
      if (!list.length) return;
      if (ev.type === 'dir' && ev.dy) {
        sel = (sel + ev.dy + list.length) % list.length;
        if (sel < top) top = sel;
        if (sel >= top + ROWS) top = sel - ROWS + 1;
      }
      if (ev.type === 'click' || ev.type === 'cursor') {
        const row = Math.floor((ev.py - LIST_Y - 4) / ROW), k = top + row;
        if (row < 0 || row >= ROWS || k >= list.length) return;
        sel = k;
      }
      if (pick) { if (m.moves.length < 4) enter('learn'); else { slot = 0; mode = 'forget'; } }
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      ctx.fillStyle = '#1c2840';
      ctx.fillRect(0, 0, W, H);
      ui.drawWindow(ctx, 2, 2, W - 4, 20);
      drawText(ctx, `${SPECIES[m.species].name} Lv${m.level} · 기술 떠올리기`, 8, 5);
      const back = 'X: 돌아가기';
      drawText(ctx, back, W - 10 - textWidth(back, 'small'), 7, '#7080a0', null, 'small');
      const list = cands(), forgetting = mode === 'forget' || mode === 'confirm';
      ui.drawWindow(ctx, 2, LIST_Y, W - 4, ROWS * ROW + 8);
      const rows = forgetting ? m.moves : list.slice(top, top + ROWS);
      if (!rows.length) drawText(ctx, '떠올릴 기술이 없다.', 14, LIST_Y + 6, '#909090');
      rows.forEach((id, i) => {
        const y = LIST_Y + 5 + i * ROW, on = forgetting ? i === slot : top + i === sel;
        drawText(ctx, name(id), 16, y, '#383838', '#d8d8d0');
        ui.drawTypeBadge(ctx, MOVES[id].type, W - 44, y);
        if (on && Math.floor(time * 3) % 3 !== 2) { ctx.fillStyle = '#e04040'; for (let k = 0; k < 4; k++) ctx.fillRect(7 + k, y + 3 + k, 1, 7 - k * 2); }
      });
      if (!forgetting && top > 0) drawText(ctx, '▲', W / 2 - 4, LIST_Y - 1, '#f8f8f8', '#384868', 'small');
      if (!forgetting && top + ROWS < list.length) drawText(ctx, '▼', W / 2 - 4, LIST_Y + ROWS * ROW + 1, '#f8f8f8', '#384868', 'small');
      if (forgetting) drawText(ctx, '잊을 기술을 고르자', W - 12 - 44 - textWidth('잊을 기술을 고르자', 'small') - 6, LIST_Y + 5 + 4 * ROW + 2, '#c06010', null, 'small');
      ui.drawWindow(ctx, 2, DETAIL_Y, W - 4, H - DETAIL_Y - 2);
      if (forgetting) { // 옛 기술 | 새 기술
        drawMoveCard(ctx, m.moves[slot], 8, DETAIL_Y + 5, 116, { label: '잊는다', labelColor: '#a04040' });
        ctx.fillStyle = '#c8c8c0'; ctx.fillRect(W / 2, DETAIL_Y + 6, 1, H - DETAIL_Y - 14);
        drawMoveCard(ctx, picked(), W / 2 + 6, DETAIL_Y + 5, 116, { label: '떠올린다', labelColor: '#2860c8' });
      } else if (list[sel]) drawMoveCard(ctx, list[sel], 8, DETAIL_Y + 5, W - 18, { maxLines: 4 });
      const blink = Math.floor(time * 3) % 2 === 0;
      if (mode === 'learn') ui.drawMessage(ctx, [`${josa(name(picked()), '을/를')} 떠올려 배울까?`, YN], null, blink);
      if (mode === 'confirm') ui.drawMessage(ctx, [`${josa(name(m.moves[slot]), '을/를')} 잊고 ${josa(name(picked()), '을/를')} 떠올릴까?`, YN], null, blink);
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, blink);
    },
  };
}

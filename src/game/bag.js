// 가방 (마을 X 메뉴에서): 탭 3개 — 도구 · 진화·뽑기 · 메타몽. 도구는 출전 포켓몬에게 바로 지니게·빼게
// 스펙 docs/superpowers/specs/2026-11-17-bag-menu-design.md
import { HELD_ITEMS } from '../data/heldItems.js';
import { SPECIES } from '../data/species.js';
import { josa } from '../data/text.js';
import { STATS, POWDER_KO } from '../core/dittoBuild.js';
import { equip, unequip } from '../core/heldBag.js';
import { deployed } from '../core/roster.js';
import { MAX_LEVEL } from '../core/stats.js';
import { memberKey } from '../core/members.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { joinLevel } from '../core/gacha.js';
import { free } from '../core/freeCost.js';

export const BAG_TABS = ['도구', '진화·뽑기', '메타몽'];
const ROW = 14, LIST_Y = 26, VISIBLE = 9;
const nameOf = (m) => SPECIES[m.species].name;

export function createBag({ game, onSave = () => {}, onBack, onCandy = null, levelCap = Infinity }) {
  let tab = 0, sel = 0, top = 0, mode = 'list', pickFor = null, pickSel = 0, pickPage = 0, msg = null;

  // 지금 탭의 줄: { label, count?, desc, act?, ... }
  function rows() {
    const it = game.items ?? {};
    if (tab === 0) {
      const team = deployed(game);
      const holding = team.filter((m) => m.held).map((m) => ({ label: `${nameOf(m)}: ${HELD_ITEMS[m.held].name}`, desc: '확인: 빼서 가방에 넣기', act: 'unequip', member: m }));
      const bag = Object.entries(it.held ?? {}).filter(([, n]) => n > 0).map(([id, n]) => ({ label: HELD_ITEMS[id].name, count: n, desc: HELD_ITEMS[id].desc, act: 'equip', id }));
      return [...holding, ...bag];
    }
    if (tab === 1) return [
      ...(it.evoStone > 0 ? [{ label: '진화의돌', count: it.evoStone, desc: '박스에서 돌로 진화하는 포켓몬에게 쓴다' }] : []),
      ...(it.rareCandy > 0 ? [{ label: '이상한사탕', count: it.rareCandy, desc: '출전 포켓몬 하나의 레벨이 1 오른다', act: 'candy' }] : []),
      ...(it.suspiciousCandy > 0 ? [{ label: '수상한 사탕', count: it.suspiciousCandy, desc: `동료 하나를 모집 레벨(Lv.${joinLevel(game)})까지`, act: 'suspiciousCandy' }] : []),
      ...(it.tenVoucher > 0 ? [{ label: '10연속 뽑기 바우처', count: it.tenVoucher, desc: '뽑기에서 10연속 뽑기를 한 번 공짜로' }] : []),
    ];
    return [
      ...STATS.filter((s) => (it.powders?.[s] ?? 0) > 0).map((s) => ({ label: POWDER_KO[s], count: it.powders[s], desc: '메타몽 빌드에서 능력치를 올린다' })),
      ...((it.capsules ?? []).length ? [{ label: '메타몽 캡슐', count: it.capsules.length, desc: '메타몽 빌드에서 기술·타입·특성을 바꾼다' }] : []),
    ];
  }
  const clampSel = () => { const n = rows().length; sel = Math.max(0, Math.min(sel, n - 1)); top = Math.max(0, Math.min(top, sel, Math.max(0, n - VISIBLE))); if (sel >= top + VISIBLE) top = sel - VISIBLE + 1; };
  const pickItems = () => {
    if (pickFor === 'suspiciousCandy') {
      const target = Math.min(joinLevel(game), levelCap, MAX_LEVEL);
      const items = game.party.slice(pickPage * 5, pickPage * 5 + 5).map(m => ({
        label: `${nameOf(m)} Lv.${m.level}`, enabled: m.level < target, member: m,
      }));
      if (game.party.length > 5) items.push({ label: '다른 동료 ' + (pickPage + 1) + '/' + Math.ceil(game.party.length / 5), enabled: true, next: true });
      return items;
    }
    return deployed(game).map((m) => ({ label: `${nameOf(m)}${m.held ? ` (${HELD_ITEMS[m.held].name})` : ''}`, enabled: true, member: m }));
  };
  const pickRect = () => ({ x: W / 2 - 60, y: 40 });

  function choose(r) {
    if (!r) return;
    if (r.act === 'unequip') { const name = HELD_ITEMS[r.member.held].name; unequip(game, memberKey(r.member)); onSave(); msg = [`${josa(name, '을/를')} 가방에 넣었다.`]; clampSel(); return; }
    if (['equip', 'candy', 'suspiciousCandy'].includes(r.act)) { pickFor = r.act === 'equip' ? r.id : r.act; pickPage = pickSel = 0; mode = 'pick'; }
  }
  function give(m) {
    const id = pickFor; mode = 'list'; pickFor = null;
    if (id === 'candy' || id === 'suspiciousCandy') {
      const catchUp = id === 'suspiciousCandy';
      if (!m) return;
      const target = Math.min(catchUp ? joinLevel(game) : m.level + 1, levelCap, MAX_LEVEL);
      if (catchUp && m.level >= target) { msg = [`이미 모집 레벨(Lv.${target}) 이상이다.`]; return; }
      if (m.level >= target) { msg = [`${josa(nameOf(m), '은/는')} 지금은`, '더 이상 강해질 수 없다.']; return; }
      const item = catchUp ? id : 'rareCandy';
      if (!onCandy || !(game.items[item] > 0)) return;
      game.items[item] -= free(game, 1);
      onCandy(m, target, id);
      onSave(); clampSel();
      return;
    }
    if (!m || !equip(game, memberKey(m), id)) return;
    onSave(); msg = [`${josa(nameOf(m), '이/가')} ${josa(HELD_ITEMS[id].name, '을/를')} 지녔다.`]; clampSel();
  }

  return {
    get message() { return msg; },
    get tab() { return tab; }, get rows() { return rows(); }, get mode() { return mode; }, get sel() { return sel; },
    handle(ev) {
      if (msg) { if (['confirm', 'cancel', 'click'].includes(ev.type)) msg = null; return; }
      if (mode === 'pick') {
        const items = pickItems();
        if (ev.type === 'cancel') { mode = 'list'; pickFor = null; return; }
        if (ev.type === 'dir' && ev.dy) pickSel = (pickSel + ev.dy + items.length) % items.length;
        const pick = (item) => {
          if (item?.next) { pickPage = (pickPage + 1) % Math.ceil(game.party.length / 5); pickSel = 0; }
          else give(item?.member);
        };
        if (ev.type === 'confirm') pick(items[pickSel]);
        if (ev.type === 'click' && ev.py !== undefined) { const r = pickRect(), k = ui.menuIndexAt(items, r.x, r.y, ev.py); if (k >= 0 && k < items.length && ev.px >= r.x) pick(items[k]); else { mode = 'list'; pickFor = null; } }
        return;
      }
      if (ev.type === 'cancel' || ev.type === 'menu') { onBack(); return; }
      if (ev.type === 'dir' && ev.dx) { tab = (tab + ev.dx + BAG_TABS.length) % BAG_TABS.length; sel = 0; top = 0; return; }
      if (ev.type === 'dir' && ev.dy) { const n = rows().length; if (n) { sel = (sel + ev.dy + n) % n; clampSel(); } return; }
      if (ev.type === 'confirm') { choose(rows()[sel]); return; }
      if (ev.type === 'click' && ev.py !== undefined) {
        if (ev.py < LIST_Y - 2) { const k = Math.floor(ev.px / (W / BAG_TABS.length)); if (k >= 0 && k < BAG_TABS.length) { tab = k; sel = 0; top = 0; } return; }
        const k = top + Math.floor((ev.py - LIST_Y) / ROW), list = rows();
        if (k >= 0 && k < list.length && ev.py < LIST_Y + VISIBLE * ROW) { if (k === sel) choose(list[k]); else sel = k; }
      }
    },
    update() {},
    draw(ctx) {
      ctx.fillStyle = '#20283c'; ctx.fillRect(0, 0, W, H);
      const tw = W / BAG_TABS.length;
      BAG_TABS.forEach((t, i) => { // 탭
        ctx.fillStyle = i === tab ? '#f0e8d0' : '#56607a'; ctx.fillRect(i * tw + 2, 2, tw - 4, 18);
        drawText(ctx, t, i * tw + tw / 2 - textWidth(t, 'small') / 2, 6, i === tab ? '#383838' : '#e0e0e8', null, 'small');
      });
      ui.drawWindow(ctx, 4, LIST_Y - 4, W - 8, VISIBLE * ROW + 8);
      const list = rows();
      if (!list.length) drawText(ctx, '아무것도 없다', 16, LIST_Y + 2, '#909090', null, 'small');
      list.slice(top, top + VISIBLE).forEach((r, i) => {
        const y = LIST_Y + i * ROW, k = top + i;
        if (k === sel && mode === 'list') { ctx.fillStyle = '#f8d878'; ctx.fillRect(8, y, W - 16, ROW - 1); }
        drawText(ctx, r.label, 14, y + 2, r.act === 'unequip' ? '#2860c8' : '#383838', null, 'small');
        if (r.count !== undefined) { const c = `×${r.count}`; drawText(ctx, c, W - 16 - textWidth(c, 'small'), y + 2, '#383838', null, 'small'); }
      });
      if (top > 0) drawText(ctx, '▲', W - 18, LIST_Y - 3, '#808080', null, 'small');
      if (top + VISIBLE < list.length) drawText(ctx, '▼', W - 18, LIST_Y + VISIBLE * ROW - 9, '#808080', null, 'small');
      const desc = mode === 'pick' ? `누구에게 ${pickFor === 'candy' ? '이상한사탕' : pickFor === 'suspiciousCandy' ? '수상한 사탕' : HELD_ITEMS[pickFor].name}?` : list[sel]?.desc ?? '좌우: 탭 · 취소: 닫기';
      ui.drawWindow(ctx, 4, H - 30, W - 8, 26);
      drawText(ctx, desc, 12, H - 24, '#383838', null, 'small');
      if (mode === 'pick') { const r = pickRect(); ui.drawMenu(ctx, pickItems(), pickSel, r.x, r.y); }
      if (msg) ui.drawMessage(ctx, msg, null, true);
    },
  };
}

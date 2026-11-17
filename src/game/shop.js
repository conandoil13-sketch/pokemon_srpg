// 상점 화면 (켈리몬): 진열 8칸 · 가격 · 품절, 확인 → "살까?" → 사기. 스펙 docs/superpowers/specs/2026-11-17-town-shop-design.md
import { HELD_ITEMS } from '../data/heldItems.js';
import { josa } from '../data/text.js';
import { buy } from '../core/shop.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';

const ROW = 15, LIST_Y = 30;

export function createShop({ game, onSave = () => {}, onBack }) {
  let sel = 0, mode = 'list', ask = 0, msg = null;
  const stock = () => game.shop?.stock ?? [];
  const price = (s) => HELD_ITEMS[s.id].price;
  const canBuy = (s) => s && !s.sold && (game.coins ?? 0) >= price(s);
  const ASK = [{ label: '예', enabled: true }, { label: '아니오', enabled: true }];
  const askRect = () => ({ x: W - 70, y: H - 74 });

  function pick() {
    const s = stock()[sel];
    if (!s) return;
    if (s.sold) { msg = ['이미 팔린 물건이에요.']; return; }
    if (!canBuy(s)) { msg = ['코인이 모자라요.', `${price(s)}코인이 필요해요.`]; return; }
    mode = 'confirm'; ask = 0;
  }
  function answer(yes) {
    mode = 'list';
    if (!yes) return;
    const r = buy(game, sel);
    if (!r.ok) return;
    onSave();
    msg = [`${josa(HELD_ITEMS[r.id].name, '을/를')} 샀다!`, '가방에 넣었다.'];
  }

  return {
    get mode() { return mode; }, get sel() { return sel; },
    handle(ev) {
      if (msg) { if (['confirm', 'cancel', 'click'].includes(ev.type)) msg = null; return; }
      if (mode === 'confirm') {
        if (ev.type === 'cancel') { mode = 'list'; return; }
        if (ev.type === 'dir' && ev.dy) ask = (ask + ev.dy + 2) % 2;
        if (ev.type === 'confirm') answer(ask === 0);
        if (ev.type === 'click' && ev.py !== undefined) { const r = askRect(), k = ui.menuIndexAt(ASK, r.x, r.y, ev.py); if (ev.px >= r.x && (k === 0 || k === 1)) answer(k === 0); else mode = 'list'; }
        return;
      }
      if (ev.type === 'cancel' || ev.type === 'menu') { onBack(); return; }
      const n = stock().length;
      if (ev.type === 'dir' && ev.dy && n) sel = (sel + ev.dy + n) % n;
      if (ev.type === 'confirm') pick();
      if (ev.type === 'click' && ev.py !== undefined) { const k = Math.floor((ev.py - LIST_Y) / ROW); if (k >= 0 && k < n) { if (k === sel) pick(); else sel = k; } }
    },
    update() {},
    draw(ctx) {
      ctx.fillStyle = '#2a2438'; ctx.fillRect(0, 0, W, H);
      drawText(ctx, '켈리몬 상점', 8, 6, '#f8e8b0', null);
      const coins = `코인 ${game.coins ?? 0}`;
      drawText(ctx, coins, W - 8 - textWidth(coins, 'small'), 8, '#f8d050', null, 'small');
      ui.drawWindow(ctx, 4, LIST_Y - 4, W - 8, stock().length * ROW + 8);
      stock().forEach((s, i) => {
        const y = LIST_Y + i * ROW, it = HELD_ITEMS[s.id];
        if (i === sel) { ctx.fillStyle = '#f8d878'; ctx.fillRect(8, y, W - 16, ROW - 1); }
        const dim = s.sold || (game.coins ?? 0) < it.price;
        drawText(ctx, it.name, 14, y + 2, dim ? '#a0a0a0' : '#383838', null, 'small');
        const p = s.sold ? '품절' : `${it.price}코인`;
        drawText(ctx, p, W - 16 - textWidth(p, 'small'), y + 2, s.sold ? '#c04040' : dim ? '#a0a0a0' : '#7a5020', null, 'small');
      });
      const s = stock()[sel];
      ui.drawWindow(ctx, 4, H - 32, W - 8, 28);
      drawText(ctx, s ? HELD_ITEMS[s.id].desc : '진열이 비었어요', 12, H - 25, '#383838', null, 'small');
      if (mode === 'confirm' && s) {
        const r = askRect();
        ui.drawWindow(ctx, 8, H - 74, r.x - 14, 36);
        drawText(ctx, `${josa(HELD_ITEMS[s.id].name, '을/를')}`, 14, H - 68, '#383838', null, 'small');
        drawText(ctx, `${HELD_ITEMS[s.id].price}코인에 살까?`, 14, H - 54, '#383838', null, 'small');
        ui.drawMenu(ctx, ASK, ask, r.x, r.y);
      }
      if (msg) ui.drawMessage(ctx, msg, { species: 'kecleon', side: 'ally', emotion: 'Normal' }, true);
    },
  };
}

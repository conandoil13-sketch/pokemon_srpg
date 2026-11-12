// 타이틀 장면: [이어하기 | 처음부터], 저장이 있는데 처음부터를 고르면 확인
import { MAP } from '../data/map.js';
import { drawMap } from '../render/tiles.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';

export function createTitle({ hasSave, onContinue, onNew }) {
  let cursor = 0, confirm = false;
  const items = () => (confirm
    ? [{ label: '예', enabled: true }, { label: '아니요', enabled: true }]
    : [...(hasSave ? [{ label: '이어하기', enabled: true }] : []), { label: '처음부터', enabled: true }]);
  const centered = (ctx, text, y, color, shadow) => drawText(ctx, text, Math.floor((W - textWidth(text)) / 2), y, color, shadow);

  function choose() {
    if (confirm) { if (cursor === 0) onNew(); else { confirm = false; cursor = 1; } return; }
    const label = items()[cursor].label;
    if (label === '이어하기') onContinue();
    else if (hasSave) { confirm = true; cursor = 1; } // 기본값 '아니요'
    else onNew();
  }

  return {
    get confirming() { return confirm; },
    handle(ev) {
      const n = items().length;
      if (ev.type === 'dir' && ev.dy) cursor = (cursor + ev.dy + n) % n;
      else if (ev.type === 'confirm' || ev.type === 'click') choose();
      else if (ev.type === 'cancel' && confirm) { confirm = false; cursor = 1; }
    },
    update() {},
    draw(ctx, time) {
      drawMap(ctx, MAP.tiles, time);
      ctx.fillStyle = 'rgba(16,24,40,0.55)';
      ctx.fillRect(0, 0, W, H);
      ui.drawWindow(ctx, 24, 30, 208, 66);
      ui.bigText(ctx, '포켓몬 택틱스', W / 2, 40, '#304878', '#a8c0e0');
      centered(ctx, '- 신오 대결전 -', 72, '#606878');
      const list = items();
      const r = ui.menuRect(list, 0, 0);
      ui.drawMenu(ctx, list, cursor, Math.round((W - r.w) / 2), confirm ? 98 : 108);
      if (confirm) ui.drawMessage(ctx, ['저장된 기록을 지우고', '처음부터 시작할까?'], null, false);
      else centered(ctx, '비공식 팬 데모', 176, '#c8d0e0', null);
    },
  };
}

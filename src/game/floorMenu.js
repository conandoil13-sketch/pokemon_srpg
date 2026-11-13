// 대사 + 선택지 (층 사이 다음 층/귀환, 재개 확인, 결과 안내). 연타 방지 잠금 후 1회만 선택
import * as ui from '../render/ui.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';

export function createFloorMenu({ lines, options, onPick, initial = 0 }) {
  let cursor = initial, t = 0, done = false;
  const items = options.map((label) => ({ label, enabled: true }));
  const rect = () => { const r = ui.menuRect(items, 0, 0); return { x: W - r.w - 4, y: H - 54 - r.h, ...r }; };
  return {
    handle(ev) {
      if (done) return;
      if (ev.type === 'dir' && ev.dy) cursor = (cursor + ev.dy + items.length) % items.length;
      if (ev.type === 'click') {
        const r = rect();
        if (ev.px < r.x || ev.px >= r.x + r.w || ev.py < r.y || ev.py >= r.y + r.h) return;
        const i = ui.menuIndexAt(items, r.x, r.y, ev.py);
        if (i < 0 || i >= items.length) return;
        cursor = i;
      }
      if ((ev.type === 'confirm' || ev.type === 'click') && t >= CHOICE_LOCK) { done = true; onPick(cursor); }
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      ctx.fillStyle = '#141c30';
      ctx.fillRect(0, 0, W, H);
      ui.drawMessage(ctx, lines, null, false);
      const r = rect();
      ui.drawMenu(ctx, items, cursor, r.x, r.y);
    },
  };
}

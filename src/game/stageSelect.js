// 출격 준비: 스테이지 선택 (잠긴 스테이지는 더미)
import { STAGES } from '../data/stages.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';

const ROW = 18, LIST_X = 8, LIST_Y = 30, LIST_W = 112;

export function createStageSelect({ cleared, onPick, onBack }) {
  let idx = 0;
  const pick = () => { const s = STAGES[idx]; if (s.map) onPick(s); };
  const rowAt = (py) => Math.floor((py - LIST_Y - 4) / ROW);

  return {
    handle(ev) {
      if (ev.type === 'dir' && ev.dy) idx = (idx + ev.dy + STAGES.length) % STAGES.length;
      else if (ev.type === 'confirm') pick();
      else if (ev.type === 'cancel') onBack();
      else if ((ev.type === 'cursor' || ev.type === 'click') && ev.px >= LIST_X && ev.px < LIST_X + LIST_W) {
        const i = rowAt(ev.py);
        if (i >= 0 && i < STAGES.length) { idx = i; if (ev.type === 'click') pick(); }
      }
    },
    update() {},
    draw(ctx, time) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#283858'); g.addColorStop(1, '#101828');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, '출격 준비', 10, 8, '#f8f8f8', '#384868');
      const back = 'X: 마을로';
      drawText(ctx, back, W - 10 - textWidth(back, 'small'), 10, '#a8b8d8', null, 'small');

      ui.drawWindow(ctx, LIST_X, LIST_Y, LIST_W, STAGES.length * ROW + 8);
      STAGES.forEach((s, i) => {
        const y = LIST_Y + 5 + i * ROW;
        const label = `${i + 1}. ${s.map ? s.name : '잠김'}`;
        drawText(ctx, label, LIST_X + 14, y, s.map ? '#383838' : '#a8a8a8', s.map ? '#d8d8d0' : null);
        if (cleared.has(s.id)) drawText(ctx, '★', LIST_X + LIST_W - 18, y, '#e0a000', '#d8d8d0');
        if (i === idx && Math.floor(time * 3) % 3 !== 2) {
          ctx.fillStyle = '#e04040';
          for (let k = 0; k < 4; k++) ctx.fillRect(LIST_X + 5 + k, y + 3 + k, 1, 7 - k * 2);
        }
      });

      const s = STAGES[idx];
      const dx = LIST_X + LIST_W + 6, dw = W - dx - 8;
      ui.drawWindow(ctx, dx, LIST_Y, dw, 96);
      drawText(ctx, s.map ? s.name : '???', dx + 8, LIST_Y + 6);
      drawText(ctx, s.desc, dx + 8, LIST_Y + 24, '#585858', null, 'small');
      if (cleared.has(s.id)) drawText(ctx, '클리어 ★', dx + 8, LIST_Y + 42, '#c08000', null, 'small');
      drawText(ctx, s.map ? 'Z: 출격!' : '잠겨 있다', dx + 8, LIST_Y + 74, s.map ? '#e04040' : '#a8a8a8');
    },
  };
}

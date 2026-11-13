// 던전 선택: (진행 중 탐험 이어하기) + 던전 목록. 잠긴 던전은 해금 조건 표시
import { DUNGEONS, dungeonById } from '../data/dungeons.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';

const ROW = 18, LIST_X = 8, LIST_Y = 30, LIST_W = 120;
const YES_NO = [{ label: '예', enabled: true }, { label: '아니요', enabled: true }];

export function createDungeonSelect({ game, onStart, onResume, onBack }) {
  const run = game.run;
  const items = [
    ...(run ? [{ kind: 'resume', label: `이어하기 B${run.floor}F` }] : []),
    ...DUNGEONS.map((d) => ({ kind: 'dungeon', d, label: d.name, locked: !game.unlocked.includes(d.id) })),
  ];
  let idx = 0, confirm = null, t = 0; // confirm = { id, cursor }

  function pick() {
    const it = items[idx];
    if (it.kind === 'resume') { onResume(); return; }
    if (it.locked) return;
    if (run) { confirm = { id: it.d.id, cursor: 1 }; t = 0; return; } // 기본 '아니요'
    onStart(it.d.id);
  }

  return {
    get confirming() { return !!confirm; },
    handle(ev) {
      const yes = ev.type === 'confirm' || ev.type === 'click';
      if (confirm) {
        if (ev.type === 'dir' && ev.dy) confirm.cursor = 1 - confirm.cursor;
        else if (ev.type === 'cancel') confirm = null;
        else if (yes && t >= CHOICE_LOCK) { if (confirm.cursor === 0) onStart(confirm.id); confirm = null; }
        return;
      }
      if (ev.type === 'dir' && ev.dy) idx = (idx + ev.dy + items.length) % items.length;
      else if (ev.type === 'confirm') pick();
      else if (ev.type === 'cancel') onBack();
      else if ((ev.type === 'cursor' || ev.type === 'click') && ev.px >= LIST_X && ev.px < LIST_X + LIST_W) {
        const i = Math.floor((ev.py - LIST_Y - 4) / ROW);
        if (i >= 0 && i < items.length) { idx = i; if (ev.type === 'click') pick(); }
      }
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#283858'); g.addColorStop(1, '#101828');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, '던전 선택', 10, 8, '#f8f8f8', '#384868');
      const back = 'X: 마을로';
      drawText(ctx, back, W - 10 - textWidth(back, 'small'), 10, '#a8b8d8', null, 'small');

      ui.drawWindow(ctx, LIST_X, LIST_Y, LIST_W, items.length * ROW + 8);
      items.forEach((it, i) => {
        const y = LIST_Y + 5 + i * ROW;
        const dim = it.locked;
        drawText(ctx, it.locked ? '잠김' : it.label, LIST_X + 14, y, dim ? '#a8a8a8' : it.kind === 'resume' ? '#c04040' : '#383838', dim ? null : '#d8d8d0');
        if (it.kind === 'dungeon' && game.cleared.includes(it.d.id)) drawText(ctx, '★', LIST_X + LIST_W - 18, y, '#e0a000', '#d8d8d0');
        if (i === idx && Math.floor(time * 3) % 3 !== 2) {
          ctx.fillStyle = '#e04040';
          for (let k = 0; k < 4; k++) ctx.fillRect(LIST_X + 5 + k, y + 3 + k, 1, 7 - k * 2);
        }
      });

      const it = items[idx];
      const d = it.kind === 'resume' ? dungeonById(run.dungeonId) : it.d;
      const dx = LIST_X + LIST_W + 6, dw = W - dx - 8;
      ui.drawWindow(ctx, dx, LIST_Y, dw, 100);
      drawText(ctx, it.locked ? '???' : d.name, dx + 8, LIST_Y + 6);
      drawText(ctx, `전 ${d.floors}층 · 최고 B${game.best[d.id] ?? 0}F`, dx + 8, LIST_Y + 24, '#585858', null, 'small');
      if (it.kind === 'resume') drawText(ctx, `B${run.floor}F 부터 이어서`, dx + 8, LIST_Y + 40, '#c04040', null, 'small');
      else if (it.locked) drawText(ctx, `${dungeonById(d.unlock).name} 돌파 시 해금`, dx + 8, LIST_Y + 40, '#a8a8a8', null, 'small');
      else if (run) drawText(ctx, '진행 중인 탐험을 포기하고 시작', dx + 8, LIST_Y + 40, '#a07020', null, 'small');
      drawText(ctx, it.locked ? '잠겨 있다' : 'Z: 출발!', dx + 8, LIST_Y + 78, it.locked ? '#a8a8a8' : '#e04040');

      if (confirm) {
        ui.drawMessage(ctx, ['진행 중인 탐험을 포기할까?', '모은 보물은 사라진다.'], null, false);
        const r = ui.menuRect(YES_NO, 0, 0);
        ui.drawMenu(ctx, YES_NO, confirm.cursor, W - r.w - 4, H - 54 - r.h);
      }
    },
  };
}

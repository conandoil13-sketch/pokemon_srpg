// "어느 모습으로 진화할까?" — 갈래 선택 + 예/아니요 확인(기본 아니요). 연타로는 아무것도 확정되지 않는다
import { SPECIES } from '../data/species.js';
import { josa } from '../data/text.js';
import * as ui from '../render/ui.js';
import { drawUnitSprite, DIR } from '../render/sprites.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';

const name = (k) => SPECIES[k].name;

export function createEvolutionChoice({ species, options, onPick }) {
  const items = [...options.map((k) => ({ label: name(k), enabled: true })), { label: '진화하지 않는다', enabled: true }];
  let cursor = items.length - 1; // 기본: 진화하지 않는다
  let confirm = null, t = 0, done = false, clock = 0;
  const YES_NO = [{ label: '예', enabled: true }, { label: '아니요', enabled: true }];

  return {
    handle(ev) {
      if (done) return;
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (confirm) {
        if (ev.type === 'dir' && ev.dy) confirm.cursor = 1 - confirm.cursor;
        else if (ev.type === 'cancel') { confirm = null; t = 0; }
        else if (pick && t >= CHOICE_LOCK) {
          if (confirm.cursor === 0) { done = true; onPick(cursor < options.length ? options[cursor] : null); }
          else { confirm = null; t = 0; }
        }
        return;
      }
      if (ev.type === 'dir' && ev.dy) cursor = (cursor + ev.dy + items.length) % items.length;
      if (pick && t >= CHOICE_LOCK) { confirm = { cursor: 1 }; t = 0; }
    },
    update(dt) { t += dt; clock += dt; },
    draw(ctx, time) {
      ctx.fillStyle = '#18203a';
      ctx.fillRect(0, 0, W, H);
      // 미리보기: 커서가 가리키는 모습 (진화하지 않으면 현재 모습)
      const show = cursor < options.length ? options[cursor] : species;
      ctx.save();
      ctx.translate(W / 2 - 50, 70);
      ctx.scale(2, 2);
      drawUnitSprite(ctx, show, 'Idle', DIR.Down, clock, 0, 0);
      ctx.restore();
      if (confirm) {
        const q = cursor < options.length ? [`${josa(name(options[cursor]), '으로/로')} 진화할까?`] : ['진화하지 않을까?'];
        ui.drawMessage(ctx, q, null, false);
        const r = ui.menuRect(YES_NO, 0, 0);
        ui.drawMenu(ctx, YES_NO, confirm.cursor, W - r.w - 4, H - 54 - r.h);
        return;
      }
      ui.drawMessage(ctx, [`${name(species)}의 모습이 바뀌려 한다!`, '어느 모습으로 진화할까?'], null, false);
      const r = ui.menuRect(items, 0, 0);
      ui.drawMenu(ctx, items, cursor, W - r.w - 4, Math.max(2, H - 54 - r.h));
    },
  };
}

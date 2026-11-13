// 결산 장면: 경험치 바 → 레벨업·기술 습득 메시지(잊을 기술 선택) → onDone(진화 목록)
import { SPECIES } from '../data/species.js';
import { applyExp } from '../core/progress.js';
import { expForLevel, levelForExp, MAX_LEVEL } from '../core/stats.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { createLearnFlow, stepsFromEvents, nameOf, CHOICE_LOCK } from './learnFlow.js';

export { CHOICE_LOCK };
const BAR_TIME = 1.2;

export function createResults({ game, result, log, firstClear, onDone }) {
  const party = game.party;
  const before = party.map((m) => ({ species: m.species, exp: m.exp }));
  const events = applyExp(party, log.exp ?? {});
  const gotStone = result === 'win' && firstClear;
  if (gotStone) game.items.evoStone += 1;
  const evolutions = events.filter((e) => e.type === 'evolve').map((e) => ({ species: e.species, options: e.options }));

  const steps = [...(gotStone ? [{ kind: 'msg', text: ['진화의돌을 얻었다!'] }] : []), ...stepsFromEvents(events)];
  let phase = 'bars', t = 0;
  const flow = createLearnFlow({
    steps,
    member: (e) => party.find((p) => p.species === e.species),
    onFinish: () => { phase = 'done'; onDone(evolutions); },
  });
  const startEvents = () => { if (phase !== 'bars') return; phase = 'events'; flow.start(); };
  const shownExp = (k) => (phase === 'bars' ? before[k].exp + (party[k].exp - before[k].exp) * Math.min(1, t / BAR_TIME) : party[k].exp);

  return {
    get phase() { return phase; },
    get pending() { return phase === 'events' ? flow.pending : null; },
    handle(ev) {
      if (phase === 'bars') { if (ev.type === 'confirm' || ev.type === 'click') startEvents(); return; }
      if (phase === 'events') flow.handle(ev);
    },
    update(dt) {
      t += dt;
      if (phase === 'bars' && t >= BAR_TIME) startEvents();
      else if (phase === 'events') flow.update(dt);
    },
    draw(ctx, time) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2c4070'); g.addColorStop(1, '#141c30');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const TITLE = { win: '승리!', stairs: '층 돌파!', loot: '탐험 보상', lose: '패배...' };
      ui.bigText(ctx, TITLE[result] ?? '결과', W / 2, 4, result === 'lose' ? '#f08080' : '#f8d050', '#202838');
      party.forEach((m, k) => {
        const y = 32 + k * 27;
        ui.drawWindow(ctx, 6, y, W - 12, 25);
        const growth = SPECIES[m.species].growth;
        const exp = shownExp(k);
        const lv = Math.min(levelForExp(growth, exp), MAX_LEVEL);
        drawText(ctx, nameOf(before[k].species), 12, y + 5);
        drawText(ctx, `Lv.${lv}`, 112, y + 5);
        const gained = (log.exp ?? {})[before[k].species];
        if (gained) drawText(ctx, `+${gained}`, W - 14 - textWidth(`+${gained}`, 'small'), y + 3, '#c08000', null, 'small');
        const lo = expForLevel(growth, lv), hi = lv >= MAX_LEVEL ? lo + 1 : expForLevel(growth, lv + 1);
        const r = Math.max(0, Math.min(1, (exp - lo) / (hi - lo)));
        drawText(ctx, 'EXP', 160, y + 3, '#58a0d8', null, 'small');
        ctx.fillStyle = '#404040'; ctx.fillRect(160, y + 15, 82, 4);
        ctx.fillStyle = '#58b8f8'; ctx.fillRect(161, y + 16, Math.round(80 * r), 2);
      });
      if (phase === 'events') flow.draw(ctx, time);
    },
  };
}

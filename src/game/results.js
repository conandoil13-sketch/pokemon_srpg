// 결산 장면: 경험치 바 → 레벨업·기술 습득 메시지(잊을 기술 선택) → onDone(진화 목록)
import { SPECIES } from '../data/species.js';
import { applyExp, abilityOf } from '../core/progress.js';
import { levelCapFor } from '../core/difficulty.js';
import { ABILITIES } from '../data/abilities.js';
import { expForLevel, levelForExp, MAX_LEVEL } from '../core/stats.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { createLearnFlow, stepsFromEvents, nameOf, CHOICE_LOCK } from './learnFlow.js';

export { CHOICE_LOCK };
const BAR_TIME = 1.2;

// members: 결산할 멤버 (기본 = 파티 전체, 탐험에선 출전 멤버). coins: 이번 층에서 얻은 코인 표시
export function createResults({ game, result, log, firstClear, onDone, members = game.party, coins = 0 }) {
  const party = members;
  const before = party.map((m) => ({ species: m.species, exp: m.exp }));
  const cap = levelCapFor(game); // 레벨 상한: 넘친 경험치는 버림
  const events = applyExp(party, log.exp ?? {}, Math.random, cap);
  const cappedSet = new Set(events.filter((e) => e.capped).map((e) => e.species));
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
      const extra = [log.pickup?.length ? `픽업 +${log.pickup.length}` : '', log.capsules?.length ? `캡슐 +${log.capsules.length}` : ''].filter(Boolean).join(' '); // 픽업·메타몽 캡슐
      if (extra) drawText(ctx, extra, 8, 4, '#90d890', null, 'small');
      if (coins) { const c = `코인 +${coins}`; drawText(ctx, c, W - 8 - textWidth(c, 'small'), 4, '#f8d050', null, 'small'); }
      party.forEach((m, k) => {
        const y = 32 + k * 27;
        ui.drawWindow(ctx, 6, y, W - 12, 25);
        const growth = SPECIES[m.species].growth;
        const exp = shownExp(k);
        const lv = Math.min(levelForExp(growth, exp), MAX_LEVEL);
        ui.drawNameWithGender(ctx, m.species, m.gender, 12, y + 5); // 진화했으면 새 이름
        drawText(ctx, `Lv.${lv}`, 112, y + 1);
        const ab = ABILITIES[abilityOf(m)];
        if (ab) drawText(ctx, ab.name, 112, y + 13, '#507050', null, 'small');
        const gained = (log.exp ?? {})[before[k].species];
        if (gained) drawText(ctx, `+${gained}`, W - 14 - textWidth(`+${gained}`, 'small'), y + 3, '#c08000', null, 'small');
        const lo = expForLevel(growth, lv), hi = lv >= MAX_LEVEL ? lo + 1 : expForLevel(growth, lv + 1);
        const r = Math.max(0, Math.min(1, (exp - lo) / (hi - lo)));
        drawText(ctx, cappedSet.has(m.species) || lv >= cap ? '레벨 상한' : 'EXP', 160, y + 3, cappedSet.has(m.species) || lv >= cap ? '#c06010' : '#58a0d8', null, 'small'); // 상한이면 경험치 버림
        ctx.fillStyle = '#404040'; ctx.fillRect(160, y + 15, 82, 4);
        ctx.fillStyle = '#58b8f8'; ctx.fillRect(161, y + 16, Math.round(80 * r), 2);
      });
      if (phase === 'events') flow.draw(ctx, time);
    },
  };
}

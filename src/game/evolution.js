// 진화 연출: "어라…?" → 두 모습이 점점 빠르게 번갈아 깜빡임 → 흰 번쩍임 → 축하 → 새 기술 처리
import { evolveMember } from '../core/progress.js';
import { drawUnitSprite, DIR } from '../render/sprites.js';
import * as ui from '../render/ui.js';
import { W, H } from '../render/screen.js';
import { josa } from '../data/text.js';
import { createLearnFlow, stepsFromEvents, nameOf } from './learnFlow.js';

const MORPH = 2.6, FLASH = 0.35;

export function createEvolution({ member, to, onDone }) {
  const from = member.species;
  let phase = 'intro', t = 0, clock = 0, showNew = false, toggleT = 0, flow = null;

  function startLearn() {
    const events = evolveMember(member, to);
    const steps = [{ kind: 'msg', text: ['축하합니다!', `${josa(nameOf(from), '은/는')} ${josa(nameOf(to), '으로/로')} 진화했다!`] }, ...stepsFromEvents(events)];
    phase = 'learn';
    flow = createLearnFlow({ steps, member: () => member, onFinish: () => { phase = 'done'; onDone(); } });
    flow.start();
  }

  return {
    get phase() { return phase; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (phase === 'intro' && pick && t > 0.3) { phase = 'morph'; t = 0; }
      else if (phase === 'learn') flow.handle(ev);
    },
    update(dt) {
      t += dt; clock += dt;
      if (phase === 'intro' && t > 1.4) { phase = 'morph'; t = 0; }
      else if (phase === 'morph') {
        // 전환 간격 0.32초 → 0.04초로 점점 빨라짐
        toggleT += dt;
        const interval = 0.32 - 0.28 * Math.min(1, t / MORPH);
        if (toggleT >= interval) { toggleT = 0; showNew = !showNew; }
        if (t >= MORPH) { phase = 'flash'; t = 0; }
      } else if (phase === 'flash' && t >= FLASH) startLearn();
      else if (phase === 'learn') flow.update(dt);
    },
    draw(ctx, time) {
      const g = ctx.createRadialGradient(W / 2, 80, 10, W / 2, 80, 160);
      g.addColorStop(0, '#5878b8'); g.addColorStop(1, '#101830');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const species = phase === 'learn' || phase === 'done' ? to : phase === 'morph' && showNew ? to : from;
      ctx.save();
      ctx.translate(W / 2, 84);
      ctx.scale(2, 2);
      if (phase === 'morph') ctx.filter = 'brightness(0) invert(1)'; // 하얀 실루엣
      drawUnitSprite(ctx, species, 'Idle', DIR.Down, clock, 0, 0);
      ctx.restore();
      if (phase === 'flash') {
        ctx.fillStyle = `rgba(255,255,255,${1 - t / FLASH})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (phase === 'intro' || phase === 'morph') ui.drawMessage(ctx, [`어라...? ${nameOf(from)}의 모습이...!`], null, false);
      if (phase === 'learn') flow.draw(ctx, time);
    },
  };
}

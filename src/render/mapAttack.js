// 맵 위 공격 연출 (PMD식). 로직 결과(result)를 재생만 한다.
import { SPECIES } from '../data/species.js';
import { TYPE_COLORS } from '../data/types.js';
import { josa } from '../data/text.js';
import { TILE } from './tiles.js';
import { animTiming, hasPmd, DIR } from './sprites.js';
import { dirFromDelta } from './pmdData.js';
import { drawText, textWidth } from './font.js';
import { drawHpBar, drawMessage } from './ui.js';
import { shade } from './pixels.js';

const AUTO = 1.1;

const label = (u) => (u.side === 'enemy' ? '상대 ' : '') + SPECIES[u.species].name;

export function attackMessages(attacker, defender, move, result) {
  const used = `${label(attacker)}의 ${move.name}!`;
  const d = label(defender);
  const mid = [];
  if (result.typeMult === 0) mid.push(`${d}에게는 효과가 없는 것 같다...`);
  else if (!result.hit) mid.push(`${d}에게는 맞지 않았다!`);
  else {
    if (result.crit) mid.push('급소에 맞았다!');
    if (result.typeMult > 1) mid.push('효과가 굉장했다!');
    else if (result.typeMult < 1) mid.push('효과가 별로인 듯하다...');
  }
  const faint = result.fainted ? `${josa(d, '은/는')} 쓰러졌다!` : null;
  return { used, mid, faint };
}

const center = (u) => ({ x: u.x * TILE + TILE / 2, y: u.y * TILE + TILE / 2 });

export function createMapAttack({ attacker, defender, move, result, hpBefore }) {
  const landed = result.hit && result.typeMult > 0;
  const special = move.category === 'special';
  const animName = special ? 'Shoot' : 'Attack';
  const timing = animTiming(attacker.species, animName);
  const actLen = Math.max(0.4, timing.length);
  const atkDir = dirFromDelta(defender.x - attacker.x, defender.y - attacker.y);
  const defDir = dirFromDelta(attacker.x - defender.x, attacker.y - defender.y);
  const msgs = attackMessages(attacker, defender, move, result);
  const lunge = !special && !hasPmd(attacker.species); // PMD 공격 동작에는 이동이 들어 있다

  const steps = [
    { k: 'act', d: actLen },
    ...(special ? [{ k: 'travel', d: 0.25 }] : []),
    { k: 'impact', d: 0.6 },
    ...msgs.mid.map((text) => ({ k: 'msg', d: AUTO, text, who: defender, emo: 'Pain' })),
    ...(msgs.faint ? [{ k: 'faint', d: 0.6 }, { k: 'msg', d: AUTO, text: msgs.faint, who: defender, emo: 'Pain' }] : []),
  ];
  let i = 0, t = 0, total = 0;
  let text = msgs.used, who = attacker, emo = 'Determined';

  const step = () => steps[i];
  const passed = (k) => steps.slice(0, i).some((s) => s.k === k);

  function shownHp() {
    if (passed('impact')) return defender.hp;
    if (step()?.k === 'impact') return hpBefore + (defender.hp - hpBefore) * Math.min(1, t / 0.45);
    return hpBefore;
  }

  return {
    defender,
    get done() { return i >= steps.length; },
    update(dt) {
      if (i >= steps.length) return;
      t += dt; total += dt;
      if (t >= step().d) {
        t = 0; i++;
        const s = step();
        if (s?.text) { text = s.text; who = s.who; emo = s.emo; }
      }
    },
    advance() { if (step()?.k === 'msg') { t = step().d; } },

    // 유닛 포즈 덮어쓰기 (없으면 null)
    unitPose(u) {
      const s = step();
      if (!s) return null;
      if (u === attacker) {
        if (s.k === 'act') {
          // 임시 도트용 돌진 오프셋 (PMD 시트는 공격 동작 자체에 움직임이 있다)
          const k = Math.sin(Math.PI * Math.min(1, t / actLen));
          const v = { x: Math.sign(defender.x - attacker.x), y: Math.sign(defender.y - attacker.y) };
          return { anim: animName, t, loop: false, dir: atkDir, dx: lunge ? v.x * 5 * k : 0, dy: lunge ? v.y * 5 * k : 0 };
        }
        return { anim: 'Idle', t: total, loop: true, dir: atkDir };
      }
      if (u === defender) {
        if (passed('faint')) return { hidden: true };
        if (s.k === 'faint') return { anim: 'Hurt', t: 0.1, loop: false, dir: defDir, hidden: Math.floor(t / 0.08) % 2 === 0 };
        if (s.k === 'impact' && landed) return { anim: 'Hurt', t, loop: false, dir: defDir, flash: Math.floor(t / 0.06) % 2 === 0 && t < 0.3 };
        return { anim: 'Idle', t: total, loop: true, dir: defDir };
      }
      return null;
    },

    // 월드 좌표 효과 (카메라 translate 된 상태)
    drawWorld(ctx) {
      const s = step();
      if (!s) return;
      const a = center(attacker), d = center(defender);
      const color = TYPE_COLORS[move.type];
      if (s.k === 'travel') {
        const k = t / s.d;
        const x = Math.round(a.x + (d.x - a.x) * k), y = Math.round(a.y - 6 + (d.y - a.y) * k);
        ctx.fillStyle = shade(color, 0.55); ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle = color; ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, 2, 2);
      }
      if (s.k === 'impact' && landed && t < 0.35) {
        const r = 4 + (t / 0.35) * 12;
        for (let n = 0; n < 8; n++) {
          const ang = (n / 8) * Math.PI * 2;
          ctx.fillStyle = n % 2 ? color : '#ffffff';
          ctx.fillRect(Math.round(d.x + Math.cos(ang) * r) - 1, Math.round(d.y - 4 + Math.sin(ang) * r) - 1, 3, 3);
        }
      }
      // 데미지 숫자 / MISS
      if (s.k === 'impact' || (passed('impact') && !passed('faint') && s.k === 'msg')) {
        const age = s.k === 'impact' ? t : 0.6;
        const rise = Math.min(8, age * 20);
        const pop = result.typeMult === 0 ? '효과 없음' : !result.hit ? 'MISS' : `${result.damage}`;
        const col = !landed ? '#d8d8d8' : result.typeMult > 1 ? '#f8d030' : '#ffffff';
        drawText(ctx, pop, Math.round(d.x - textWidth(pop) / 2), Math.round(d.y - 30 - rise), col, '#202020');
        const bw = 22;
        ctx.fillStyle = '#202020';
        ctx.fillRect(Math.round(d.x - bw / 2) - 1, Math.round(d.y + 10), bw + 2, 7);
        drawHpBar(ctx, Math.round(d.x - bw / 2), Math.round(d.y + 11), bw, shownHp(), defender.maxHp);
      }
      // 경험치 (적을 쓰러뜨린 아군 위)
      const exp = result.expGained?.[attacker.species];
      if (exp && (passed('impact') || s.k === 'impact')) {
        const label = `+${exp} EXP`;
        drawText(ctx, label, Math.round(a.x - textWidth(label, 'small') / 2), Math.round(a.y - 32), '#f8d030', '#202020', 'small');
      }
    },

    // 화면 좌표 대사 창
    drawScreen(ctx) {
      const s = step();
      if (!s) return;
      drawMessage(ctx, text, { species: who.species, side: who.side, emotion: emo }, s.k === 'msg' && Math.floor(t * 3) % 2 === 0);
    },
  };
}

export { DIR };

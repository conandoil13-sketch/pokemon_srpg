// 맵 위 공격 연출 (PMD식). 로직 결과(result)를 재생만 한다.
import { SPECIES } from '../data/species.js';
import { TYPE_COLORS } from '../data/types.js';
import { josa } from '../data/text.js';
import { TILE } from './tiles.js';
import { animTiming, hasPmd, DIR } from './sprites.js';
import { dirFromDelta } from './pmdData.js';
import { drawText, textWidth } from './font.js';
import { drawHpBar, drawMessage, drawStatusBadge } from './ui.js';
import { shade } from './pixels.js';
import { STAT_KO } from '../core/stages.js';

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

// 랭크 변화 대사 (changes: applyMove 의 stageChanges, byId: 유닛 찾기 객체/함수)
export function stageMessages(changes, byId) {
  const get = typeof byId === 'function' ? byId : (id) => byId[id];
  return changes.map((c) => {
    const who = label(get(c.unitId)), stat = STAT_KO[c.key];
    if (c.applied === 0) return `${who}의 ${josa(stat, '은/는')} 더 이상 ${c.change > 0 ? '오르지 않는다' : '떨어지지 않는다'}!`;
    const n = Math.abs(c.applied), mag = n >= 3 ? '매우 크게 ' : n === 2 ? '크게 ' : '';
    return `${who}의 ${josa(stat, '이/가')} ${mag}${c.applied > 0 ? '올라갔다' : '떨어졌다'}!`;
  });
}

// 상태이상 대사. isStatusMove: 변화기면 실패도 알리고, 부가효과면 실패는 조용히
const INFLICT = {
  paralysis: '마비되어 기술이 나오기 어려워졌다!', burn: '화상을 입었다!', poison: '독에 걸렸다!', toxic: '맹독에 걸렸다!',
  sleep: '잠들어 버렸다!', freeze: '얼어붙었다!', confusion: '혼란에 빠졌다!',
};
export function statusMessages(changes, byId, isStatusMove) {
  const get = typeof byId === 'function' ? byId : (id) => byId[id];
  return changes.flatMap((c) => {
    const who = label(get(c.unitId));
    if (c.ok) return [`${josa(who, '은/는')} ${INFLICT[c.ailment]}`];
    return isStatusMove ? [`${who}에게는 효과가 없는 것 같다...`] : [];
  });
}

function statusSteps(result, get, isStatusMove) {
  const out = (result.thawed ?? []).map((id) => ({ k: 'msg', d: AUTO, text: wrapMessage(`${label(get(id))}의 얼음이 녹았다!`), who: get(id), emo: 'Normal' }));
  for (const c of result.statusChanges ?? []) {
    const [text] = statusMessages([c], get, isStatusMove);
    if (text) out.push({ k: 'msg', d: AUTO, text: wrapMessage(text), who: get(c.unitId), emo: c.ok ? 'Pain' : 'Normal', pop: c.ok ? c : null, stage: true });
  }
  return out;
}

// 상태 배지 팝업 (월드 좌표)
function drawStatusPop(ctx, c, get) {
  const u = get(c.unitId);
  if (!u) return;
  const p = center(u);
  drawStatusBadge(ctx, c.ailment, Math.max(1, Math.round(p.x - 12)), Math.max(1, Math.round(p.y - 34)));
}

// 대사 창 폭에 맞춰 두 줄로 (단어 단위)
const MSG_W = 190;
export function wrapMessage(text) {
  if (textWidth(text) <= MSG_W) return text;
  const words = text.split(' ');
  for (let k = words.length - 1; k > 0; k--) {
    const a = words.slice(0, k).join(' ');
    if (textWidth(a) <= MSG_W) return [a, words.slice(k).join(' ')];
  }
  return text;
}

const UP = '#e04838', DOWN = '#3868e0';
function drawArrow(ctx, x, y, up, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) ctx.fillRect(x - i, up ? y + i : y + 3 - i, i * 2 + 1, 1);
  ctx.fillRect(x - 1, up ? y + 4 : y - 3, 3, 3);
}

// 대상 위 ▲/▼ + "공격+2" (월드 좌표)
function drawStagePops(ctx, changes, get, age) {
  const rise = Math.min(8, age * 20);
  const per = {};
  for (const c of changes) {
    if (!c.applied) continue;
    const u = get(c.unitId);
    if (!u) continue;
    const n = (per[u.id] = (per[u.id] ?? 0) + 1) - 1;
    const p = center(u);
    const up = c.applied > 0, col = up ? UP : DOWN;
    const txt = `${STAT_KO[c.key]}${up ? '+' : '-'}${Math.abs(c.applied)}`;
    const w = textWidth(txt, 'small') + 7;
    const x = Math.max(1, Math.round(p.x - w / 2)), y = Math.max(1, Math.round(p.y - 30 - rise + n * 10)); // 맵 가장자리에서 잘리지 않게
    drawArrow(ctx, x + 2, y + 2, up, col);
    drawText(ctx, txt, x + 7, y, col, '#f8f8f8', 'small');
  }
}

const center = (u) => ({ x: u.x * TILE + TILE / 2, y: u.y * TILE + TILE / 2 });

export function createMapAttack(opts) {
  if (opts.result.blocked) return createBlockedAnim(opts);
  return opts.result.kind === 'status' ? createStatusAnim(opts) : createAttack(opts);
}

// 마비로 기술 실패 / 혼란 자해. 사용자만 등장
function createBlockedAnim({ attacker, result }) {
  const who = label(attacker);
  const hpBefore = attacker.hp + (result.selfHit?.damage ?? 0);
  const steps = result.blocked === 'paralysis'
    ? [{ k: 'msg', d: AUTO, text: wrapMessage(`${josa(who, '은/는')} 몸이 저려서 움직일 수 없다!`), emo: 'Pain' }]
    : [
      { k: 'msg', d: AUTO, text: wrapMessage(`${josa(who, '은/는')} 혼란스러워 한다!`), emo: 'Normal' },
      { k: 'impact', d: 0.6, text: wrapMessage('영문도 모르고 자신을 공격했다!'), emo: 'Pain' },
      ...(result.selfHit?.fainted ? [{ k: 'faint', d: 0.6 }, { k: 'msg', d: AUTO, text: `${josa(who, '은/는')} 쓰러졌다!`, emo: 'Pain' }] : []),
    ];
  let i = 0, t = 0, total = 0;
  let text = steps[0].text, emo = steps[0].emo;
  const step = () => steps[i];
  const passed = (k) => steps.slice(0, i).some((s) => s.k === k);
  return {
    defender: attacker,
    get done() { return i >= steps.length; },
    update(dt) {
      if (i >= steps.length) return;
      t += dt; total += dt;
      if (t >= step().d) { t = 0; i++; const s = step(); if (s?.text) { text = s.text; emo = s.emo; } }
    },
    advance() { if (step()?.k === 'msg') t = step().d; },
    unitPose(u) {
      const s = step();
      if (!s || u !== attacker) return null;
      if (passed('faint')) return { hidden: true };
      if (s.k === 'faint') return { anim: 'Hurt', t: 0.1, loop: false, hidden: Math.floor(t / 0.08) % 2 === 0 };
      if (s.k === 'impact') return { anim: 'Hurt', t, loop: false, flash: Math.floor(t / 0.06) % 2 === 0 && t < 0.3 };
      return { anim: 'Idle', t: total, loop: true };
    },
    drawWorld(ctx) {
      const s = step();
      if (!s || !result.selfHit || !(s.k === 'impact' || passed('impact')) || passed('faint')) return;
      const p = center(attacker), bw = 22;
      const shown = s.k === 'impact' ? hpBefore - result.selfHit.damage * Math.min(1, t / 0.45) : attacker.hp;
      const pop = `${result.selfHit.damage}`;
      drawText(ctx, pop, Math.round(p.x - textWidth(pop) / 2), Math.round(p.y - 30 - Math.min(8, (s.k === 'impact' ? t : 0.6) * 20)), '#ffffff', '#202020');
      ctx.fillStyle = '#202020';
      ctx.fillRect(Math.round(p.x - bw / 2) - 1, Math.round(p.y + 10), bw + 2, 7);
      drawHpBar(ctx, Math.round(p.x - bw / 2), Math.round(p.y + 11), bw, shown, attacker.maxHp);
    },
    drawScreen(ctx) {
      const s = step();
      if (!s) return;
      drawMessage(ctx, text, { species: attacker.species, side: attacker.side, emotion: emo }, s.k === 'msg' && Math.floor(t * 3) % 2 === 0);
    },
  };
}

function stageSteps(changes, get) {
  if (!changes?.length) return [];
  const msgs = stageMessages(changes, get);
  return [{ k: 'stage', d: 0.5 }, ...changes.map((c, n) => ({ k: 'msg', d: AUTO, text: wrapMessage(msgs[n]), who: get(c.unitId), emo: c.applied > 0 ? 'Determined' : 'Pain', stage: true }))];
}

// 변화기: 짧게 뛰기 → (빗나감) → ▲▼ 팝업 + 대사
function createStatusAnim({ attacker, defender, move, result, lookup }) {
  const get = lookup ?? ((id) => [attacker, defender].find((u) => u?.id === id));
  const target = defender ?? attacker;
  const dir = target === attacker ? null : dirFromDelta(target.x - attacker.x, target.y - attacker.y);
  const missed = (result.missed ?? []).map((id) => ({ k: 'msg', d: AUTO, text: wrapMessage(`${label(get(id))}에게는 맞지 않았다!`), who: get(id), emo: 'Normal' }));
  const nothing = !result.stageChanges.length && !result.statusChanges?.length && !missed.length ? [{ k: 'msg', d: AUTO, text: '그러나 아무 일도 일어나지 않았다!', who: attacker, emo: 'Normal' }] : [];
  const steps = [{ k: 'act', d: 0.45 }, ...missed, ...stageSteps(result.stageChanges, get), ...statusSteps(result, get, true), ...nothing];
  let i = 0, t = 0, total = 0;
  let text = wrapMessage(`${label(attacker)}의 ${move.name}!`), who = attacker, emo = 'Determined';
  const step = () => steps[i];
  const stageAge = () => { const k = steps.findIndex((x) => x.k === 'stage'); return k < 0 || i < k ? null : i === k ? t : 0.6; };
  return {
    defender: target,
    get done() { return i >= steps.length; },
    update(dt) {
      if (i >= steps.length) return;
      t += dt; total += dt;
      if (t >= step().d) { t = 0; i++; const s = step(); if (s?.text) { text = s.text; who = s.who; emo = s.emo; } }
    },
    advance() { if (step()?.k === 'msg') t = step().d; },
    unitPose(u) {
      const s = step();
      if (!s || u !== attacker) return null;
      const hop = s.k === 'act' ? -Math.round(4 * Math.sin(Math.PI * Math.min(1, t / 0.45))) : 0;
      return { anim: 'Idle', t: total, loop: true, dir: dir ?? undefined, dy: hop };
    },
    drawWorld(ctx) {
      const age = stageAge();
      if (age !== null && step()) drawStagePops(ctx, result.stageChanges, get, age);
      if (step()?.pop) drawStatusPop(ctx, step().pop, get);
    },
    drawScreen(ctx) {
      const s = step();
      if (!s) return;
      drawMessage(ctx, text, { species: who.species, side: who.side, emotion: emo }, s.k === 'msg' && Math.floor(t * 3) % 2 === 0);
    },
  };
}

function createAttack({ attacker, defender, move, result, hpBefore, lookup }) {
  const get = lookup ?? ((id) => [attacker, defender].find((u) => u.id === id));
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
    ...stageSteps(result.stageChanges, get),
    ...statusSteps(result, get, false),
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
      if (s.k === 'stage' || (s.stage && !s.pop)) drawStagePops(ctx, result.stageChanges, get, s.k === 'stage' ? t : 0.6);
      if (s.pop) drawStatusPop(ctx, s.pop, get);
      if (s.k === 'impact' || (passed('impact') && !passed('faint') && s.k === 'msg' && !s.stage)) {
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

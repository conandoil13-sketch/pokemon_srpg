// 맵 위 공격 연출 (PMD식). 로직 결과(result)를 재생만 한다.
import { PAL } from '../vendor/pixelfx/core/index.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { TYPE_COLORS } from '../data/types.js';
import { josa } from '../data/text.js';
import { TILE } from './tiles.js';
import { animTiming, hasPmd, DIR } from './sprites.js';
import { dirFromDelta } from './pmdData.js';
import { drawText, textWidth } from './font.js';
import { drawHpBar, drawMessage, drawStatusBadge } from './ui.js';
import { shade } from './pixels.js';
import { STAT_KO } from '../core/stages.js';
import { fxForMove, fxForStage, fxForAilment, fxForEffect, HEAL_FX, drainFx, trapTossFx, TOSS_FLIGHT, TOSS_GAP, pushFx } from '../data/moveFx.js';
import { actorFor, bodyAt } from './fxActor.js';
import { BURST_TIME, drawBurstRing, drawBurstFlash } from './weatherFx.js';
import { idleFrameSource } from './sprites.js';

const AUTO = 1.1;

const label = (u) => (u.side === 'enemy' ? '상대 ' : '') + SPECIES[u.species].name;

// ---- 포켓몬에 붙는 효과 (변화기 묶음 1차) 대사 ----
const W_ = (w, j) => josa(w, j);
const EFFECT_TEXT = {
  protect: (w) => `${W_(w, '은/는')} 방어 태세에 들어갔다!`,
  endure: (w) => `${W_(w, '은/는')} 버티기 태세에 들어갔다!`,
  focusEnergy: (w) => `${W_(w, '은/는')} 기합이 들어갔다!`,
  rest: (w) => `${W_(w, '은/는')} 잠들어 체력을 회복했다!`,
  aquaRing: (w) => `${W_(w, '은/는')} 물의 베일을 둘렀다!`,
  ingrain: (w) => `${W_(w, '은/는')} 뿌리를 내렸다!`,
  curse: (w) => `${w}에게 저주가 걸렸다!`,
  yawn: (w) => `${W_(w, '은/는')} 졸음이 왔다!`,
  leechSeed: (w) => `${w}에게 씨앗을 심었다!`,
  helpingHand: (w) => `${W_(w, '을/를')} 도울 준비가 됐다!`,
  identNormal: (w) => `${w}의 정체를 꿰뚫어 보았다!`,
  identPsychic: (w) => `${w}의 정체를 꿰뚫어 보았다!`,
  taunt: (w) => `${W_(w, '은/는')} 도발에 넘어갔다!`,
  encore: (w) => `${W_(w, '은/는')} 앙코르를 받았다!`,
  disable: (w) => `${w}의 기술이 사슬에 묶였다!`,
  torment: (w) => `${W_(w, '은/는')} 트집을 잡혔다!`,
  healBlock: (w) => `${W_(w, '은/는')} 회복할 수 없게 됐다!`,
  noMove: (w) => `${W_(w, '은/는')} 움직일 수 없게 됐다!`,
  abilityOff: (w) => `${w}의 특성이 효과를 잃었다!`,
  worrySeed: (w) => `${w}의 특성이 불면이 됐다!`,
  bond: (w) => `${W_(w, '은/는')} 상대를 길동무로 삼으려 하고 있다!`,
  // 2차: 오라 · 장판 · 함정 (날씨·밀어내기·흑안개는 아래에서)
  tailwind: () => '순풍이 불기 시작했다!', safeguard: () => '신비의 베일이 주위를 감쌌다!', mist: () => '흰 안개가 주위를 감쌌다!', luckyChant: () => '주술로 급소를 막는다!',
  reflect: () => '리플렉터로 물리 공격에 강해졌다!', lightScreen: () => '빛의장막으로 특수 공격에 강해졌다!', mudSport: () => '전기의 위력이 약해졌다!', waterSport: () => '불꽃의 위력이 약해졌다!',
  spikes: () => '발밑에 압정이 뿌려졌다!', toxicSpikes: () => '발밑에 독압정이 뿌려졌다!',
  haze: () => '모든 랭크 변화가 원래대로 돌아왔다!',
};
// 속박기 걸림 대사: 감는 기술은 "묶였다", 가두는 기술은 "갇혔다"
const COILS = new Set(['bind', 'wrap', 'clamp']);
export const bindLine = (name, moveId) => `${josa(name, '은/는')} ${MOVES[moveId].name}에 ${COILS.has(moveId) ? '묶였다' : '갇혔다'}!`;
// 공격 뒤 덧붙는 대사: 깨뜨리다·고속스핀·점프킥 충돌
export function attackExtraLines(result, attacker) {
  const out = [];
  if (result.screensBroken?.length) out.push({ text: '장벽이 깨졌다!', who: attacker, emo: 'Determined' });
  if (result.spun?.freed) out.push({ text: `${josa(label(attacker), '은/는')} 몸이 자유로워졌다!`, who: attacker, emo: 'Happy' });
  if (result.spun?.cleared) out.push({ text: '압정이 날아갔다!', who: attacker, emo: 'Happy' });
  const HIDE_LINE = { fly: '하늘 높이 날아올랐다!', bounce: '높이 뛰어올랐다!', dig: '땅속으로 파고들었다!', dive: '물속으로 잠수했다!', 'shadow-force': '모습을 감췄다!' };
  if (attacker.burrow && HIDE_LINE[attacker.burrow.moveId]) out.push({ text: `${josa(label(attacker), '은/는')} ${HIDE_LINE[attacker.burrow.moveId]}`, who: attacker, emo: 'Determined' });
  if (result.crash > 0) out.push({ text: `${josa(label(attacker), '은/는')} 땅에 부딪혔다!`, who: attacker, emo: 'Pain' });
  return out;
}
export const TRAP_LINE = { spikes: '압정에 찔렸다!', toxicSpikes: '독압정을 밟았다!', cleared: '독압정을 치웠다!' };
const WEATHER_TEXT = { 'rain-dance': '비가 내리기 시작했다!', 'sunny-day': '햇살이 강해졌다!', sandstorm: '모래바람이 불기 시작했다!', hail: '싸라기눈이 내리기 시작했다!' };
const BLOCK_TEXT = {
  taunt: '도발당해서 변화기를 쓸 수 없다!', encore: '앙코르 때문에 다른 기술을 쓸 수 없다!',
  disable: '그 기술은 사슬묶기로 봉인됐다!', torment: '같은 기술을 연달아 쓸 수 없다!', healBlock: '회복봉인으로 회복할 수 없다!',
};
export const blockedText = (reason) => BLOCK_TEXT[reason] ?? null;
const FAIL_TEXT = '그러나 실패했다!';
// 대사 + 연출 정보 (effect: 몸에 띄울 이펙트)
function effectLines(result, get, moveId = null) {
  const out = [];
  const say = (u, text, effect = null) => { if (u) out.push({ text, who: u, effect }); };
  for (const id of result.protectedIds ?? []) say(get(id), `${W_(label(get(id)), '은/는')} 몸을 지켰다!`, 'protect');
  for (const h of result.hits ?? []) {
    if (h.protected) say(get(h.unitId), `${W_(label(get(h.unitId)), '은/는')} 몸을 지켰다!`, 'protect');
    if (h.endured) say(get(h.unitId), `${W_(label(get(h.unitId)), '은/는')} 공격을 버텼다!`, 'endure');
  }
  let failed = false;
  for (const e of result.effects ?? []) {
    const u = get(e.unitId);
    if (e.ok && e.effect === 'weather') say(u, WEATHER_TEXT[moveId] ?? '날씨가 바뀌었다!', 'weather');
    else if (e.ok && e.effect === 'push') say(u, `${W_(label(u), '은/는')} 날려가 버렸다!`, null);
    else if (e.ok && EFFECT_TEXT[e.effect]) say(u, EFFECT_TEXT[e.effect](label(u)), e.effect);
    else if (!e.ok && e.effect === 'push' && (e.reason === 'stuck' || e.reason === 'immune')) say(u, `${W_(label(u), '은/는')} 꿈쩍도 하지 않았다!`);
    else if (!e.ok && e.reason === 'safeguard') say(u, `${W_(label(u), '은/는')} 신비의 베일이 지켜 주고 있다!`);
    else if (!e.ok && !failed) { failed = true; say(u, FAIL_TEXT); }
  }
  for (const e of result.trapEvents ?? []) { // 밀려나며 밟은 압정
    const u = get(e.unitId);
    if (!u) continue;
    say(u, `${W_(label(u), '은/는')} ${TRAP_LINE[e.kind]}`);
    if (e.fainted) out.push({ text: `${W_(label(u), '은/는')} 쓰러졌다!`, who: u, effect: null, pushFaint: true });
  }
  for (const b of result.unbound ?? []) { const u = get(b.unitId); if (u) say(u, `${W_(label(u), '은/는')} ${MOVES[b.moveId].name}에서 풀려났다!`); } // 밀어내기로 속박이 풀림
  if (result.selfFainted) { const u = get(result.selfFainted); if (u) out.push({ text: `${W_(label(u), '은/는')} 쓰러졌다!`, who: u, effect: null, selfFaint: true }); } // 고스트 저주
  return out;
}
export const effectMessages = (result, get, moveId = null) => effectLines(result, get, moveId).map((l) => l.text);
const effectSteps = (result, get, moveId = null) => effectLines(result, get, moveId).map((l) => ({ k: 'msg', d: AUTO, text: wrapMessage(l.text), who: l.who, emo: l.text === FAIL_TEXT || l.selfFaint ? (l.selfFaint ? 'Pain' : 'Normal') : 'Determined', efx: l.effect ? { effect: l.effect, unitId: l.who.id, moveId } : null, selfFaint: !!l.selfFaint, pushFaint: !!l.pushFaint }));
const spawnEffectFx = (fx, s, get) => { if (s?.efx) { const u = get(s.efx.unitId); if (u) onBody(fx, fxForEffect(s.efx.effect, s.efx.moveId), u); } };

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
  sleep: '잠들어 버렸다!', freeze: '얼어붙었다!', confusion: '혼란에 빠졌다!', infatuation: '헤롱헤롱해졌다!',
};
export function statusMessages(changes, byId, isStatusMove) {
  const get = typeof byId === 'function' ? byId : (id) => byId[id];
  return changes.flatMap((c) => {
    const who = label(get(c.unitId));
    if (c.ok) return [`${josa(who, '은/는')} ${INFLICT[c.ailment]}`];
    if (c.reason === 'safeguard') return [`${josa(who, '은/는')} 신비의 베일이 지켜 주고 있다!`];
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

// ---- pixelfx 연결 ----
const feet = (u) => ({ x: u.x * TILE + TILE / 2, y: u.y * TILE + TILE - 4 });
const dirName = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
const TOSSED = new Set(['spikes', 'toxicSpikes']);
// 이펙트 하나가 실패해도 연출은 계속 (실패하면 null → 예전 그림으로)
function spawnSafe(fx, spec, at, opts) {
  if (!fx || !spec) return null;
  try { return fx.spawn(spec, at, opts); } catch { return null; }
}
// 몸에 붙는 이펙트: 우리 스프라이트 모양 actor 와 그 원점
function onBody(fx, spec, u) {
  const actor = actorFor(u.species, idleFrameSource(u.species));
  return spawnSafe(fx, spec, bodyAt(actor, u.x * TILE + TILE / 2, u.y * TILE + TILE / 2), { actor });
}
// 랭크·상태이상 걸림 (세 연출 공통): 단계에 들어갈 때 한 번
function spawnChangeFx(fx, s, result, get) {
  if (s.k === 'stage') for (const c of result.stageChanges ?? []) { const u = get(c.unitId); if (u && c.applied) onBody(fx, fxForStage(c.applied), u); }
  if (s.pop) { const u = get(s.pop.unitId); if (u) onBody(fx, fxForAilment(s.pop.ailment).inflict, u); }
}
// 직선 빔: 이펙트의 손 위치(15, -24)가 사용자 중심에 오도록 원점을 방향별로 옮긴다
const BEAM_HAND = { right: [15, -24], left: [-15, -24], up: [-24, -15], down: [24, 15] };

export function createMapAttack(opts) {
  if (opts.result.charged) return createBlockedAnim({ ...opts, result: { ...opts.result, blocked: 'charged' } }); // 준비 기술: 모으기 대사만
  if (opts.result.blocked) return createBlockedAnim(opts);
  return opts.result.kind === 'status' ? createStatusAnim(opts) : createAttack(opts);
}

// 마비로 기술 실패 / 혼란 자해. 사용자만 등장
function createBlockedAnim({ attacker, result, fx }) {
  const who = label(attacker);
  const hpBefore = attacker.hp + (result.selfHit?.damage ?? 0);
  const steps = result.blocked === 'paralysis'
    ? [{ k: 'msg', d: AUTO, text: wrapMessage(`${josa(who, '은/는')} 몸이 저려서 움직일 수 없다!`), emo: 'Pain' }]
    : result.blocked === 'infatuation'
    ? [{ k: 'msg', d: AUTO, text: wrapMessage(`${josa(who, '은/는')} 헤롱헤롱해서 기술을 쓸 수 없었다!`), emo: 'Normal' }]
    : result.blocked === 'sealed'
    ? [{ k: 'msg', d: AUTO, text: wrapMessage(`${josa(who, '은/는')} 풀이 죽어 기술을 쓸 수 없다!`), emo: 'Pain' }]
    : result.blocked === 'charged'
    ? [{ k: 'msg', d: AUTO, text: wrapMessage(`${josa(who, '은/는')} ${result.charged.moveId === 'solar-beam' ? '빛을' : '힘을'} 모으고 있다!`), emo: 'Determined' },
      ...(result.stageChanges?.length ? [{ k: 'msg', d: AUTO, text: wrapMessage(`${who}의 방어가 올라갔다!`), emo: 'Determined' }] : [])]
    : result.blocked === 'damp'
    ? [{ k: 'msg', d: AUTO, text: wrapMessage('습기 때문에 폭발할 수 없다!'), emo: 'Normal' }]
    : BLOCK_TEXT[result.blocked]
    ? [{ k: 'msg', d: AUTO, text: wrapMessage(BLOCK_TEXT[result.blocked]), emo: 'Normal' }] // 도발·앙코르 …
    : [
      { k: 'msg', d: AUTO, text: wrapMessage(`${josa(who, '은/는')} 혼란스러워 한다!`), emo: 'Normal' },
      { k: 'impact', d: 0.6, text: wrapMessage('영문도 모르고 자신을 공격했다!'), emo: 'Pain' },
      ...(result.selfHit?.fainted ? [{ k: 'faint', d: 0.6 }, { k: 'msg', d: AUTO, text: `${josa(who, '은/는')} 쓰러졌다!`, emo: 'Pain' }] : []),
    ];
  let i = 0, t = 0, total = 0;
  let text = steps[0].text, emo = steps[0].emo;
  const step = () => steps[i];
  const passed = (k) => steps.slice(0, i).some((s) => s.k === k);
  const enter = (s) => { if (s?.k === 'impact') spawnSafe(fx, { id: 'impacts/hit-spark', opts: {}, timeScale: 1, layer: 'front' }, feet(attacker)); };
  return {
    defender: attacker,
    get done() { return i >= steps.length; },
    update(dt) {
      if (i >= steps.length) return;
      t += dt; total += dt;
      if (t >= step().d) { t = 0; i++; const s = step(); enter(s); if (s?.text) { text = s.text; emo = s.emo; } }
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
function createStatusAnim({ attacker, defender, move, result, lookup, fx }) {
  const get = lookup ?? ((id) => [attacker, defender].find((u) => u?.id === id));
  const target = defender ?? attacker;
  const dir = target === attacker ? null : dirFromDelta(target.x - attacker.x, target.y - attacker.y);
  const missed = (result.missed ?? []).map((id) => ({ k: 'msg', d: AUTO, text: wrapMessage(`${label(get(id))}에게는 맞지 않았다!`), who: get(id), emo: 'Normal' }));
  const healed = result.healed ? [{ k: 'msg', d: AUTO, text: wrapMessage(`${josa(label(attacker), '은/는')} 체력을 회복했다!`), who: attacker, emo: 'Happy', heal: true }]
    : result.healFailed ? [{ k: 'msg', d: AUTO, text: wrapMessage(result.healFailed === 'full' ? '그러나 HP 가 가득 차 있다!' : '이번 층에서는 더 쓸 수 없다!'), who: attacker, emo: 'Normal' }] : [];
  const wx = (result.effects ?? []).find((e) => e.effect === 'weather' && e.ok); // 날씨 부르기 성공: 모으기 → 펑 → 날씨
  const efx = effectSteps(result, get, move.id).map((s) => (wx && s.efx?.effect === 'weather' ? { ...s, efx: null } : s));
  const weatherSteps = wx ? [{ k: 'wcharge', d: 0.6 }, { k: 'wburst', d: BURST_TIME }] : [];
  const push = result.pushed ? [{ k: 'push', d: 0.3 }] : []; // 밀려나며 미끄러짐
  const nothing = !healed.length && !efx.length && !result.stageChanges.length && !result.statusChanges?.length && !missed.length ? [{ k: 'msg', d: AUTO, text: '그러나 아무 일도 일어나지 않았다!', who: attacker, emo: 'Normal' }] : [];
  const steps = [{ k: 'act', d: 0.45 }, ...weatherSteps, ...push, ...healed, ...missed, ...efx, ...stageSteps(result.stageChanges, get), ...statusSteps(result, get, true), ...nothing];
  let i = 0, t = 0, total = 0;
  let text = wrapMessage(`${label(attacker)}의 ${move.name}!`), who = attacker, emo = 'Determined';
  const step = () => steps[i];
  const stageAge = () => { const k = steps.findIndex((x) => x.k === 'stage'); return k < 0 || i < k ? null : i === k ? t : 0.6; };
  const enter = (s) => {
    if (!s) return;
    if (s.heal) onBody(fx, HEAL_FX, attacker); // 회복: 초록 반짝임
    if (s.k === 'wcharge') onBody(fx, fxForEffect('weather', move.id), attacker); // 날씨: 손끝에 모으기
    if (TOSSED.has(s.efx?.effect) && tossAt === null) { // 압정: 깔린 칸마다 하나씩 던짐
      tossAt = total;
      const from = feet(attacker);
      laid.forEach((p, k) => { const at = { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE - 4 }; spawnSafe(fx, trapTossFx(s.efx.effect, from.x - at.x, from.y - at.y), at, { delay: TOSS_GAP * k }); });
      spawnChangeFx(fx, s, result, get);
      return;
    }
    spawnChangeFx(fx, s, result, get); spawnEffectFx(fx, s, get);
  };
  if (move.effect === 'push') { // 울부짖기·날려버리기: 대상(밀렸으면 원래 칸) 쪽으로 바로
    const to = result.pushed?.from ?? (defender && defender !== attacker ? defender : null);
    if (to) spawnSafe(fx, pushFx(move.id, Math.max(Math.abs(to.x - attacker.x), Math.abs(to.y - attacker.y))), // 대각선: 큰 축 거리 (그 축 방향으로 불어 대상과 나란히)
       feet(attacker), { dir: dirName(to.x - attacker.x, to.y - attacker.y) });
  }
  const laid = result.trapsLaid ?? [];
  let tossAt = null; // 던지기 시작 시각 (total 기준)
  const burstAt = steps.findIndex((x) => x.k === 'wburst');
  const TOSS_HOLD = 0.25; // 마지막 압정이 떨어진 뒤 잠깐 (적 압정도 보이게)
  const tossing = () => tossAt !== null && total - tossAt < TOSS_GAP * (laid.length - 1) + TOSS_FLIGHT + TOSS_HOLD;
  const live = () => i < steps.length || tossing(); // 대사를 넘겨도 압정이 다 떨어질 때까지
  return {
    defender: target,
    get done() { return !live(); },
    update(dt) {
      if (!live()) return;
      total += dt;
      if (i >= steps.length) return;
      t += dt;
      if (t >= step().d) { t = 0; i++; const s = step(); enter(s); if (s?.text) { text = s.text; who = s.who; emo = s.emo; } }
    },
    advance() { if (step()?.k === 'msg') t = step().d; },
    get trapsShown() { return live() ? laid : []; }, // 적이 깐 압정도 까는 동안은 보인다
    get trapsHidden() { // 던진 압정이 아직 안 떨어진 칸
      if (!laid.length || !live()) return [];
      if (tossAt === null) return laid;
      return laid.filter((_, k) => total - tossAt < TOSS_GAP * k + TOSS_FLIGHT);
    },
    get weatherShown() { return !wx || i >= steps.length ? undefined : i < burstAt ? wx.from : wx.to; }, // 펑 전엔 이전 날씨
    unitPose(u) {
      const s = step();
      if (!s) return null;
      if (result.pushed && u.id === result.pushed.unitId) { // 밀려난 포켓몬: 원래 칸 → 새 칸
        const pi = steps.findIndex((x) => x.k === 'push'), { from, to } = result.pushed;
        const k = i < pi ? 0 : i === pi ? Math.min(1, t / 0.3) : 1;
        if (steps.slice(0, i + 1).some((x) => x.pushFaint)) return { hidden: true }; // 압정에 쓰러짐
        if (k >= 1) return null;
        return { anim: 'Hurt', t, loop: false, dx: (from.x - to.x) * TILE * (1 - k), dy: (from.y - to.y) * TILE * (1 - k) };
      }
      if (u !== attacker) return null;
      if (steps.slice(0, i + 1).some((x) => x.selfFaint)) return { hidden: true }; // 저주로 쓰러짐
      const hop = s.k === 'act' ? -Math.round(4 * Math.sin(Math.PI * Math.min(1, t / 0.45))) : 0;
      return { anim: 'Idle', t: total, loop: true, dir: dir ?? undefined, dy: hop };
    },
    drawWorld(ctx) {
      const age = stageAge();
      if (age !== null && step()) drawStagePops(ctx, result.stageChanges, get, age);
      if (step()?.pop) drawStatusPop(ctx, step().pop, get);
      if (step()?.k === 'wburst') { const c = center(attacker); drawBurstRing(ctx, wx.to, t / BURST_TIME, c.x, c.y); }
    },
    drawScreen(ctx) {
      const s = step();
      if (!s) return;
      if (s.k === 'wburst') drawBurstFlash(ctx, wx.to, t / BURST_TIME);
      drawMessage(ctx, text, { species: who.species, side: who.side, emotion: emo }, s.k === 'msg' && Math.floor(t * 3) % 2 === 0);
    },
  };
}

// 공격기 (단일·범위 공통). defenders: 맞기 전 대상들, aim: 조준 (탄 끝점 계산용)
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function createAttack({ attacker, defender, defenders: ds, move, result, hpBefore, lookup, aim, endPt: givenEnd, fx }) {
  const defenders = ds ?? (defender ? [defender] : []);
  const hits = result.hits ?? (defender ? [{ unitId: defender.id, ...result, hpBefore }] : []);
  // 연속 공격: 같은 대상의 타를 합쳐서 (데미지 합 · 급소는 하나라도 · 기절은 마지막 타)
  const hitOf = (u) => {
    const mine = hits.filter((h) => h.unitId === u.id);
    if (mine.length <= 1) return mine[0];
    return { ...mine[0], damage: mine.reduce((t, h) => t + h.damage, 0), crit: mine.some((h) => h.crit), fainted: mine.at(-1).fainted, strikes: mine.length };
  };
  const get = lookup ?? ((id) => [attacker, ...defenders].find((u) => u.id === id));
  const special = move.category === 'special';
  const animName = special ? 'Shoot' : 'Attack';
  const actLen = Math.max(0.4, animTiming(attacker.species, animName).length);
  // 사용자가 바라볼 곳: 방향 조준이면 그 방향, 아니면 첫 대상(없으면 착탄 칸)
  const focusPt = aim?.dir ? { x: attacker.x + VEC[aim.dir][0], y: attacker.y + VEC[aim.dir][1] }
    : defenders[0] ? { x: defenders[0].x, y: defenders[0].y } : aim?.x !== undefined ? aim : { x: attacker.x + 1, y: attacker.y };
  const atkDir = dirFromDelta(focusPt.x - attacker.x, focusPt.y - attacker.y);
  const defDir = (d) => dirFromDelta(attacker.x - d.x, attacker.y - d.y);
  // 탄 끝점: 단일·착탄은 대상/착탄 칸, 직선은 끝 칸, 부채꼴·주변은 탄 없음
  const shapeType = move.shape?.type ?? 'single';
  const endPt = givenEnd ?? (shapeType === 'line' ? { x: attacker.x + VEC[aim.dir][0] * (move.shape.length ?? 3), y: attacker.y + VEC[aim.dir][1] * (move.shape.length ?? 3) }
    : shapeType === 'blast' ? aim : shapeType === 'single' ? defenders[0] : null);
  const travel = special && endPt && (shapeType !== 'single' || defenders[0]);
  const lunge = !special && !hasPmd(attacker.species);
  const many = defenders.length >= 2;

  const mid = [], faints = [];
  for (const d of defenders) {
    const h = hitOf(d); if (!h) continue;
    const name = label(d);
    if (h.protected) { mid.push({ text: `${josa(name, '은/는')} 몸을 지켰다!`, who: d, effect: 'protect' }); continue; } // 방어
    if (h.failed) mid.push({ text: '그러나 실패하고 말았다!', who: d }); // 꿈먹기: 깨어 있음
    else if (h.typeMult === 0) mid.push({ text: `${name}에게는 효과가 없는 것 같다...`, who: d });
    else if (!h.hit) mid.push({ text: `${name}에게는 맞지 않았다!`, who: d });
    else {
      if (h.crit) mid.push({ text: many ? `${name}의 급소에 맞았다!` : '급소에 맞았다!', who: d });
      if (h.typeMult > 1) mid.push({ text: many ? `${name}에게 효과가 굉장했다!` : '효과가 굉장했다!', who: d });
      else if (h.typeMult < 1) mid.push({ text: many ? `${name}에게는 효과가 별로인 듯하다...` : '효과가 별로인 듯하다...', who: d });
    }
    if (h.strikes > 1) mid.push({ text: `${h.strikes}번 맞았다!`, who: d }); // 연속 공격
    if (hits.some((x) => x.unitId === d.id && x.endured)) mid.push({ text: `${josa(name, '은/는')} 공격을 버텼다!`, who: d, effect: 'endure' }); // 버티기
    if (h.fainted) faints.push({ text: `${josa(name, '은/는')} 쓰러졌다!`, who: d });
  }
  // 흡수·반동·풀죽음 대사
  const after = [];
  if (result.drained > 0) after.push({ text: `${josa(label(attacker), '은/는')} 체력을 흡수했다!`, who: attacker, emo: 'Happy', drain: true });
  if (result.drained < 0) after.push({ text: `${josa(label(attacker), '은/는')} 해감액을 흡수해 데미지를 입었다!`, who: attacker, emo: 'Pain' });
  after.push(...attackExtraLines(result, attacker));
  if (result.recoil > 0) after.push({ text: `${josa(label(attacker), '은/는')} 반동으로 데미지를 입었다!`, who: attacker, emo: 'Pain' });
  for (const id of result.flinched ?? []) { const u = get(id); if (u) after.push({ text: `${josa(label(u), '은/는')} 풀이 죽었다!`, who: u, emo: 'Pain' }); }
  for (const b of result.bound ?? []) { const u = get(b.unitId); if (u) after.push({ text: bindLine(label(u), b.moveId), who: u, emo: 'Pain', effect: 'bind', moveId: b.moveId }); }
  const bonded = result.bond?.includes(attacker.id) ? defenders.find((d) => hitOf(d)?.fainted) : null; // 길동무로 같이 쓰러짐
  if (bonded) after.push({ text: `${josa(label(bonded), '은/는')} 상대를 길동무로 삼았다!`, who: bonded, emo: 'Pain', effect: 'bond' });
  const steps = [
    { k: 'act', d: actLen },
    ...(travel ? [{ k: 'travel', d: 0.25 }] : []),
    { k: 'impact', d: result.selfKO ? 1.2 : 0.6 },
    ...mid.map((m) => ({ k: 'msg', d: AUTO, text: wrapMessage(m.text), who: m.who, emo: 'Pain', efx: m.effect ? { effect: m.effect, unitId: m.who.id } : null })),
    ...(faints.length ? [{ k: 'faint', d: 0.6 }, ...faints.map((m) => ({ k: 'msg', d: AUTO, text: m.text, who: m.who, emo: 'Pain' }))] : []),
    ...stageSteps(result.stageChanges, get),
    ...statusSteps(result, get, false),
    ...after.map((m) => ({ k: 'msg', d: AUTO, text: wrapMessage(m.text), who: m.who, emo: m.emo, drain: m.drain, efx: m.effect ? { effect: m.effect, unitId: m.who.id, moveId: m.moveId ?? null } : null })),
    ...(result.selfKO || bonded || ((result.recoil > 0 || result.drained < 0 || result.crash > 0) && attacker.hp === 0) ? [{ k: 'selffaint', d: 0.6 }, { k: 'msg', d: AUTO, text: `${josa(label(attacker), '은/는')} 쓰러졌다!`, who: attacker, emo: 'Pain' }] : []), // 자폭·반동·해감액
  ];
  let i = 0, t = 0, total = 0;
  let text = wrapMessage(`${label(attacker)}의 ${move.name}!`), who = attacker, emo = 'Determined';
  const step = () => steps[i];
  const passed = (k) => steps.slice(0, i).some((x) => x.k === k);

  // pixelfx: 단계에 들어갈 때 한 번씩
  const dist0 = defenders[0] ? Math.abs(defenders[0].x - attacker.x) + Math.abs(defenders[0].y - attacker.y) : 1;
  const spec = fx ? fxForMove(move, { distance: dist0 }) : null;
  const dir = dirName(focusPt.x - attacker.x, focusPt.y - attacker.y);
  let shot = null, fallbackHit = !spec, fallbackShot = !spec, shakeT = 0;
  function enter(s) {
    spawnEffectFx(fx, s, get); // 방어·버티기·길동무
    if (!s || !spec) return;
    if (s.k === 'act' && spec.cast) spawnSafe(fx, spec.cast, feet(attacker), { dir });
    if (s.drain) { // 흡수: 대상에서 구슬이 날아오고, 도착하면 회복 표시
      const src = defenders[0] ?? attacker;
      spawnSafe(fx, drainFx((src.x - attacker.x) * TILE, (src.y - attacker.y) * TILE), feet(attacker));
      const actor = actorFor(attacker.species, idleFrameSource(attacker.species));
      spawnSafe(fx, HEAL_FX, bodyAt(actor, attacker.x * TILE + TILE / 2, attacker.y * TILE + TILE / 2), { actor, delay: 0.5 });
    }
    if (s.k === 'travel' && spec.travel) {
      if (spec.travel.clip) {
        const len = (Math.abs(endPt.x - attacker.x) + Math.abs(endPt.y - attacker.y)) * TILE + TILE / 2;
        const [hx, hy] = BEAM_HAND[dir], c = center(attacker);
        fallbackShot = !spawnSafe(fx, spec.travel, { x: c.x - hx, y: c.y - hy }, { dir, clipTo: len + 15 }); // 손 위치만큼 더
      } else {
        shot = spawnSafe(fx, spec.travel, feet(attacker), { dir });
        fallbackShot = !shot;
      }
    }
    if (s.k === 'impact') {
      if (shot) { try { shot.fx.stop(); } catch { /* 무시 */ } }
      if (spec.burst && aim?.x !== undefined) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) spawnSafe(fx, spec.burst, feet({ x: aim.x + dx, y: aim.y + dy }), { delay: dx || dy ? 0.06 : 0 }); // 착탄 십자
      if (spec.selfKO) { spawnSafe(fx, spec.selfKO, feet(attacker)); shakeT = 0.4; }
      let ok = true;
      for (const d of defenders) {
        const h = hitOf(d);
        if (!h || !h.hit || h.typeMult === 0 || !spec.hit) continue;
        const strong = h.typeMult > 1;
        const base = strong ? { ...spec.hit, opts: { ...spec.hit.opts, light: 1.5 } } : spec.hit;
        ok = !!spawnSafe(fx, base, feet(d), { dir }) && ok;
        // 효과 굉장: 한 겹 더 (이빨·발·별 같은 모양 이펙트는 두 번 나오면 어색해서 반짝임으로)
        if (strong) spawnSafe(fx, spec.hit.noEcho ? { id: 'impacts/hit-spark', opts: { palette: spec.hit.opts.palette, light: 1.5, seed: 99 }, timeScale: 1, layer: 'front' } : { ...base, opts: { ...base.opts, seed: 99 } }, feet(d), { dir, delay: 0.08 });
        if (spec.hit2) spawnSafe(fx, spec.hit2, feet(d), { dir, delay: 0.05 }); // 강한 기술: 충격 한 겹 더
        if (h.crit && spec.hit.id !== 'impacts/crit-hit') spawnSafe(fx, { id: 'impacts/crit-hit', opts: {}, timeScale: 1.5, layer: 'front' }, feet(d), { dir }); // 펀치는 이미 별 강타
      }
      fallbackHit = !ok;
    }
    spawnChangeFx(fx, s, result, get);
  }

  function shownHp(d) {
    const h = hitOf(d), before = h?.hpBefore ?? d.hp;
    if (passed('impact')) return d.hp;
    if (step()?.k === 'impact') return before + (d.hp - before) * Math.min(1, t / 0.45);
    return before;
  }

  enter(steps[0]);
  return {
    defender: defenders[0] ?? null,
    extraUnits: [attacker, ...defenders], // 기절해 목록에서 빠져도 연출 동안 그린다
    get done() { return i >= steps.length; },
    get shake() { return shakeT > 0 ? (Math.floor(shakeT * 30) % 2 ? 2 : -2) : 0; },
    update(dt) {
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      if (shot && step()?.k === 'travel') { const a = feet(attacker), e = feet(endPt), k = Math.min(1, t / step().d); shot.fx.options.x = a.x + (e.x - a.x) * k; shot.fx.options.y = a.y - 6 + (e.y - a.y) * k; }
      if (i >= steps.length) return;
      t += dt; total += dt;
      if (t >= step().d) { t = 0; i++; const s = step(); enter(s); if (s?.text) { text = s.text; who = s.who; emo = s.emo; } }
    },
    advance() { if (step()?.k === 'msg') t = step().d; },

    unitPose(u) {
      const s = step();
      if (!s) return null;
      if (u === attacker) {
        if (passed('selffaint')) return { hidden: true };
        if (s.k === 'selffaint') return { anim: 'Hurt', t: 0.1, loop: false, dir: atkDir, hidden: Math.floor(t / 0.08) % 2 === 0 };
        if (s.k === 'act') {
          const k = Math.sin(Math.PI * Math.min(1, t / actLen));
          const v = { x: Math.sign(focusPt.x - attacker.x), y: Math.sign(focusPt.y - attacker.y) };
          return { anim: animName, t, loop: false, dir: atkDir, dx: lunge ? v.x * 5 * k : 0, dy: lunge ? v.y * 5 * k : 0 };
        }
        return { anim: 'Idle', t: total, loop: true, dir: atkDir };
      }
      const h = defenders.includes(u) ? hitOf(u) : null;
      if (!h) return null;
      const landed = h.hit && h.typeMult > 0;
      if (h.fainted && passed('faint')) return { hidden: true };
      if (h.fainted && s.k === 'faint') return { anim: 'Hurt', t: 0.1, loop: false, dir: defDir(u), hidden: Math.floor(t / 0.08) % 2 === 0 };
      if (s.k === 'impact' && landed) return { anim: 'Hurt', t, loop: false, dir: defDir(u), flash: Math.floor(t / 0.06) % 2 === 0 && t < 0.3 };
      return { anim: 'Idle', t: total, loop: true, dir: defDir(u) };
    },

    drawWorld(ctx) {
      const s = step();
      if (!s) return;
      const a = center(attacker);
      const color = TYPE_COLORS[move.type];
      if (s.k === 'travel' && fallbackShot) {
        const e = center(endPt), k = t / s.d;
        const x = Math.round(a.x + (e.x - a.x) * k), y = Math.round(a.y - 6 + (e.y - a.y) * k);
        ctx.fillStyle = shade(color, 0.55); ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle = color; ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, 2, 2);
      }
      for (const d of defenders) {
        const h = hitOf(d); if (!h) continue;
        const p = center(d), landed = h.hit && h.typeMult > 0;
        if (s.k === 'impact' && landed && t < 0.35 && fallbackHit) {
          const r = 4 + (t / 0.35) * 12;
          for (let n = 0; n < 8; n++) {
            const ang = (n / 8) * Math.PI * 2;
            ctx.fillStyle = n % 2 ? color : '#ffffff';
            ctx.fillRect(Math.round(p.x + Math.cos(ang) * r) - 1, Math.round(p.y - 4 + Math.sin(ang) * r) - 1, 3, 3);
          }
        }
        const showing = s.k === 'impact' || (passed('impact') && !(h.fainted && passed('faint')) && s.k === 'msg' && !s.stage);
        if (!showing) continue;
        const rise = Math.min(8, (s.k === 'impact' ? t : 0.6) * 20);
        const pop = h.typeMult === 0 ? '효과 없음' : !h.hit ? 'MISS' : `${h.damage}`;
        const col = !landed ? '#d8d8d8' : h.typeMult > 1 ? '#f8d030' : '#ffffff';
        drawText(ctx, pop, Math.round(p.x - textWidth(pop) / 2), Math.round(p.y - 30 - rise), col, '#202020');
        const bw = 22;
        ctx.fillStyle = '#202020';
        ctx.fillRect(Math.round(p.x - bw / 2) - 1, Math.round(p.y + 10), bw + 2, 7);
        drawHpBar(ctx, Math.round(p.x - bw / 2), Math.round(p.y + 11), bw, shownHp(d), d.maxHp);
      }
      if (s.k === 'stage' || (s.stage && !s.pop)) drawStagePops(ctx, result.stageChanges, get, s.k === 'stage' ? t : 0.6);
      if (s.pop) drawStatusPop(ctx, s.pop, get);
      const exp = result.expGained?.[attacker.species];
      if (exp && (passed('impact') || s.k === 'impact') && !passed('selffaint')) {
        const lbl = `+${exp} EXP`;
        drawText(ctx, lbl, Math.round(a.x - textWidth(lbl, 'small') / 2), Math.round(a.y - 32), '#f8d030', '#202020', 'small');
      }
    },

    drawScreen(ctx) {
      const s = step();
      if (!s) return;
      drawMessage(ctx, text, { species: who.species, side: who.side, emotion: emo }, s.k === 'msg' && Math.floor(t * 3) % 2 === 0);
    },
  };
}

export { DIR };

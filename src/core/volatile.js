// 포켓몬에 붙는 효과 (순수). 층이 끝나면 유닛째 사라지므로 파티 멤버에는 쓰지 않는다.
// 남은 턴은 그 포켓몬 편 페이즈 끝에 줄어든다 (tickEnd). 스펙 docs/superpowers/specs/2026-11-15-status-moves-batch-design.md
import { MOVES } from '../data/moves.js';
import { typesOf, blocksAilment, magicGuard } from './abilities.js';
import { cure, canInflict, inflict } from './status.js';
import { castField, castWeather, AURAS, ZONES } from './field.js';

export const TAUNT_TURNS = 3, NO_MOVE_TURNS = 2, LOCK_TURNS = 3; // 도발 · 이동 불가 · 앙코르·사슬묶기·트집·회복봉인
export const YAWN_RANGE = 3; // 하품: 쓴 포켓몬에게서 3칸 이내면 잠듦, 4칸 이상이면 풀림
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const newVolatile = () => ({
  guard: null, guardPrev: false, bond: false, bondPrev: false,
  focusEnergy: false, aquaRing: false, rooted: false, cursed: false,
  leechBy: null, yawnBy: null, helped: false, identNormal: false, identPsychic: false, abilityOff: false,
  taunt: 0, encore: null, disable: null, torment: 0, healBlock: 0, noMove: 0, lastMove: null,
});

// 쓰는 유닛 기준 기술. 저주: 고스트면 적 하나(사거리 1~2), 아니면 자신 랭크(스피드 −1·공격 +1·방어 +1)
const CURSE_STATS = [{ stat: 'speed', change: -1 }, { stat: 'attack', change: 1 }, { stat: 'defense', change: 1 }];
export const isGhost = (unit) => typesOf(unit).includes('ghost');
export function moveFor(unit, moveId) {
  const m = MOVES[moveId];
  if (moveId !== 'curse' || !unit) return m;
  return isGhost(unit) ? { ...m, kind: 'enemy', range: [1, 2] } : { ...m, kind: 'self', range: [0, 0], effect: null, statChanges: CURSE_STATS };
}
const quarter = (u, n) => Math.max(1, Math.floor(u.maxHp / n));
export const isHealMove = (m) => !!m && (!!m.heal || m.effect === 'rest' || m.effect === 'aquaRing' || m.effect === 'ingrain');
export const canHeal = (u) => !(u.healBlock > 0); // 회복봉인

// 지금 그 기술을 못 쓰는 이유 (없으면 null)
export function moveBlock(unit, moveId) {
  const m = MOVES[moveId];
  if (unit.taunt > 0 && m?.category === 'status') return 'taunt';
  if (unit.encore && moveId !== unit.encore.move) return 'encore';
  if (unit.disable && moveId === unit.disable.move) return 'disable';
  if (unit.torment > 0 && moveId === unit.lastMove) return 'torment';
  if (unit.healBlock > 0 && isHealMove(m)) return 'healBlock';
  return null;
}

// 효과 하나 적용. 성공/실패를 돌려준다
export function applyEffect(state, user, target, move, rng, weather) {
  const out = (ok, reason) => ({ unitId: target.id, effect: move.effect, ok, ...(reason ? { reason } : {}) });
  switch (move.effect) {
    case 'focusEnergy':
      if (target.focusEnergy) return out(false, 'already');
      target.focusEnergy = true; return out(true);
    case 'taunt':
      if (target.taunt > 0) return out(false, 'already');
      target.taunt = TAUNT_TURNS; return out(true);
    case 'noMove':
      if (target.noMove > 0) return out(false, 'already');
      target.noMove = NO_MOVE_TURNS; return out(true);
    case 'protect': case 'endure': // 다음 내 편 페이즈 시작까지. 바로 앞 차례에 썼으면 실패
      if (target.guardPrev) return out(false, 'chain');
      target.guard = move.effect; return out(true);
    case 'rest': {
      if (target.hp >= target.maxHp) return out(false, 'full');
      if ((target.healUses ?? 0) <= 0) return out(false, 'uses');
      if (blocksAilment(target, 'sleep', weather)) return out(false, 'immune');
      target.hp = target.maxHp; cure(target);
      target.status = 'sleep'; target.statusTurns = 2; // 정확히 2번 쉼
      target.healUses -= 1;
      return out(true);
    }
    case 'aquaRing':
      if (target.aquaRing) return out(false, 'already');
      target.aquaRing = true; return out(true);
    case 'ingrain':
      if (target.rooted) return out(false, 'already');
      target.rooted = true; return out(true);
    case 'curse': // 고스트: 자기 HP 절반을 쓰고 대상 저주 (쓴 쪽 기절은 battle 이 처리)
      if (target.cursed) return out(false, 'already');
      user.hp = Math.max(0, user.hp - Math.floor(user.maxHp / 2));
      target.cursed = true; return out(true);
    case 'yawn': {
      if (target.yawnBy) return out(false, 'already');
      const r = canInflict(target, 'sleep', null, weather);
      if (!r.ok) return out(false, r.reason === 'already' || r.reason === 'safeguard' ? r.reason : 'immune');
      target.yawnBy = user.id; return out(true);
    }
    case 'leechSeed':
      if (typesOf(target).includes('grass')) return out(false, 'immune');
      if (target.leechBy) return out(false, 'already');
      target.leechBy = user.id; return out(true);
    case 'helpingHand': // 그 아군의 이번 페이즈 다음 공격기 ×1.5
      if (target.helped || target.acted) return out(false, 'already');
      target.helped = true; return out(true);
    case 'identNormal': case 'identPsychic': // 꿰뚫어보기·냄새구별 / 미라클아이
      if (target[move.effect]) return out(false, 'already');
      target[move.effect] = true; return out(true);
    case 'encore': case 'disable':
      if (target[move.effect]) return out(false, 'already');
      if (!target.lastMove) return out(false, 'noLast');
      target[move.effect] = { move: target.lastMove, turns: LOCK_TURNS }; return out(true);
    case 'torment': case 'healBlock':
      if (target[move.effect] > 0) return out(false, 'already');
      target[move.effect] = LOCK_TURNS; return out(true);
    case 'abilityOff': // 위액
      if (target.abilityOff) return out(false, 'already');
      // 특성을 직접 읽는 곳(부유·불면·정전기 …)도 꺼지도록 비워 두고, 원래 특성은 따로 (메타몽 캡슐용)
      target.suppressedAbility = target.ability; target.ability = null; target.abilityOff = true;
      return out(true);
    case 'worrySeed': // 고민씨: 특성이 불면 (잠들어 있으면 깸)
      if (['truant', 'insomnia', 'multitype'].includes(target.ability)) return out(false, 'immune');
      target.ability = 'insomnia';
      if (target.status === 'sleep') cure(target);
      return out(true);
    case 'bond': // 길동무: 다음 내 편 페이즈 시작까지. 연속 사용 실패
      if (target.bondPrev) return out(false, 'chain');
      target.bond = true; return out(true);
    case 'weather': { const r = castWeather(state, user, move.id); return r.ok ? { ...out(true), from: r.from, to: r.to } : out(false, r.reason); }
    default:
      if (AURAS.includes(move.effect) || ZONES.includes(move.effect)) { const r = castField(state, user, move.effect); return out(r.ok, r.reason); } // 오라·장판
      return out(false, 'blocked');
  }
}

// 그 유닛 편 페이즈 끝: 턴 감소 (끝나면 effectEnd 이벤트)
export function tickEnd(state, unit, events, rng) {
  // 지속 회복 (아쿠아링·뿌리박기 각 1/16), 저주 피해 1/4
  for (const [flag, kind] of [['aquaRing', 'aquaRing'], ['rooted', 'ingrain']]) {
    if (!unit[flag] || unit.hp >= unit.maxHp || !canHeal(unit)) continue;
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + quarter(unit, 16));
    events.push({ unitId: unit.id, kind, healed: unit.hp - before });
  }
  if (unit.cursed && !magicGuard(unit)) {
    const hpBefore = unit.hp, damage = quarter(unit, 4);
    unit.hp = Math.max(0, unit.hp - damage);
    events.push({ unitId: unit.id, kind: 'curse', damage, hpBefore, maxHp: unit.maxHp, x: unit.x, y: unit.y });
  }
  // 씨뿌리기: 1/8 을 빼앗아 쓴 포켓몬 회복 (쓴 쪽이 없으면 빼앗기만)
  if (unit.leechBy && !magicGuard(unit)) {
    const hpBefore = unit.hp, damage = Math.min(unit.hp, quarter(unit, 8));
    unit.hp -= damage;
    const by = state.units.find((u) => u.id === unit.leechBy);
    let healed = 0;
    if (by && canHeal(by)) { const b = by.hp; by.hp = Math.min(by.maxHp, by.hp + damage); healed = by.hp - b; }
    events.push({ unitId: unit.id, kind: 'leech', by: unit.leechBy, damage, healed, hpBefore, maxHp: unit.maxHp, x: unit.x, y: unit.y });
  }
  // 하품: 쓴 포켓몬이 살아 있고 3칸 이내이며 아직 잠들 수 있으면 잠듦
  if (unit.yawnBy && unit.hp > 0) {
    const by = state.units.find((u) => u.id === unit.yawnBy);
    unit.yawnBy = null;
    const ok = by && dist(by, unit) <= YAWN_RANGE && canInflict(unit, 'sleep', null, unit.fieldWeather ?? null).ok;
    if (ok) inflict(unit, 'sleep', rng, null, unit.fieldWeather ?? null);
    events.push({ unitId: unit.id, kind: ok ? 'yawnSleep' : 'yawnFizzle' });
  }
  unit.helped = false; // 도우미는 그 페이즈만
  for (const key of ['taunt', 'noMove', 'torment', 'healBlock']) {
    if (unit[key] > 0 && --unit[key] === 0) events.push({ unitId: unit.id, kind: 'effectEnd', effect: key });
  }
  for (const key of ['encore', 'disable']) {
    if (unit[key] && --unit[key].turns <= 0) { unit[key] = null; events.push({ unitId: unit.id, kind: 'effectEnd', effect: key }); }
  }
}

// 그 유닛 편 페이즈 시작
export function tickStart(unit) {
  unit.guardPrev = unit.guard !== null; unit.guard = null; // 방어·버티기
  unit.bondPrev = unit.bond; unit.bond = false; // 길동무
}

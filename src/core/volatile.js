// 포켓몬에 붙는 효과 (순수). 층이 끝나면 유닛째 사라지므로 파티 멤버에는 쓰지 않는다.
// 남은 턴은 그 포켓몬 편 페이즈 끝에 줄어든다 (tickEnd). 스펙 docs/superpowers/specs/2026-11-15-status-moves-batch-design.md
import { MOVES } from '../data/moves.js';
import { typesOf, blocksAilment, magicGuard } from './abilities.js';
import { cure } from './status.js';

export const TAUNT_TURNS = 3, NO_MOVE_TURNS = 2;

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

// 지금 그 기술을 못 쓰는 이유 (없으면 null)
export function moveBlock(unit, moveId) {
  const m = MOVES[moveId];
  if (unit.taunt > 0 && m?.category === 'status') return 'taunt';
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
    default:
      return out(false, 'blocked');
  }
}

// 그 유닛 편 페이즈 끝: 턴 감소 (끝나면 effectEnd 이벤트)
export function tickEnd(state, unit, events, rng) {
  // 지속 회복 (아쿠아링·뿌리박기 각 1/16), 저주 피해 1/4
  for (const [flag, kind] of [['aquaRing', 'aquaRing'], ['rooted', 'ingrain']]) {
    if (!unit[flag] || unit.hp >= unit.maxHp) continue;
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + quarter(unit, 16));
    events.push({ unitId: unit.id, kind, healed: unit.hp - before });
  }
  if (unit.cursed && !magicGuard(unit)) {
    const hpBefore = unit.hp, damage = quarter(unit, 4);
    unit.hp = Math.max(0, unit.hp - damage);
    events.push({ unitId: unit.id, kind: 'curse', damage, hpBefore, maxHp: unit.maxHp, x: unit.x, y: unit.y });
  }
  for (const key of ['taunt', 'noMove']) {
    if (unit[key] > 0 && --unit[key] === 0) events.push({ unitId: unit.id, kind: 'effectEnd', effect: key });
  }
}

// 그 유닛 편 페이즈 시작
export function tickStart(unit) {
  unit.guardPrev = unit.guard !== null; unit.guard = null; // 방어·버티기
}

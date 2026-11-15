// 포켓몬에 붙는 효과 (순수). 층이 끝나면 유닛째 사라지므로 파티 멤버에는 쓰지 않는다.
// 남은 턴은 그 포켓몬 편 페이즈 끝에 줄어든다 (tickEnd). 스펙 docs/superpowers/specs/2026-11-15-status-moves-batch-design.md
import { MOVES } from '../data/moves.js';

export const TAUNT_TURNS = 3, NO_MOVE_TURNS = 2;

export const newVolatile = () => ({
  guard: null, guardPrev: false, bond: false, bondPrev: false,
  focusEnergy: false, aquaRing: false, rooted: false, cursed: false,
  leechBy: null, yawnBy: null, helped: false, identNormal: false, identPsychic: false, abilityOff: false,
  taunt: 0, encore: null, disable: null, torment: 0, healBlock: 0, noMove: 0, lastMove: null,
});

// 쓰는 유닛 기준 기술 (저주는 Task 2 에서 타입에 따라)
export const moveFor = (unit, moveId) => MOVES[moveId];

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
    default:
      return out(false, 'blocked');
  }
}

// 그 유닛 편 페이즈 끝: 턴 감소 (끝나면 effectEnd 이벤트)
export function tickEnd(state, unit, events, rng) {
  for (const key of ['taunt', 'noMove']) {
    if (unit[key] > 0 && --unit[key] === 0) events.push({ unitId: unit.id, kind: 'effectEnd', effect: key });
  }
}

// 그 유닛 편 페이즈 시작
export function tickStart(unit) {}

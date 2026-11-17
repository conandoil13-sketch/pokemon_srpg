// 지니는 도구 전투 효과 (순수). 표 = data/heldItems.js. 특성 끄기(위액·틀깨기)와 상관없이 늘 켜짐
import { HELD_ITEMS } from '../data/heldItems.js';
import { SPECIES } from '../data/species.js';

const SPECIAL_SPECIES_OK = (u, it) => !it.species || (it.species.includes(u.species) && !(it.plainDitto && u.build));
export function itemOf(u) {
  if (!u || u.side !== 'ally' || !u.held) return null;
  const it = HELD_ITEMS[u.held];
  return it && SPECIAL_SPECIES_OK(u, it) ? { id: u.held, ...it } : null;
}
const typeOfMove = (u, move) => (move.typeOverride ?? move.type);
const isSE = (typeMult) => typeMult > 1;

// 공격 쪽 배수 (데미지 계산에 특성 배수와 함께 곱함)
export function itemAttackMult(a, d, move, typeMult, moveType = null) {
  const it = itemOf(a); if (!it || move.category === 'status') return 1;
  const physical = move.category === 'physical', type = moveType ?? typeOfMove(a, move);
  let m = 1;
  if (it.typeBoost && it.typeBoost === type) m *= 1.2;
  if (it.physMult && physical) m *= it.physMult;
  if (it.specMult && !physical) m *= it.specMult;
  if (it.seMult && isSE(typeMult)) m *= it.seMult;
  if (it.lifeOrb) m *= it.lifeOrb;
  if (it.choice === 'physical' && physical) m *= 1.5;
  if (it.choice === 'special' && !physical) m *= 1.5;
  if (it.statMult) m *= it.statMult[physical ? 'atk' : 'spa'] ?? 1;
  return m;
}
// 방어 쪽 배수 (심해의비늘·메탈파우더)
export function itemDefMult(d, move) {
  const it = itemOf(d); if (!it?.statMult) return 1;
  const k = move.category === 'physical' ? 'def' : 'spd';
  return it.statMult[k] ? 1 / it.statMult[k] : 1;
}
export const itemSpeedMult = (u) => itemOf(u)?.speedMult ?? 1; // 구애스카프·검은철구
export const itemMove = (u) => itemOf(u)?.move ?? 0;
export const itemHeal = (u) => itemOf(u)?.healMult ?? 1; // 큰뿌리
export const itemCritBonus = (u) => itemOf(u)?.crit ?? 0;
export function itemAcc(a, d) {
  return (itemOf(a)?.accMult ?? 1) * (itemOf(d)?.foeAccMult ?? 1) * (itemOf(a)?.still && !a.walked ? itemOf(a).still : 1); // 줌렌즈: 이번 차례 이동 안 함
}
// 차례 끝: { heal, damage, ailment } (최대 HP 기준으로 계산된 정수)
export function itemPhaseEnd(u) {
  const it = itemOf(u); if (!it) return null;
  const part = (f) => Math.max(1, Math.floor(u.maxHp * f));
  const types = u.types ?? SPECIES[u.species].types;
  if (it.endHeal) return u.hp < u.maxHp ? { heal: part(it.endHeal) } : null;
  if (it.blackSludge) return types.includes('poison') ? (u.hp < u.maxHp ? { heal: part(1 / 16) } : null) : { damage: part(1 / 8) };
  if (it.stickyBarb) return { damage: part(it.stickyBarb) };
  if (it.orb && !u.status) return { ailment: it.orb };
  return null;
}
// 쓰러질 피해를 버팀: 'sash'(HP 가득, 층마다 1번) | 'band'(10%) | null
export function survives(u, hpBefore, rng) {
  const it = itemOf(u); if (!it) return null;
  if (it.sash && hpBefore === u.maxHp && !u.itemUsed) { u.itemUsed = true; return 'sash'; }
  if (it.band && rng() < it.band) return 'band';
  return null;
}

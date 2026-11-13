// 상태이상 (순수). 본가 4~5세대 규칙을 SRPG 페이즈 단위로.
// unit.status: 주 상태이상 하나, unit.statusTurns: 잠듦 남은 수면 / 얼음 남은 턴 / 맹독 n, unit.confusion: 혼란 남은 턴
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';
import { weatherBlocksAilment } from './weather.js';
import { blocksAilment, has, moveBonus, ignoresParalysisSlow } from './abilities.js';

export const STATUS_KO = { paralysis: '마비', burn: '화상', poison: '독', toxic: '맹독', sleep: '잠듦', freeze: '얼음', confusion: '혼란' };
const PRIMARY = ['paralysis', 'burn', 'poison', 'toxic', 'sleep', 'freeze'];
const IMMUNE = { burn: ['fire'], freeze: ['ice'], poison: ['poison', 'steel'], toxic: ['poison', 'steel'] };
const FREEZE_MAX = 3;      // 얼음으로 쉬는 최대 턴 (사용자 결정)
const THAW_CHANCE = 0.2;
const PARALYSIS_FAIL = 0.25;
const CONFUSION_HIT = 0.5;
const TOXIC_MAX = 15;

export const newStatus = () => ({ status: null, statusTurns: 0, confusion: 0 });

const types = (unit) => SPECIES[unit.species].types;

// move: 거는 기술 (전기자석파처럼 기술 타입 상성으로 무효가 되는 경우)
export function canInflict(unit, ailment, move, weather = null) {
  if (weatherBlocksAilment(weather, ailment)) return { ok: false, reason: 'weather' }; // 쾌청엔 얼지 않는다
  if (blocksAilment(unit, ailment, weather)) return { ok: false, reason: 'ability' }; // 면역·불면·리프가드 …
  if (IMMUNE[ailment]?.some((t) => types(unit).includes(t))) return { ok: false, reason: 'immune' };
  if (move?.id === 'thunder-wave' && typeMultiplier(move.type, types(unit)) === 0) return { ok: false, reason: 'immune' };
  if (ailment === 'confusion') return unit.confusion > 0 ? { ok: false, reason: 'already' } : { ok: true };
  return unit.status ? { ok: false, reason: 'already' } : { ok: true };
}

export function inflict(unit, ailment, rng, move, weather = null) {
  const r = canInflict(unit, ailment, move, weather);
  if (!r.ok) return r;
  if (ailment === 'confusion') { unit.confusion = 1 + Math.floor(rng() * 4); return r; }
  unit.status = ailment;
  unit.statusTurns = ailment === 'sleep' ? 1 + Math.floor(rng() * 3) : ailment === 'freeze' ? FREEZE_MAX : ailment === 'toxic' ? 1 : 0;
  if (ailment === 'sleep' && has(unit, 'early-bird')) unit.statusTurns = Math.ceil(unit.statusTurns / 2); // 일찍기상
  return r;
}

export const cure = (unit) => { unit.status = null; unit.statusTurns = 0; };

export const moveBudget = (unit) => {
  const m = SPECIES[unit.species].move;
  const base = unit.status === 'paralysis' && !ignoresParalysisSlow(unit) ? Math.max(1, Math.floor(m / 2)) : m;
  if (unit.trapped) return 1; // 개미지옥·그림자밟기·자력
  return Math.max(1, base + moveBonus(unit)); // 쓱쓱·엽록소·속보 +1, 슬로스타트 −1
};

export const speedMultiplier = (unit) => (unit.status === 'paralysis' ? 0.5 : 1);

// 그 편 페이즈 시작: 잠듦·얼음이면 쉬는지 판정
export function phaseStart(unit, rng) {
  if (unit.status === 'sleep') {
    if (unit.statusTurns > 0) { unit.statusTurns--; return { skip: true, event: 'asleep' }; }
    cure(unit); return { skip: false, event: 'woke' };
  }
  if (unit.status === 'freeze') {
    if (unit.statusTurns <= 0 || rng() < THAW_CHANCE) { cure(unit); return { skip: false, event: 'thawed' }; }
    unit.statusTurns--; return { skip: true, event: 'frozen' };
  }
  return { skip: false };
}

// 그 편 페이즈 끝: 지속 데미지(HP 적용은 호출 측), 맹독 증가, 혼란 감소
export function phaseEnd(unit) {
  let damage = 0, kind;
  if (unit.status === 'poison' || unit.status === 'burn') { damage = Math.max(1, Math.floor(unit.maxHp / 8)); kind = unit.status; }
  if (unit.status === 'toxic') {
    damage = Math.max(1, Math.floor(unit.maxHp * unit.statusTurns / 16)); kind = 'toxic';
    unit.statusTurns = Math.min(TOXIC_MAX, unit.statusTurns + 1);
  }
  let confusionEnded = false;
  if (unit.confusion > 0) { unit.confusion--; confusionEnded = unit.confusion === 0; }
  return { damage, ...(kind ? { kind } : {}), confusionEnded };
}

// 기술을 쓰기 직전: 마비 25% 실패, 혼란 50% 자해
export function checkAction(unit, rng) {
  if (unit.status === 'paralysis' && rng() < PARALYSIS_FAIL) return 'paralysis';
  if (unit.confusion > 0 && rng() < CONFUSION_HIT) return 'confusion';
  return null;
}

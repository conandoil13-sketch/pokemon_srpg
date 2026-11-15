// 상태이상 (순수). 본가 4~5세대 규칙을 SRPG 페이즈 단위로.
// unit.status: 주 상태이상 하나, unit.statusTurns: 잠듦 남은 수면 / 얼음 남은 턴 / 맹독 n, unit.confusion: 혼란 남은 턴
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';
import { weatherBlocksAilment } from './weather.js';
import { blocksAilment, has, moveBonus, ignoresParalysisSlow } from './abilities.js';

export const STATUS_KO = { paralysis: '마비', burn: '화상', poison: '독', toxic: '맹독', sleep: '잠듦', freeze: '얼음', confusion: '혼란', infatuation: '헤롱헤롱' };
const PRIMARY = ['paralysis', 'burn', 'poison', 'toxic', 'sleep', 'freeze'];
const IMMUNE = { burn: ['fire'], freeze: ['ice'], poison: ['poison', 'steel'], toxic: ['poison', 'steel'] };
const FREEZE_MAX = 3;      // 얼음으로 쉬는 최대 턴 (사용자 결정)
const THAW_CHANCE = 0.2;
const PARALYSIS_FAIL = 0.25;
const CONFUSION_HIT = 0.5;
const TOXIC_MAX = 15;

export const newStatus = () => ({ status: null, statusTurns: 0, confusion: 0, infatuation: 0, infatuatedBy: null, flinch: false, sealed: false, fakedOut: false });

// 헤롱헤롱: 서로 성별이 있고 반대일 때만, 둔감 면역(틀깨기면 무시), 이미 걸렸으면 실패
export const INFATUATION_TURNS = 3, INFATUATION_FAIL = 0.5;
export function canInfatuate(target, source, { breaker = false } = {}) {
  if (!target.gender || !source.gender || target.gender === source.gender) return { ok: false, reason: 'immune' };
  if (!breaker && has(target, 'oblivious')) return { ok: false, reason: 'ability' };
  if (target.infatuation > 0) return { ok: false, reason: 'already' };
  return { ok: true };
}
export function infatuate(target, source, opts) {
  const r = canInfatuate(target, source, opts);
  if (r.ok) { target.infatuation = INFATUATION_TURNS; target.infatuatedBy = source.id; }
  return r;
}

const types = (unit) => unit.types ?? SPECIES[unit.species].types; // 메타몽 빌드 타입

// move: 거는 기술 (전기자석파처럼 기술 타입 상성으로 무효가 되는 경우)
export function canInflict(unit, ailment, move, weather = null, { breaker = false } = {}) {
  if (weatherBlocksAilment(weather, ailment)) return { ok: false, reason: 'weather' }; // 쾌청엔 얼지 않는다
  if (unit.field?.safeguard) return { ok: false, reason: 'safeguard' }; // 신비의부적 오라
  if (!breaker && blocksAilment(unit, ailment, weather)) return { ok: false, reason: 'ability' }; // 면역·불면·리프가드 …
  if (IMMUNE[ailment]?.some((t) => types(unit).includes(t))) return { ok: false, reason: 'immune' };
  if (move?.id === 'thunder-wave' && typeMultiplier(move.type, types(unit)) === 0) return { ok: false, reason: 'immune' };
  if (ailment === 'confusion') return unit.confusion > 0 ? { ok: false, reason: 'already' } : { ok: true };
  return unit.status ? { ok: false, reason: 'already' } : { ok: true };
}

export function inflict(unit, ailment, rng, move, weather = null, opts = {}) {
  const r = canInflict(unit, ailment, move, weather, opts);
  if (!r.ok) return r;
  if (ailment === 'confusion') { unit.confusion = 1 + Math.floor(rng() * 4); return r; }
  unit.status = ailment;
  unit.statusTurns = ailment === 'sleep' ? 1 + Math.floor(rng() * 3) : ailment === 'freeze' ? FREEZE_MAX : ailment === 'toxic' ? 1 : 0;
  if (ailment === 'sleep' && has(unit, 'early-bird')) unit.statusTurns = Math.ceil(unit.statusTurns / 2); // 일찍기상
  return r;
}

export const cure = (unit) => { unit.status = null; unit.statusTurns = 0; };

export const moveBudget = (unit) => {
  const runAway = has(unit, 'run-away'); // 도주: 상대가 거는 이동 제한(이동 불가·속박·묶기 특성)을 무시
  if (unit.rooted || (!runAway && (unit.noMove > 0 || unit.bound))) return 0; // 검은눈빛·블록·거미집·뿌리박기·속박
  const m = SPECIES[unit.species].move;
  const base = unit.status === 'paralysis' && !ignoresParalysisSlow(unit) ? Math.max(1, Math.floor(m / 2)) : m;
  if (unit.trapped && !runAway) return 1; // 개미지옥·그림자밟기·자력
  return Math.max(1, base + moveBonus(unit)) + (unit.field?.tailwind ? 1 : 0); // 쓱쓱·엽록소·속보 +1, 슬로스타트 −1, 순풍 +1
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
  if (unit.status === 'poison' || unit.status === 'burn') { damage = Math.max(1, Math.floor(unit.maxHp / (unit.status === 'burn' && has(unit, 'heatproof') ? 16 : 8))); kind = unit.status; } // 내열: 화상 피해 절반
  if (unit.status === 'toxic') {
    damage = Math.max(1, Math.floor(unit.maxHp * unit.statusTurns / 16)); kind = 'toxic';
    unit.statusTurns = Math.min(TOXIC_MAX, unit.statusTurns + 1);
  }
  let confusionEnded = false, infatuationEnded = false;
  if (unit.confusion > 0) { unit.confusion--; confusionEnded = unit.confusion === 0; }
  if (unit.infatuation > 0) { unit.infatuation--; infatuationEnded = unit.infatuation === 0; if (infatuationEnded) unit.infatuatedBy = null; }
  return { damage, ...(kind ? { kind } : {}), confusionEnded, infatuationEnded };
}

// 기술을 쓰기 직전: 마비 25% 실패, 혼란 50% 자해
export function checkAction(unit, rng) {
  if (unit.status === 'paralysis' && rng() < PARALYSIS_FAIL) return 'paralysis';
  if (unit.confusion > 0 && rng() < CONFUSION_HIT) return 'confusion';
  if (unit.infatuation > 0 && rng() < INFATUATION_FAIL) return 'infatuation'; // 헤롱헤롱: 기술이 나가지 않음
  return null;
}

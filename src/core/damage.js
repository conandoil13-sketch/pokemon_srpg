// 데미지 / 명중 계산 (순수 함수, spec §4.4)
import { weightPower, weightOf } from './individual.js';
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';
import { effectiveStat, accuracyShift } from './stages.js';
import { weatherDamageMult, weatherAccuracy } from './weather.js';
import { has, typeEffect, stabMult, attackMult, defendMult, ignoresBurn, immunity, accuracyFor, critRate, critMult } from './abilities.js';


const sp = (unit) => SPECIES[unit.species];

export function hitChance(attacker, defender, move, defTile, weather = null) {
  const acc = weatherAccuracy(weather, move, move.accuracy);
  if (acc.sure) return 100; // 비의 번개·싸라기눈의 눈보라: 반드시 명중
  const ab = accuracyFor(attacker, defender, move, acc.value, weather); // 특성 (복안·의욕·노가드·모래숨기 …)
  if (ab.sure) return 100;
  acc.value = ab.value;
  const speGap = Math.floor((effectiveStat(defender, 'spe') - effectiveStat(attacker, 'spe')) / 10);
  const evasion = Math.min(30, (defTile === '"' ? 15 : 0) + Math.max(0, speGap));
  return Math.max(0, Math.min(100, acc.value - evasion + accuracyShift(attacker, defender)));
}

// 난수·급소를 제외한 기본 데미지 (STAB·상성 포함)
function baseDamage(attacker, defender, move, defTile, weather = null) {
  if (move.weightPower) move = { ...move, power: weightPower(weightOf(defender)) }; // 안다리걸기·풀묶기: 상대 몸무게
  const physical = move.category === 'physical';
  // 천진: 상대 랭크를 무시 (틀깨기면 천진도 무시)
  const aKey = physical ? 'atk' : 'spa', dKey = physical ? 'def' : 'spd';
  const A = defender.ability === 'unaware' && attacker.ability !== 'mold-breaker' ? attacker.stats[aKey] : effectiveStat(attacker, aKey);
  let D = attacker.ability === 'unaware' ? defender.stats[dKey] : effectiveStat(defender, dKey);
  if (defTile === '^') D *= 1.2;
  const base = Math.floor(Math.floor((2 * attacker.level / 5 + 2) * move.power * A / D) / 50) + 2;
  const stab = stabMult(attacker, move, weather);
  let typeMult = typeEffect(attacker, defender, move, weather);
  const blocked = immunity(attacker, defender, move, typeMult); // 특성 무효·흡수 (축전·부유·불가사의부적 …)
  if (blocked) typeMult = 0;
  const burn = physical && attacker.status === 'burn' && !ignoresBurn(attacker) ? 0.5 : 1; // 화상: 물리 데미지 절반 (근성 제외)
  const ab = attackMult(attacker, defender, move, { typeMult, weather }) * defendMult(attacker, defender, move, { typeMult });
  return { raw: base * stab * typeMult * burn * ab * weatherDamageMult(weather, move, defender), typeMult, blocked };
}

// spread: 여러 마리를 맞히면 0.75 (본가 4세대)
// 연속 공격 타수: 2~5회 = 2·3 각 37.5%, 4·5 각 12.5% (4세대), 고정 횟수는 그대로, 스킬링크는 최대
export function rollHits(attacker, move, rng) {
  const lo = move.minHits, hi = move.maxHits;
  if (!lo || !hi || hi <= 1) return 1;
  if (lo === hi || has(attacker, 'skill-link')) return hi;
  if (lo === 2 && hi === 5) { const r = rng(); return r < 0.375 ? 2 : r < 0.75 ? 3 : r < 0.875 ? 4 : 5; }
  return lo + Math.floor(rng() * (hi - lo + 1));
}
export const avgHits = (move) => (!move.minHits || !move.maxHits || move.maxHits <= 1 ? 1 : move.minHits === move.maxHits ? move.maxHits : move.minHits === 2 && move.maxHits === 5 ? 3 : (move.minHits + move.maxHits) / 2);

// 고정 데미지 (지구던지기·나이트헤드 = 레벨, 용의분노 40, 소닉붐 20): 상성 무효만 적용
export function fixedDamage(attacker, defender, move, weather = null) {
  if (!move.fixedDamage) return null;
  if (typeEffect(attacker, defender, move, weather) === 0 || immunity(attacker, defender, move, 1)) return 0;
  return move.fixedDamage === 'level' ? attacker.level : move.fixedDamage;
}

// forceHit: 연속 공격 2타째부터 (명중은 첫 타만)
export function calcDamage(attacker, defender, move, { rng, defTile, spread = 1, weather = null, forceHit = false }) {
  if (move.fixedDamage) {
    const fd = fixedDamage(attacker, defender, move, weather);
    if (fd === 0) return { hit: true, crit: false, typeMult: 0, damage: 0 };
    const hit = forceHit || rng() * 100 < hitChance(attacker, defender, move, defTile, weather);
    return { hit, crit: false, typeMult: 1, damage: hit ? fd : 0 };
  }
  const { raw: base, typeMult, blocked } = baseDamage(attacker, defender, move, defTile, weather);
  const raw = base * spread;
  // 면역은 명중 판정 없이 "효과가 없다" (빗나감 메시지가 나오지 않도록). 특성 무효면 absorbed 로 알림
  if (typeMult === 0) return { hit: true, crit: false, typeMult, damage: 0, ...(blocked ? { absorbed: blocked } : {}) };
  const hit = forceHit || rng() * 100 < hitChance(attacker, defender, move, defTile, weather);
  const crit = hit && rng() < critRate(attacker, defender, move);
  const roll = 0.85 + rng() * 0.15;
  if (!hit) return { hit, crit: false, typeMult, damage: 0 };
  const damage = Math.max(1, Math.floor(raw * (crit ? critMult(attacker) : 1) * roll));
  return { hit, crit, typeMult, damage };
}

export function expectedDamage(attacker, defender, move, defTile, spread = 1, weather = null) {
  const acc = hitChance(attacker, defender, move, defTile, weather) / 100;
  if (move.fixedDamage) return fixedDamage(attacker, defender, move, weather) * acc;
  const { raw } = baseDamage(attacker, defender, move, defTile, weather);
  return raw * spread * 0.925 * acc * avgHits(move); // 연속 공격은 평균 타수
}

// 혼란 자해: 위력 40 · 타입 없음 · 물리, 자기 공격/방어 랭크와 화상 반영, 난수·급소 없음
export function confusionDamage(unit) {
  const A = effectiveStat(unit, 'atk'), D = effectiveStat(unit, 'def');
  const base = Math.floor(Math.floor((2 * unit.level / 5 + 2) * 40 * A / D) / 50) + 2;
  return Math.max(1, Math.floor(base * (unit.status === 'burn' ? 0.5 : 1)));
}

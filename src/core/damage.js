// 데미지 / 명중 계산 (순수 함수, spec §4.4)
import { weightPower, weightOf } from './individual.js';
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';
import { effectiveStat, accuracyShift } from './stages.js';
import { weatherDamageMult, weatherAccuracy } from './weather.js';
import { typeEffect, stabMult, attackMult, defendMult, ignoresBurn, immunity, accuracyFor, critRate, critMult } from './abilities.js';


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
export function calcDamage(attacker, defender, move, { rng, defTile, spread = 1, weather = null }) {
  const { raw: base, typeMult, blocked } = baseDamage(attacker, defender, move, defTile, weather);
  const raw = base * spread;
  // 면역은 명중 판정 없이 "효과가 없다" (빗나감 메시지가 나오지 않도록). 특성 무효면 absorbed 로 알림
  if (typeMult === 0) return { hit: true, crit: false, typeMult, damage: 0, ...(blocked ? { absorbed: blocked } : {}) };
  const hit = rng() * 100 < hitChance(attacker, defender, move, defTile, weather);
  const crit = hit && rng() < critRate(attacker, defender);
  const roll = 0.85 + rng() * 0.15;
  if (!hit) return { hit, crit: false, typeMult, damage: 0 };
  const damage = Math.max(1, Math.floor(raw * (crit ? critMult(attacker) : 1) * roll));
  return { hit, crit, typeMult, damage };
}

export function expectedDamage(attacker, defender, move, defTile, spread = 1, weather = null) {
  const { raw } = baseDamage(attacker, defender, move, defTile, weather);
  return raw * spread * 0.925 * hitChance(attacker, defender, move, defTile, weather) / 100;
}

// 혼란 자해: 위력 40 · 타입 없음 · 물리, 자기 공격/방어 랭크와 화상 반영, 난수·급소 없음
export function confusionDamage(unit) {
  const A = effectiveStat(unit, 'atk'), D = effectiveStat(unit, 'def');
  const base = Math.floor(Math.floor((2 * unit.level / 5 + 2) * 40 * A / D) / 50) + 2;
  return Math.max(1, Math.floor(base * (unit.status === 'burn' ? 0.5 : 1)));
}

// 데미지 / 명중 계산 (순수 함수, spec §4.4)
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';
import { effectiveStat, accuracyShift } from './stages.js';

const CRIT_RATE = 1 / 16;

const sp = (unit) => SPECIES[unit.species];

export function hitChance(attacker, defender, move, defTile) {
  const speGap = Math.floor((effectiveStat(defender, 'spe') - effectiveStat(attacker, 'spe')) / 10);
  const evasion = Math.min(30, (defTile === '"' ? 15 : 0) + Math.max(0, speGap));
  return Math.max(0, Math.min(100, move.accuracy - evasion + accuracyShift(attacker, defender)));
}

// 난수·급소를 제외한 기본 데미지 (STAB·상성 포함)
function baseDamage(attacker, defender, move, defTile) {
  const a = sp(attacker), d = sp(defender);
  const physical = move.category === 'physical';
  const A = effectiveStat(attacker, physical ? 'atk' : 'spa');
  let D = effectiveStat(defender, physical ? 'def' : 'spd');
  if (defTile === '^') D *= 1.2;
  const base = Math.floor(Math.floor((2 * attacker.level / 5 + 2) * move.power * A / D) / 50) + 2;
  const stab = a.types.includes(move.type) ? 1.5 : 1;
  const typeMult = typeMultiplier(move.type, d.types);
  const burn = physical && attacker.status === 'burn' ? 0.5 : 1; // 화상: 물리 데미지 절반
  return { raw: base * stab * typeMult * burn, typeMult };
}

export function calcDamage(attacker, defender, move, { rng, defTile }) {
  const { raw, typeMult } = baseDamage(attacker, defender, move, defTile);
  // 면역은 명중 판정 없이 "효과가 없다" (빗나감 메시지가 나오지 않도록)
  if (typeMult === 0) return { hit: true, crit: false, typeMult, damage: 0 };
  const hit = rng() * 100 < hitChance(attacker, defender, move, defTile);
  const crit = hit && rng() < CRIT_RATE;
  const roll = 0.85 + rng() * 0.15;
  if (!hit) return { hit, crit: false, typeMult, damage: 0 };
  const damage = Math.max(1, Math.floor(raw * (crit ? 1.5 : 1) * roll));
  return { hit, crit, typeMult, damage };
}

export function expectedDamage(attacker, defender, move, defTile) {
  const { raw } = baseDamage(attacker, defender, move, defTile);
  return raw * 0.925 * hitChance(attacker, defender, move, defTile) / 100;
}

// 혼란 자해: 위력 40 · 타입 없음 · 물리, 자기 공격/방어 랭크와 화상 반영, 난수·급소 없음
export function confusionDamage(unit) {
  const A = effectiveStat(unit, 'atk'), D = effectiveStat(unit, 'def');
  const base = Math.floor(Math.floor((2 * unit.level / 5 + 2) * 40 * A / D) / 50) + 2;
  return Math.max(1, Math.floor(base * (unit.status === 'burn' ? 0.5 : 1)));
}

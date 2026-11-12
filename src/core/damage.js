// 데미지 / 명중 계산 (순수 함수, spec §4.4)
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';

const CRIT_RATE = 1 / 16;

const sp = (unit) => SPECIES[unit.species];

export function hitChance(attacker, defender, move, defTile) {
  const speGap = Math.floor((defender.stats.spe - attacker.stats.spe) / 10);
  const evasion = Math.min(30, (defTile === '"' ? 15 : 0) + Math.max(0, speGap));
  return Math.max(0, Math.min(100, move.accuracy - evasion));
}

// 난수·급소를 제외한 기본 데미지 (STAB·상성 포함)
function baseDamage(attacker, defender, move, defTile) {
  const a = sp(attacker), d = sp(defender);
  const physical = move.category === 'physical';
  const A = physical ? attacker.stats.atk : attacker.stats.spa;
  let D = physical ? defender.stats.def : defender.stats.spd;
  if (defTile === '^') D *= 1.2;
  const base = Math.floor(Math.floor((2 * attacker.level / 5 + 2) * move.power * A / D) / 50) + 2;
  const stab = a.types.includes(move.type) ? 1.5 : 1;
  const typeMult = typeMultiplier(move.type, d.types);
  return { raw: base * stab * typeMult, typeMult };
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

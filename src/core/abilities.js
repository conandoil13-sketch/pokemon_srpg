// 특성 효과 (순수). 전투 코드가 정해진 시점에 부르는 훅 모음 (스펙 §3·§4)
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';

export const PUNCH = ['ice-punch', 'fire-punch', 'thunder-punch', 'mach-punch', 'mega-punch', 'comet-punch', 'dizzy-punch', 'dynamic-punch', 'focus-punch', 'hammer-arm', 'meteor-mash', 'drain-punch', 'bullet-punch', 'shadow-punch', 'sky-uppercut'];
export const SOUND = ['growl', 'roar', 'sing', 'supersonic', 'screech', 'snore', 'uproar', 'metal-sound', 'grass-whistle', 'hyper-voice', 'bug-buzz', 'chatter', 'perish-song', 'heal-bell'];
const PINCH = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' };

export const has = (u, id) => u?.ability === id;
const breaks = (attacker) => has(attacker, 'mold-breaker'); // 틀깨기: 방어 쪽 특성 무시
const def = (attacker, defender, id) => !breaks(attacker) && has(defender, id);

// 실제 타입 (기분파·변색)
export function typesOf(unit, weather = null) {
  if (unit.typeOverride) return [unit.typeOverride];
  if (has(unit, 'forecast')) { const t = { rain: 'water', sun: 'fire', hail: 'ice' }[weather]; if (t) return [t]; }
  return SPECIES[unit.species].types;
}
// 기술 타입 (노말스킨)
export const moveTypeOf = (attacker, move) => (has(attacker, 'normalize') ? 'normal' : move.type);

// 상성 (배짱: 노말·격투가 고스트에게 맞음)
export function typeEffect(attacker, defender, move, weather = null) {
  const type = moveTypeOf(attacker, move);
  let types = typesOf(defender, weather);
  if (has(attacker, 'scrappy') && (type === 'normal' || type === 'fighting')) types = types.filter((t) => t !== 'ghost');
  return types.length ? typeMultiplier(type, types) : 1;
}

export function stabMult(attacker, move, weather = null) {
  if (!typesOf(attacker, weather).includes(moveTypeOf(attacker, move))) return 1;
  return has(attacker, 'adaptability') ? 2 : 1.5;
}

// 공격 쪽 배율 (STAB·상성 외)
export function attackMult(attacker, defender, move, { typeMult, weather }) {
  const physical = move.category === 'physical', type = moveTypeOf(attacker, move);
  let m = 1;
  const pinch = PINCH[attacker.ability];
  if (pinch && type === pinch && attacker.hp <= attacker.maxHp / 3) m *= 1.5;
  if (has(attacker, 'technician') && move.power <= 60) m *= 1.5;
  if (has(attacker, 'tinted-lens') && typeMult > 0 && typeMult < 1) m *= 2;
  if ((has(attacker, 'huge-power') || has(attacker, 'pure-power')) && physical) m *= 2;
  if (has(attacker, 'guts') && attacker.status && physical) m *= 1.5;
  if (has(attacker, 'hustle') && physical) m *= 1.5;
  if (has(attacker, 'iron-fist') && PUNCH.includes(move.id)) m *= 1.2;
  if (has(attacker, 'solar-power') && weather === 'sun' && !physical) m *= 1.5;
  if (attacker.flashFire && type === 'fire') m *= 1.5;
  return m;
}
// 화상의 물리 반감을 무시하는가 (근성)
export const ignoresBurn = (attacker) => has(attacker, 'guts');

// 방어 쪽 배율
export function defendMult(attacker, defender, move, { typeMult }) {
  const physical = move.category === 'physical', type = moveTypeOf(attacker, move);
  let m = 1;
  if (def(attacker, defender, 'thick-fat') && (type === 'fire' || type === 'ice')) m *= 0.5;
  if (def(attacker, defender, 'heatproof') && type === 'fire') m *= 0.5;
  if ((def(attacker, defender, 'filter') || def(attacker, defender, 'solid-rock')) && typeMult > 1) m *= 0.75;
  if (def(attacker, defender, 'marvel-scale') && defender.status && physical) m /= 1.5;
  if (def(attacker, defender, 'dry-skin') && type === 'fire') m *= 1.25;
  return m;
}

// 무효·흡수: null 또는 { ability, heal?(최대 HP 비율), boost?(랭크), flashFire? }
export function immunity(attacker, defender, move, typeMult = 1) {
  if (breaks(attacker) || attacker === defender) return null;
  const type = moveTypeOf(attacker, move), a = defender.ability;
  if (a === 'levitate' && type === 'ground') return { ability: a };
  if (a === 'volt-absorb' && type === 'electric') return { ability: a, heal: 1 / 4 };
  if (a === 'water-absorb' && type === 'water') return { ability: a, heal: 1 / 4 };
  if (a === 'dry-skin' && type === 'water') return { ability: a, heal: 1 / 4 };
  if (a === 'motor-drive' && type === 'electric') return { ability: a, boost: { spe: 1 } };
  if (a === 'flash-fire' && type === 'fire') return { ability: a, flashFire: true };
  if (a === 'soundproof' && SOUND.includes(move.id)) return { ability: a };
  if (a === 'wonder-guard' && move.category !== 'status' && typeMult <= 1) return { ability: a };
  return null;
}

// 명중: base → { value, sure }
export function accuracyFor(attacker, defender, move, base) {
  if (has(attacker, 'no-guard') || has(defender, 'no-guard')) return { value: 100, sure: true };
  let v = base;
  if (has(attacker, 'compound-eyes')) v *= 1.3;
  if (has(attacker, 'hustle') && move.category === 'physical') v *= 0.8;
  return { value: v, sure: false };
}

// 급소: 확률과 배율
export function critRate(attacker, defender) {
  if (def(attacker, defender, 'battle-armor') || def(attacker, defender, 'shell-armor')) return 0;
  return has(attacker, 'super-luck') ? 1 / 8 : 1 / 16;
}
export const critMult = (attacker) => (has(attacker, 'sniper') ? 2.25 : 1.5);

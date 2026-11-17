// 특성 효과 (순수). 전투 코드가 정해진 시점에 부르는 훅 모음 (스펙 §3·§4)
import { SPECIES } from '../data/species.js';
import { typeMultiplier } from '../data/types.js';
import { itemAttackMult, itemDefMult, itemCritBonus, itemAcc } from './items.js';

export const PUNCH = ['ice-punch', 'fire-punch', 'thunder-punch', 'mach-punch', 'mega-punch', 'comet-punch', 'dizzy-punch', 'dynamic-punch', 'focus-punch', 'hammer-arm', 'meteor-mash', 'drain-punch', 'bullet-punch', 'shadow-punch', 'sky-uppercut'];
export const SOUND = ['growl', 'roar', 'sing', 'supersonic', 'screech', 'snore', 'uproar', 'metal-sound', 'grass-whistle', 'hyper-voice', 'bug-buzz', 'chatter', 'perish-song', 'heal-bell'];
const PINCH = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' };

export const has = (u, id) => u?.ability === id && !u.abilityOff; // 위액: 특성 꺼짐
const breaks = (attacker) => has(attacker, 'mold-breaker'); // 틀깨기: 방어 쪽 특성 무시
const def = (attacker, defender, id) => !breaks(attacker) && has(defender, id);

// 실제 타입 (기분파·변색)
export function typesOf(unit, weather = null) {
  if (unit.typeOverride) return [unit.typeOverride];
  if (has(unit, 'forecast')) { const t = { rain: 'water', sun: 'fire', hail: 'ice' }[weather]; if (t) return [t]; }
  return unit.types ?? SPECIES[unit.species].types;
}
// 기술 타입 (노말스킨)
export const moveTypeOf = (attacker, move) => (has(attacker, 'normalize') ? 'normal' : move.type);

// 상성 (배짱: 노말·격투가 고스트에게 맞음)
// 떠 있음: 비행 타입·부유·전자부유 (중력이면 모두 땅에 붙음)
export const airborne = (u) => !u.grounded && (typesOf(u).includes('flying') || has(u, 'levitate') || u.magnetRise > 0);

export function typeEffect(attacker, defender, move, weather = null) {
  const type = moveTypeOf(attacker, move);
  let types = typesOf(defender, weather);
  if (type === 'ground' && defender.grounded) types = types.filter((t) => t !== 'flying'); // 중력: 비행도 땅 기술을 맞음
  else if (type === 'ground' && defender.magnetRise > 0) return 0; // 전자부유: 땅 기술 무효
  if ((has(attacker, 'scrappy') || defender.identNormal) && (type === 'normal' || type === 'fighting')) types = types.filter((t) => t !== 'ghost'); // 배짱·꿰뚫어보기
  if (defender.identPsychic && type === 'psychic') types = types.filter((t) => t !== 'dark'); // 미라클아이
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
  if (attacker.ability === 'rivalry' && attacker.gender && defender.gender) m *= attacker.gender === defender.gender ? 1.25 : 0.75; // 투쟁심
  if (has(attacker, 'technician') && move.power <= 60) m *= 1.5;
  if (has(attacker, 'tinted-lens') && typeMult > 0 && typeMult < 1) m *= 2;
  if ((has(attacker, 'huge-power') || has(attacker, 'pure-power')) && physical) m *= 2;
  if (has(attacker, 'guts') && attacker.status && physical) m *= 1.5;
  if (has(attacker, 'hustle') && physical) m *= 1.5;
  if (has(attacker, 'iron-fist') && PUNCH.includes(move.id)) m *= 1.2;
  if (has(attacker, 'solar-power') && weather === 'sun' && !physical) m *= 1.5;
  if (attacker.flashFire && type === 'fire') m *= 1.5;
  if (attacker.slowTurns > 0 && physical) m *= 0.5;            // 슬로스타트
  if (attacker.plusActive && !physical) m *= 1.5;               // 플러스·마이너스 (전투가 옆 동료를 보고 켬)
  if (attacker.flowerActive && physical) m *= 1.5;              // 플라워기프트 (쾌청 + 본인/옆)
  return m * itemAttackMult(attacker, defender, move, typeMult, type); // 지니는 도구
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
  if (defender.flowerActive && !physical) m /= 1.5;
  return m * itemDefMult(defender, move); // 심해의비늘·메탈파우더
}

// 무효·흡수: null 또는 { ability, heal?(최대 HP 비율), boost?(랭크), flashFire? }
export function immunity(attacker, defender, move, typeMult = 1) {
  if (breaks(attacker) || attacker === defender) return null;
  const type = moveTypeOf(attacker, move), a = defender.ability;
  if (a === 'levitate' && type === 'ground' && !defender.grounded) return { ability: a };
  if (a === 'volt-absorb' && type === 'electric') return { ability: a, heal: 1 / 4 };
  if (a === 'water-absorb' && type === 'water') return { ability: a, heal: 1 / 4 };
  if (a === 'dry-skin' && type === 'water') return { ability: a, heal: 1 / 4 };
  if (a === 'motor-drive' && type === 'electric') return { ability: a, boost: { spe: 1 } };
  if (a === 'flash-fire' && type === 'fire') return { ability: a, flashFire: true };
  if (a === 'soundproof' && SOUND.includes(move.id)) return { ability: a };
  if (a === 'wonder-guard' && move.category !== 'status' && typeMult <= 1) return { ability: a };
  if (a === 'lightning-rod' && type === 'electric') return { ability: a, boost: { spa: 1 } };
  if (a === 'storm-drain' && type === 'water') return { ability: a, boost: { spa: 1 } };
  return null;
}

// 명중: base → { value, sure }
export function accuracyFor(attacker, defender, move, base, weather = null) {
  if (has(attacker, 'no-guard') || has(defender, 'no-guard')) return { value: 100, sure: true };
  let v = base;
  if (has(attacker, 'compound-eyes')) v *= 1.3;
  if (has(attacker, 'hustle') && move.category === 'physical') v *= 0.8;
  if ((def(attacker, defender, 'sand-veil') && weather === 'sand') || (def(attacker, defender, 'snow-cloak') && weather === 'hail')) v -= 20;
  if (def(attacker, defender, 'tangled-feet') && defender.confusion > 0) v -= 20;
  v *= itemAcc(attacker, defender); // 광각렌즈·빛의가루
  return { value: v, sure: false };
}

// 급소: 확률과 배율
// 급소 단계: 0 → 1/16, 1 → 1/8, 2 이상 → 1/4 (기술 급소율 + 대운). 전투무장·조가비갑옷이 우선
export function critRate(attacker, defender, move = null) {
  if (defender?.field?.luckyChant) return 0; // 주술 오라
  if (def(attacker, defender, 'battle-armor') || def(attacker, defender, 'shell-armor')) return 0;
  const stage = (move?.critRate ?? 0) + (has(attacker, 'super-luck') ? 1 : 0) + (attacker.focusEnergy ? 2 : 0) + itemCritBonus(attacker); // 기충전 +2 · 초점렌즈 등
  return stage >= 2 ? 1 / 4 : stage === 1 ? 1 / 8 : 1 / 16;
}
export const critMult = (attacker) => (has(attacker, 'sniper') ? 2.25 : 1.5);

// ---- 상태이상 ----
const STATUS_IMMUNE = {
  immunity: ['poison', 'toxic'], insomnia: ['sleep'], 'vital-spirit': ['sleep'], limber: ['paralysis'],
  'magma-armor': ['freeze'], 'water-veil': ['burn'], 'own-tempo': ['confusion'],
};
const PRIMARY = ['paralysis', 'burn', 'poison', 'toxic', 'sleep', 'freeze'];
export function blocksAilment(unit, ailment, weather = null) {
  if (STATUS_IMMUNE[unit.ability]?.includes(ailment)) return true;
  return has(unit, 'leaf-guard') && weather === 'sun' && PRIMARY.includes(ailment);
}

// ---- 랭크: 다른 포켓몬 때문에 떨어지는 걸 막음 / 단순 ----
export function stageGuard(unit, key, change, fromOther) {
  if (fromOther && change < 0) {
    if (has(unit, 'clear-body') || has(unit, 'white-smoke')) return 0;
    if (has(unit, 'hyper-cutter') && key === 'atk') return 0;
    if (has(unit, 'keen-eye') && key === 'acc') return 0;
  }
  return has(unit, 'simple') ? change * 2 : change;
}

// ---- 스피드·이동력 (unit.fieldWeather = 지금 유효한 날씨, 전투가 넣어 줌) ----
export function speedMult(unit) {
  const w = unit.fieldWeather;
  if (unit.slowTurns > 0) return 0.5;
  if (has(unit, 'swift-swim') && w === 'rain') return 2;
  if (has(unit, 'chlorophyll') && w === 'sun') return 2;
  if (has(unit, 'quick-feet') && unit.status) return 1.5;
  return 1;
}
export const ignoresParalysisSlow = (unit) => has(unit, 'quick-feet');
export function moveBonus(unit) {
  const w = unit.fieldWeather;
  if (unit.slowTurns > 0) return -1;
  if ((has(unit, 'swift-swim') && w === 'rain') || (has(unit, 'chlorophyll') && w === 'sun') || (has(unit, 'quick-feet') && unit.status)) return 1;
  return 0;
}

// ---- 날씨 피해 면역 / 기술 외 피해 무효 ----
export const magicGuard = (unit) => has(unit, 'magic-guard');
export function weatherChipImmune(unit, weather) {
  if (magicGuard(unit)) return true;
  if (weather === 'sand' && has(unit, 'sand-veil')) return true;
  if (weather === 'hail' && (has(unit, 'snow-cloak') || has(unit, 'ice-body'))) return true;
  return false;
}
// 차례 끝 특성 HP 변화: 양수 회복, 음수 피해 (최대 HP 비율)
export function phaseEndHp(unit, weather) {
  const a = unit.ability;
  if (a === 'rain-dish' && weather === 'rain') return 1 / 16;
  if (a === 'ice-body' && weather === 'hail') return 1 / 16;
  if (a === 'dry-skin' && weather === 'rain') return 1 / 8;
  if (a === 'dry-skin' && weather === 'sun') return -1 / 8;
  if (a === 'solar-power' && weather === 'sun') return -1 / 8;
  return 0;
}

// ---- 접촉 반격 (접촉 = 거리 1 의 물리 기술) ----
export const CONTACT_AILMENT = { static: ['paralysis'], 'poison-point': ['poison'], 'flame-body': ['burn'], 'effect-spore': ['paralysis', 'poison', 'sleep'] };

// ---- SRPG 재해석 (스펙 §4-③) ----
export const WEATHER_SETTER = { drizzle: 'rain', drought: 'sun', 'sand-stream': 'sand', 'snow-warning': 'hail' };
export const REDIRECT = { 'lightning-rod': 'electric', 'storm-drain': 'water' };
export const SYNC_AILMENTS = ['poison', 'toxic', 'paralysis', 'burn'];
// 묶기: 옆의 상대(trapper 기준)를 다음 차례 이동력 1로
export function traps(trapper, foe) {
  if (has(trapper, 'shadow-tag')) return true;
  if (has(trapper, 'arena-trap')) return !airborne(foe);
  if (has(trapper, 'magnet-pull')) return typesOf(foe).includes('steel');
  return false;
}
// 픽업·꿀모으기: 층 돌파 시 멤버마다 10% 로 코인 주머니 또는 경험 사탕
export function pickupLoot(members, rng) {
  const out = [];
  for (const m of members) {
    const a = m.build?.ability ?? SPECIES[m.species].abilities[m.abilitySlot ?? 0] ?? SPECIES[m.species].abilities[0]; // 메타몽은 빌드 특성
    if ((a === 'pickup' || a === 'honey-gather') && rng() < 0.1) out.push(rng() < 0.5 ? 'pickupCoins' : 'candy');
  }
  return out;
}

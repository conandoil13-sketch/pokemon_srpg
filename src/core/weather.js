// 날씨 (순수). 층마다 하나, 층 고정. 본가 4세대 효과 + 안개 정보 가리기.
import { SPECIES } from '../data/species.js';
import { createRng } from './rng.js';

export const WEATHER_KO = { rain: '비', sun: '쾌청', sand: '모래바람', hail: '싸라기눈', fog: '안개' };
export const FOG_SIGHT = 5;     // 아군 누구에게서든 이 거리 이상이면 안개 속 (정체 숨김)
const FOG_ACC = 10;             // 안개 명중 −10%p
const types = (u) => u.types ?? SPECIES[u.species]?.types ?? []; // 메타몽 빌드 타입

// 던전 날씨표에서 굴린다. 지형 생성과 다른 별도 난수라 같은 시드의 맵은 그대로.
export function rollWeather(dungeon, seed) {
  const table = dungeon?.weather;
  if (!table?.length) return null;
  const r = createRng((seed ^ 0x5bd1e995) >>> 0)();
  let acc = 0;
  for (const { id, chance } of table) { acc += chance; if (r < acc) return id; }
  return null;
}

// 데미지 배율 (STAB·상성과 함께 곱함)
export function weatherDamageMult(weather, move, defender) {
  if (weather === 'rain') return move.type === 'water' ? 1.5 : move.type === 'fire' ? 0.5 : 1;
  if (weather === 'sun') return move.type === 'fire' ? 1.5 : move.type === 'water' ? 0.5 : 1;
  if (weather === 'sand' && move.category === 'special' && types(defender).includes('rock')) return 1 / 1.5; // 바위 특방 ×1.5
  return 1;
}

// 명중: base(기술 명중) → { value, sure }. sure 면 회피를 무시하고 반드시 명중
export function weatherAccuracy(weather, move, base) {
  if (weather === 'rain' && move.id === 'thunder') return { value: 100, sure: true };
  if (weather === 'hail' && move.id === 'blizzard') return { value: 100, sure: true };
  if (weather === 'sun' && move.id === 'thunder') return { value: 50, sure: false };
  if (weather === 'fog') return { value: base - FOG_ACC, sure: false };
  return { value: base, sure: false };
}

export const weatherBlocksAilment = (weather, ailment) => weather === 'sun' && ailment === 'freeze';

const CHIP_IMMUNE = { sand: ['rock', 'ground', 'steel'], hail: ['ice'] };
// 페이즈 끝 날씨 피해 (HP 적용은 호출 측)
export function phaseEndWeather(unit, weather) {
  const immune = CHIP_IMMUNE[weather];
  if (!immune || immune.some((t) => types(unit).includes(t))) return null;
  return { damage: Math.max(1, Math.floor(unit.maxHp / 16)), kind: weather };
}

// 안개: 보는 쪽 유닛 누구와도 FOG_SIGHT 이상 떨어져 있으면 숨겨진다
export const ILLUMINATE_SIGHT = 2; // 발광: 안개 속 시야 +2
export const isHidden = (target, viewers) => viewers.every((v) => Math.abs(v.x - target.x) + Math.abs(v.y - target.y) >= FOG_SIGHT + (v.ability === 'illuminate' ? ILLUMINATE_SIGHT : 0));

// 에어록·날씨부정이 전장에 있으면 비·쾌청·모래바람·싸라기눈 효과 없음 (안개는 그대로)
export const effectiveWeather = (state) => (state.weather && state.weather !== 'fog' && state.units.some((u) => u.ability === 'air-lock' || u.ability === 'cloud-nine') ? null : state.weather ?? null);

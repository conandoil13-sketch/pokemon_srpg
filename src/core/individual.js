// 개체 차이 (순수): 개체값 · 성별 · 몸무게
import { SPECIES } from '../data/species.js';

// 안다리걸기·풀묶기: 상대 몸무게(kg)로 위력 (4세대)
export function weightPower(kg) {
  return kg < 10 ? 20 : kg < 25 ? 40 : kg < 50 ? 60 : kg < 100 ? 80 : kg < 200 ? 100 : 120;
}
// 헤비봄버·히트스탬프: 내 몸무게 ÷ 상대 몸무게
export function heavyPower(ratio) {
  return ratio >= 5 ? 120 : ratio >= 4 ? 100 : ratio >= 3 ? 80 : ratio >= 2 ? 60 : 40;
}
export const weightOf = (unit) => (unit.weight ?? SPECIES[unit.species]?.weight ?? 50) * (unit.abilityOff ? 1 : unit.ability === 'heavy-metal' ? 2 : unit.ability === 'light-metal' ? 0.5 : 1); // 헤비메탈·라이트메탈

import { hash } from '../render/pixels.js';

// ---- 개체값 ----
export const IV_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const IV_MAX = 31;
export const maxIvs = () => Object.fromEntries(IV_KEYS.map((k) => [k, IV_MAX]));
export const rollIvs = (rng) => Object.fromEntries(IV_KEYS.map((k) => [k, Math.min(IV_MAX, Math.floor(rng() * (IV_MAX + 1)))]));
export const hashIvs = (...seed) => Object.fromEntries(IV_KEYS.map((k) => [k, Math.min(IV_MAX, Math.floor(hash(...seed, 'iv', k) * (IV_MAX + 1)))]));
// 능력치마다 큰 값 (뽑기 중복). up = 오른 능력치
export function mergeIvs(have, add) {
  const ivs = {}, up = [];
  for (const k of IV_KEYS) { ivs[k] = Math.max(have[k] ?? 0, add[k] ?? 0); if (ivs[k] > (have[k] ?? 0)) up.push(k); }
  return { ivs, up };
}
export const ivGrade = (v) => (v >= 31 ? '최고' : v >= 26 ? '훌륭함' : v >= 16 ? '꽤 좋음' : v >= 1 ? '그럭저럭' : '별로');

// ---- 성별 ---- (genderRate: -1 없음, 0 ♂만, 8 ♀만, 그 외 ♀ 확률 rate/8)
export const GENDER_COLOR = { male: '#4878f0', female: '#f05878' };
const rateOf = (species) => SPECIES[species]?.genderRate ?? -1;
const fromRoll = (rate, r) => (rate < 0 ? null : rate === 0 ? 'male' : rate >= 8 ? 'female' : r < rate / 8 ? 'female' : 'male');
export const rollGender = (species, rng) => { const rate = rateOf(species); return rate > 0 && rate < 8 ? fromRoll(rate, rng()) : fromRoll(rate, 0); };
export const hashGender = (species, ...seed) => fromRoll(rateOf(species), hash(species, ...seed, 'gender'));
export const genderFixed = (species) => { const r = rateOf(species); return r <= 0 || r >= 8; };
export const genderFits = (species, g) => { const r = rateOf(species); return r < 0 ? g === null : r === 0 ? g === 'male' : r >= 8 ? g === 'female' : g === 'male' || g === 'female'; };

// 동료 찾기: 열쇠(uid) 로, 안 맞으면 종 이름으로 (members.memberByKey 와 같음 — 순환 import 피하려고 여기에)
export function findMember(game, key) {
  if (key === null || key === undefined) return undefined;
  const k = String(key);
  return game.party.find((m) => String(m.uid ?? m.species) === k) ?? game.party.find((m) => m.species === k);
}

// 얻은 성별(계열 기록) 중 지금 모습이 쓸 수 있는 것
export const usableGenders = (m) => (m.genders ?? []).filter((g) => genderFits(m.species, g));

// 성별 전환: 얻은 적 있는 성별 중 지금 모습에 맞는 것으로만, 비용 없음
export function setGender(game, key, g) {
  const m = findMember(game, key);
  if (!m) return { ok: false, reason: 'missing' };
  if (genderFixed(m.species)) return { ok: false, reason: 'fixed' };
  if (!usableGenders(m).includes(g)) return { ok: false, reason: 'locked' };
  m.gender = g;
  return { ok: true };
}

// 이름 옆 기호 (니드런처럼 이름에 기호가 있으면 생략)
export function genderSymbol(species, g) {
  if (!g) return '';
  if (/[♂♀]/.test(SPECIES[species]?.name ?? '')) return '';
  return g === 'male' ? '♂' : '♀';
}

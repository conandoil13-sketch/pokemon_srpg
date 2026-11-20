// 뽑기 (순수, rng 주입): 1단계 포켓몬, 계열 최종형 종족값으로 희귀도, 같은 계열이 있으면 결정
import { SPECIES } from '../data/species.js';
import { newMember } from './progress.js';
import { levelCapFor } from './difficulty.js';
import { mergeIvs, rollIvs, rollGender, genderFits } from './individual.js';
import { deployed } from './roster.js';
import { giveUid, syncLine } from './members.js';

import { addShards } from './shards.js';

const DUPLICATE_SHARDS = { common: 1, rare: 2, epic: 3 };
export const GACHA_COST = 100, GACHA_TEN_COST = 900; // 10연속은 10% 할인
export const RARITY = [{ id: 'common', weight: 70 }, { id: 'rare', weight: 25 }, { id: 'epic', weight: 5 }];
const RARE_MIN = 450, EPIC_MIN = 535;

// 계열 최종형들의 최대 종족값 합 (갈래 포함, 자기 자신 포함)
export function lineFinalBst(key) {
  const s = SPECIES[key];
  return Math.max(s.bst, ...s.evolutions.map((e) => lineFinalBst(e.to)));
}

export function rarityOf(key) {
  const b = lineFinalBst(key);
  return b >= EPIC_MIN ? 'epic' : b >= RARE_MIN ? 'rare' : 'common';
}

let poolCache = null;
export function gachaPool() {
  if (poolCache) return poolCache;
  const pool = { common: [], rare: [], epic: [] };
  for (const s of Object.values(SPECIES)) {
    if (s.stage === 0 && !s.legendary && s.key !== 'ditto') pool[rarityOf(s.key)].push(s.key);
  }
  for (const k of Object.keys(pool)) pool[k].sort();
  return (poolCache = pool);
}

// 1단계 조상 (진화 역방향)
const parentOf = {};
for (const s of Object.values(SPECIES)) for (const e of s.evolutions) parentOf[e.to] ??= s.key;
export function lineRoot(key) {
  let k = key;
  while (parentOf[k]) k = parentOf[k];
  return k;
}

// 합류 레벨: 출전 동료 평균 - 2 (최소 5). 출전 정보가 없으면 메타몽 외 파티 평균
export function joinLevel(game) {
  const out = game.sortie ? deployed(game).filter((m) => m.species !== 'ditto') : [];
  const pool = out.length ? out : game.party.filter((m) => m.species !== 'ditto');
  const cap = levelCapFor(game); // 레벨 상한
  if (!pool.length) return Math.min(5, cap);
  const avg = pool.reduce((s, m) => s + m.level, 0) / pool.length;
  return Math.min(cap, Math.max(5, Math.round(avg) - 2));
}

// 희귀도 → 볼 모양 (뽑기 연출)
export const BALL_OF = { common: 'poke', rare: 'great', epic: 'ultra' };

// 볼 하나의 결과 (코인·파티는 건드리지 않음)
export function rollBall(rng) {
  const total = RARITY.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total, rarity = RARITY[0].id;
  for (const r of RARITY) { if (roll < r.weight) { rarity = r.id; break; } roll -= r.weight; }
  const tier = gachaPool()[rarity];
  return { species: tier[Math.min(tier.length - 1, Math.floor(rng() * tier.length))], rarity };
}

// 볼 n개 (각각 따로 굴림)
export const rollBalls = (rng, n = 3) => Array.from({ length: n }, () => rollBall(rng));

// 고른 볼 받기: 코인 차감 + 동료 합류(이미 있는 계열이면 결정)
export function claimBall(game, ball, rng) {
  if ((game.coins ?? 0) < GACHA_COST) return { ok: false, reason: 'coins' };
  game.coins -= GACHA_COST;
  return applyBall(game, ball, rng);
}

// 10연속: 한 번에 결제하고 순서대로 받는다 (같은 계열 두 번째부터 결정)
export function claimBalls(game, balls, rng) {
  if ((game.items?.tenVoucher ?? 0) > 0) { game.items.tenVoucher -= 1; return { ok: true, voucher: true, results: balls.map((b) => applyBall(game, b, rng)) }; } // 바우처가 있으면 코인 대신
  if ((game.coins ?? 0) < GACHA_TEN_COST) return { ok: false, reason: 'coins' };
  game.coins -= GACHA_TEN_COST;
  return { ok: true, results: balls.map((b) => applyBall(game, b, rng)) };
}

function applyBall(game, ball, rng) {
  const { species, rarity } = ball;
  const have = game.party.find((m) => lineRoot(m.species) === species);
  if (have) { // 중복: 결정 + 개체값 능력치별 큰 값 + 새 성별 해금 (PokeRogue 식) — 같은 계열 모두 같이
    const shardCount = DUPLICATE_SHARDS[rarity];
    addShards(game, species, shardCount);
    const merged = mergeIvs(have.ivs ?? {}, rollIvs(rng));
    const g = rollGender(species, rng);
    const newGender = g && !(have.genders ?? []).includes(g) && genderFits(species, g) ? g : null; // 계열 뿌리 기준 (지금 모습이 못 써도 기록)
    syncLine(game, species, { ivs: merged.ivs, genders: newGender ? [...(have.genders ?? []), newGender] : have.genders ?? [] });
    return { ok: true, species, rarity, duplicate: true, shardCount, ivUp: merged.up, newGender };
  }
  const member = giveUid(game, newMember(species, joinLevel(game), rng)); // 특성 슬롯도 무작위
  game.party.push(member);
  return { ok: true, species, rarity, duplicate: false, member };
}

// 1회 뽑기 (기존 호출 호환). 코인이 없으면 굴리지 않는다
export function pull(game, rng) {
  if ((game.coins ?? 0) < GACHA_COST) return { ok: false, reason: 'coins' };
  return claimBall(game, rollBall(rng), rng);
}

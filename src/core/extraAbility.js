// 2칸 특성 굴리기 (순수). 스펙 docs/superpowers/specs/2026-11-24-extra-ability-slot2-design.md
// 결과(등급·특성·낚시)는 시드 = game.extraSeq 로 미리 정하고, 연출은 그 결과를 보여 줄 뿐이다
import { ABILITIES } from '../data/abilities.js';
import { ABILITY_TIERS } from '../data/abilityTiers.js';
import { createRng } from './rng.js';
import { findMember } from './individual.js';
import { lineRoot } from './gacha.js';
import { abilityOf } from './progress.js';
import { free } from './freeCost.js';

export const EXTRA_COST = 2; // 그 계열 결정
export const TIER_ODDS = { C: 0.5, B: 0.3, A: 0.15, S: 0.05 };
export const TEASE_ODDS = { A: 0.3, B: 0.1 }; // 낚시: 고급 룰렛까지 나온 뒤 이 등급에 멈춤
const ORDER = ['C', 'B', 'A', 'S']; // 낮은 등급부터
const EXTRA_SALT = 0x2ca7e5;
const seedOf = (seq) => (EXTRA_SALT ^ Math.imul(seq + 1, 0x9e3779b1)) >>> 0;

export const extraTier = (id) => (id && ABILITY_TIERS[id] && ABILITY_TIERS[id] !== 'SS' ? ABILITY_TIERS[id] : null);

// 그 등급의 후보 (SS·효과 없음·지금 1칸 제외), id 순
export const extraCandidates = (tier, excludeId) => Object.keys(ABILITY_TIERS)
  .filter((id) => ABILITY_TIERS[id] === tier && id !== excludeId && ABILITIES[id] && !ABILITIES[id].inactive).sort();

function pickTier(r) {
  let acc = 0;
  for (const t of ORDER) { acc += TIER_ODDS[t]; if (r < acc) return t; }
  return 'C';
}

export function rollExtraAbility(seq, excludeId) {
  const rng = createRng(seedOf(seq));
  const want = pickTier(rng());
  const i = ORDER.indexOf(want);
  const tiers = [want, ...ORDER.slice(0, i).reverse(), ...ORDER.slice(i + 1)]; // 비면 아래 등급 → 위 등급
  const tier = tiers.find((t) => extraCandidates(t, excludeId).length > 0);
  const cands = extraCandidates(tier, excludeId);
  const id = cands[Math.floor(rng() * cands.length)];
  const tease = (TEASE_ODDS[tier] ?? 0) > 0 && rng() < TEASE_ODDS[tier];
  return { tier, id, tease };
}

// 동료 하나 굴리기: 결정 차감 · 2칸 교체 · 카운터 +1
export function rollExtra(game, key) {
  const m = findMember(game, key);
  if (!m) return { ok: false, reason: 'missing' };
  const root = lineRoot(m.species);
  if ((game.shards?.[root] ?? 0) < free(game, EXTRA_COST)) return { ok: false, reason: 'shards' };
  const seq = Number.isInteger(game.extraSeq) && game.extraSeq >= 0 ? game.extraSeq : 0;
  const r = rollExtraAbility(seq, abilityOf(m));
  game.shards[root] = (game.shards[root] ?? 0) - free(game, EXTRA_COST);
  game.extraSeq = seq + 1;
  const prev = m.extraAbility ?? null;
  m.extraAbility = r.id;
  return { ok: true, ...r, prev };
}

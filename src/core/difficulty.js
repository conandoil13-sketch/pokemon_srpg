// 난이도 곡선 (순수): 위협도 · 층 적 굴림 · 레벨 상한. 규칙: docs/dungeon-guide.md
import { SPECIES } from '../data/species.js';
import { DUNGEONS } from '../data/dungeons.js';

// 적 한 마리의 위협도 = 레벨 × 종족값 합 / 100
export const threat = (level, species) => (level * SPECIES[species].bst) / 100;
// 권장 레벨 (최소 컷): 그 층 적의 기본 레벨
export const recommendedLevel = (dungeon, floor) => dungeon.baseLevel[Math.min(floor, dungeon.floors) - 1];
export const bossLevel = (dungeon) => dungeon.baseLevel[dungeon.floors - 1] + dungeon.boss.levelBonus;

// 레벨 상한: 해금 사슬에서 아직 돌파하지 않은 첫 던전의 상한, 다 돌파했으면 마지막 던전 상한 (던전이 늘면 이어진다)
export function levelCapFor(game, list = DUNGEONS) {
  const cleared = game.cleared ?? [];
  const done = new Set(list.filter((d) => cleared.includes(d.id)).map((d) => d.stage ?? d.id)); // 분기는 하나만 깨도 그 단계 돌파
  const next = list.find((d) => !done.has(d.stage ?? d.id));
  return (next ?? list[list.length - 1]).levelCap;
}

// ---- 층 적 굴림 (층 시드에서 별도 난수 — 지형·상자·날씨 불변) ----
import { encounterPool } from './encounters.js';
import { createRng } from './rng.js';

// 구성 유형: 무리형(약한 적 잔뜩) · 보통형 · 준보스형(센 적 몇 마리). 1~2층은 준보스 없음
export const COMPOSITION = {
  early: [{ id: 'swarm', w: 0.4 }, { id: 'normal', w: 0.6 }],
  later: [{ id: 'swarm', w: 0.3 }, { id: 'normal', w: 0.5 }, { id: 'elite', w: 0.2 }],
};
const SHAPE = {
  swarm: { half: 'low', dl: [-1, -1], max: 7 },
  normal: { half: null, dl: [-1, 1], max: 6 },
  elite: { half: 'high', dl: [2, 2], max: 3 },
};
export const MIN_ENEMIES = 2, EARLY_MAX = 4;

// 깊을수록 예산이 무작위로 더 커질 수 있다 (사용자 결정): 1~2층 0, 그 뒤 층마다 +5%p, 뒤 던전일수록 +5%p, 최대 +25%
export const BONUS_STEP = 0.05, BONUS_MAX = 0.25;
export function budgetBonusMax(dungeon, floor) {
  if (floor <= 2) return 0;
  const order = Math.max(0, DUNGEONS.findIndex((d) => d.id === dungeon.id));
  return Math.min(BONUS_MAX, BONUS_STEP * (floor - 2) + BONUS_STEP * order);
}

export function rollEnemies(dungeon, floor, seed) {
  const rng = createRng((seed ^ Math.imul(floor + 7919, 0x85ebca6b) ^ 0x5bd1e995) >>> 0);
  const early = floor <= 2;
  const table = early ? COMPOSITION.early : COMPOSITION.later;
  let r = rng(), kind = table[table.length - 1].id;
  for (const t of table) { if (r < t.w) { kind = t.id; break; } r -= t.w; }
  const shape = SHAPE[kind], base = dungeon.baseLevel[floor - 1];
  const budget = dungeon.budget[floor - 1] * (1 + rng() * budgetBonusMax(dungeon, floor)); // 깊은 층은 가끔 더 빡빡
  const pool = encounterPool(dungeon, floor, { half: shape.half });
  const all = encounterPool(dungeon, floor);
  const max = Math.min(shape.max, early ? EARLY_MAX : Infinity);
  // 약한 쪽으로 맞출 때: 가장 약한 몇 종 중 무작위 (한 종만 계속 나오지 않게)
  const cheapest = (list, level) => { const w = [...list].sort((a, b) => threat(level, a) - threat(level, b) || a.localeCompare(b)).slice(0, 4); return w[Math.floor(rng() * w.length)]; };
  const out = [];
  let sum = 0;
  while (out.length < max) {
    const level = Math.max(2, base + shape.dl[0] + Math.floor(rng() * (shape.dl[1] - shape.dl[0] + 1)));
    let species = pool[Math.floor(rng() * pool.length)];
    if (dungeon.minorTypes && SPECIES[species].types.every((t) => dungeon.minorTypes.includes(t)) && rng() < 0.7) species = pool[Math.floor(rng() * pool.length)]; // 해변: 소수 타입은 드물게
    let lv = level;
    if (sum + threat(lv, species) > budget) { // 더 약한 종·낮은 레벨로 다시 맞춰 본다
      lv = Math.max(2, base + shape.dl[0]);
      species = cheapest(pool, lv);
      if (sum + threat(lv, species) > budget) break;
    }
    out.push({ species, level: lv });
    sum += threat(lv, species);
  }
  while (out.length < MIN_ENEMIES) { // 최소 2마리: 그 층 가장 약한 후보로
    const lv = Math.max(2, base - 1), species = cheapest(all, lv);
    out.push({ species, level: lv });
  }
  return out;
}

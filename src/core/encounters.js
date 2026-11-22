// 던전 적 후보 (순수): 테마 타입 · 진화 단계 상한 · 종족값 합 상한. 전설·환상·메타몽 제외
import { SPECIES } from '../data/species.js';

const RELAX_STEPS = 3;

// half: 'low' | 'high' — 그 층 후보의 종족값 하위/상위 절반 (무리형·준보스형)
export function encounterPool(dungeon, floor, { boss = false, half = null } = {}) {
  const pool = basePool(dungeon, floor, { boss });
  if (!half || pool.length < 2) return pool;
  const sorted = [...pool].sort((a, b) => SPECIES[a].bst - SPECIES[b].bst || a.localeCompare(b));
  const mid = Math.ceil(sorted.length / 2);
  return (half === 'low' ? sorted.slice(0, mid) : sorted.slice(sorted.length - mid)).sort();
}

function basePool(dungeon, floor, { boss = false } = {}) {
  // 1~2층(보스 아님): 그 던전의 초반 종만 (진화 단계 상한 안)
  if (!boss && floor <= 2 && dungeon.early?.length) {
    const early = dungeon.early.filter((k) => SPECIES[k] && SPECIES[k].stage <= dungeon.stageCap(floor)).sort();
    if (early.length) return early;
  }
  let stageCap = dungeon.stageCap(floor);
  let bstCap = dungeon.bstCap + (boss ? 80 : 0);
  for (let step = 0; step <= RELAX_STEPS; step++) {
    const pool = Object.values(SPECIES)
      .filter((s) => !s.legendary && s.key !== 'ditto' && s.key !== 'shedinja' /* 불가사의부적: 적으로 안 나옴 (사용자 결정) */ && s.types.some((t) => dungeon.types.includes(t)) && s.stage <= stageCap && s.bst <= bstCap)
      .map((s) => s.key)
      .sort();
    if (pool.length) {
      if (!boss) return [...new Set([...pool, ...(dungeon.early ?? []).filter((k) => SPECIES[k].stage <= stageCap)])].sort();
      // 보스: 그 층 상한 단계를 우선. bossTypes 가 있으면 그 타입만 (해변: 물·얼음)
      const typed = dungeon.bossTypes ? pool.filter((k) => SPECIES[k].types.some((t) => dungeon.bossTypes.includes(t))) : pool;
      if (!typed.length) { stageCap = Math.min(2, stageCap + 1); bstCap += 50; continue; }
      const top = typed.filter((k) => SPECIES[k].stage === Math.min(stageCap, 2));
      return top.length ? top : typed;
    }
    stageCap = Math.min(2, stageCap + 1); // 후보가 없으면 조건을 조금씩 완화
    bstCap += 50;
  }
  return [dungeon.fallback];
}

// 던전 적 후보 (순수): 테마 타입 · 진화 단계 상한 · 종족값 합 상한. 전설·환상·메타몽 제외
import { SPECIES } from '../data/species.js';

const RELAX_STEPS = 3;

export function encounterPool(dungeon, floor, { boss = false } = {}) {
  let stageCap = dungeon.stageCap(floor);
  let bstCap = dungeon.bstCap + (boss ? 80 : 0);
  for (let step = 0; step <= RELAX_STEPS; step++) {
    const pool = Object.values(SPECIES)
      .filter((s) => !s.legendary && s.key !== 'ditto' && s.key !== 'shedinja' /* 불가사의부적: 적으로 안 나옴 (사용자 결정) */ && s.types.some((t) => dungeon.types.includes(t)) && s.stage <= stageCap && s.bst <= bstCap)
      .map((s) => s.key)
      .sort();
    if (pool.length) {
      if (!boss) return pool;
      // 보스: 그 층 상한 단계를 우선
      const top = pool.filter((k) => SPECIES[k].stage === Math.min(stageCap, 2));
      return top.length ? top : pool;
    }
    stageCap = Math.min(2, stageCap + 1); // 후보가 없으면 조건을 조금씩 완화
    bstCap += 50;
  }
  return [dungeon.fallback];
}

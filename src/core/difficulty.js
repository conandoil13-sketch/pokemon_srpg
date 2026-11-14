// 난이도 곡선 (순수): 위협도 · 층 적 굴림 · 레벨 상한. 규칙: docs/dungeon-guide.md
import { SPECIES } from '../data/species.js';
import { DUNGEONS } from '../data/dungeons.js';

// 적 한 마리의 위협도 = 레벨 × 종족값 합 / 100
export const threat = (level, species) => (level * SPECIES[species].bst) / 100;
export const bossLevel = (dungeon) => dungeon.baseLevel[dungeon.floors - 1] + dungeon.boss.levelBonus;

// 레벨 상한: 해금 사슬에서 아직 돌파하지 않은 첫 던전의 상한, 다 돌파했으면 마지막 던전 상한 (던전이 늘면 이어진다)
export function levelCapFor(game) {
  const cleared = game.cleared ?? [];
  const next = DUNGEONS.find((d) => !cleared.includes(d.id));
  return (next ?? DUNGEONS[DUNGEONS.length - 1]).levelCap;
}

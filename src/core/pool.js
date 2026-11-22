// 하수도 독 웅덩이 (`%`): 자기 페이즈 끝에 그 위에 서 있으면 최대 HP 1/8 (강철 1/16, 최소 1).
// 독 타입(복합 포함)·떠 있는 포켓몬(중력 아닌 비행·부유·전자부유)·매직가드는 면역. 스펙 docs/superpowers/specs/2026-11-22-sewer-design.md
import { typesOf, airborne, magicGuard } from './abilities.js';

export const POOL = '%';

export function poolDamage(unit, tile) {
  if (tile !== POOL) return null;
  const t = typesOf(unit);
  if (t.includes('poison') || airborne(unit) || magicGuard(unit)) return null;
  return { damage: Math.max(1, Math.floor(unit.maxHp / (t.includes('steel') ? 16 : 8))), kind: 'poisonPool' };
}

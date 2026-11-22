// 깊은 동굴 시야 (순수). 맨해튼 거리 SIGHT 안만 보임, 발광 +2. 보스 층에선 보스와 주변도 아군에게 늘 보임.
// 탐험 기억(state.explored): 아군이 한 번 본 칸 "x,y" (지형만 어둡게 남김). 스펙 docs/superpowers/specs/2026-11-22-deep-cave-design.md
import { has } from './abilities.js';

export const SIGHT = 2;
export const BOSS_LIGHT = 2;
const ILLUMINATE_BONUS = 2;
const key = (x, y) => `${x},${y}`;

export const sightOf = (u) => SIGHT + (has(u, 'illuminate') ? ILLUMINATE_BONUS : 0);
export const canSee = (viewer, p) => Math.abs(viewer.x - p.x) + Math.abs(viewer.y - p.y) <= sightOf(viewer);

function addDiamond(out, state, cx, cy, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r + Math.abs(dy); dx <= r - Math.abs(dy); dx++) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && y >= 0 && x < state.width && y < state.height) out.add(key(x, y));
  }
}

// side 편이 지금 보는 칸
export function seenCells(state, side) {
  const out = new Set();
  for (const u of state.units) if (u.side === side && u.hp > 0) addDiamond(out, state, u.x, u.y, sightOf(u));
  if (side === 'ally') for (const b of state.units) if (b.boss && b.side !== side && b.hp > 0) addDiamond(out, state, b.x, b.y, BOSS_LIGHT);
  return out;
}

// 어둠 속이라 side 편에게 안 보이는 상대 (맞거나 공격해 드러난 유닛은 다음 이동까지 보임)
export function darkUnseen(state, side) {
  if (!state.dark) return [];
  const seen = seenCells(state, side);
  return state.units.filter((u) => u.side !== side && u.hp > 0 && !u.revealed && !seen.has(key(u.x, u.y)));
}

export function markExplored(state) {
  if (!state.dark) return;
  for (const k of seenCells(state, 'ally')) state.explored.add(k);
}

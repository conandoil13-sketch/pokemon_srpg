// 시티 워프 타일: 아군이 이동을 워프 위에서 끝내면 짝 타일로 순간이동하고 그 자리에서 행동을 이어 간다.
// 비행 타입은 못 씀(드래곤은 씀), 적은 안 씀, 짝 칸에 누가 있으면 안 탐. 스펙 docs/superpowers/specs/2026-11-22-city-design.md
import { typesOf } from './abilities.js';
import { refreshField } from './field.js';

export const padAt = (state, x, y) => state.warps?.find((w) => w.x === x && w.y === y) ?? null;

export function warpTarget(state, u) {
  const pad = padAt(state, u.x, u.y);
  if (!pad || u.side !== 'ally' || u.hp <= 0) return null;
  const t = typesOf(u);
  if (t.includes('flying') && !t.includes('dragon')) return null;
  if (state.units.some((o) => o !== u && o.hp > 0 && o.x === pad.to.x && o.y === pad.to.y)) return null;
  return { ...pad.to };
}

// 반환: { from, to, color } 또는 null
export function useWarp(state, u) {
  const to = warpTarget(state, u);
  if (!to) return null;
  const from = { x: u.x, y: u.y }, color = padAt(state, u.x, u.y).color;
  u.x = to.x; u.y = to.y;
  refreshField(state); // 오라가 따라옴
  return { from, to, color };
}

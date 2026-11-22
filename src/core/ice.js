// 얼음동굴 (순수): 미끄러진 이동이 끝날 때의 부딪힘·고드름 판정, 얼음 타입이 지나간 물 얼리기
// 스펙 docs/superpowers/specs/2026-11-23-ice-cave-design.md · 미끄럼 길찾기는 pathfind.search
import { typesOf } from './abilities.js';
import { slides } from './pathfind.js';

export const ICICLE_DIV = 8; // 고드름 충돌 피해 = 최대 HP 1/8
const isIce = (u) => typesOf(u).includes('ice');
const unitAt = (state, x, y, not) => state.units.find((v) => v !== not && v.hp > 0 && v.x === x && v.y === y);

// 미끄러진 경로가 끝날 때 (u 는 아직 출발 칸): 끝 칸의 포켓몬을 한 칸 밀고, 빙판 위에서 막혔으면 부딪힘·고드름.
// 반환 = 고드름에 박힌 포켓몬 (없으면 null) · 이벤트는 events 에
export function iceBump(state, u, path, events) {
  const end = path.at(-1), prev = path.at(-2), dx = end.x - prev.x, dy = end.y - prev.y;
  const o = unitAt(state, end.x, end.y, u);
  if (o) { // pathfind 가 뒤 칸이 비었을 때만 이 칸을 허락함
    const from = { x: o.x, y: o.y };
    o.x += dx; o.y += dy;
    events.push({ kind: 'bump', unitId: o.id, by: u.id, from, to: { x: o.x, y: o.y } });
    return null;
  }
  if (state.grid[end.y][end.x] !== '_') return null; // 바닥에 닿아 멈춤
  const nx = end.x + dx, ny = end.y + dy, b = unitAt(state, nx, ny, u);
  if (b) {
    events.push({ kind: 'blocked', unitId: b.id, by: u.id });
    return state.grid[ny + dy]?.[nx + dx] === 'Y' && !isIce(b) ? b : null;
  }
  return state.grid[ny]?.[nx] === 'Y' && !isIce(u) ? u : null;
}

export const icicleDamage = (u) => Math.max(1, Math.floor(u.maxHp / ICICLE_DIV));

// 얼음 타입이 지나가거나 멈춘 물 칸 → 빙판 (그 층 동안. 해변 밀물은 applyTide 가 다시 물로)
export function freezeWater(state, u, cells) {
  if (!isIce(u)) return;
  for (const { x, y } of cells) {
    const row = state.grid[y];
    if (row?.[x] === '~') state.grid[y] = row.slice(0, x) + '_' + row.slice(x + 1);
  }
}

// AI: 미끄러지는 포켓몬이 고드름 옆 빙판에서 멈추는 칸은 고드름에 박혀 멈춘 것 (방향을 몰라도 충분)
export function icicleRisk(state, u, p) {
  if (state.grid[p.y]?.[p.x] !== '_' || !slides(u)) return 0;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.grid[p.y + dy]?.[p.x + dx] === 'Y') ? icicleDamage(u) : 0;
}

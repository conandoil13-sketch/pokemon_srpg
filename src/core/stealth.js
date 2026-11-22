// 악 타입 수풀 숨기 (타입별 지형 이득): 악 타입이 수풀 칸에 있고 상대 편 누구와도 3칸보다 멀면 그 편에게 안 보인다.
// 공격기를 쓰거나 공격에 맞으면 revealed — 다음에 자기가 움직일 때까지 숨지 못한다 (battle.js 가 켜고 끔).
import { typesOf } from './abilities.js';

export const DARK_SIGHT = 3;
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function darkHidden(state, u, viewers = state.units.filter((o) => o.side !== u.side)) {
  return !u.revealed && u.hp > 0 && state.grid[u.y]?.[u.x] === '"' && typesOf(u).includes('dark') && viewers.every((v) => dist(v, u) > DARK_SIGHT);
}

// side 편에게 안 보이는 상대 id
export const hiddenFrom = (state, side) => new Set(state.units.filter((u) => u.side !== side && darkHidden(state, u)).map((u) => u.id));

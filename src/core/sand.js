// 사막 모래 (순수): 깊은 모래 `:` (비용·회피는 pathfind·damage) · 흐르는 모래 `=` (state.flows 방향으로 1칸) · 모래지옥 `o` 바깥 / `@` 가운데
// 판정은 행동을 마칠 때 한 번 (states 가 부른다). 떠 있음·숨기 중이면 전부 무시. 목적지가 막히면 제자리, 연쇄 없음
// 스펙 docs/superpowers/specs/2026-11-23-desert-design.md
import { airborne } from './abilities.js';
import { canEnter } from './pathfind.js';
import { refreshField } from './field.js';
import { markExplored } from './vision.js';

export const SAND_TILES = ':=o@';
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const BLOCK = '#^*GB'; // 벽·바위·더미·발전기·건물: 밀려 들어가지 않음

export const onSand = (state, u) => !airborne(u) && !u.burrow && SAND_TILES.includes(state.grid[u.y]?.[u.x] ?? '#');

// 바깥 칸 → 이웃 8칸 중 가운데 '@'
function pitCenter(grid, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[y + dy]?.[x + dx] === '@') return { x: x + dx, y: y + dy };
  return null;
}

// (x,y) 에서 행동을 마치면 갈 칸 (막힘은 아직 안 봄)
function pull(state, u, x, y) {
  const t = state.grid[y]?.[x];
  if (t === '=') { const v = VEC[state.flows?.[`${x},${y}`]]; return v ? { kind: 'flow', to: { x: x + v[0], y: y + v[1] } } : null; }
  if (t === 'o' && !u.pitEscaped) { const c = pitCenter(state.grid, x, y); return c ? { kind: 'pit', to: c } : null; }
  return null;
}

function blocked(state, u, { x, y }) {
  const t = state.grid[y]?.[x];
  if (t === undefined || BLOCK.includes(t) || !canEnter(t, u, !!state.grid.trees)) return true;
  return state.units.some((o) => o !== u && o.hp > 0 && o.x === x && o.y === y);
}

// AI 미리 보기: cell 에서 행동을 마치면 최종 자리, stuck = 모래지옥 가운데 (다음 턴 묶임)
export function sandLanding(state, u, cell) {
  let end = { x: cell.x, y: cell.y };
  if (!airborne(u) && !u.burrow) {
    const p = pull(state, u, cell.x, cell.y);
    if (p && !blocked(state, { ...u, x: cell.x, y: cell.y }, p.to)) end = p.to;
  }
  return { ...end, stuck: !airborne(u) && !u.burrow && state.grid[end.y]?.[end.x] === '@' };
}

// 행동을 마친 유닛을 밀거나 끌어당긴다. 반환 { kind: 'flow'|'pit', from, to } | null
export function sandShift(state, u) {
  if (!state.units.includes(u) && !state.units.some((o) => o.id === u.id)) return null;
  if (!onSand(state, u)) return null;
  const p = pull(state, u, u.x, u.y);
  if (!p || blocked(state, u, p.to)) return null;
  const from = { x: u.x, y: u.y };
  u.x = p.to.x; u.y = p.to.y;
  markExplored(state);
  refreshField(state);
  return { kind: p.kind, from, to: { ...p.to } };
}

// 이번 턴에 모래 판정을 받은 유닛 표시 (행동 끝·턴 종료 한 번씩) — 잠듦·얼음처럼 페이즈 시작부터 acted 인 유닛도 판정 대상
export const markSettled = (state, u) => { u.sandTurn = state.turn; };
export const unsettled = (state, side) => state.units.filter((u) => u.side === side && u.hp > 0 && u.sandTurn !== state.turn);

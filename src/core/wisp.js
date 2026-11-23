// 묘지 혼불 (순수 규칙). 층 예정표 state.wisps = [{ x, y, round, species, level, lit, done }]
// 등장 라운드 바로 전 라운드의 적 페이즈 끝에 묘비에 혼불이 피고, 다음 적 페이즈 끝에 묘비 옆 빈칸(가장 가까운 아군 쪽)으로
// 고스트 1마리. 빈칸이 없으면 한 라운드 미룸. 층이 이미 끝났으면(state.result) 아무 일도 없음.
import { canEnter } from './pathfind.js';

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 적 페이즈 끝마다. make(w, x, y, i) = 새 적 유닛 (battle.js 가 만들어 줌). 반환 = 이번 일 [{kind:'lit'|'spawn', ...}]
export function wispPhase(state, make) {
  const out = [];
  if (state.result || !state.wisps?.length) return out;
  const allies = state.units.filter((u) => u.side === 'ally');
  state.wisps.forEach((w, i) => {
    if (w.done) return;
    if (!w.lit) { if (state.turn === w.round - 1) { w.lit = true; out.push({ kind: 'lit', x: w.x, y: w.y }); } return; }
    if (state.turn < w.round) return;
    const near = (p) => Math.min(Infinity, ...allies.map((a) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y)));
    const spot = SIDES.map(([dx, dy]) => ({ x: w.x + dx, y: w.y + dy }))
      .filter((p) => canEnter(state.grid[p.y]?.[p.x], w.species) && !state.units.some((u) => u.x === p.x && u.y === p.y))
      .sort((a, b) => near(a) - near(b))[0];
    if (!spot) return; // 자리 없음: 혼불은 켜진 채 다음 라운드
    const u = make(w, spot.x, spot.y, i);
    state.units.push(u);
    w.lit = false; w.done = true;
    out.push({ kind: 'spawn', unitId: u.id, x: spot.x, y: spot.y, from: { x: w.x, y: w.y } });
  });
  return out;
}

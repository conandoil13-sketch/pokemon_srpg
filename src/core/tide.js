// 해변 물때 (순수): 기본 0 · 밀물 +1 · 썰물 −1. 라운드 1~3 = 0, 4~6 = +1, 7~9 = 0, 10~12 = −1, 반복.
// 칸 등급: a = 해안 첫 줄, b = 둘째 줄 (c 는 늘 깊은 물이라 기록 안 함). 스펙 docs/superpowers/specs/2026-11-22-beach-design.md
const ORDER = [0, 1, 0, -1];
export const TIDE_ROUNDS = 3;
export const tideFor = (turn) => ORDER[Math.floor((turn - 1) / TIDE_ROUNDS) % ORDER.length];

const TILES = { a: { '-1': '.', 0: ',', 1: '~' }, b: { '-1': ',', 0: '~', 1: '~' } };
export const tideTile = (grade, level) => TILES[grade][level];

// 격자 행(문자열)을 바꿔 끼움 — 배열 자체(grid.trees 등 속성)는 그대로
export function applyTide(state, level) {
  state.tide = level;
  if (!state.tideCells) return;
  for (const grade of ['a', 'b']) for (const { x, y } of state.tideCells[grade]) {
    const row = state.grid[y], ch = tideTile(grade, level);
    if (row[x] !== ch) state.grid[y] = row.slice(0, x) + ch + row.slice(x + 1);
  }
}

// 다음 라운드에 물때가 바뀌면 { next, cells(글자가 바뀔 칸) }, 아니면 null
export function tidePreview(state) {
  if (!state.tideCells) return null;
  const next = tideFor(state.turn + 1);
  if (next === (state.tide ?? 0)) return null;
  const cells = [];
  for (const grade of ['a', 'b']) for (const p of state.tideCells[grade]) if (tideTile(grade, next) !== tideTile(grade, state.tide ?? 0)) cells.push(p);
  return { next, cells };
}

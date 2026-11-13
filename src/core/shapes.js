// 기술 범위 모양 (순수). 전투·AI·화면이 모두 이 계산만 쓴다.
// aim: { unitId } (단일) | { dir } (직선·부채꼴) | { self: true } (주변) | { x, y } (착탄·단일 칸)
export const DIRS = ['up', 'down', 'left', 'right'];
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const inMap = (state, x, y) => x >= 0 && y >= 0 && x < state.width && y < state.height;
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const aimRangeOf = (move) => move.aimRange ?? move.shape?.range ?? move.range ?? [1, 1];

export function tilesOf(state, user, move, aim) {
  const s = move.shape ?? { type: 'single' };
  const keep = (ts) => ts.filter((t) => inMap(state, t.x, t.y));
  switch (s.type) {
    case 'line': {
      const [dx, dy] = VEC[aim.dir];
      const out = [];
      for (let i = 1; i <= (s.length ?? 3); i++) {
        const x = user.x + dx * i, y = user.y + dy * i;
        if (!inMap(state, x, y) || state.grid[y][x] === '#') break; // 벽에서 멈춤
        out.push({ x, y });
      }
      return out;
    }
    case 'cone': {
      const [dx, dy] = VEC[aim.dir];
      const f = { x: user.x + dx, y: user.y + dy };
      return keep([f, { x: f.x + dy, y: f.y + dx }, { x: f.x - dy, y: f.y - dx }, { x: user.x + dx * 2, y: user.y + dy * 2 }]);
    }
    case 'around': {
      const r = s.radius ?? 1, out = [];
      for (let y = user.y - r; y <= user.y + r; y++) for (let x = user.x - r; x <= user.x + r; x++) if (x !== user.x || y !== user.y) out.push({ x, y });
      return keep(out);
    }
    case 'blast':
      return keep([{ x: aim.x, y: aim.y }, { x: aim.x + 1, y: aim.y }, { x: aim.x - 1, y: aim.y }, { x: aim.x, y: aim.y + 1 }, { x: aim.x, y: aim.y - 1 }]);
    default: { // single
      if (aim.unitId) { const u = state.units.find((o) => o.id === aim.unitId); return u ? [{ x: u.x, y: u.y }] : []; }
      return [{ x: aim.x, y: aim.y }];
    }
  }
}

// 맞는 유닛: 상대, friendlyFire 면 같은 편도. 사용자 자신은 제외
export function unitsHit(state, user, move, aim) {
  const keys = new Set(tilesOf(state, user, move, aim).map((t) => `${t.x},${t.y}`));
  return state.units.filter((u) => u !== user && u.hp > 0 && keys.has(`${u.x},${u.y}`) && (u.side !== user.side || move.friendlyFire));
}

export function aimsOf(state, user, move) {
  const type = move.shape?.type ?? 'single';
  if (type === 'around') return [{ self: true }];
  if (type === 'line' || type === 'cone') return DIRS.filter((dir) => tilesOf(state, user, move, { dir }).length).map((dir) => ({ dir }));
  const [lo, hi] = aimRangeOf(move);
  if (type === 'blast') {
    const out = [];
    for (let y = user.y - hi; y <= user.y + hi; y++) for (let x = user.x - hi; x <= user.x + hi; x++) {
      const d = dist(user, { x, y });
      if (d < lo || d > hi || !inMap(state, x, y)) continue;
      if (unitsHit(state, user, move, { x, y }).some((u) => u.side !== user.side)) out.push({ x, y });
    }
    return out;
  }
  return state.units.filter((u) => u.side !== user.side && u.hp > 0 && dist(u, user) >= lo && dist(u, user) <= hi).map((u) => ({ unitId: u.id }));
}

// 적 수 − 같은 편 수가 가장 큰 조준 (동점은 앞쪽)
export function bestAim(state, user, move) {
  let best = null, top = -Infinity;
  for (const aim of aimsOf(state, user, move)) {
    const hit = unitsHit(state, user, move, aim);
    const score = hit.filter((u) => u.side !== user.side).length - hit.filter((u) => u.side === user.side).length;
    if (score > top) { top = score; best = aim; }
  }
  return best;
}

// 닿을 수 있는 맨해튼 거리 범위 (위협 계산·공격 가능 칸 표시용)
export function coverage(move) {
  const s = move.shape ?? { type: 'single', range: move.range };
  switch (s.type) {
    case 'line': return [1, s.length ?? 3];
    case 'cone': return [1, 2];
    case 'around': return [1, 2 * (s.radius ?? 1)];
    case 'blast': { const [lo, hi] = s.range ?? [2, 3]; return [Math.max(1, lo - 1), hi + 1]; }
    default: return s.range ?? move.range ?? [1, 1];
  }
}

// 기술 범위 모양 (순수). 전투·AI·화면이 모두 이 계산만 쓴다.
// aim: { unitId } (단일) | { dir } (직선·부채꼴) | { self: true } (주변) | { x, y } (착탄·단일 칸)
import { hiddenFrom } from './stealth.js';
import { DASH, dashPath } from './dash.js';
import { has } from './abilitySlots.js';
export const DIRS = ['up', 'down', 'left', 'right'];
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const inMap = (state, x, y) => x >= 0 && y >= 0 && x < state.width && y < state.height;
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const aimRangeOf = (move) => move.aimRange ?? move.shape?.range ?? move.range ?? [1, 1];
// 스나이퍼: 사거리 2 이상 기술은 1칸 더
export const sniperBonus = (user, hi) => (has(user, 'sniper') && hi >= 2 ? 1 : 0);

// 직선·부채꼴에 대상 유닛으로 조준하면(옛 호출 방식) 그 유닛 쪽 방향으로 바꾼다
function dirToward(state, user, aim) {
  const u = aim.unitId ? state.units.find((o) => o.id === aim.unitId) : aim.x !== undefined ? aim : null;
  if (!u) return 'right';
  const dx = u.x - user.x, dy = u.y - user.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

export function tilesOf(state, user, move, aim) {
  const s = move.shape ?? { type: 'single' };
  if ((s.type === 'line' || s.type === 'cone') && !aim.dir) aim = { dir: dirToward(state, user, aim) };
  const keep = (ts) => ts.filter((t) => inMap(state, t.x, t.y));
  switch (s.type) {
    case 'line': {
      const [dx, dy] = VEC[aim.dir];
      const out = [];
      const len = (s.length ?? 3) + sniperBonus(user, s.length ?? 3);
      for (let i = 1; i <= len; i++) {
        const x = user.x + dx * i, y = user.y + dy * i;
        if (!inMap(state, x, y) || '#GVT'.includes(state.grid[y][x])) break; // 벽·발전기·분출구·묘비에서 멈춤
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
// 숨기(공중날기·구멍파기·다이빙·섀도다이브): 숨은 포켓몬은 예외 기술만 맞는다 (땅속·물속 예외는 위력 2배)
const HIDE_HITS = { ground: ['earthquake', 'magnitude'], sky: ['thunder', 'gust', 'twister', 'sky-uppercut'], water: ['surf', 'whirlpool'], shadow: [] };
const HIDE_DOUBLE = { ground: ['earthquake', 'magnitude'], water: ['surf', 'whirlpool'] };
export const canTarget = (move, u) => !u.burrow || (HIDE_HITS[u.burrow.kind] ?? []).includes(move.id);
export const hideDouble = (move, u) => !!u.burrow && (HIDE_DOUBLE[u.burrow.kind] ?? []).includes(move.id);

export function unitsHit(state, user, move, aim) {
  const keys = new Set(tilesOf(state, user, move, aim).map((t) => `${t.x},${t.y}`));
  return state.units.filter((u) => u !== user && u.hp > 0 && keys.has(`${u.x},${u.y}`) && (u.side !== user.side || move.friendlyFire) && canTarget(move, u));
}

export function aimsOf(state, user, move) {
  const type = move.shape?.type ?? 'single';
  if (type === 'around') return [{ self: true }];
  if (type === 'line' || type === 'cone') return DIRS.filter((dir) => tilesOf(state, user, move, { dir }).length).map((dir) => ({ dir }));
  const [lo, hi0] = aimRangeOf(move), hi = hi0 + sniperBonus(user, hi0);
  if (type === 'blast') {
    const out = [];
    for (let y = user.y - hi; y <= user.y + hi; y++) for (let x = user.x - hi; x <= user.x + hi; x++) {
      const d = dist(user, { x, y });
      if (d < lo || d > hi || !inMap(state, x, y)) continue;
      if (unitsHit(state, user, move, { x, y }).some((u) => u.side !== user.side)) out.push({ x, y });
    }
    return out;
  }
  return state.units.filter((u) => u.side !== user.side && u.hp > 0 && ((dist(u, user) >= lo && dist(u, user) <= hi) || (DASH[move.id] && dashPath(state, user, move, u)))).map((u) => ({ unitId: u.id })); // 대시: 곧게 달려가 닿는 상대도
}

// 기억으로 겨냥 (악 수풀 숨기): 쓰는 쪽에게 숨은 상대가 하나라도 있으면, 비어 보이는 수풀 칸(숨은 상대 칸 포함)을 덮는 조준
// 숨은 상대가 없으면 [] (위치는 알려 주지 않음 — 어딘가 숨어 있다는 것만)
export function guessAims(state, user, move) {
  const hidden = hiddenFrom(state, user.side);
  if (!hidden.size) return [];
  const looksEmpty = (t) => state.grid[t.y]?.[t.x] === '"' && !state.units.some((u) => u.x === t.x && u.y === t.y && !hidden.has(u.id));
  const covers = (aim) => tilesOf(state, user, move, aim).some(looksEmpty);
  const type = move.shape?.type ?? 'single';
  if (type === 'around') return covers({ self: true }) ? [{ self: true }] : [];
  if (type === 'line' || type === 'cone') return DIRS.filter((dir) => covers({ dir })).map((dir) => ({ dir }));
  const [lo, hi0] = aimRangeOf(move), hi = hi0 + sniperBonus(user, hi0), out = [];
  for (let y = user.y - hi; y <= user.y + hi; y++) for (let x = user.x - hi; x <= user.x + hi; x++) {
    const d = dist(user, { x, y });
    if (d < lo || d > hi || !inMap(state, x, y)) continue;
    if (type === 'blast' ? covers({ x, y }) : looksEmpty({ x, y })) out.push({ x, y });
  }
  return out;
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

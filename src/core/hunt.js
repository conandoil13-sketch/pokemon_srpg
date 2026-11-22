// 깊은 동굴 적의 탐색·추적 (순수). 적이 아군을 하나도 못 볼 때의 이동 계획을 정한다 — 보이면 null (기존 AI 가 맡음).
// u.hunt = { mode: 'patrol' | 'chase' | 'track' | 'lost', goal?, last?, targetId?, turns? }
// 스펙 docs/superpowers/specs/2026-11-22-deep-cave-design.md
import { reachable, canEnter } from './pathfind.js';
import { moveBudget } from './status.js';
import { canSee } from './vision.js';

export const TRACK_CHANCE = 0.6; // 시야 이탈 한 번당: 추적 60% · 길 잃음 40%
export const SEARCH_RADIUS = 3;
export const SEARCH_TURNS = 2;
const key = (x, y) => `${x},${y}`;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// 목표 칸에서 거꾸로 걷는 거리 (유닛은 무시, 지형만)
function distFrom(state, u, goal) {
  const d = new Map([[key(goal.x, goal.y), 0]]), q = [goal];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, y = c.y + dy, k = key(x, y);
      if (d.has(k) || !canEnter(state.grid[y]?.[x], u)) continue;
      d.set(k, d.get(key(c.x, c.y)) + 1); q.push({ x, y });
    }
  }
  return d;
}

function toward(state, u, goal, budget = null) {
  const reach = reachable(state.grid, state.units, u, budget), d = distFrom(state, u, goal);
  const score = (p) => d.get(key(p.x, p.y)) ?? 1000 + manhattan(p, goal);
  let best = { x: u.x, y: u.y }, bs = score(best);
  for (const k of reach.keys()) {
    const [x, y] = k.split(',').map(Number), s = score({ x, y });
    if (s < bs) { bs = s; best = { x, y }; }
  }
  return best;
}

// 정보 전달: 발견한 적이 아무것도 모르는 가장 가까운 적 하나에게 아군 위치를 알림 → 그 적이 와서 직접 보면 또 다음 적에게
function relay(state, u, target) {
  const uninformed = state.units.filter((o) => o !== u && o.side === u.side && o.hp > 0 && !o.boss && !['chase', 'track'].includes(o.hunt?.mode));
  if (!uninformed.length) return;
  const n = uninformed.reduce((m, o) => (manhattan(u, o) < manhattan(u, m) ? o : m));
  n.hunt = { mode: 'track', goal: { x: target.x, y: target.y } };
}

const stay = (u) => ({ moveTo: { x: u.x, y: u.y }, attack: null });

export function huntPlan(state, u, rng = Math.random) {
  const foes = state.units.filter((o) => o.side !== u.side && o.hp > 0 && !o.burrow);
  const seen = foes.filter((a) => canSee(u, a));
  if (seen.length) {
    const t = seen.reduce((m, a) => (manhattan(u, a) < manhattan(u, m) ? a : m));
    if (u.hunt?.mode !== 'chase') relay(state, u, t); // 새로 발견했을 때만 한 명에게 알림
    u.hunt = { mode: 'chase', last: { x: t.x, y: t.y }, targetId: t.id };
    return null;
  }
  let h = u.hunt ?? { mode: 'patrol' };
  if (h.mode === 'chase') { // 시야 이탈: 한 번만 굴림
    const t = foes.find((a) => a.id === h.targetId);
    h = rng() < TRACK_CHANCE ? { mode: 'track', goal: t ? { x: t.x, y: t.y } : { ...h.last } } : { mode: 'lost', goal: { ...h.last }, turns: SEARCH_TURNS };
  }
  if (h.mode === 'track') {
    if (manhattan(u, h.goal) > 1) { u.hunt = h; return { moveTo: toward(state, u, h.goal), attack: null }; }
    h = { mode: 'lost', goal: h.goal, turns: SEARCH_TURNS }; // 도착했는데 아무도 없음
  }
  if (h.mode === 'lost') {
    if (manhattan(u, h.goal) > SEARCH_RADIUS) { u.hunt = h; return { moveTo: toward(state, u, h.goal), attack: null }; }
    const near = [...reachable(state.grid, state.units, u).keys()].map((k) => k.split(',').map(Number)).filter(([x, y]) => manhattan({ x, y }, h.goal) <= SEARCH_RADIUS);
    const pick = near.length ? near[Math.floor(rng() * near.length)] : [u.x, u.y];
    const turns = h.turns - 1;
    u.hunt = turns > 0 ? { ...h, turns } : { mode: 'patrol' };
    return { moveTo: { x: pick[0], y: pick[1] }, attack: null };
  }
  // 순찰: 보스는 제자리, 나머지는 이동력 절반으로 무작위 목표 칸까지
  if (u.boss) { u.hunt = { mode: 'patrol' }; return stay(u); }
  let goal = h.goal;
  if (!goal || manhattan(u, goal) <= 1) {
    const cells = [];
    for (let y = 0; y < state.height; y++) for (let x = 0; x < state.width; x++) if (state.grid[y][x] === '.' && canEnter('.', u)) cells.push({ x, y });
    goal = cells[Math.floor(rng() * cells.length)] ?? { x: u.x, y: u.y };
  }
  u.hunt = { mode: 'patrol', goal };
  return { moveTo: toward(state, u, goal, Math.floor(moveBudget(u) / 2)), attack: null };
}

// 안 보이는 곳에서 맞음 → 공격한 쪽 위치로 추적
export function alertHunt(state, victim, attacker) {
  if (!state.dark || !attacker || victim.side === attacker.side || victim.side !== 'enemy' || canSee(victim, attacker)) return;
  victim.hunt = { mode: 'track', goal: { x: attacker.x, y: attacker.y } };
}

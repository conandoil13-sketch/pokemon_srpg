// 발전소 찌리리공 기습 (순수). 적 유닛 u.ambush = 'hidden' | 'awake'.
// hidden: 아군 누구에게서도 3칸보다 멀고 안 맞았으면 아군에게 안 보이고 가만히 있음. 아군이 3칸 안에 오거나 맞으면 awake (다시 안 숨음).
// awake: 자폭이 아군에게 닿는 자리가 있으면 반드시 자폭, 없으면 가장 가까운 아군 쪽으로 전력 이동. 스펙 docs/superpowers/specs/2026-11-23-power-plant-design.md
import { reachable } from './pathfind.js';
import { unitsHit } from './shapes.js';
import { MOVES } from '../data/moves.js';

export const AMBUSH_SIGHT = 3;
export const AMBUSH_MOVE = 'self-destruct';
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const foesOf = (state, u) => state.units.filter((o) => o.side !== u.side && o.hp > 0);

export const ambushHidden = (state, u) => u.ambush === 'hidden' && u.hp > 0 && !u.revealed && foesOf(state, u).every((a) => dist(a, u) > AMBUSH_SIGHT);

// 아군이 움직인 뒤·맞은 뒤: 들킨 기습 유닛은 깨어남
export function wakeAmbush(state) {
  for (const u of state.units) if (u.ambush === 'hidden' && u.hp > 0 && !ambushHidden(state, u)) u.ambush = 'awake';
}

export function ambushPlan(state, u) {
  wakeAmbush(state);
  const stay = { moveTo: { x: u.x, y: u.y }, attack: null };
  if (u.ambush !== 'awake') return stay;
  const foes = foesOf(state, u);
  if (!foes.length) return stay;
  const cells = [{ x: u.x, y: u.y }, ...[...reachable(state.grid, state.units, u).keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })];
  const move = MOVES[AMBUSH_MOVE];
  let best = null;
  for (const p of cells) {
    const ghost = { ...u, x: p.x, y: p.y };
    const hit = unitsHit({ ...state, units: state.units.map((o) => (o === u ? ghost : o)) }, ghost, move, { self: true });
    const foesHit = hit.filter((o) => o.side !== u.side).length, mine = hit.length - foesHit;
    if (!foesHit) continue;
    const score = foesHit * 10 - mine * 3 - dist(u, p) * 0.01;
    if (!best || score > best.score) best = { score, p };
  }
  if (best) return { moveTo: best.p, attack: { moveId: AMBUSH_MOVE, aim: { self: true } } };
  const near = (p) => Math.min(...foes.map((a) => dist(a, p)));
  return { moveTo: cells.reduce((m, p) => (near(p) < near(m) ? p : m)), attack: null };
}

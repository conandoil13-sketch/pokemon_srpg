// 적 AI (순수 함수, spec §5)
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { reachable, tilesInRange, manhattan, canEnter, TILE_COST } from './pathfind.js';
import { expectedDamage } from './damage.js';
import { effectiveStat } from './stages.js';

const KO_BONUS = 100;
const THREAT_WEIGHT = 0.5;

export function enemyTurnOrder(state) {
  return state.units
    .filter((u) => u.side === 'enemy')
    .sort((a, b) => effectiveStat(b, 'spe') - effectiveStat(a, 'spe'));
}

const parse = (k) => { const [x, y] = k.split(',').map(Number); return { x, y }; };

// 아군별로 "다음 턴에 공격 가능한 칸 → 기술 목록" 미리 계산
function threatMap(state, unit) {
  const out = [];
  for (const ally of state.units.filter((u) => u.side !== unit.side)) {
    const attackable = new Map(); // "x,y" → Set<moveId>
    for (const k of reachable(state.grid, state.units, ally).keys()) {
      const p = parse(k);
      for (const mid of ally.moves) {
        for (const t of tilesInRange(p.x, p.y, MOVES[mid].range, state.width, state.height)) {
          const tk = `${t.x},${t.y}`;
          if (!attackable.has(tk)) attackable.set(tk, new Set());
          attackable.get(tk).add(mid);
        }
      }
    }
    out.push({ ally, attackable });
  }
  return out;
}

function threatAt(threats, unit, x, y, tile) {
  let worst = 0;
  for (const { ally, attackable } of threats) {
    const moves = attackable.get(`${x},${y}`);
    if (!moves) continue;
    for (const mid of moves) worst = Math.max(worst, expectedDamage(ally, unit, MOVES[mid], tile));
  }
  return worst;
}

export function planEnemyAction(state, unit) {
  const reach = reachable(state.grid, state.units, unit);
  const foes = state.units.filter((u) => u.side !== unit.side);
  const threats = threatMap(state, unit);
  let best = null;

  for (const k of reach.keys()) {
    const p = parse(k);
    const ghost = { ...unit, x: p.x, y: p.y };
    const risk = THREAT_WEIGHT * threatAt(threats, ghost, p.x, p.y, state.grid[p.y][p.x]);
    for (const mid of unit.moves) {
      const move = MOVES[mid];
      for (const foe of foes) {
        const d = manhattan(p, foe);
        if (d < move.range[0] || d > move.range[1]) continue;
        const exp = expectedDamage(ghost, foe, move, state.grid[foe.y][foe.x]);
        if (exp === 0) continue;
        const score = exp + (exp >= foe.hp ? KO_BONUS : 0) - risk;
        if (!best || score > best.score) best = { score, moveTo: p, attack: { moveId: mid, targetId: foe.id } };
      }
    }
  }
  if (best) return { moveTo: best.moveTo, attack: best.attack };

  // 공격 불가: 가장 가까운 아군 쪽으로 (실제 걸어가는 거리 기준, spec §5-4)
  const walk = walkDistanceFromFoes(state, unit, foes);
  let approach = { x: unit.x, y: unit.y }, bestDist = Infinity;
  for (const k of reach.keys()) {
    const p = parse(k);
    const dist = walk.get(k) ?? 1000 + Math.min(...foes.map((f) => manhattan(p, f)));
    if (dist < bestDist) { bestDist = dist; approach = p; }
  }
  return { moveTo: approach, attack: null };
}

// 적(=foes) 위치에서 출발하는 다익스트라: 이 유닛이 지날 수 있는 지형만, 유닛은 무시
function walkDistanceFromFoes(state, unit, foes) {
  const dist = new Map();
  const open = [];
  for (const f of foes) { dist.set(`${f.x},${f.y}`, 0); open.push({ x: f.x, y: f.y, c: 0 }); }
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    if (cur.c > dist.get(`${cur.x},${cur.y}`)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cur.x + dx, y = cur.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      const tile = state.grid[y][x];
      if (!canEnter(tile, unit.species)) continue;
      const c = cur.c + TILE_COST[tile];
      const k = `${x},${y}`;
      if (dist.has(k) && dist.get(k) <= c) continue;
      dist.set(k, c);
      open.push({ x, y, c });
    }
  }
  return dist;
}

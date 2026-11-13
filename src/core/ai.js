// 적 AI (순수 함수, spec §5)
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { reachable, tilesInRange, manhattan, canEnter, TILE_COST } from './pathfind.js';
import { expectedDamage, hitChance } from './damage.js';
import { effectiveStat, stageMultiplier, API_STAT } from './stages.js';
import { AREA_RADIUS } from '../data/moveTargets.js';

const KO_BONUS = 100;
const THREAT_WEIGHT = 0.5;
const IDLE_BUFF_SCORE = 20;   // 때릴 적이 없을 때 자신 버프 점수
const BUFF_WEIGHT = 1.5;      // 다음 턴 데미지 증가분 가중치
const MINOR_STAT_SCORE = 3;   // 스피드·명중·회피 변화 1건 점수
const isStatus = (m) => m.category === 'status';

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
        if (isStatus(MOVES[mid])) continue;
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
  let best = null, bestStatus = null;

  for (const k of reach.keys()) {
    const p = parse(k);
    const ghost = { ...unit, x: p.x, y: p.y };
    const risk = THREAT_WEIGHT * threatAt(threats, ghost, p.x, p.y, state.grid[p.y][p.x]);
    for (const mid of unit.moves) {
      const move = MOVES[mid];
      if (isStatus(move)) {
        const cand = positionalStatus(state, unit, ghost, move, foes);
        if (cand && cand.value > 0) {
          const score = cand.value - risk;
          if (!bestStatus || score > bestStatus.score) bestStatus = { score, moveTo: p, attack: { moveId: mid, targetId: cand.targetId } };
        }
        continue;
      }
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
  // 자신 버프: 때릴 적이 없으면 고정 점수, 있으면 다음 턴 데미지 증가분 × 1.5 가 최선 공격보다 클 때
  const buff = bestSelfBuff(unit, foes, !!best);
  if (best && buff && buff.score > best.score && (!bestStatus || buff.score > bestStatus.score)) return { moveTo: best.moveTo, attack: buff.attack };
  if (best) {
    if (bestStatus && bestStatus.score > best.score) return { moveTo: bestStatus.moveTo, attack: bestStatus.attack };
    return { moveTo: best.moveTo, attack: best.attack };
  }

  // 공격 불가: 가장 가까운 아군 쪽으로 (실제 걸어가는 거리 기준, spec §5-4)
  const walk = walkDistanceFromFoes(state, unit, foes);
  let approach = { x: unit.x, y: unit.y }, bestDist = Infinity;
  for (const k of reach.keys()) {
    const p = parse(k);
    const dist = walk.get(k) ?? 1000 + Math.min(...foes.map((f) => manhattan(p, f)));
    if (dist < bestDist) { bestDist = dist; approach = p; }
  }
  // 변화기 위치의 위험은 그냥 다가갈 때의 위험과 비교 → 그래도 이득이고 자신 버프보다 나을 때만
  if (bestStatus) {
    const approachRisk = THREAT_WEIGHT * threatAt(threats, { ...unit, ...approach }, approach.x, approach.y, state.grid[approach.y][approach.x]);
    const net = bestStatus.score + approachRisk;
    if (net > 0 && (!buff || net > buff.score)) return { moveTo: bestStatus.moveTo, attack: bestStatus.attack };
  }
  return { moveTo: approach, attack: buff ? buff.attack : null };
}

const changesOf = (move) => move.statChanges.map(({ stat, change }) => ({ key: API_STAT[stat], change })).filter((c) => c.key);
const ratio = (n, c) => stageMultiplier(Math.max(-6, Math.min(6, n + c))) / stageMultiplier(n);
const OFFENSE = { atk: 'physical', spa: 'special' }, DEFENSE = { def: 'physical', spd: 'special' };

// 기술 위치 무관 최선 기대 데미지 (category 지정 시 그 분류만)
function bestDamage(attacker, targets, category) {
  let m = 0;
  for (const mid of attacker.moves) {
    const mv = MOVES[mid];
    if (isStatus(mv) || (category && mv.category !== category)) continue;
    for (const t of targets) m = Math.max(m, expectedDamage(attacker, t, mv, '.'));
  }
  return m;
}

// 한 유닛에 대한 랭크 변화 가치 (owner: 기술 사용자, foesOfOwner: 사용자의 적)
function changeValue(owner, foesOfOwner, sameSide, r, { key, change }) {
  const n = r.stages?.[key] ?? 0, left = r.turns?.[key] ?? 0;
  if (left >= 2) return 0; // 남발 방지
  if (sameSide) {
    if (change < 0 || n >= 2) return 0;
    if (OFFENSE[key]) return bestDamage(r, foesOfOwner, OFFENSE[key]) * (ratio(n, change) - 1) * BUFF_WEIGHT;
    return MINOR_STAT_SCORE;
  }
  if (change > 0 || n <= -2) return 0;
  const allies = [owner];
  if (OFFENSE[key]) return bestDamage(r, allies, OFFENSE[key]) * (1 - ratio(n, change));
  if (DEFENSE[key]) return bestDamage(owner, [r], DEFENSE[key]) * (1 / ratio(n, change) - 1);
  return MINOR_STAT_SCORE;
}

// 위치에 따라 대상이 바뀌는 변화기 (적 하나 / 주변 적 / 아군 하나 / 주변 아군)
function positionalStatus(state, unit, ghost, move, foes) {
  const ch = changesOf(move);
  const tile = (u) => state.grid[u.y][u.x];
  const acc = { ...move, accuracy: move.accuracy ?? 100 };
  const valueOn = (r) => {
    const same = r.side === unit.side;
    const v = ch.reduce((s, c) => s + changeValue(ghost, foes, same, r, c), 0);
    return same ? v : v * hitChance(ghost, r, acc, tile(r)) / 100;
  };
  const near = (list, lo, hi) => list.filter((u) => { const d = manhattan(ghost, u); return d >= lo && d <= hi; });
  const mates = state.units.filter((u) => u.side === unit.side && u.id !== unit.id);
  if (move.kind === 'enemies') {
    const ts = near(foes, 0, AREA_RADIUS);
    return ts.length ? { value: ts.reduce((s, t) => s + valueOn(t), 0), targetId: unit.id } : null;
  }
  if (move.kind === 'allies') {
    const ts = [ghost, ...near(mates, 0, AREA_RADIUS)];
    return { value: ts.reduce((s, t) => s + (t === ghost ? 0 : valueOn(t)), 0), targetId: unit.id }; // 자신 몫은 bestSelfBuff 에서
  }
  if (move.kind === 'enemy' || move.kind === 'ally') {
    const pool = move.kind === 'enemy' ? foes : mates;
    let top = null;
    for (const t of near(pool, move.range[0], move.range[1])) {
      const value = valueOn(t);
      if (!top || value > top.value) top = { value, targetId: t.id };
    }
    return top;
  }
  return null; // self 는 위치 무관 → bestSelfBuff
}

function bestSelfBuff(unit, foes, canAttack) {
  let top = null;
  for (const mid of unit.moves) {
    const move = MOVES[mid];
    if (!isStatus(move) || (move.kind !== 'self' && move.kind !== 'allies')) continue;
    const vals = changesOf(move).map((c) => changeValue(unit, foes, true, unit, c));
    if (!vals.some((v) => v > 0)) continue;
    const score = canAttack ? vals.reduce((a, b) => a + b, 0) : IDLE_BUFF_SCORE;
    if (!top || score > top.score) top = { score, attack: { moveId: mid, targetId: unit.id } };
  }
  return top;
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

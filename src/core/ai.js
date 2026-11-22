// 적 AI (순수 함수, spec §5)
import { SPECIES } from '../data/species.js';
import { effectiveWeather } from './weather.js';
import { poolDamage } from './pool.js';
import { pulseRisk } from './generator.js';
import { sandLanding } from './sand.js';
const PIT_STUCK = 0.2; // 사막: 모래지옥 가운데에 끌려 묶이는 칸 = 최대 HP 20% 만큼 손해
import { MOVES } from '../data/moves.js';
import { reachable, tilesInRange, manhattan, canEnter, TILE_COST } from './pathfind.js';
import { expectedDamage, hitChance, terrainCtx } from './damage.js';
import { effectiveStat, stageMultiplier, API_STAT } from './stages.js';
import { AREA_RADIUS } from '../data/moveTargets.js';
import { canInflict, canInfatuate } from './status.js';
import { immunity, has } from './abilities.js';
import { aimsOf, unitsHit } from './shapes.js';
import { SIGNATURE_MOVES } from './learn.js';
import { moveBlock, moveFor, isHealMove, BIND_MOVES } from './volatile.js';
import { typesOf } from './abilities.js';
import { AURAS, ZONES, WEATHER_OF, FIELD_RADIUS, TRAP_RANGE } from './field.js';

const KO_BONUS = 100;
const THREAT_WEIGHT = 0.5;
const IDLE_BUFF_SCORE = 20;   // 때릴 적이 없을 때 자신 버프 점수
const BUFF_WEIGHT = 1.5;      // 다음 턴 데미지 증가분 가중치
const MINOR_STAT_SCORE = 3;   // 스피드·명중·회피 변화 1건 점수
const isStatus = (m) => m.category === 'status';
// 이번 계획의 날씨 (planEnemyAction 이 정한다; 계산 함수들이 같이 쓴다)
let W = null;
const FRIENDLY_WEIGHT = 1.5;  // 같은 편이 휘말린 데미지 감점 배율
const HEAL_WEIGHT = 1.2;      // 회복기 점수: 회복량 × 이 값
const SELF_KO = ['self-destruct', 'explosion'];
const SELF_TURNS = 3;         // 자폭 감점: 자기 최선 기대 데미지 × 3턴
const SIG_SELF_KO = 0.3, OTHER_SELF_KO = 2;
// 변화기 묶음 1차 (포켓몬에 붙는 효과) 점수
const GUARD_HP = 0.5;          // 방어·판별·버티기: HP 비율 이하이고 맞을 칸일 때
const REST_HP = 0.4;           // 잠자기: HP 비율 이하
const REST_WEIGHT = 0.8;       // 잠자기 회복량 가중치 (2턴 잠듦 감점)
const BOND_HP = 0.25;          // 길동무: HP 비율 이하이고 맞을 칸일 때
export const HINDER_SCORE = 8;
const ILLUMINATE_LURE = 6; // 발광 상대를 노리는 가산점        // 앙코르·사슬묶기·트집·이동 불가·특성 끄기 등 기본 점수
const IDLE_EFFECTS = ['focusEnergy', 'aquaRing', 'ingrain'];
// 변화기 묶음 2차 (전장) 점수
const FIELD_UNIT_SCORE = 10;   // 오라·장판: 덮는 아군 한 마리당
const WEATHER_SCORE = 25;      // 자기 타입에 유리한 날씨 부르기
const HAZE_STAGE_SCORE = 6;    // 흑안개: 지우는 (상대 양의 랭크 − 아군 양의 랭크) 1단계당
const TRAP_NEAR = 3;           // 압정: 가장 가까운 상대가 사거리 + 이 거리 안일 때만
const WEATHER_FOR = { water: 'rain', fire: 'sun', rock: 'sand', ground: 'sand', steel: 'sand', ice: 'hail' };

// 조준 하나의 점수 (위험도 제외). 적이 하나도 안 맞으면 null
// 속박기: 아직 안 묶인 상대를 묶으면 조금 더 (이미 묶였으면 가산 없음)
export const bindValue = (move, t) => (BIND_MOVES.has(move.id) && !t.bound ? (HINDER_SCORE / 2) * ((move.accuracy ?? 100) / 100) : 0); // 명중률만큼

function aimScore(state, unit, ghost, move, aim, foes, unseen = new Set()) {
  const sim = { ...state, units: state.units.map((u) => (u === unit ? ghost : u)) };
  const hit = unitsHit(sim, ghost, move, aim);
  const spread = hit.length >= 2 ? 0.75 : 1;
  let score = 0, enemies = 0, kos = 0, mates = 0;
  for (const t of hit) {
    const e = expectedDamage(ghost, t, move, state.grid[t.y][t.x], spread, W, terrainCtx(sim, ghost, t));
    const ko = e >= t.hp;
    if (t.side !== unit.side && unseen.has(t.id)) continue; // 안 보이는 상대는 노리지 않는다
    if (t.side !== unit.side) { if (e > 0) enemies++; if (ko) kos++; score += e + (ko ? KO_BONUS : 0) + (ko ? 0 : bindValue(move, t)) + (t.ability === 'illuminate' && e > 0 ? ILLUMINATE_LURE : 0); } // 발광: 먼저 노림
    else { mates++; score -= e * FRIENDLY_WEIGHT + (ko ? KO_BONUS : 0); }
  }
  if (!enemies) return null;
  if (mates && score <= 0) return null; // 같은 편을 휘말려 손해면 쓰지 않는다
  // 흡수는 기대 회복만큼 가산, 반동은 감산 — 반동으로 자기가 쓰러질 기대면 쓰지 않는다
  if (move.drain) {
    const dealt = hit.filter((t) => t.side !== unit.side).reduce((s, t) => s + Math.min(t.hp, expectedDamage(ghost, t, move, state.grid[t.y][t.x], spread, W, terrainCtx(sim, ghost, t))), 0);
    const amt = dealt * Math.abs(move.drain) / 100;
    if (move.drain > 0 && hit.some((t) => t.ability === 'liquid-ooze')) { if (amt >= unit.hp) return null; score -= amt; } // 해감액: 흡수가 피해
    else if (move.drain > 0) score += Math.min(amt, unit.maxHp - unit.hp) * 0.5;
    else if (unit.ability !== 'rock-head' && unit.ability !== 'magic-guard') { if (amt >= unit.hp) return null; score -= amt; }
  }
  if (SELF_KO.includes(move.id)) {
    const sig = SIGNATURE_MOVES[unit.species] === move.id;
    if (!sig && !kos) return null; // 신중: 하나라도 쓰러뜨릴 때만
    score -= bestDamage(unit, foes) * SELF_TURNS * (sig ? SIG_SELF_KO : OTHER_SELF_KO);
    if (sig && enemies >= 2) score += KO_BONUS / 2; // 찌리리공·붐볼: 여럿 휘말리면 보너스
  }
  return score;
}

export function enemyTurnOrder(state) {
  return state.units
    .filter((u) => u.side === 'enemy')
    .sort((a, b) => effectiveStat(b, 'spe') - effectiveStat(a, 'spe'));
}

const parse = (k) => { const [x, y] = k.split(',').map(Number); return { x, y }; };

// 다음 페이즈에 움직일 수 있는 상대인가 (잠듦 남은 턴이 있거나 얼음이면 아님)
export const isThreat = (u) => !((u.status === 'sleep' && u.statusTurns > 0) || u.status === 'freeze');

// 아군별로 "다음 턴에 공격 가능한 칸 → 기술 목록" 미리 계산
function threatMap(state, unit, unseen = new Set()) {
  const out = [];
  for (const ally of state.units.filter((u) => u.side !== unit.side && isThreat(u) && !unseen.has(u.id))) {
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
    for (const mid of moves) worst = Math.max(worst, expectedDamage(ally, unit, MOVES[mid], tile, 1, W));
  }
  return worst;
}

// unseen: 안개 속이라 이번 적 차례에 보이지 않는 상대 id (공격·위협 계산에서 뺀다, 다가가는 목표로는 씀)
export function planEnemyAction(state, unit, { unseen = new Set() } = {}) {
  if (unit.acted) return { moveTo: { x: unit.x, y: unit.y }, attack: null }; // 잠듦·얼음으로 쉬는 중
  W = effectiveWeather(state); // 에어록·날씨부정 반영
  const reach = reachable(state.grid, state.units, unit);
  const allFoes = state.units.filter((u) => u.side !== unit.side);
  const foes = allFoes.filter((u) => !unseen.has(u.id) && !u.burrow); // 안개 속·숨은 상대는 노리지 않는다
  const threats = threatMap(state, unit, unseen);
  let best = null, bestStatus = null;

  for (const k of reach.keys()) {
    const p = parse(k);
    const ghost = { ...unit, x: p.x, y: p.y };
    const land = state.flows ? sandLanding(state, unit, p) : null; // 사막: 행동이 끝난 뒤 밀리거나 끌린 자리로 위험 계산
    const at = land ?? p;
    const risk = THREAT_WEIGHT * threatAt(threats, { ...unit, x: at.x, y: at.y }, at.x, at.y, state.grid[at.y][at.x]) + (land?.stuck ? unit.maxHp * PIT_STUCK : 0) + (poolDamage(ghost, state.grid[p.y][p.x])?.damage ?? 0) + pulseRisk(state, ghost, p); // 독 웅덩이·발전기 방출: 피해만큼 손해
    for (const mid of unit.sealed ? [] : unit.moves.filter((m) => !moveBlock(unit, m))) { // 풀죽음 봉인: 기술 없이 이동만, 도발·앙코르 … 로 못 쓰는 기술 제외
      const move = MOVES[mid];
      if (move.heal) { // 회복기: HP 절반 이하이고 남은 횟수가 있을 때만, 안전한 칸에서
        if (unit.hp <= unit.maxHp / 2 && (unit.healUses ?? 0) > 0) {
          const score = Math.min(unit.maxHp / 2, unit.maxHp - unit.hp) * HEAL_WEIGHT - risk;
          if (!bestStatus || score > bestStatus.score) bestStatus = { score, moveTo: p, attack: { moveId: mid, targetId: unit.id } };
        }
        continue;
      }
      if (isStatus(move) && moveFor(unit, mid).effect) { // 포켓몬에 붙는 효과 · 전장
        const threat = risk / THREAT_WEIGHT;
        const cand = effectCandidate(state, unit, ghost, moveFor(unit, mid), foes, threat, risk);
        if (cand && (!bestStatus || cand.score > bestStatus.score)) bestStatus = { score: cand.score, moveTo: p, attack: { moveId: mid, ...(cand.aim ? { aim: cand.aim } : { targetId: cand.targetId }) } };
        continue;
      }
      if (isStatus(move)) {
        const cand = positionalStatus(state, unit, ghost, move, foes);
        if (cand && cand.value > 0) {
          const score = cand.value - risk;
          if (!bestStatus || score > bestStatus.score) bestStatus = { score, moveTo: p, attack: { moveId: mid, targetId: cand.targetId } };
        }
        continue;
      }
      const sim = { ...state, units: state.units.map((u) => (u === unit ? ghost : u)) };
      for (const aim of aimsOf(sim, ghost, move)) {
        const s = aimScore(state, unit, ghost, move, aim, foes, unseen);
        if (s === null) continue;
        const score = s - (SELF_KO.includes(mid) ? 0 : risk); // 자폭은 어차피 쓰러지므로 위험 무시
        if (!best || score > best.score) best = { score, moveTo: p, attack: { moveId: mid, aim, ...(aim.unitId ? { targetId: aim.unitId } : {}) } };
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
  const walk = walkDistanceFromFoes(state, unit, allFoes);
  let approach = { x: unit.x, y: unit.y }, bestDist = Infinity;
  for (const k of reach.keys()) {
    const p = parse(k);
    const dist = (walk.get(k) ?? 1000 + Math.min(...allFoes.map((f) => manhattan(p, f)))) + (state.flows && sandLanding(state, unit, p).stuck ? 3 : 0); // 모래지옥 가운데로 끌리는 칸은 피해서 다가감
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

// 상태이상 가치 (스펙 §4). 상대가 이미 걸렸거나 면역이면 0, 상대 편 잠듦·얼음이 2 이상이면 잠듦 0
const SLEEP_LOCK = 2;
function ailmentValue(state, user, r, move) {
  const a = move.ailment;
  if (a === 'infatuation') return canInfatuate(r, user, { breaker: has(user, 'mold-breaker') }).ok ? bestDamage(r, [user]) * 0.5 : 0; // 헤롱헤롱: 반대 성별만
  if (!a || !canInflict(r, a, move, W, { breaker: has(user, 'mold-breaker') }).ok) return 0;
  if (a === 'sleep') {
    // 상대 편이 이미 2마리 이상 쉬고 있거나, 깨어 있는 마지막 하나라면 재우지 않는다 (소수 편성 보호)
    const side = state.units.filter((u) => u.side === r.side);
    const resting = side.filter((u) => u.status === 'sleep' || u.status === 'freeze').length;
    if (resting >= Math.min(SLEEP_LOCK, side.length - 1)) return 0;
  }
  const out = bestDamage(r, [user]);
  switch (a) {
    case 'sleep': case 'freeze': return out * 1.5;
    case 'paralysis': return out * 0.5;
    case 'burn': return (bestDamage(r, [user], 'physical') >= bestDamage(r, [user], 'special') ? out * 0.5 : out * 0.2) + (r.maxHp / 8) * 2;
    case 'poison': return (r.maxHp / 8) * 3;
    case 'toxic': return (r.maxHp / 16) * 6;
    case 'confusion': return out * 0.4;
    default: return 0;
  }
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
    for (const t of targets) m = Math.max(m, expectedDamage(attacker, t, mv, '.', 1, W));
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
    if (!same && immunity(ghost, r, move)) return 0; // 축전에 전기자석파·방음에 노래 등은 쓰지 않는다
    if (move.id === 'captivate' && !(r.gender && ghost.gender && r.gender !== ghost.gender)) return 0; // 유혹: 반대 성별만
    const v = ch.reduce((s, c) => s + changeValue(ghost, foes, same, r, c), 0) + (same ? 0 : ailmentValue(state, ghost, r, move));
    return same ? v : v * hitChance(ghost, r, acc, tile(r), W, terrainCtx(state, ghost, r)) / 100;
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
    const move = moveFor(unit, mid); // 저주(비고스트)는 랭크 기술
    if (moveBlock(unit, mid)) continue;
    if (IDLE_EFFECTS.includes(move.effect)) { // 기충전·아쿠아링·뿌리박기: 때릴 상대가 없을 때만
      const flag = { focusEnergy: 'focusEnergy', aquaRing: 'aquaRing', ingrain: 'rooted' }[move.effect];
      if (!canAttack && !unit[flag] && (move.effect === 'focusEnergy' || unit.hp < unit.maxHp) && (!top || IDLE_BUFF_SCORE > top.score)) top = { score: IDLE_BUFF_SCORE, attack: { moveId: mid, targetId: unit.id } };
      continue;
    }
    if (move.effect) continue;
    if (!isStatus(move) || (move.kind !== 'self' && move.kind !== 'allies')) continue;
    const vals = changesOf(move).map((c) => changeValue(unit, foes, true, unit, c));
    if (!vals.some((v) => v > 0)) continue;
    const score = canAttack ? vals.reduce((a, b) => a + b, 0) : IDLE_BUFF_SCORE;
    if (!top || score > top.score) top = { score, attack: { moveId: mid, targetId: unit.id } };
  }
  return top;
}

// 포켓몬에 붙는 효과 변화기의 한 칸 점수 (위험 반영 끝난 score). threat: 그 칸에서 받을 최악 기대 데미지
function effectCandidate(state, unit, ghost, move, foes, threat, risk) {
  const self = (score) => (score > 0 ? { score, targetId: unit.id } : null);
  const hpRate = unit.hp / unit.maxHp;
  switch (move.effect) {
    case 'protect': case 'endure': // 맞을 칸이고 HP 가 낮을 때. 막는 데미지가 곧 점수 (위험을 빼지 않음)
      if (unit.guardPrev || hpRate > GUARD_HP || threat <= 0) return null;
      return self(threat + (threat >= unit.hp ? KO_BONUS : 0));
    case 'bond':
      if (unit.bondPrev || hpRate > BOND_HP || threat < unit.hp) return null;
      return self(KO_BONUS / 2);
    case 'rest':
      if (hpRate > REST_HP || (unit.healUses ?? 0) <= 0 || unit.healBlock > 0) return null;
      return self((unit.maxHp - unit.hp) * HEAL_WEIGHT * REST_WEIGHT - risk);
    case 'weather': { // 자기 타입에 유리하고 아직 그 날씨가 아닐 때
      const w = WEATHER_OF[move.id];
      if (state.weather === 'fog' || state.weather === w || !typesOf(unit).some((t) => WEATHER_FOR[t] === w)) return null;
      return self(WEATHER_SCORE - risk);
    }
    case 'haze': {
      const pos = (u) => Object.values(u.stages ?? {}).reduce((s, n) => s + Math.max(0, n), 0);
      const near = state.units.filter((u) => manhattan(ghost, u) <= FIELD_RADIUS);
      const v = near.filter((u) => u.side !== unit.side).reduce((s, u) => s + pos(u), 0) - near.filter((u) => u.side === unit.side).reduce((s, u) => s + pos(u), 0);
      return v > 0 ? self(v * HAZE_STAGE_SCORE - risk) : null;
    }
    case 'spikes': case 'toxicSpikes': { // 가장 가까운 상대 쪽으로 사거리 안 가장 가까운 빈 칸
      const f = foes.slice().sort((p, q) => manhattan(ghost, p) - manhattan(ghost, q))[0];
      if (!f || manhattan(ghost, f) > TRAP_RANGE[1] + TRAP_NEAR) return null; // 멀면 깔지 말고 다가간다 (제자리 압정 깔기 방지)
      let best = null;
      for (let y = ghost.y - TRAP_RANGE[1]; y <= ghost.y + TRAP_RANGE[1]; y++) for (let x = ghost.x - TRAP_RANGE[1]; x <= ghost.x + TRAP_RANGE[1]; x++) {
        const d = manhattan(ghost, { x, y });
        if (d < TRAP_RANGE[0] || d > TRAP_RANGE[1] || state.grid[y]?.[x] === undefined || state.grid[y][x] === '#') continue;
        if (state.units.some((u) => u.x === x && u.y === y) || (state.spikes ?? []).some((t) => t.x === x && t.y === y && t.kind === move.effect)) continue;
        const k = manhattan({ x, y }, f);
        if (!best || k < best.k) best = { k, x, y };
      }
      return best ? { score: HINDER_SCORE - risk, aim: { x: best.x, y: best.y } } : null;
    }
    case 'helpingHand': {
      let top = null;
      for (const m of state.units) {
        if (m.side !== unit.side || m === unit || m.acted || m.helped || manhattan(ghost, m) !== 1) continue;
        const v = bestDamage(m, foes) * 0.5 - risk;
        if (v > 0 && (!top || v > top.score)) top = { score: v, targetId: m.id };
      }
      return top;
    }
  }
  if (AURAS.includes(move.effect) || ZONES.includes(move.effect)) { // 주변 2칸에 다른 아군이 있고, 같은 종류가 아직 덮고 있지 않을 때
    const mates = state.units.filter((m) => m.side === unit.side && m !== unit && manhattan(ghost, m) <= FIELD_RADIUS);
    if (!mates.length) return null;
    const covered = AURAS.includes(move.effect)
      ? (state.auras ?? []).some((a) => a.kind === move.effect && a.side === unit.side)
      : (state.zones ?? []).some((z) => z.kind === move.effect && z.side === unit.side && manhattan(z, ghost) <= FIELD_RADIUS);
    return covered ? null : self((mates.length + 1) * FIELD_UNIT_SCORE - risk);
  }
  if (move.kind !== 'enemy') return null;
  const acc = { ...move, accuracy: move.accuracy ?? 100 };
  let top = null;
  for (const r of foes) {
    const d = manhattan(ghost, r);
    if (d < move.range[0] || d > move.range[1]) continue;
    const v = hinderValue(state, ghost, r, move) * hitChance(ghost, r, acc, state.grid[r.y][r.x], W, terrainCtx(state, ghost, r)) / 100 - risk;
    if (v > 0 && (!top || v > top.score)) top = { score: v, targetId: r.id };
  }
  return top;
}

// 상대 하나에게 거는 효과의 가치 (이미 걸렸거나 안 통하면 0)
function hinderValue(state, user, r, move) {
  const hasStatus = r.moves.some((m) => isStatus(MOVES[m]));
  switch (move.effect) {
    case 'yawn': return r.yawnBy ? 0 : ailmentValue(state, user, r, { ...move, ailment: 'sleep' }) * 0.8;
    case 'leechSeed': return r.leechBy || typesOf(r).includes('grass') ? 0 : (r.maxHp / 8) * 3;
    case 'curse': return r.cursed || user.hp <= user.maxHp / 2 ? 0 : (r.maxHp / 4) * 3 - user.maxHp / 2;
    case 'taunt': return r.taunt > 0 || !hasStatus ? 0 : HINDER_SCORE + bestDamage(r, [user]) * 0.2;
    case 'healBlock': return r.healBlock > 0 || !r.moves.some((m) => isHealMove(MOVES[m])) ? 0 : HINDER_SCORE;
    case 'encore': case 'disable': return r[move.effect] || !r.lastMove ? 0 : HINDER_SCORE;
    case 'torment': return r.torment > 0 || !r.lastMove ? 0 : HINDER_SCORE / 2;
    case 'noMove': return r.noMove > 0 ? 0 : HINDER_SCORE;
    case 'identNormal': return r.identNormal || !typesOf(r).includes('ghost') || !user.moves.some((m) => ['normal', 'fighting'].includes(MOVES[m].type) && !isStatus(MOVES[m])) ? 0 : HINDER_SCORE;
    case 'identPsychic': return r.identPsychic || !typesOf(r).includes('dark') || !user.moves.some((m) => MOVES[m].type === 'psychic' && !isStatus(MOVES[m])) ? 0 : HINDER_SCORE;
    case 'abilityOff': return r.abilityOff ? 0 : HINDER_SCORE / 2;
    case 'push': return r.boss || r.rooted || r.bound?.by === user.id || manhattan(user, r) !== 1 ? 0 : HINDER_SCORE + bestDamage(r, [user]) * 0.3; // 붙어 있는 상대를 떼어 냄
    case 'worrySeed': return r.ability === 'insomnia' || r.ability === 'truant' ? 0 : HINDER_SCORE / 2;
    default: return 0;
  }
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
      if (!canEnter(tile, unit)) continue;
      const c = cur.c + TILE_COST[tile];
      const k = `${x},${y}`;
      if (dist.has(k) && dist.get(k) <= c) continue;
      dist.set(k, c);
      open.push({ x, y, c });
    }
  }
  return dist;
}

// 치고 빠지기 후퇴 칸: 남은 이동력 안에서 상대 편 모두에게서 가장 먼(최소 거리가 가장 큰) 칸
export function retreatSpot(state, unit, budget) {
  const foes = state.units.filter((u) => u.side !== unit.side);
  let best = null, bestD = -1;
  for (const k of reachable(state.grid, state.units, unit, budget).keys()) {
    const [x, y] = k.split(',').map(Number);
    const d = foes.length ? Math.min(...foes.map((f) => manhattan({ x, y }, f))) : 0;
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

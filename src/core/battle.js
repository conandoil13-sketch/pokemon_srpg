// 전투 상태 (순수 로직, 상태 객체를 직접 갱신)
import { MAP } from '../data/map.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { AREA_RADIUS } from '../data/moveTargets.js';
import { BALANCE } from '../data/balance.js';
import { calcDamage, hitChance, confusionDamage } from './damage.js';
import { unitsHit } from './shapes.js';
import { newStatus, inflict, cure, checkAction, phaseStart, phaseEnd } from './status.js';
import { newStages, applyStageChange, tickStages, API_STAT } from './stages.js';
import { statsAt, expYield } from './stats.js';
import { startingMoves } from './learn.js';
import { newParty } from './progress.js';

export const spec = (unit) => SPECIES[unit.species];

// 유닛 = 종족 + 레벨에서 계산한 능력치 + 기술
export function makeUnit({ species, side, x, y, level, moves, id, boss }) {
  const stats = statsAt(SPECIES[species].base, level);
  return {
    id: id ?? `${side}-${species}`, species, side, x, y, level, stats,
    hp: stats.hp, maxHp: stats.hp,
    moves: moves?.length ? [...moves] : startingMoves(SPECIES[species].learnset, level, MOVES, species),
    moved: false, acted: false,
    ...newStages(),
    ...newStatus(),
    ...(boss ? { boss: true } : {}),
  };
}

function uniqueId(units, side, species) {
  let id = `${side}-${species}`;
  for (let n = 2; units.some((u) => u.id === id); n++) id = `${side}-${species}-${n}`;
  return id;
}

// opts.hpRatio: { [species]: 0.5 } — 직전 층 기절자 등 시작 HP 비율
export function createBattle(mapDef = MAP, party = newParty(), { hpRatio = {} } = {}) {
  const units = [];
  party.slice(0, mapDef.allySlots.length).forEach((m, i) => {
    const { x, y } = mapDef.allySlots[i];
    const u = makeUnit({ species: m.species, side: 'ally', x, y, level: m.level, moves: m.moves, id: uniqueId(units, 'ally', m.species) });
    if (hpRatio[m.species]) u.hp = Math.max(1, Math.floor(u.maxHp * hpRatio[m.species]));
    units.push(u);
  });
  for (const e of mapDef.enemies) units.push(makeUnit({ ...e, side: 'enemy', id: uniqueId(units, 'enemy', e.species) }));
  return {
    grid: mapDef.tiles.slice(),
    width: mapDef.tiles[0].length,
    height: mapDef.tiles.length,
    units,
    phase: 'player',
    turn: 1,
    result: null,
    log: { exp: {}, fainted: [], loot: [], coins: 0, expired: [] }, // 획득 경험치(종족별), 기절한 아군, 연 보물, 격파 코인, 이번 페이즈에 풀린 랭크
    stairs: mapDef.stairs ?? null,
    chests: (mapDef.chests ?? []).map((c) => ({ ...c })),
    bossFloor: units.some((u) => u.boss),
  };
}

export const unitAt = (state, x, y) => state.units.find((u) => u.x === x && u.y === y);
const byId = (state, id) => state.units.find((u) => u.id === id);

export function moveUnit(state, id, x, y) {
  const u = byId(state, id);
  u.x = x; u.y = y; u.moved = true;
}

// 적이 기절한 순간: 쓰러뜨린 아군 100%, 그 순간 살아 있는 다른 아군 각 shareRatio
function awardExp(state, attacker, defender) {
  const gained = {};
  if (attacker.side !== 'ally' || defender.side !== 'enemy') return gained;
  const full = expYield(SPECIES[defender.species].baseExp, defender.level, BALANCE.expMultiplier);
  gained[attacker.species] = full;
  for (const u of state.units) {
    if (u.side === 'ally' && u !== attacker && u.hp > 0) gained[u.species] = (gained[u.species] ?? 0) + Math.floor(full * BALANCE.shareRatio);
  }
  for (const [sp, n] of Object.entries(gained)) state.log.exp[sp] = (state.log.exp[sp] ?? 0) + n;
  return gained;
}

// 쓰러뜨린 상대 없이 기절(상태 데미지·혼란 자해): 살아 있는 아군 전원 공유 비율
function awardShare(state, defender) {
  if (defender.side !== 'enemy') return;
  const full = expYield(SPECIES[defender.species].baseExp, defender.level, BALANCE.expMultiplier);
  for (const u of state.units) {
    if (u.side === 'ally' && u.hp > 0) state.log.exp[u.species] = (state.log.exp[u.species] ?? 0) + Math.floor(full * BALANCE.shareRatio);
  }
}

// 기절 처리 공통. by: 쓰러뜨린 유닛(없으면 상태 데미지·자해). reward false: 보상 없음(자폭)
// 같은 편끼리 쓰러뜨리면 경험치·코인 없음 (awardExp 는 아군→적만 지급)
function knockOut(state, d, by, { reward = true, deferExp = false } = {}) {
  state.units = state.units.filter((u) => u !== d);
  let expGained = {};
  if (by) { if (!deferExp) expGained = awardExp(state, by, d); } // deferExp: 공격이 끝난 뒤 호출 측이 지급
  else if (reward) awardShare(state, d);
  if (reward && d.side === 'enemy' && (!by || by.side === 'ally')) state.log.coins += 3 + Math.floor(d.level / 3);
  if (d.side === 'ally' && !state.log.fainted.includes(d.species)) state.log.fainted.push(d.species);
  return expGained;
}

const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// 기술이 실제로 닿는 유닛들 (move: id 또는 기술 객체, focus: 고른 대상)
export function targetsOf(state, user, move, focus) {
  const m = typeof move === 'string' ? MOVES[move] : move;
  const [lo, hi] = m.range ?? [1, 1];
  switch (m.kind) {
    case 'self': return [user];
    case 'enemies': return state.units.filter((u) => u.side !== user.side && dist(u, user) <= AREA_RADIUS);
    case 'allies': return state.units.filter((u) => u.side === user.side && dist(u, user) <= AREA_RADIUS);
    case 'ally':
      return focus && focus !== user && focus.side === user.side && dist(focus, user) >= lo && dist(focus, user) <= hi ? [focus] : [];
    default: // enemy
      return focus && focus.side !== user.side && dist(focus, user) >= lo && dist(focus, user) <= hi ? [focus] : [];
  }
}

function changeStats(unit, list, out) {
  for (const { stat, change } of list) {
    const key = API_STAT[stat];
    if (!key) continue;
    const r = applyStageChange(unit, key, change);
    out.push({ unitId: unit.id, key, change, applied: r.applied, after: r.after });
  }
}

// 공격기·변화기 공통. 공격기는 데미지 + 능력치 부가효과, 변화기는 대상별 랭크 변화
const SELF_KO = ['self-destruct', 'explosion']; // 쓴 쪽이 기절

// aim: 대상 id 문자열(단일, 호환) 또는 shapes.js 의 조준 객체
export function applyMove(state, userId, moveId, aim, rng) {
  const focusId = typeof aim === 'string' ? aim : aim?.unitId ?? null;
  const a = byId(state, userId), move = MOVES[moveId];
  a.acted = true;
  a.moved = true;
  const stageChanges = [], statusChanges = [], thawed = [];
  const kind = move.category === 'status' ? 'status' : 'attack';
  const ail = (t) => { if (move.ailment) statusChanges.push({ unitId: t.id, ailment: move.ailment, ...inflict(t, move.ailment, rng, move) }); };

  // 마비 25% 실패 → 혼란 50% 자해 (기술은 나가지 않고 행동 종료)
  const blocked = checkAction(a, rng);
  if (blocked) {
    const out = { kind, blocked, stageChanges, statusChanges, thawed, missed: [] };
    if (blocked === 'confusion') {
      const damage = confusionDamage(a);
      a.hp = Math.max(0, a.hp - damage);
      out.selfHit = { damage, fainted: a.hp === 0 };
      if (a.hp === 0) knockOut(state, a, null);
      checkResult(state);
    }
    return out;
  }

  if (kind === 'status') {
    const missed = [];
    const acc = { ...move, accuracy: move.accuracy ?? 100 };
    for (const t of targetsOf(state, a, move, focusId ? byId(state, focusId) : null)) {
      if (t.side !== a.side && !(rng() * 100 < hitChance(a, t, acc, state.grid[t.y][t.x]))) { missed.push(t.id); continue; }
      changeStats(t, move.statChanges ?? [], stageChanges);
      ail(t);
    }
    return { kind, stageChanges, statusChanges, thawed, missed };
  }
  const targets = unitsHit(state, a, move, typeof aim === 'string' ? { unitId: aim } : aim ?? { self: true });
  const spread = targets.length >= 2 ? 0.75 : 1;
  const roll = (chance) => !chance || rng() * 100 < chance; // 확률 0 = 100%
  const hits = [], expGained = {}, knocked = [];
  let anyLanded = false;
  for (const d of targets) {
    const hpBefore = d.hp;
    const r = calcDamage(a, d, move, { rng, defTile: state.grid[d.y][d.x], spread });
    d.hp = Math.max(0, d.hp - r.damage);
    const fainted = d.hp === 0;
    if (fainted) { knockOut(state, d, a, { deferExp: true }); knocked.push(d); }
    else if (move.type === 'fire' && r.damage > 0 && d.status === 'freeze') { cure(d); thawed.push(d.id); } // 불꽃 공격에 맞으면 녹는다
    // 대상 부가효과: 맞았고 면역이 아니고 버텼을 때
    const landed = r.hit && r.typeMult > 0;
    anyLanded ||= landed;
    if (landed && !fainted && move.effectKind === 'damage-lower' && move.statChanges?.length && roll(move.statChance)) changeStats(d, move.statChanges, stageChanges);
    if (landed && !fainted && move.ailment && roll(move.ailmentChance)) ail(d);
    hits.push({ unitId: d.id, ...r, fainted, hpBefore });
  }
  // 경험치는 공격이 끝난 뒤 살아 있는 아군 기준 (목록 순서에 따라 달라지지 않게)
  for (const d of knocked) for (const [sp, n] of Object.entries(awardExp(state, a, d))) expGained[sp] = (expGained[sp] ?? 0) + n;
  // 사용자 부가효과(인파이트류): 한 명이라도 맞으면 한 번
  if (anyLanded && move.effectKind === 'damage-raise' && move.statChanges?.length && roll(move.statChance)) changeStats(a, move.statChanges, stageChanges);
  // 자폭: 빗나가도 쓴 쪽은 기절, 보상 없음
  const selfKO = SELF_KO.includes(move.id) && state.units.includes(a);
  if (selfKO) { a.hp = 0; knockOut(state, a, null, { reward: false }); }
  checkResult(state);
  const out = { kind, hits, expGained, stageChanges, statusChanges, thawed, selfKO };
  if (hits.length === 1) { const { hit, crit, typeMult, damage, fainted } = hits[0]; Object.assign(out, { hit, crit, typeMult, damage, fainted }); }
  return out;
}

// 기존 호출 호환
export const applyAttack = (state, attackerId, targetId, moveId, rng) => applyMove(state, attackerId, moveId, targetId, rng);

// 아군이 이동을 마친 칸 처리: 상자 열기, 계단 도착
export function arrive(state, unitId) {
  const u = byId(state, unitId);
  const out = { stairs: false, item: null };
  if (!u || u.side !== 'ally') return out;
  const i = state.chests.findIndex((c) => c.x === u.x && c.y === u.y);
  if (i >= 0) {
    out.item = state.chests[i].item;
    state.chests.splice(i, 1);
    state.log.loot.push(out.item);
  }
  if (state.stairs && state.stairs.x === u.x && state.stairs.y === u.y) {
    out.stairs = true;
    state.result = 'stairs';
  }
  return out;
}

// 페이즈 전환: 끝나는 편 상태 데미지·혼란 → 랭크 만료 → 시작하는 편 잠듦·얼음
export function endPhase(state, rng = Math.random) {
  const ending = state.phase === 'player' ? 'ally' : 'enemy';
  const events = (state.log.statusEvents = []);
  for (const u of state.units.filter((o) => o.side === ending)) {
    const r = phaseEnd(u);
    if (r.damage) {
      const hpBefore = u.hp;
      u.hp = Math.max(0, u.hp - r.damage);
      events.push({ unitId: u.id, kind: r.kind, damage: r.damage, hpBefore, maxHp: u.maxHp, x: u.x, y: u.y });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    if (r.confusionEnded) events.push({ unitId: u.id, kind: 'confusionEnd' });
  }
  checkResult(state);
  state.log.expired = [];
  for (const u of state.units) {
    if (u.side !== ending || !u.turns) continue;
    const keys = tickStages(u);
    if (keys.length) state.log.expired.push({ unitId: u.id, keys });
  }
  state.phase = state.phase === 'player' ? 'enemy' : 'player';
  if (state.phase === 'player') state.turn++;
  const side = state.phase === 'player' ? 'ally' : 'enemy';
  for (const u of state.units) {
    if (u.side !== side) continue;
    u.moved = false; u.acted = false;
    if (state.result) continue;
    const st = phaseStart(u, rng);
    if (st.event) events.push({ unitId: u.id, kind: st.event });
    if (st.skip) { u.moved = true; u.acted = true; }
  }
}

export function checkResult(state) {
  if (state.result === 'stairs') return state.result; // 계단 클리어는 덮어쓰지 않음
  if (state.bossFloor && !state.units.some((u) => u.boss)) { state.result = 'win'; return state.result; }
  const enemies = state.units.some((u) => u.side === 'enemy');
  const allies = state.units.some((u) => u.side === 'ally');
  state.result = !enemies ? 'win' : !allies ? 'lose' : null;
  return state.result;
}

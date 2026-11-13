// 전투 상태 (순수 로직, 상태 객체를 직접 갱신)
import { MAP } from '../data/map.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { BALANCE } from '../data/balance.js';
import { calcDamage } from './damage.js';
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
    moves: moves?.length ? [...moves] : startingMoves(SPECIES[species].learnset, level, MOVES),
    moved: false, acted: false,
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
    log: { exp: {}, fainted: [], loot: [] }, // 획득 경험치(종족별), 기절한 아군, 연 보물
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

export function applyAttack(state, attackerId, targetId, moveId, rng) {
  const a = byId(state, attackerId), d = byId(state, targetId);
  const r = calcDamage(a, d, MOVES[moveId], { rng, defTile: state.grid[d.y][d.x] });
  d.hp = Math.max(0, d.hp - r.damage);
  a.acted = true;
  a.moved = true;
  const fainted = d.hp === 0;
  let expGained = {};
  if (fainted) {
    state.units = state.units.filter((u) => u !== d);
    expGained = awardExp(state, a, d);
    if (d.side === 'ally' && !state.log.fainted.includes(d.species)) state.log.fainted.push(d.species);
  }
  checkResult(state);
  return { ...r, fainted, expGained };
}

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

export function endPhase(state) {
  state.phase = state.phase === 'player' ? 'enemy' : 'player';
  if (state.phase === 'player') state.turn++;
  const side = state.phase === 'player' ? 'ally' : 'enemy';
  for (const u of state.units) if (u.side === side) { u.moved = false; u.acted = false; }
}

export function checkResult(state) {
  if (state.result === 'stairs') return state.result; // 계단 클리어는 덮어쓰지 않음
  if (state.bossFloor && !state.units.some((u) => u.boss)) { state.result = 'win'; return state.result; }
  const enemies = state.units.some((u) => u.side === 'enemy');
  const allies = state.units.some((u) => u.side === 'ally');
  state.result = !enemies ? 'win' : !allies ? 'lose' : null;
  return state.result;
}

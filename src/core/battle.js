// 전투 상태 (순수 로직, 상태 객체를 직접 갱신)
import { MAP } from '../data/map.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { calcDamage } from './damage.js';

export const spec = (unit) => SPECIES[unit.species];

function makeUnit(p, side) {
  const hp = SPECIES[p.species].stats.hp;
  return { id: `${side}-${p.species}`, species: p.species, side, x: p.x, y: p.y, hp, maxHp: hp, moved: false, acted: false };
}

export function createBattle(mapDef = MAP) {
  return {
    grid: mapDef.tiles.slice(),
    width: mapDef.tiles[0].length,
    height: mapDef.tiles.length,
    units: [
      ...mapDef.allies.map((p) => makeUnit(p, 'ally')),
      ...mapDef.enemies.map((p) => makeUnit(p, 'enemy')),
    ],
    phase: 'player',
    turn: 1,
    result: null,
  };
}

export const unitAt = (state, x, y) => state.units.find((u) => u.x === x && u.y === y);
const byId = (state, id) => state.units.find((u) => u.id === id);

export function moveUnit(state, id, x, y) {
  const u = byId(state, id);
  u.x = x; u.y = y; u.moved = true;
}

export function applyAttack(state, attackerId, targetId, moveId, rng) {
  const a = byId(state, attackerId), d = byId(state, targetId);
  const r = calcDamage(a, d, MOVES[moveId], { rng, defTile: state.grid[d.y][d.x] });
  d.hp = Math.max(0, d.hp - r.damage);
  a.acted = true;
  a.moved = true;
  const fainted = d.hp === 0;
  if (fainted) state.units = state.units.filter((u) => u !== d);
  checkResult(state);
  return { ...r, fainted };
}

export function endPhase(state) {
  state.phase = state.phase === 'player' ? 'enemy' : 'player';
  if (state.phase === 'player') state.turn++;
  const side = state.phase === 'player' ? 'ally' : 'enemy';
  for (const u of state.units) if (u.side === side) { u.moved = false; u.acted = false; }
}

export function checkResult(state) {
  const enemies = state.units.some((u) => u.side === 'enemy');
  const allies = state.units.some((u) => u.side === 'ally');
  state.result = !enemies ? 'win' : !allies ? 'lose' : null;
  return state.result;
}

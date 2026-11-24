// 메타몽 빌드 (순수): 타입·능력치(파우더)·기술·특성을 플레이어가 키운다. 캡슐 = 쓰러뜨린 적에게서 얻는 소모품
import { MOVES } from '../data/moves.js';
import { ABILITIES } from '../data/abilities.js';
import { TYPES } from '../data/types.js';
import { SPECIES } from '../data/species.js';
import { free } from './freeCost.js';

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const POWDER_KO = { hp: '체력파우더', atk: '공격파우더', def: '방어파우더', spa: '특공파우더', spd: '특방파우더', spe: '스피드파우더' };
export const DITTO_BASE = 48;
export const POWDER_STEP = 10;
export const STAT_MAX = 255;
export const CAPSULE_CHANCE = 0.15;
export const CAPSULE_BAG_MAX = 200;
export const SECOND_TYPE_LEVEL = 10;
export const CAPSULE_KINDS = ['type', 'move', 'ability'];

export const DEFAULT_BUILD = () => ({ types: ['normal'], bonus: Object.fromEntries(STATS.map((s) => [s, 0])), ability: 'limber' });
export const emptyPowders = () => Object.fromEntries(STATS.map((s) => [s, 0]));

// 종족값 합계 상한: 10레벨마다 +40, 최대 600
export const statCap = (level) => Math.min(600, 320 + 40 * Math.floor(level / 10));
export const effectiveBase = (build) => Object.fromEntries(STATS.map((s) => [s, DITTO_BASE + (build.bonus[s] ?? 0)]));
export const bonusTotal = (build) => STATS.reduce((a, s) => a + (build.bonus[s] ?? 0), 0);
const baseTotal = (build) => DITTO_BASE * STATS.length + bonusTotal(build);

const dittoOf = (game) => game.party.find((m) => m.species === 'ditto');
const learnable = (id) => !!MOVES[id] && (MOVES[id].learnable || id === 'tackle');

export function canPowder(member, stat) {
  if (!STATS.includes(stat)) return { ok: false, reason: 'stat' };
  if (DITTO_BASE + member.build.bonus[stat] + POWDER_STEP > STAT_MAX) return { ok: false, reason: 'max' };
  if (baseTotal(member.build) + POWDER_STEP > statCap(member.level)) return { ok: false, reason: 'cap' };
  return { ok: true };
}

export function applyPowder(game, stat) {
  const d = dittoOf(game);
  if (!d) return { ok: false, reason: 'missing' };
  if (!(game.items.powders?.[stat] > 0)) return { ok: false, reason: 'none' };
  const r = canPowder(d, stat);
  if (!r.ok) return r;
  game.items.powders[stat] -= free(game, 1);
  d.build.bonus[stat] += POWDER_STEP;
  return { ok: true };
}

// 캡슐을 넣을 수 있는 칸 (move: 기술 칸 0~3, type: 타입 칸 0~1, ability: 0)
export function capsuleUse(member, capsule) {
  const b = member.build;
  if (capsule.kind === 'move') {
    if (member.moves.includes(capsule.value)) return { ok: false, reason: 'same', slots: [] };
    const slots = member.moves.map((_, k) => k); // 지금 기술 칸 + (4개 미만이면) 다음 빈 칸 하나
    if (member.moves.length < 4) slots.push(member.moves.length);
    return { ok: true, slots };
  }
  if (capsule.kind === 'type') {
    const open = member.level >= SECOND_TYPE_LEVEL ? [0, 1] : [0];
    const slots = open.filter((k) => !b.types.some((t, j) => j !== k && t === capsule.value) && b.types[k] !== capsule.value);
    if (!slots.length) return { ok: false, reason: 'same', slots };
    return { ok: true, slots, level: open.length < 2 };
  }
  if (capsule.kind === 'ability') return b.ability === capsule.value ? { ok: false, reason: 'same', slots: [] } : { ok: true, slots: [0] };
  return { ok: false, reason: 'kind', slots: [] };
}

// 가방의 index 번째 캡슐을 slot 에 적용하고 가방에서 뺀다 (빠진 것은 사라진다)
export function applyCapsule(game, index, slot) {
  const d = dittoOf(game), c = game.items.capsules?.[index];
  if (!d || !c) return { ok: false, reason: 'missing' };
  const use = capsuleUse(d, c);
  if (!use.ok) return use;
  if (!use.slots.includes(slot)) return { ok: false, reason: 'slot' };
  if (c.kind === 'move') { if (slot >= d.moves.length) d.moves.push(c.value); else d.moves[slot] = c.value; }
  if (c.kind === 'type') d.build.types[slot] = c.value;
  if (c.kind === 'ability') d.build.ability = c.value;
  d.build.types = d.build.types.filter(Boolean);
  game.items.capsules.splice(index, 1);
  return { ok: true };
}

export function clearSecondType(game) {
  const d = dittoOf(game);
  if (!d || d.build.types.length < 2) return { ok: false, reason: 'none' };
  d.build.types = [d.build.types[0]];
  return { ok: true };
}

// 쓰러뜨린 적 [{ species, types, moves, ability, boss }] → 캡슐 (보스 확정, 아니면 15%)
export function rollCapsules(defeated, rng) {
  const out = [];
  for (const f of defeated) {
    if (!f.boss && !(rng() < CAPSULE_CHANCE)) continue;
    const pool = [
      ...(f.types ?? []).map((value) => ({ kind: 'type', value })),
      ...(f.moves ?? []).filter(learnable).map((value) => ({ kind: 'move', value })),
      ...(f.ability && ABILITIES[f.ability] ? [{ kind: 'ability', value: f.ability }] : []),
    ];
    if (!pool.length) continue;
    out.push({ ...pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))], from: f.species });
  }
  return out;
}

// 가방에 넣기. 넘치면 오래된 것부터 버리고 버린 수를 돌려준다
export function addCapsules(game, list) {
  game.items.capsules ??= [];
  game.items.capsules.push(...list);
  const over = Math.max(0, game.items.capsules.length - CAPSULE_BAG_MAX);
  if (over) game.items.capsules.splice(0, over);
  return over;
}

// ---- 저장 정리 ----
export function cleanCapsule(c) {
  if (!c || typeof c !== 'object' || !CAPSULE_KINDS.includes(c.kind) || !Object.hasOwn(SPECIES, c.from)) return null;
  const ok = c.kind === 'type' ? TYPES.includes(c.value) : c.kind === 'move' ? learnable(c.value) : Object.hasOwn(ABILITIES, c.value);
  return ok ? { kind: c.kind, value: c.value, from: c.from } : null;
}

export function cleanPowders(p) {
  const src = p && typeof p === 'object' ? p : {};
  return Object.fromEntries(STATS.map((s) => [s, Math.max(0, Math.min(999, Math.floor(Number(src[s]) || 0)))]));
}

export function cleanBuild(b, level) {
  const def = DEFAULT_BUILD();
  if (!b || typeof b !== 'object') return def;
  let types = [...new Set((Array.isArray(b.types) ? b.types : []).filter((t) => TYPES.includes(t)))];
  types = types.slice(0, level >= SECOND_TYPE_LEVEL ? 2 : 1);
  if (!types.length) types = def.types;
  const bonus = Object.fromEntries(STATS.map((s) => {
    const v = Math.floor(Number(b.bonus?.[s]) || 0);
    const top = Math.floor((STAT_MAX - DITTO_BASE) / POWDER_STEP) * POWDER_STEP; // 파우더로 닿을 수 있는 값만 (200)
    return [s, Math.max(0, Math.min(top, v - (v % POWDER_STEP)))];
  }));
  // 합계 상한을 넘으면 큰 값부터 깎는다
  let over = DITTO_BASE * STATS.length + STATS.reduce((a, s) => a + bonus[s], 0) - statCap(level);
  while (over > 0) {
    const top = STATS.reduce((m, s) => (bonus[s] > bonus[m] ? s : m), STATS[0]);
    bonus[top] -= POWDER_STEP; over -= POWDER_STEP;
  }
  const ability = typeof b.ability === 'string' && Object.hasOwn(ABILITIES, b.ability) ? b.ability : def.ability;
  return { types, bonus, ability };
}

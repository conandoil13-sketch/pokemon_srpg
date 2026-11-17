// 종족 = PokeAPI 생성 데이터 + SRPG 이동력. 키는 PokeAPI 식별자 (예: 'chimchar')
import POKEDEX from './generated/pokedex.js';
import { TYPES } from './types.js';
import { MOVES } from './moves.js';

// 이동력: 스피드 종족값 20 단위 2~8 (30 미만 2 … 130 이상 8), 비행 타입 +1 (최대 8) — 2026-11-18
export const MOVE_MAX = 8;
export function movementFor(types, speed) {
  const base = speed < 30 ? 2 : Math.min(MOVE_MAX, 3 + Math.floor((speed - 30) / 20));
  return Math.min(MOVE_MAX, base + (types.includes('flying') ? 1 : 0));
}

export const SPECIES = Object.fromEntries(
  Object.values(POKEDEX.species).map((s) => [s.api, { ...s, key: s.api, move: movementFor(s.types, s.base.spe) }]),
);

export function validateData() {
  for (const s of Object.values(SPECIES)) {
    for (const t of s.types) if (!TYPES.includes(t)) throw new Error(`${s.key}: unknown type ${t}`);
    for (const [, m] of s.learnset) if (!MOVES[m]) throw new Error(`${s.key}: unknown move ${m}`);
    for (const e of s.evolutions) if (!SPECIES[e.to]) throw new Error(`${s.key}: unknown evolution ${e.to}`);
  }
  // 변화기(learnable=false)는 쓰지 않으므로 4세대 '???' 타입(저주) 등도 허용
  for (const m of Object.values(MOVES)) if (m.learnable && !TYPES.includes(m.type)) throw new Error(`${m.id}: unknown type ${m.type}`);
}

// 기술 = PokeAPI 생성 데이터 + SRPG 사거리. 키는 PokeAPI 식별자 (예: 'close-combat')
import POKEDEX from './generated/pokedex.js';
import { MOVE_RANGES } from './moveRanges.js';

export const defaultRange = (category) => (category === 'physical' ? [1, 1] : [1, 2]);

export const MOVES = Object.fromEntries(
  Object.values(POKEDEX.moves).map((m) => [m.api, { ...m, id: m.api, range: MOVE_RANGES[m.api] ?? defaultRange(m.category) }]),
);

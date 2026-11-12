// 파티 진행 (순수): 새 파티, 경험치 적용 → 레벨업·기술·진화 이벤트
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { BALANCE } from '../data/balance.js';
import { expForLevel } from './stats.js';
import { startingMoves } from './learn.js';

export const STARTERS = ['chimchar', 'piplup', 'turtwig', 'shinx'];

// Member = { species, level, exp, moves }
export function newMember(species, level = BALANCE.startLevel) {
  const s = SPECIES[species];
  return { species, level, exp: expForLevel(s.growth, level), moves: startingMoves(s.learnset, level, MOVES) };
}

export const newParty = () => STARTERS.map((sp) => newMember(sp));

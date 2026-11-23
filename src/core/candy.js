// 이상한사탕 (순수): 마을 보물찾기로 얻고, 가방에서 써서 레벨 1 (상한은 지킴). 2026-11-23
import { SPECIES } from '../data/species.js';
import { expForLevel } from './stats.js';

export const CANDY_TOTAL = 3;

// 처음 찾은 자리면 사탕 하나 + 찾은 수를, 이미 찾았으면 0
export function findCandy(game, id) {
  const found = game.eggs?.candies ?? [];
  if (found.includes(id)) return 0;
  game.eggs = { ...game.eggs, candies: [...found, id] };
  game.items.rareCandy = (game.items.rareCandy ?? 0) + 1;
  return found.length + 1;
}

// 다음 레벨까지 필요한 경험치 (결산 화면에 그대로 넘겨 레벨업·기술·진화를 같은 흐름으로)
export const candyExp = (m) => expForLevel(SPECIES[m.species].growth, m.level + 1) - m.exp;

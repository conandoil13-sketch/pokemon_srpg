// 지니는 도구 가방: game.items.held = { [id]: 개수 }, 동료 m.held = id | null (지닌 것은 가방에서 빠짐)
import { isHeldItem } from '../data/heldItems.js';

const memberOf = (game, uid) => game.party.find((m) => (m.uid ?? m.species) === uid);
const bag = (game) => (game.items.held ??= {});

// 지니기 (지닌 게 있으면 가방으로 돌려놓고 바꿈). 가방에 없으면 실패
export function equip(game, uid, id) {
  const m = memberOf(game, uid), b = bag(game);
  if (!m || !isHeldItem(id) || !(b[id] > 0)) return false;
  if (m.held) b[m.held] = (b[m.held] ?? 0) + 1;
  b[id] -= 1; if (b[id] <= 0) delete b[id];
  m.held = id;
  return true;
}

export function unequip(game, uid) {
  const m = memberOf(game, uid), b = bag(game);
  if (!m || !m.held) return false;
  b[m.held] = (b[m.held] ?? 0) + 1;
  m.held = null;
  return true;
}

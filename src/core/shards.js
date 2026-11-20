// 결정은 진화 계열의 첫 종을 키로 보관한다.
export function addShards(game, root, count) {
  game.shards ??= {};
  game.shards[root] = (game.shards[root] ?? 0) + count;
}

export const TREE_SHAKES = 5;

export function shakeGiftTree(game) {
  game.eggs ??= {};
  const count = game.eggs.treeShakes ?? 0;
  if (count >= TREE_SHAKES) return false;
  game.eggs.treeShakes = count + 1;
  if (game.eggs.treeShakes !== TREE_SHAKES) return false;
  addShards(game, 'shinx', 3);
  return true;
}

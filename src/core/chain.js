// 전기·불꽃 연쇄 (타입별 지형 이득): 맞은 상대가 그 종류 칸에 있으면 상하좌우로 같은 종류 칸에 선 상대에게 번진다.
// 전기 = 물 칸(깊은·얕은), 불꽃 = 수풀 칸 + 단풍길(state.leafTiles). 피해 = 처음 맞은 대상이 받은 피해의 10% (최소 1).
// 한 포켓몬 한 번, 이 기술에 이미 맞은 대상 제외, 쓴 쪽의 상대 편만. 면역이면 피해 없이 지나감.
export const CHAIN_RATE = 0.1;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function chainKind(type) { return type === 'electric' || type === 'fire' ? type : null; }

export function chainTile(state, kind, x, y) {
  const t = state.grid[y]?.[x];
  if (kind === 'electric') return t === '~' || t === ',';
  if (kind === 'fire') return t === '"' || !!state.leafTiles?.has(`${x},${y}`);
  return false;
}

// starts: [{ unit, damage }] — 맞은 대상과 받은 피해. exclude: 이 기술의 대상 id.
// blocked(u): 면역이면 true (피해 없이 지나감). 돌려줌: [{ unit, damage, from }] (처음 닿은 순서)
export function chainSpread(state, attacker, kind, starts, exclude, blocked = () => false) {
  const seen = new Set(exclude), out = [];
  for (const { unit, damage } of starts) {
    if (!(damage > 0) || !chainTile(state, kind, unit.x, unit.y)) continue;
    const dmg = Math.max(1, Math.floor(damage * CHAIN_RATE));
    const q = [unit];
    while (q.length) {
      const cur = q.shift();
      for (const [dx, dy] of DIRS) {
        const x = cur.x + dx, y = cur.y + dy;
        if (!chainTile(state, kind, x, y)) continue;
        const v = state.units.find((u) => u.x === x && u.y === y && u.hp > 0 && !u.burrow);
        if (!v || v.side === attacker.side || seen.has(v.id)) continue;
        seen.add(v.id); q.push(v);
        if (!blocked(v)) out.push({ unit: v, damage: dmg, from: cur.id });
      }
    }
  }
  return out;
}

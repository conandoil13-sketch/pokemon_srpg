// 이동 범위 / 사거리 (순수 함수)
import { SPECIES } from '../data/species.js';

export const TILE_COST = { '.': 1, '"': 1, '^': 2, '~': 1, '#': Infinity, '>': 1 };

export function canEnter(tile, speciesKey) {
  if (tile === '#' || tile === undefined) return false;
  if (tile === '~') {
    const t = SPECIES[speciesKey].types;
    return t.includes('water') || t.includes('flying');
  }
  return true;
}

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 다익스트라. 반환: { best: Map<"x,y", 비용>, parent: Map<"x,y", "x,y">, occ }
function search(grid, units, unit) {
  const budget = SPECIES[unit.species].move;
  const h = grid.length, w = grid[0].length;
  const occ = new Map(units.filter((o) => o !== unit && o.hp > 0).map((o) => [`${o.x},${o.y}`, o.side]));
  const best = new Map([[`${unit.x},${unit.y}`, 0]]);
  const parent = new Map();
  const open = [{ x: unit.x, y: unit.y, c: 0 }];
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    if (cur.c > best.get(`${cur.x},${cur.y}`)) continue;
    for (const [dx, dy] of DIRS) {
      const x = cur.x + dx, y = cur.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const tile = grid[y][x];
      if (!canEnter(tile, unit.species)) continue;
      const side = occ.get(`${x},${y}`);
      if (side && side !== unit.side) continue;
      const c = cur.c + TILE_COST[tile];
      if (c > budget) continue;
      const k = `${x},${y}`;
      if (best.has(k) && best.get(k) <= c) continue;
      best.set(k, c);
      parent.set(k, `${cur.x},${cur.y}`);
      open.push({ x, y, c });
    }
  }
  return { best, parent, occ };
}

// 반환: Map<"x,y", 누적비용> (정지 가능한 칸만, 시작 칸 포함)
export function reachable(grid, units, unit) {
  const { best, occ } = search(grid, units, unit);
  // 같은 편이 서 있는 칸은 통과만 가능, 정지 불가
  for (const [k, side] of occ) if (side === unit.side) best.delete(k);
  return best;
}

// 시작 칸 → (tx,ty) 경로 (양끝 포함). 도달 불가면 [시작 칸]
export function pathTo(grid, units, unit, tx, ty) {
  const { best, parent } = search(grid, units, unit);
  let k = `${tx},${ty}`;
  if (!best.has(k)) return [{ x: unit.x, y: unit.y }];
  const out = [];
  while (k) {
    const [x, y] = k.split(',').map(Number);
    out.unshift({ x, y });
    k = parent.get(k);
  }
  return out;
}

export function tilesInRange(x, y, [min, max], w, h) {
  const out = [];
  for (let dy = -max; dy <= max; dy++) {
    for (let dx = -max; dx <= max; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      const tx = x + dx, ty = y + dy;
      if (d < min || d > max || tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      out.push({ x: tx, y: ty });
    }
  }
  return out;
}

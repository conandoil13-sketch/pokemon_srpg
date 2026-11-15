// 이동 범위 / 사거리 (순수 함수)
import { SPECIES } from '../data/species.js';
import { moveBudget } from './status.js';

export const TILE_COST = { '.': 1, '"': 1, '^': 2, '~': 1, '#': Infinity, '>': 1 };

// who: 유닛(타입은 유닛 기준 — 메타몽 빌드) 또는 종 키
// trees: 벽(#)이 나무인 맵 (유연은 나무를 지나갈 수 있음 — 멈추지는 못함, reachable 이 뺀다)
const ab = (who) => (typeof who === 'object' && !who.abilityOff ? who.ability : null);
export function canEnter(tile, who, trees = false) {
  if (tile === undefined) return false;
  if (tile === '#') return trees && ab(who) === 'limber'; // 유연: 나무 통과
  if (tile === '~') {
    const t = typeof who === 'string' ? SPECIES[who].types : who.types ?? SPECIES[who.species].types;
    return t.includes('water') || t.includes('flying') || ab(who) === 'levitate'; // 부유: 비행처럼 물 위로
  }
  return true;
}

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 다익스트라. 반환: { best: Map<"x,y", 비용>, parent: Map<"x,y", "x,y">, occ }
function search(grid, units, unit, budgetOverride = null) {
  const budget = budgetOverride ?? moveBudget(unit); // 마비면 절반 (치고 빠지기는 남은 이동력)
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
      if (!canEnter(tile, unit, !!grid.trees)) continue;
      const side = occ.get(`${x},${y}`);
      if (side && side !== unit.side) continue;
      const c = cur.c + (tile === '#' ? 1 : TILE_COST[tile]); // 유연이 지나는 나무는 1
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
export function reachable(grid, units, unit, budget = null) {
  const { best, occ } = search(grid, units, unit, budget);
  // 같은 편이 서 있는 칸은 통과만 가능, 정지 불가
  for (const [k, side] of occ) if (side === unit.side) best.delete(k);
  for (const k of [...best.keys()]) { const [x, y] = k.split(',').map(Number); if (grid[y][x] === '#') best.delete(k); } // 나무 위엔 못 섬
  return best;
}

// 시작 칸 → (tx,ty) 경로 (양끝 포함). 도달 불가면 [시작 칸]
export function pathTo(grid, units, unit, tx, ty, budget = null) {
  const { best, parent } = search(grid, units, unit, budget);
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

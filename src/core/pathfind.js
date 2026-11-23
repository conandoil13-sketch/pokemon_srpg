// 이동 범위 / 사거리 (순수 함수)
import { SPECIES } from '../data/species.js';
import { moveBudget } from './status.js';

export const TILE_COST = { '.': 1, '"': 1, '^': 2, '~': 1, ',': 1, '#': Infinity, '>': 1, '*': Infinity, B: 1, '%': 1, G: Infinity, ':': 2, '=': 1, o: 1, '@': 1, L: 1, v: 1, V: Infinity, _: 1, Y: Infinity, T: Infinity }; // '*' = 열리지 않은 낙엽더미 · 'B' = 건물(옥상, 시티) · '%' = 독 웅덩이(하수도) · 'G' = 발전기(발전소) · ':' 깊은 모래 '=' 흐르는 모래 'o'/'@' 모래지옥(사막) · 'L' 용암 'v' 현무암 'V' 분출구(화산동굴) · '_' 빙판 'Y' 고드름(얼음동굴) · 'T' 묘비(묘지)

// 바위·땅 타입은 바위 칸 비용 1 (타입별 지형 이득)
const typesOfWho = (who) => (typeof who === 'string' ? SPECIES[who].types : who.types ?? SPECIES[who.species].types);
const typed = (who, t) => typesOfWho(who).includes(t);
// 비행(중력 아닐 때)·드래곤: 나무·벽·낙엽더미를 비용 3 으로 넘음 (멈출 수 없음)
const soars = (who) => typeof who === 'object' && ((typed(who, 'flying') && !who.grounded) || typed(who, 'dragon'));
const climbs = (who, trees) => trees && (ab(who) === 'limber' || typed(who, 'bug')); // 유연·벌레: 나무를 비용 1 로
export function tileCost(tile, who, trees = false) {
  if (tile === '#' || tile === '*') return tile === '#' && climbs(who, trees) ? 1 : 3;
  if (tile === 'T') return typed(who, 'ghost') ? 1 : 3; // 묘비: 고스트는 스며 지나감, 비행·드래곤은 넘음
  if (tile === '^' && typesOfWho(who).some((t) => t === 'rock' || t === 'ground')) return 1;
  if (tile === ':' && floats(who)) return 1; // 깊은 모래: 떠 있으면 평지
  return TILE_COST[tile];
}

// 떠 있음 (abilities.airborne 과 같은 기준 — 순환 import 를 피해 여기 둠)
export const floats = (who) => {
  if (typeof who === 'object' && who.grounded) return false;
  return typesOfWho(who).includes('flying') || ab(who) === 'levitate' || (typeof who === 'object' && who.magnetRise > 0);
};

// 얼음동굴: 빙판에서 끝까지 미끄러지는 포켓몬 = 지상 && 얼음 타입 아님 (얼음 타입·떠 있음은 빙판을 평지처럼)
export const slides = (who) => typeof who === 'object' && !floats(who) && !typed(who, 'ice');
// 부딪혀 밀 수 있는 포켓몬 (battle.pushAway 면역과 같게: 보스·뿌리박기·흡반)
export const shovable = (o) => !o.boss && !o.rooted && ab(o) !== 'suction-cups';

// who: 유닛(타입은 유닛 기준 — 메타몽 빌드) 또는 종 키
// trees: 벽(#)이 나무인 맵 (유연은 나무를 지나갈 수 있음 — 멈추지는 못함, reachable 이 뺀다)
const ab = (who) => (typeof who === 'object' && !who.abilityOff ? who.ability : null);
// pass: 지나가기만 하는 경로 계산 (비행·드래곤 장애물 넘기)
export function canEnter(tile, who, trees = false, pass = false) {
  if (tile === undefined) return false;
  if (pass && (tile === '#' || tile === '*') && soars(who)) return true;
  if (tile === 'T') return pass && (soars(who) || typed(who, 'ghost')); // 묘비: 지나가기만 (아무도 멈추거나 내려앉지 못함)
  if (tile === 'B') return soars(who); // 건물: 지상에선 벽, 비행·드래곤만 옥상으로 (옥상 안 이동은 search 가 따로)
  if (tile === '*' || tile === 'G' || tile === 'V' || tile === 'Y') return false; // 낙엽더미·발전기·분출구: 누구도 못 들어감 (순간이동·밀치기 포함)
  if (tile === 'L') { // 용암: 떠 있음·드래곤·마그마그 계열만 (물 타입은 못 감)
    if (typeof who === 'object' && ['slugma', 'magcargo'].includes(who.species)) return true;
    if (typeof who === 'string' && ['slugma', 'magcargo'].includes(who)) return true;
    if (typesOfWho(who).includes('dragon') && !(typeof who === 'object' && who.grounded)) return true;
    return floats(who);
  }
  if (tile === '#') return climbs(who, trees); // 유연·벌레: 나무 통과
  if (tile === '~') {
    const t = typeof who === 'string' ? SPECIES[who].types : who.types ?? SPECIES[who.species].types;
    if (t.includes('water') || t.includes('dragon') || t.includes('ice')) return true; // 드래곤: 물 위 이동 · 얼음: 물을 얼리며 걸음 (battle.moveUnit)
    if (typeof who === 'object' && who.grounded) return false; // 중력: 땅에 붙어 물 위로 못 감
    return t.includes('flying') || ab(who) === 'levitate' || (typeof who === 'object' && who.magnetRise > 0); // 부유·전자부유: 비행처럼 물 위로
  }
  return true;
}

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 다익스트라. 반환: { best: Map<"x,y", 비용>, parent: Map<"x,y", "x,y">, occ }
function search(grid, units, unit, budgetOverride = null) {
  const budget = budgetOverride ?? moveBudget(unit); // 마비면 절반 (치고 빠지기는 남은 이동력)
  const h = grid.length, w = grid[0].length;
  const others = units.filter((o) => o !== unit && o.hp > 0);
  const occ = new Map(others.map((o) => [`${o.x},${o.y}`, o.side]));
  const occU = new Map(others.map((o) => [`${o.x},${o.y}`, o]));
  const best = new Map([[`${unit.x},${unit.y}`, 0]]);
  const parent = new Map(), via = new Map();
  const stopBest = new Map(), stopFrom = new Map(), stopVia = new Map(); // 부딪혀·고드름에 멈춘 도착 (거기서 더 안 감) — 걸어 온 도착과 따로 셈
  const open = [{ x: unit.x, y: unit.y, c: 0 }];
  const slider = slides(unit), trees = !!grid.trees;
  // 빙판 미끄럼 끝: { x, y, cells(지나간 칸), stop(부딪힘·고드름) } — 못 움직이면 null
  const slide = (sx, sy, dx, dy) => {
    let px = sx, py = sy;
    const cells = [];
    for (;;) {
      const nx = px + dx, ny = py + dy, t = grid[ny]?.[nx], o = occU.get(`${nx},${ny}`);
      if (o) { // 부딪힘: 뒤 칸이 비어 있고 들어갈 수 있으면 한 칸 밀고 그 칸에, 아니면 앞에서 멈춤
        const bt = grid[ny + dy]?.[nx + dx];
        if (shovable(o) && bt !== undefined && bt !== '#' && canEnter(bt, o, trees) && !occU.has(`${nx + dx},${ny + dy}`)) return { x: nx, y: ny, cells, stop: true };
        return px === sx && py === sy ? null : { x: px, y: py, cells: cells.slice(0, -1), stop: true };
      }
      if (t === undefined || !canEnter(t, unit, trees)) return px === sx && py === sy ? null : { x: px, y: py, cells: cells.slice(0, -1), stop: t === 'Y' };
      if (t !== '_') return { x: nx, y: ny, cells, stop: false }; // 빙판이 아닌 칸에 닿으면 그 칸에서
      cells.push({ x: nx, y: ny }); px = nx; py = ny;
    }
  };
  const pit = grid[unit.y]?.[unit.x] === '@' && typeof unit === 'object' && !floats(unit) && !unit.burrow; // 모래지옥 가운데: 나가는 첫걸음이 이동력 전부
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    if (cur.c > best.get(`${cur.x},${cur.y}`)) continue;
    for (const [dx, dy] of DIRS) {
      let x = cur.x + dx, y = cur.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (slider && grid[y][x] === '_') { // 빙판: 들어서는 걸음 1, 미끄러짐은 공짜
        const s = slide(cur.x, cur.y, dx, dy);
        if (!s) continue;
        const c = cur.c + 1, k = `${s.x},${s.y}`;
        if (c > budget) continue;
        if (s.stop) { // 멈춘 도착: 따로 기록, 확장 안 함
          if (!stopBest.has(k) || stopBest.get(k) > c) { stopBest.set(k, c); stopFrom.set(k, `${cur.x},${cur.y}`); stopVia.set(k, s.cells); }
          continue;
        }
        if (best.has(k) && best.get(k) <= c) continue;
        best.set(k, c); parent.set(k, `${cur.x},${cur.y}`); via.set(k, s.cells);
        open.push({ x: s.x, y: s.y, c });
        continue;
      }
      const tile = grid[y][x], roofWalk = tile === 'B' && grid[cur.y][cur.x] === 'B'; // 옥상 위에서는 누구나 건물 칸끼리 걷는다
      if (!roofWalk && !canEnter(tile, unit, !!grid.trees, true)) continue;
      const side = occ.get(`${x},${y}`);
      if (side && side !== unit.side && !typesOfWho(unit).includes('ghost')) continue; // 고스트: 상대 칸 통과
      const c = pit && cur.c === 0 && cur.x === unit.x && cur.y === unit.y ? budget : cur.c + (tile === 'B' && !roofWalk ? 2 : tileCost(tile, unit, !!grid.trees)); // 비행·드래곤 옥상 오르기 2
      if (c > budget) continue;
      const k = `${x},${y}`;
      if (best.has(k) && best.get(k) <= c) continue;
      best.set(k, c);
      parent.set(k, `${cur.x},${cur.y}`); via.delete(k);
      open.push({ x, y, c });
    }
  }
  // 멈춘 도착이 이기는 칸: 다른 포켓몬이 있는 칸(밀어내기 — 걸어서는 못 섬)이거나 더 싸거나 같을 때
  const stops = new Set();
  for (const [k, c] of stopBest) {
    if (best.has(k) && !occ.has(k) && best.get(k) < c) continue;
    stops.add(k); best.set(k, c); // 경로의 마지막 한 걸음만 stopFrom/stopVia — 이 칸을 지나는 다른 경로(parent)는 그대로
  }
  return { best, parent, occ, via, stops, stopFrom, stopVia };
}

// 반환: Map<"x,y", 누적비용> (정지 가능한 칸만, 시작 칸 포함)
export function reachable(grid, units, unit, budget = null) {
  const { best, occ, stops } = search(grid, units, unit, budget);
  // 같은 편이 서 있는 칸은 통과만 가능, 정지 불가 (빙판에서 부딪혀 밀어낸 칸은 예외)
  for (const [k, side] of occ) if (!stops.has(k) && side === unit.side || typesOfWho(unit).includes('ghost')) best.delete(k); // 고스트도 상대 칸엔 못 섬
  for (const k of [...best.keys()]) { const [x, y] = k.split(',').map(Number); const t = grid[y][x]; if (t === '*' || t === 'T' || (t === '#' && !(grid.trees && typed(unit, 'bug')))) best.delete(k); } // 나무 위엔 벌레만 섬, 낙엽더미 위엔 아무도
  return best;
}

// 시작 칸 → (tx,ty) 경로 (양끝 포함). 도달 불가면 [시작 칸]
export function pathTo(grid, units, unit, tx, ty, budget = null) {
  const { best, parent, via, stops, stopFrom, stopVia } = search(grid, units, unit, budget);
  let k = `${tx},${ty}`;
  if (!best.has(k)) return [{ x: unit.x, y: unit.y }];
  const out = [];
  let last = stops.has(k); // 끝 칸이 멈춘 도착이면 마지막 한 걸음은 stopFrom
  while (k) {
    const [x, y] = k.split(',').map(Number);
    out.unshift({ x, y });
    const v = (last ? stopVia : via).get(k) ?? [];
    for (let i = v.length - 1; i >= 0; i--) out.unshift(v[i]); // 미끄러져 지나간 칸
    k = (last ? stopFrom : parent).get(k);
    last = false;
  }
  return out;
}

// 걸은 경로의 이동 비용 (치고 빠지기용). 빙판에서 같은 방향으로 이어지는 걸음은 미끄럼이라 공짜
export function pathCost(grid, unit, path) {
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], t = grid[b.y][b.x];
    if (i > 1 && slides(unit) && grid[a.y][a.x] === '_' && b.x - a.x === a.x - path[i - 2].x && b.y - a.y === a.y - path[i - 2].y) continue;
    c += t === 'T' ? tileCost('T', unit) : t === '#' ? 1 : t === 'B' && grid[a.y][a.x] !== 'B' ? 2 : t === ':' ? tileCost(':', unit) : TILE_COST[t] ?? 1;
  }
  return c;
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

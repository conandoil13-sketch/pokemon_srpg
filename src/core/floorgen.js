// 층 맵 생성 (순수, 시드 고정이면 같은 결과). 탁 트인 필드에 지형 덩어리를 뿌리고 연결성을 보장한다.
import { createRng } from './rng.js';
import { encounterPool } from './encounters.js';

const W = 16, H = 12;
const WALK = '."^>'; // 땅 타입이 지나갈 수 있는 칸
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SAFE_COLS = 3; // 아군 출발 구역 (x < 3) 에는 지형을 칠하지 않는다
export const ALLY_SLOTS = 5; // 메타몽 + 동료 4

export const hashSeed = (runSeed, floor) => (runSeed ^ Math.imul(floor + 1, 0x9e3779b1)) >>> 0;
const key = (x, y) => `${x},${y}`;

// 땅 이동 기준 BFS. 반환: Map<"x,y", 거리>
function distances(tiles, start) {
  const dist = new Map([[key(start.x, start.y), 0]]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist.has(k) || !WALK.includes(tiles[ny][nx])) continue;
      dist.set(k, dist.get(key(x, y)) + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

export const reachableFrom = (tiles, start) => new Set(distances(tiles, start).keys());

export function generateFloor(dungeon, floor, seed) {
  const rng = createRng(seed);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // 1~2. 바닥 + 지형 덩어리 (무작위 걸음)
  const g = Array.from({ length: H }, () => new Array(W).fill('.'));
  for (const tile of ['~', '#', '^', '"']) {
    const c = dungeon.clusters[tile];
    const n = Array.isArray(c) ? int(c[0], c[1]) : c;
    for (let i = 0; i < n; i++) {
      let x = int(SAFE_COLS, W - 1), y = int(0, H - 1);
      for (let s = int(4, 12); s > 0; s--) {
        g[y][x] = tile;
        const [dx, dy] = pick(DIRS);
        x = Math.min(W - 1, Math.max(SAFE_COLS, x + dx));
        y = Math.min(H - 1, Math.max(0, y + dy));
      }
    }
  }
  const tiles = () => g.map((r) => r.join(''));

  // 3. 연결성 보장: 도달 못 한 칸 → 가장 가까운 도달 칸까지 막힌 칸을 뚫는다
  const anchor = { x: 1, y: Math.floor(H / 2) };
  for (;;) {
    const reach = reachableFrom(tiles(), anchor);
    let lost = null;
    for (let y = 0; y < H && !lost; y++) for (let x = 0; x < W && !lost; x++) {
      if (WALK.includes(g[y][x]) && !reach.has(key(x, y))) lost = { x, y };
    }
    if (!lost) break;
    let best = null, bd = Infinity;
    for (const k of reach) {
      const [x, y] = k.split(',').map(Number);
      const d = Math.abs(x - lost.x) + Math.abs(y - lost.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    let { x, y } = lost;
    while (x !== best.x) { x += Math.sign(best.x - x); if (!WALK.includes(g[y][x])) g[y][x] = '.'; }
    while (y !== best.y) { y += Math.sign(best.y - y); if (!WALK.includes(g[y][x])) g[y][x] = '.'; }
  }

  const used = new Set();
  const take = (p) => { used.add(key(p.x, p.y)); return p; };

  // 4. 아군 출발 4칸 (왼쪽 3열)
  const left = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < SAFE_COLS; x++) left.push({ x, y });
  const allySlots = shuffle(left).slice(0, ALLY_SLOTS).map(take);

  // 5. 계단 (보스 층 제외): 출발점에서 가장 먼 바닥 칸 상위 25%
  const isBoss = floor === dungeon.floors;
  let stairs = null;
  const dist = distances(tiles(), anchor);
  if (!isBoss) {
    const far = [...dist.entries()]
      .map(([k, d]) => { const [x, y] = k.split(',').map(Number); return { x, y, d }; })
      .filter((p) => g[p.y][p.x] === '.' && !used.has(key(p.x, p.y)))
      .sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
    stairs = take(pick(far.slice(0, Math.max(1, Math.ceil(far.length * 0.25)))));
    stairs = { x: stairs.x, y: stairs.y };
    g[stairs.y][stairs.x] = '>';
  }

  // 6. 적 (오른쪽 절반)
  const right = [...dist.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
    .filter((p) => p.x >= 8 && '."^'.includes(g[p.y][p.x]) && !used.has(key(p.x, p.y)))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  shuffle(right);
  const pool = encounterPool(dungeon, floor);
  const enemies = [];
  for (let i = 0; i < dungeon.count(floor); i++) {
    const p = take(right.pop());
    enemies.push({ species: pick(pool), level: dungeon.level(floor), x: p.x, y: p.y });
  }
  if (isBoss) {
    const p = take(right.pop());
    enemies.push({ species: pick(encounterPool(dungeon, floor, { boss: true })), level: dungeon.level(floor) + dungeon.boss.levelBonus, x: p.x, y: p.y, boss: true });
  }

  // 7. 보물상자 0~2개 (0: 30%, 1: 50%, 2: 20%)
  const r = rng();
  const nChests = r < 0.3 ? 0 : r < 0.8 ? 1 : 2;
  const floorCells = [...dist.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
    .filter((p) => g[p.y][p.x] === '.' && !used.has(key(p.x, p.y)))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  shuffle(floorCells);
  const chests = [];
  for (let i = 0; i < nChests && floorCells.length; i++) {
    const p = take(floorCells.pop());
    chests.push({ x: p.x, y: p.y, item: rng() < 0.2 ? 'evoStone' : 'candy' });
  }

  return { tiles: tiles(), allySlots, enemies, stairs, chests };
}

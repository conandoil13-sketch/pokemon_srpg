// 단풍길 (그림만, 효과 없음): 출발 칸 → 목표 칸까지 걸을 수 있는 길 (BFS), 두 칸 폭으로 듬성듬성 넓힘
const BLOCK = '#~*';
export function leafRoute(tiles, from, to) {
  const ok = (x, y) => tiles[y]?.[x] !== undefined && !BLOCK.includes(tiles[y][x]);
  if (!from || !to || !ok(from.x, from.y) || !ok(to.x, to.y)) return new Set();
  const key = (x, y) => `${x},${y}`, prev = new Map([[key(from.x, from.y), null]]), q = [[from.x, from.y]];
  while (q.length) {
    const [x, y] = q.shift(); if (x === to.x && y === to.y) break;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!ok(nx, ny) || prev.has(key(nx, ny))) continue; prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]); }
  }
  if (!prev.has(key(to.x, to.y))) return new Set();
  const path = new Set(); for (let k = key(to.x, to.y); k; k = prev.get(k)) path.add(k);
  for (const k of [...path]) { const [x, y] = k.split(',').map(Number); if ((x + y) % 2 === 0 && ok(x + 1, y)) path.add(key(x + 1, y)); }
  return path;
}

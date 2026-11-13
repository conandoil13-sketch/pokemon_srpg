// 4분할 오토타일 (순수). 칸을 12×12 네 조각으로 나눠, 조각마다 가로·세로·대각 이웃으로 모양을 고른다.
export const QUAD = { INNER: 0, EDGE_H: 1, EDGE_V: 2, OUTER: 3, CORNER_IN: 4 };
// EDGE_H: 위나 아래가 테두리(가로로 이어짐), EDGE_V: 왼쪽이나 오른쪽이 테두리(세로로 이어짐)

// 반환 [왼쪽위, 오른쪽위, 왼쪽아래, 오른쪽아래]. 맵 밖은 같은 종류로 친다(가장자리에 테두리 없음)
export function quadrants(grid, x, y, same) {
  const at = (xx, yy) => (yy < 0 || yy >= grid.length || xx < 0 || xx >= grid[0].length ? true : same(grid[yy][xx]));
  const pick = (dx, dy) => {
    const h = at(x + dx, y), v = at(x, y + dy), d = at(x + dx, y + dy);
    if (!h && !v) return QUAD.OUTER;
    if (h && !v) return QUAD.EDGE_H;
    if (!h && v) return QUAD.EDGE_V;
    return d ? QUAD.INNER : QUAD.CORNER_IN;
  };
  return [pick(-1, -1), pick(1, -1), pick(-1, 1), pick(1, 1)];
}

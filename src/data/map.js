// . 풀  " 수풀  ^ 바위산  ~ 물  # 벽(나무)
export const MAP = {
  tiles: [
    '..""....~~...^^.',
    '.."....~~....^..',
    '.......~~..""...',
    '..^^...~~..""...',
    '..^....~~....#..',
    '................',
    '.......""...#...',
    '..#....~~.......',
    '.......~~..^^...',
    '.""....~~..^....',
    '.""...~~~...""..',
    '......~~~.......',
  ],
  allies: [
    { species: 'infernape', x: 2, y: 5 },
    { species: 'empoleon', x: 1, y: 3 },
    { species: 'torterra', x: 1, y: 7 },
    { species: 'luxray', x: 2, y: 8 },
  ],
  enemies: [
    { species: 'lucario', x: 13, y: 5 },
    { species: 'garchomp', x: 12, y: 3 },
    { species: 'honchkrow', x: 14, y: 1 },
    { species: 'roserade', x: 13, y: 9 },
    { species: 'bronzong', x: 12, y: 7 },
  ],
};

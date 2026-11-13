// 던전 표 (숫자만 바꿔서 조정). 층 f = 1..floors
export const DUNGEONS = [
  {
    id: 'sinnoh-field',
    name: '신오 들판',
    floors: 5,
    unlock: null, // 처음부터 열림
    theme: 'field',
    level: (f) => 7 + f,
    count: (f) => Math.min(3 + Math.ceil(f / 2), 6),
    pool: [
      { species: 'budew', minFloor: 1 },
      { species: 'murkrow', minFloor: 1 },
      { species: 'riolu', minFloor: 2 },
      { species: 'gible', minFloor: 3 },
      { species: 'bronzor', minFloor: 3 },
    ],
    boss: { species: 'riolu', levelBonus: 3 },
    // 지형 덩어리 개수 (물은 [최소, 최대])
    clusters: { '"': 3, '^': 2, '~': [1, 2], '#': 2 },
  },
  {
    id: 'sinnoh-cave',
    name: '신오 동굴',
    floors: 7,
    unlock: 'sinnoh-field', // 이 던전을 돌파하면 열림
    theme: 'cave',
    level: (f) => 12 + f,
    count: (f) => Math.min(4 + Math.ceil(f / 2), 6),
    pool: [
      { species: 'bronzor', minFloor: 1 },
      { species: 'gible', minFloor: 1 },
      { species: 'roselia', minFloor: 2 },
      { species: 'murkrow', minFloor: 3 },
      { species: 'gabite', minFloor: 5 },
    ],
    boss: { species: 'gabite', levelBonus: 3 },
    clusters: { '"': 2, '^': 3, '~': [1, 1], '#': 4 },
  },
];

export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id);

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
    // 적 후보 규칙 (core/encounters.js): 테마 타입 · 종족값 합 상한 · 층별 진화 단계 상한
    types: ['normal', 'grass', 'bug', 'flying', 'electric', 'fairy'],
    bstCap: 420,
    stageCap: (f) => (f <= 2 ? 0 : f <= 4 ? 1 : 2),
    fallback: 'pidgey',
    boss: { levelBonus: 3 },
    // 지형 덩어리 개수 (물은 [최소, 최대])
    clusters: { '"': 3, '^': 2, '~': [1, 2], '#': 2 },
    // 날씨 확률 (층마다 하나, 나머지는 날씨 없음)
    weather: [{ id: 'rain', chance: 0.15 }, { id: 'sun', chance: 0.10 }],
  },
  {
    id: 'sinnoh-cave',
    name: '신오 동굴',
    floors: 7,
    unlock: 'sinnoh-field', // 이 던전을 돌파하면 열림
    theme: 'cave',
    level: (f) => 12 + f,
    count: (f) => Math.min(4 + Math.ceil(f / 2), 6),
    types: ['rock', 'ground', 'steel', 'ghost', 'poison', 'dragon', 'fighting'],
    bstCap: 470,
    stageCap: (f) => (f <= 3 ? 0 : f <= 6 ? 1 : 2),
    fallback: 'geodude',
    boss: { levelBonus: 3 },
    clusters: { '"': 2, '^': 3, '~': [1, 1], '#': 4 },
    weather: [{ id: 'fog', chance: 0.15 }],
  },
];

export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id);

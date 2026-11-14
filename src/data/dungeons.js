// 던전 표 (숫자만 바꿔서 조정). 층 f = 1..floors
export const DUNGEONS = [
  {
    id: 'sinnoh-field',
    name: '신오 들판',
    floors: 5,
    unlock: null, // 처음부터 열림
    theme: 'field',
    // 난이도 곡선 (docs/dungeon-guide.md): 층별 기준 레벨 · 위협도 예산(레벨 × 종족값 합 / 100) · 레벨 상한(= 보스 레벨)
    baseLevel: [6, 7, 9, 10, 12],
    budget: [55, 70, 90, 110, 125],
    levelCap: 15,
    // 1~2층 전용 초반 종: 여러 게임 첫 풀숲의 벌레·동네 새
    early: ['caterpie', 'weedle', 'wurmple', 'kricketot', 'burmy', 'combee', 'ledyba', 'spinarak', 'pidgey', 'spearow', 'starly', 'hoothoot', 'rattata', 'sentret', 'zigzagoon', 'bidoof', 'sunkern', 'budew'],
    // 적 후보 규칙 (core/encounters.js): 테마 타입 · 종족값 합 상한 · 층별 진화 단계 상한
    types: ['normal', 'grass', 'bug', 'flying'],
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
    baseLevel: [13, 14, 15, 16, 17, 18, 19],
    budget: [115, 130, 145, 160, 175, 190, 200],
    levelCap: 22,
    early: ['zubat', 'geodude', 'diglett', 'machop', 'sandshrew', 'makuhita', 'gastly', 'nidoran-f', 'nidoran-m', 'ekans', 'croagunk'],
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

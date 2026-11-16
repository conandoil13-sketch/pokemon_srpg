// 임시 스테이지 (난이도 곡선만, 기믹 없음): 신오 동굴 뒤에 8개. 들판·동굴 번갈아.
// 진짜 새 맵을 만들면 REPLACED 에 { 번호: 던전 } 으로 넣어 그 자리를 대체한다 (해금 사슬은 순서대로 다시 이어짐).
// 스펙 docs/superpowers/specs/2026-11-17-filler-stages-design.md
import { SINNOH_DUNGEONS } from './sinnohDungeons.js';

export const FILLER_COUNT = 8;
export const REPLACED = {}; // 예: { 1: myNewDungeon }

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];
const TEMPLATE = { field: SINNOH_DUNGEONS.find((d) => d.theme === 'field'), cave: SINNOH_DUNGEONS.find((d) => d.theme === 'cave') };
const FLOORS = (n) => (n <= 2 ? 7 : n <= 5 ? 8 : 9);
const START = (n) => 23 + 7 * (n - 1); // 시작 레벨 (단계마다 +7)
const SPAN = 5; // 한 단계 안의 레벨 폭
const BUDGET_PER_LEVEL = 9, BUDGET_STEP = 0.02; // 위협도 예산 ≈ 레벨 × 9 (신오 동굴 끝 층과 비슷한 비율), 층마다 +2%

// n 번째 임시 단계 (1..8). unlock 은 stageSlots 가 순서대로 채운다
export function fillerStage(n) {
  const theme = n % 2 === 1 ? 'field' : 'cave', t = TEMPLATE[theme], floors = FLOORS(n), s = START(n);
  const lv = Array.from({ length: floors }, (_, f) => s + (SPAN * f) / (floors - 1)); // 층별 연속 레벨
  const third = Math.ceil(floors / 3);
  return {
    id: `trial-${n}`,
    name: `시련의 ${theme === 'field' ? '들판' : '동굴'} ${ROMAN[Math.ceil(n / 2) - 1]}`,
    floors,
    unlock: null,
    theme,
    baseLevel: lv.map((l) => Math.round(l)),
    budget: lv.map((l, f) => Math.round(BUDGET_PER_LEVEL * l * (1 + BUDGET_STEP * f))), // 층마다 2% 더 (같은 레벨 층에서도 적이 세지게)
    levelCap: Math.round(lv[floors - 1]) + 3,
    early: t.early,
    types: t.types,
    bstCap: Math.min(670, 470 + 25 * n),
    stageCap: (f) => (f <= third ? 0 : f <= floors - 2 ? 1 : 2), // 마지막 두 층은 최종 진화까지
    fallback: t.fallback,
    boss: { levelBonus: 3 },
    clusters: t.clusters,
    weather: t.weather,
    filler: true, // 임시 단계 표시 (나중에 진짜 맵으로 대체)
  };
}

// 신오 뒤에 붙는 8개 자리: 임시 단계 또는 대체된 진짜 맵. 해금은 앞 자리 돌파 뒤
export function stageSlots(replaced = REPLACED) {
  let prev = SINNOH_DUNGEONS[SINNOH_DUNGEONS.length - 1].id;
  return Array.from({ length: FILLER_COUNT }, (_, i) => {
    const d = { ...(replaced[i + 1] ?? fillerStage(i + 1)), unlock: prev };
    prev = d.id;
    return d;
  });
}

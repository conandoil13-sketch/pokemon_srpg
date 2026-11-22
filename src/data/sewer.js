// 하수도: 6단계 첫 분기 (6-1). 기믹 = 독 웅덩이 `%` + 벽·직선 통로 + 물길 + 쓰레기봉투
// 스펙 docs/superpowers/specs/2026-11-22-sewer-design.md
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(4); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const SEWER = {
  ...curve,
  id: 'sewer',
  name: '하수도',
  theme: 'sewer',
  types: ['poison', 'dark', 'water', 'grass'],
  minorTypes: ['water', 'grass'], // 이 타입만 가진 종은 드물게 (뽑히면 70% 한 번 다시)
  bossTypes: ['poison', 'dark'],
  early: [],
  fallback: 'grimer',
  clusters: { '~': 0, '#': 0, '^': 0, '"': 0 }, // 벽·통로·웅덩이는 sewer 단계가 따로
  weather: [{ id: 'fog', chance: 0.15 }],
  piles: [2, 3], // 쓰레기봉투
  pileSpecies: ['grimer', 'grimer', 'muk', 'muk', 'stunky', 'skuntank', 'croagunk'], // 질퍽이 계열 2배
  sewer: true,
};

// ???시티: 시련 3번 자리를 대체하는 5번째 맵. 기믹 = 건물 옥상(높이) + 워프 타일 + 쓰레기통
// 스펙 docs/superpowers/specs/2026-11-22-city-design.md
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(3); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const CITY = {
  ...curve,
  id: 'city',
  name: '???시티',
  theme: 'city',
  types: ['poison', 'psychic', 'normal', 'steel'],
  minorTypes: ['normal', 'steel'], // 이 타입만 가진 종은 드물게 (뽑히면 70% 한 번 다시)
  bossTypes: ['poison', 'psychic'],
  early: [],
  fallback: 'grimer',
  clusters: { '~': 0, '#': 2, '^': 0, '"': [1, 2] }, // 화단·가로수 (건물은 city 단계가 따로)
  weather: [{ id: 'rain', chance: 0.15 }, { id: 'fog', chance: 0.1 }],
  piles: [2, 3], // 쓰레기통
  pileSpecies: ['grimer', 'muk', 'koffing', 'weezing', 'stunky', 'skuntank'],
  city: true,
};

// 해변: 시련 2번 자리를 대체하는 4번째 맵. 기믹 = 바다 띠 + 물때(−1/0/+1) + 깊은 물 섬 상자 + 모래더미
// 스펙 docs/superpowers/specs/2026-11-22-beach-design.md
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(2); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const BEACH = {
  ...curve,
  id: 'beach',
  name: '해변',
  theme: 'beach',
  types: ['water', 'flying', 'electric', 'ice', 'ground'],
  minorTypes: ['electric', 'ice', 'ground'], // 이 타입만 가진 종은 드물게 (뽑히면 70% 한 번 다시)
  bossTypes: ['water', 'ice'],
  early: [],
  fallback: 'buizel',
  clusters: { '"': 1, '^': 2, '#': 3 }, // 바다는 sea 단계가 따로 (물 덩어리 없음)
  weather: [{ id: 'rain', chance: 0.15 }],
  piles: [2, 3], // 모래더미
  pileSpecies: ['krabby', 'kingler', 'shellder', 'cloyster', 'corphish', 'crawdaunt'],
  sea: true,
};

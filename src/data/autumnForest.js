// 단풍 숲: 시련 1번 자리를 대체하는 첫 진짜 새 맵. 기믹 = 낙엽더미 (다가가면 숨은 포켓몬 기습 또는 상자)
// 스펙 docs/superpowers/specs/2026-11-17-autumn-forest-design.md
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(1); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const AUTUMN_FOREST = {
  ...curve,
  id: 'autumn-forest',
  name: '단풍 숲',
  theme: 'autumn',
  types: ['bug', 'poison', 'fire', 'grass'],
  early: [],
  fallback: 'oddish',
  clusters: { '"': 3, '^': 2, '~': [1, 2], '#': 4 },
  weather: [{ id: 'sun', chance: 0.15 }],
  piles: [2, 4], // 층마다 낙엽더미 2~4개
};

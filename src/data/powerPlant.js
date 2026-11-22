// 발전소: 7단계 첫 분기 (7-1). 기믹 = 2×2 발전기(`G`)의 박자 방출·전기 강화 + 찌리리공 기습 + 고철더미·가벽
// 스펙 docs/superpowers/specs/2026-11-23-power-plant-design.md · core/generator.js · core/ambush.js
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(5); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const POWER_PLANT = {
  ...curve,
  id: 'power-plant',
  name: '발전소',
  theme: 'power-plant',
  types: ['electric', 'steel', 'dark', 'fighting'],
  minorTypes: ['dark', 'fighting'], // 이 타입만 가진 종은 드물게 (뽑히면 70% 한 번 다시)
  bossTypes: ['electric', 'steel'],
  early: [],
  fallback: 'magnemite',
  clusters: { '~': 0, '"': 0, '#': 4, '^': 6 }, // 벽 = 기계·배관, 바위 = 낮은 가벽, 물·수풀 없음
  weather: [],
  piles: [2, 3], // 고철더미
  pileSpecies: ['magnemite', 'magnemite', 'magneton', 'voltorb', 'electrode', 'bronzor'],
  power: true, // 발전기 (floorgen.powerLayout)
  ambush: { species: 'voltorb', drop: 12 }, // 찌리리공 기습: 층 기준 레벨 −12
};

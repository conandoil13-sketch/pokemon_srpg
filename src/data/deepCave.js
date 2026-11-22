// 깊은 동굴: 6단계 두 번째 분기 (6-2). 기믹 = 어둠 (시야 2칸, 탐험 기억) + 적의 순찰·추격·추적·길 잃음
// 스펙 docs/superpowers/specs/2026-11-22-deep-cave-design.md · core/vision.js · core/hunt.js
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(4); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const DEEP_CAVE = {
  ...curve,
  id: 'deep-cave',
  name: '깊은 동굴',
  theme: 'deep-cave',
  types: ['rock', 'steel', 'ground', 'electric'],
  minorTypes: ['ground', 'electric'], // 이 타입만 가진 종은 드물게 (뽑히면 70% 한 번 다시)
  bossTypes: ['rock', 'steel'],
  early: [],
  fallback: 'geodude',
  clusters: { '"': 2, '^': 4, '~': [0, 1], '#': 6 }, // 신오 동굴보다 벽 많고 물 적게
  weather: [], // 어둠과 안개가 겹치지 않게
  dark: true,
};

// 화산동굴: 8단계 두 번째 분기 (8-2). 기믹 = 용암(건넘 규칙·마그마그 예외)·현무암 열 피해·분출구 스팀(박자·예고·밀기)
// 스펙 docs/superpowers/specs/2026-11-23-volcano-design.md · core/vent.js
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(6); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const VOLCANO = {
  ...curve,
  id: 'volcano',
  name: '화산동굴',
  theme: 'volcano',
  types: ['fire', 'fighting', 'water', 'rock'],
  minorTypes: ['water', 'rock'], // 이 타입만 가진 종은 드물게 (뽑히면 70% 한 번 다시)
  bossTypes: ['fire', 'fighting'],
  early: [],
  signature: ['slugma', 'magcargo'], // 용암 위를 다니는 고유종
  fallback: 'slugma',
  clusters: { '~': [0, 1], '"': 0, '#': 6, '^': 3 }, // 화산암 벽 많게, 물 조금 (용암은 floorgen.lavaLayout)
  weather: [{ id: 'sun', chance: 0.3 }],
  volcano: true,
};

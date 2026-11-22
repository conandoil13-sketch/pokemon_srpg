// 얼음동굴: 8단계 첫 번째 분기 (8-1). 기믹 = 빙판 미끄럼(끝까지)·부딪혀 밀기·고드름 충돌, 얼음 타입은 빙판에서 자유롭게 멈춤
// 스펙 docs/superpowers/specs/2026-11-23-ice-cave-design.md · core/pathfind.js (미끄럼) · battle.moveUnit (부딪힘)
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(6); // 층·레벨·예산·상한은 그 자리 곡선 그대로 (화산동굴과 같음)

export const ICE_CAVE = {
  ...curve,
  id: 'ice-cave',
  name: '얼음동굴',
  theme: 'ice',
  types: ['ice', 'water', 'rock', 'dark'],
  minorTypes: ['rock', 'dark'], // 이 타입만 가진 종은 드물게
  favored: { type: 'ice', chance: 0.5 }, // 얼음이 아니면 50% 로 얼음 종으로 다시 (얼음 위주, 물이 버금)
  bossTypes: ['ice', 'water'],
  early: [],
  fallback: 'snorunt',
  clusters: { '~': [1, 2], '"': 0, '#': 5, '^': 2 }, // 지하 호수 일부 + 동굴 벽 (빙판·고드름은 floorgen.iceLayout)
  piles: [2, 4], // 눈더미 (낙엽더미 규칙)
  weather: [{ id: 'hail', chance: 0.4 }],
  ice: true,
};

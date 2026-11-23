// 묘지: 9단계 두 번째 분기 (9-2). 기믹 = 묘비 줄(고스트·비행·드래곤만 넘음) · 혼불 예고 뒤 고스트 증원 · 짙은 안개
// 스펙 docs/superpowers/specs/2026-11-23-graveyard-design.md · floorgen.graveyardLayout · core/wisp.js
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(7); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const GRAVEYARD = {
  ...curve,
  id: 'graveyard',
  name: '묘지',
  theme: 'graveyard',
  types: ['ghost', 'psychic', 'fire', 'ground'], // 페어리는 데이터에 종이 없어 뺌
  minorTypes: ['fire', 'ground'], // 이 타입만 가진 종은 드물게
  favored: { type: 'ghost', chance: 0.4 }, // 에스퍼 종이 훨씬 많아서 고스트를 앞세움
  bossTypes: ['ghost', 'psychic'],
  early: [],
  signature: ['spiritomb'], // 108 영혼 — 늘 후보
  fallback: 'gastly',
  clusters: { '~': [0, 1], '"': 2, '#': 3, '^': 1 }, // 묘비 줄·추모 정원은 floorgen.graveyardLayout
  weather: [{ id: 'fog', chance: 0.6 }],
  graveyard: true,
};

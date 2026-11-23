// 사막: 7단계 두 번째 분기 (7-2). 기믹 = 깊은 모래(느림·회피)·흐르는 모래(밀림)·모래지옥(끌림) — "어디서 멈출까"
// 스펙 docs/superpowers/specs/2026-11-23-desert-design.md · core/sand.js
import { fillerStage } from './fillerStages.js';

const { filler, ...curve } = fillerStage(5); // 층·레벨·예산·상한은 그 자리 곡선 그대로

export const DESERT = {
  ...curve,
  id: 'desert',
  name: '사막',
  theme: 'desert',
  types: ['ground', 'rock', 'fire', 'psychic', 'ghost'],
  minorTypes: ['fire', 'psychic', 'ghost'], // 이 타입만 가진 종은 드물게 (뽑히면 70% 한 번 다시)
  shownTypes: ['ground'], // 출격 게시판 배지 (바위는 숨김)
  bossTypes: ['ground', 'rock'],
  early: [],
  signature: ['cacnea', 'cacturne'], // 사막 고유종: 단계 상한 안에서 늘 후보에 섞음
  fallback: 'sandshrew',
  clusters: { '~': 0, '"': 0, '#': 2, '^': 7 }, // 붉은 사암 바위 많게, 물·수풀 없음
  weather: [{ id: 'sand', chance: 0.6 }],
  desert: true, // 모래 지형 (floorgen.desertLayout)
};

// 협곡: 9단계 첫 번째 분기 (9-1). 기믹 = 고지 능선(명중 ±10, 지상은 덩굴로만 오름) · 낭떠러지(뜨는 포켓몬만, 밀려 떨어지면 기절)
// 스펙 docs/superpowers/specs/2026-11-23-canyon-design.md · floorgen.canyonLayout
import { fillerStage } from './fillerStages.js';

const { filler, weather, ...curve } = fillerStage(7); // 층·레벨·예산·상한·맵 크기는 그 자리 곡선 그대로 (날씨 없음)

export const CANYON = {
  ...curve,
  id: 'canyon',
  name: '협곡',
  theme: 'canyon',
  types: ['flying', 'dragon', 'rock', 'psychic', 'grass'],
  minorTypes: ['rock', 'psychic', 'grass'], // 이 타입만 가진 종은 드물게
  favored: [{ type: 'dragon', chance: 0.3 }, { type: 'flying', chance: 0.3 }], // 드래곤이 묻히지 않게 먼저, 그다음 비행 (풀·에스퍼 종이 많아서)
  bossTypes: ['flying', 'dragon'],
  early: [],
  fallback: 'swablu',
  clusters: { '~': 0, '"': 2, '#': 2, '^': 1 }, // 능선·개울·낭떠러지·덩굴은 floorgen.canyonLayout
  canyon: true,
};

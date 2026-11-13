// PokeAPI 기술 대상 → 게임 대상 종류 (SRPG 규칙, 스펙 §3)
// self: 자신 · enemy: 적 하나 · enemies: 주변 적 전체 · ally: 인접 아군 하나 · allies: 자신 + 주변 아군
export const TARGET_KIND = {
  user: 'self',
  'selected-pokemon': 'enemy',
  'selected-pokemon-me-first': 'enemy',
  'random-opponent': 'enemy',
  'all-opponents': 'enemies',
  'opponents-field': 'enemies',
  ally: 'ally',
  'user-and-allies': 'allies',
  'users-field': 'allies',
};
export const AREA_RADIUS = 2;

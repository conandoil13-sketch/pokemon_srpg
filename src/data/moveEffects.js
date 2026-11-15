// 포켓몬에 붙는 효과 변화기 (스펙 2026-11-15 변화기 묶음). 기술 id → 효과 이름 (core/volatile.js 가 처리)
export const EFFECT_MOVES = {
  'focus-energy': 'focusEnergy',
  taunt: 'taunt',
  'mean-look': 'noMove', block: 'noMove', 'spider-web': 'noMove',
  protect: 'protect', detect: 'protect', endure: 'endure', rest: 'rest',
  'aqua-ring': 'aquaRing', ingrain: 'ingrain', curse: 'curse',
};

// PokeAPI 대상 덮어쓰기: 방해·견제는 사거리 1~2 적 하나
export const KIND_OVERRIDES = {
  'heal-block': { kind: 'enemy', range: [1, 2], area: false },
  curse: { type: 'ghost', kind: 'self', range: [0, 0] }, // 4세대 '???' → 고스트로. 대상은 쓰는 유닛 타입에 따라 (volatile.moveFor)
};

// 포켓몬에 붙는 효과 변화기 (스펙 2026-11-15 변화기 묶음). 기술 id → 효과 이름 (core/volatile.js 가 처리)
export const EFFECT_MOVES = {
  'focus-energy': 'focusEnergy',
  taunt: 'taunt',
  'mean-look': 'noMove', block: 'noMove', 'spider-web': 'noMove',
  protect: 'protect', detect: 'protect', endure: 'endure', rest: 'rest',
  'aqua-ring': 'aquaRing', ingrain: 'ingrain', curse: 'curse',
  yawn: 'yawn', 'leech-seed': 'leechSeed', 'helping-hand': 'helpingHand',
  foresight: 'identNormal', 'odor-sleuth': 'identNormal', 'miracle-eye': 'identPsychic',
  encore: 'encore', disable: 'disable', torment: 'torment', 'heal-block': 'healBlock',
  'gastro-acid': 'abilityOff', 'worry-seed': 'worrySeed', 'destiny-bond': 'bond',
  // 2차: 오라 (쓴 포켓몬 주변 2칸, 따라다님) · 장판 (쓴 자리 주변 2칸, 고정)
  tailwind: 'tailwind', safeguard: 'safeguard', mist: 'mist', 'lucky-chant': 'luckyChant',
  reflect: 'reflect', 'light-screen': 'lightScreen', 'mud-sport': 'mudSport', 'water-sport': 'waterSport',
  'rain-dance': 'weather', 'sunny-day': 'weather', sandstorm: 'weather', hail: 'weather', // 날씨 부르기 5턴
  spikes: 'spikes', 'toxic-spikes': 'toxicSpikes', // 칸에 까는 함정
  roar: 'push', whirlwind: 'push', haze: 'haze', // 밀어내기 3칸 · 주변 2칸 랭크 초기화
};
const SELF = { kind: 'self', range: [0, 0], area: false };

// 효과 없이 지금 변화기 규칙(랭크 + 상태이상)으로 충분해서 배울 수 있게만 하는 기술
export const PLAIN_MOVES = ['swagger', 'flatter'];

// PokeAPI 대상 덮어쓰기: 방해·견제는 사거리 1~2 적 하나
export const KIND_OVERRIDES = {
  'heal-block': { kind: 'enemy', range: [1, 2], area: false },
  curse: { type: 'ghost', kind: 'self', range: [0, 0] },
  tailwind: SELF, safeguard: SELF, mist: SELF, 'lucky-chant': SELF, reflect: SELF, 'light-screen': SELF, 'mud-sport': SELF, 'water-sport': SELF,
  'rain-dance': SELF, 'sunny-day': SELF, sandstorm: SELF, hail: SELF,
  spikes: { kind: 'tile', range: [1, 3], area: false, aimTile: true }, // 칸을 고른다 (그 칸 + 4방)
  'toxic-spikes': { kind: 'tile', range: [1, 3], area: false, aimTile: true },
  haze: SELF, // 4세대 '???' → 고스트로. 대상은 쓰는 유닛 타입에 따라 (volatile.moveFor)
};

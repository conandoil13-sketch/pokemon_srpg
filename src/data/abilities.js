// 특성 = PokeAPI 생성 데이터(4세대 기준) + 이 게임 규칙에 맞춘 설명 덮어쓰기
import POKEDEX from './generated/pokedex.js';

// SRPG 로 다시 해석한 특성 (스펙 §4-③) — 설명은 게임 규칙 그대로
export const SRPG_ABILITY_TEXT = {
  intimidate: '이동을 마쳤을 때 옆의 상대 공격을 1랭크 낮춘다. 같은 상대에게 연달아서는 안 된다.',
  drizzle: '층을 시작할 때 비를 내린다. 날씨 특성이 여럿이면 느린 쪽이 나중에 덮는다.',
  drought: '층을 시작할 때 햇살을 강하게 한다. 날씨 특성이 여럿이면 느린 쪽이 나중에 덮는다.',
  'sand-stream': '층을 시작할 때 모래바람을 일으킨다. 날씨 특성이 여럿이면 느린 쪽이 나중에 덮는다.',
  'snow-warning': '층을 시작할 때 싸라기눈을 내린다. 날씨 특성이 여럿이면 느린 쪽이 나중에 덮는다.',
  'lightning-rod': '주변 2칸의 포켓몬을 노린 단일 전기 기술을 끌어와 무효로 하고 특공이 오른다.',
  'storm-drain': '주변 2칸의 포켓몬을 노린 단일 물 기술을 끌어와 무효로 하고 특공이 오른다.',
  'arena-trap': '옆에 있는 상대는 다음 차례에 1칸밖에 움직이지 못한다. 비행·부유는 제외.',
  'shadow-tag': '옆에 있는 상대는 다음 차례에 1칸밖에 움직이지 못한다.',
  'magnet-pull': '옆에 있는 강철 타입 상대는 다음 차례에 1칸밖에 움직이지 못한다.',
  sturdy: 'HP가 가득할 때 한 방에 쓰러지지 않고 1 남긴다. 한 층에 한 번.',
  truant: '행동한 다음 자기 차례는 쉰다.',
  'slow-start': '층을 시작하고 자기 차례 5번 동안 공격·스피드가 절반, 이동력이 1 줄어든다.',
  trace: '층을 시작할 때 가장 가까운 상대의 특성을 복사한다.',
  download: '층을 시작할 때 가장 가까운 상대의 방어·특방 중 낮은 쪽에 맞춰 공격 또는 특공이 오른다.',
  anticipation: '상대 정보를 볼 때 이 포켓몬에게 효과가 굉장한 기술을 가졌으면 알려 준다.',
  forewarn: '상대 정보를 볼 때 이 포켓몬에게 효과가 굉장한 기술을 가졌으면 알려 준다.',
  plus: '옆에 플러스나 마이너스 동료가 있으면 특공이 1.5배.',
  minus: '옆에 플러스나 마이너스 동료가 있으면 특공이 1.5배.',
  'flower-gift': '햇살이 강할 때 자신과 옆 동료의 공격·특방이 1.5배.',
  'bad-dreams': '주변 2칸 안의 잠든 상대는 차례가 끝날 때 HP를 1/8 잃는다.',
  synchronize: '독·마비·화상을 건 상대에게도 같은 상태이상을 건다.',
  pickup: '층을 돌파하면 가끔 코인 주머니나 경험 사탕을 줍는다.',
  'honey-gather': '층을 돌파하면 가끔 코인 주머니나 경험 사탕을 줍는다.',
  'swift-swim': '비가 오면 스피드가 2배, 이동력이 1 늘어난다.',
  chlorophyll: '햇살이 강하면 스피드가 2배, 이동력이 1 늘어난다.',
  'quick-feet': '상태이상이면 스피드가 1.5배, 이동력이 1 늘어난다.',
};

// 지금 게임에 해당 시스템이 없어 효과가 없는 특성 (스펙 §4-②)
export const NO_EFFECT = ['gluttony', 'klutz', 'sticky-hold', 'unburden', 'frisk', 'multitype', 'run-away', 'suction-cups', 'natural-cure',
  'pressure', 'rivalry', 'cute-charm', 'oblivious', 'inner-focus', 'steadfast', 'stench', 'rock-head', 'reckless', 'skill-link', 'illuminate', 'liquid-ooze'];

export const ABILITIES = Object.fromEntries(Object.values(POKEDEX.abilities).map((a) => [a.id, {
  ...a,
  desc: SRPG_ABILITY_TEXT[a.id] ?? (NO_EFFECT.includes(a.id) ? `${a.desc} (이 게임에서는 아직 효과가 없다)` : a.desc),
  inactive: NO_EFFECT.includes(a.id),
}]));

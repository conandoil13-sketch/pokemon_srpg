// 기술 이펙트 고르기 (스펙 §3). 틀(모양·분류) × 타입 팔레트. 예외는 moveFx.json (2단계 조정 페이지가 고친다)
// FxSpec = { id, opts, timeScale, layer: 'back'|'front', life? (초, 루프를 그만큼만) }
import { PAL } from '../vendor/pixelfx/core/index.js';
import OVERRIDES from './moveFx.json' with { type: 'json' };
import { familyOf } from './moveFamilies.js';
import { MOVES } from './moves.js';

export const TYPE_PALETTE = {
  normal: 'bone', fire: 'fire', water: 'water', electric: 'volt', grass: 'leaf', ice: 'ice', fighting: 'ember',
  poison: 'poison', ground: 'earth', flying: 'smoke', psychic: 'neon', bug: 'matrix', rock: 'stone', ghost: 'shadow',
  dragon: 'arcane', dark: 'night', steel: 'metal',
};
export const RANK_UP_PAL = PAL.blood;   // 오르면 빨강
export const RANK_DOWN_PAL = PAL.water; // 내리면 파랑

// 악 타입: 내장 night 는 거의 검정이라 맵 위에서 안 보임 → 보랏빛 검정에서 밝은 연보라까지
const DARK_PAL = ['#120c1a', '#24182e', '#3a2a48', '#5a4470', '#8a6aa8', '#c0a0e0', '#f0e0ff'];
// 독 타입: 포켓몬의 독은 보라 — 내장 poison(초록) 대신 자주에서 연분홍빛 보라까지 (사용자 결정)
export const POISON_PAL = ['#1a0a1e', '#3a1442', '#5e1e6a', '#8a2a96', '#b048c0', '#d878e0', '#f0b0f4', '#fff0ff'];
const pal = (type) => (type === 'dark' ? DARK_PAL : type === 'poison' ? POISON_PAL : PAL[TYPE_PALETTE[type]] ?? PAL.bone);
const bright = (p) => p.slice(-4); // 보조 색이 주인공처럼 보이는 이펙트용 밝은 쪽
const spec = (id, opts = {}, timeScale = 1, layer = 'front', extra = {}) => ({ id, opts, timeScale, layer, ...extra });
const SELF_KO = { 'self-destruct': 'explosions/small-explosion', explosion: 'explosions/big-explosion' };
const AREA_REACH = 40; // 주변 충격파 반경(px) ≈ 주변 1칸 + 여유

// 위력 단계 (사용자 결정): 약 ≤50 작고 귀엽게 · 중 · 강 ≥90 겹치고 밝고 크게
export const powerTier = (power) => (!power || power <= 50 ? 'weak' : power >= 90 ? 'strong' : 'mid');
const TIER = {
  weak: { light: 0.6, reach: 28, life: 0.7 },
  mid: { light: 1, reach: AREA_REACH, life: 1 },
  strong: { light: 1.4, reach: 56, life: 1.4 },
};

function rule(move, distance) {
  if (SELF_KO[move.id]) return { selfKO: spec(SELF_KO[move.id], {}, 2, 'front') }; // 원래 색, 크게
  const p = pal(move.type), type = move.shape?.type ?? 'single';
  const tier = powerTier(move.power), T = TIER[tier];
  const cute = spec('pickups/collect-burst', { palette: p, light: T.light }, 1.6, 'front', { dy: 22 }); // 약: 작은 반짝임 (원래 중심이 발밑 30px 위 → 몸 가운데로)
  const spark = tier === 'weak' ? cute : spec('impacts/hit-spark', { palette: p, light: T.light }, 1);
  const thud = tier === 'weak' ? cute : spec('impacts/blunt-hit', { palette: p, light: T.light }, 1.5);
  const out = rule2(move, distance, p, type, T, spark, thud);
  if (tier === 'strong' && out.hit && !out.noHit2) out.hit2 = spec('impacts/blunt-hit', { palette: p, light: T.light }, 1.5); // 강: 묵직한 충격 겹침
  delete out.noHit2;
  return out;
}

// 특수 탄: 크기를 칸(16px)에 맞출 수 있는 것만 타입별로, 나머지는 타입 색 플라스마탄
function shotFor(type, p) {
  if (type === 'fire') return spec('fire/fireball', { palette: p, radius: 3 }, 1, 'front', { life: 0.35 });
  if (type === 'ice') return spec('ice/ice-lance', { palette: p, length: 16 }, 1, 'front', { life: 0.35 });
  return spec('projectiles/plasma-shot', { palette: p }, 1, 'front', { life: 0.3 });
}

function rule2(move, distance, p, type, T, spark, thud) {
  const AREA_REACH = T.reach, L = (s) => s * T.life;
  // 소리 기술은 범위 모양(부채꼴·주변 포함)과 상관없이 음파
  if (familyOf(move) === 'sound' && type !== 'line' && type !== 'blast') return { cast: spec('pokemon/sound-wave', { palette: p }, 1, 'front'), hit: spark, noHit2: true }; // 음파는 묵직한 겹타 없이
  switch (type) {
    case 'line': return { travel: spec('arcane/arcane-beam', { palette: p, light: T.light }, 1.5, 'front', { life: L(0.45), clip: true }), hit: spark };
    case 'cone': return { cast: spec(move.type === 'ice' ? 'ice/frost-breath' : 'fire/fire-breath', { palette: p, light: T.light }, 1, 'front', { life: L(0.6) }), hit: spark };
    case 'around':
      if (move.type === 'ground' || move.type === 'rock') return { cast: spec('impacts/ground-slam', { palette: p, reach: AREA_REACH }, 2, 'back'), hit: thud };
      return { cast: spec('lightning/thunderclap', { palette: p, sparks: bright(p), reach: AREA_REACH }, 2, 'back'), hit: thud };
    case 'blast': return { travel: spec('projectiles/plasma-shot', { palette: p }, 1, 'front', { life: 0.3 }), burst: spec('impacts/blunt-hit', { palette: p, light: 1.3 * T.light }, 1.5) }; // 착탄 십자 5칸에 하나씩 (plasma-explosion 은 화면에 너무 큼)
    default: {
      const fam = familyOf(move);
      // 소리 기술: 입에서 음파가 퍼진다 (거리 무관)
      if (fam === 'sound') return { cast: spec('pokemon/sound-wave', { palette: p }, 1, 'front'), hit: spark, noHit2: true };
      // 특수: 붙어 있든 떨어져 있든 손끝에서 모았다가 타입 탄이 날아간다 (사용자 결정)
      if (move.category === 'special') return { cast: spec('arcane/spell-charge', { palette: p }, 2, 'front', { life: 0.3 }), travel: shotFor(move.type, p), hit: thud };
      if (distance >= 2) return { travel: spec('projectiles/energy-disc', { palette: p }, 1, 'front', { life: 0.3 }), hit: spark };
      // 물리 근접: 기술 모양별 (물기·킥은 이 게임 전용 이펙트, 나머지는 pixelfx 근접 이펙트를 사용자 쪽에서)
      if (fam === 'bite') return { hit: spec('pokemon/bite', { palette: p }, 1, 'front', { noEcho: true }) };
      if (fam === 'kick') return { hit: spec('pokemon/kick', { palette: p }, 1, 'front', { noEcho: true }) };
      if (fam === 'punch') return { hit: spec('impacts/crit-hit', { palette: p, light: T.light }, 1.2, 'front', { noEcho: true }) }; // 펀치: 별 모양 강타 (어퍼컷 이펙트는 몸 위로 크게 그려져 칸에 안 맞음)
      if (fam === 'slash') return { cast: spec('melee/claw-swipe', { palette: p, sparks: bright(p) }, 1.2, 'front'), hit: spark };
      if (fam === 'stab') return { cast: spec('melee/thrust', { palette: p, sparks: bright(p), reach: 26 }, 1.2, 'front'), hit: spark };
      return { hit: spark };
    }
  }
}

// 예외: 필드별로 덮어씀 (opts 는 합침, null 이면 그 단계 없음)
export function fxForMoveWith(move, { distance = 1 } = {}, overrides = OVERRIDES) {
  const base = rule(move, distance), o = overrides[move.id];
  if (!o) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(o)) {
    if (v === null) delete out[k];
    else out[k] = { ...(base[k] ?? spec(v.id)), ...v, opts: { ...(base[k]?.opts ?? {}), ...(v.opts ?? {}) } };
  }
  return out;
}
export const fxForMove = (move, ctx) => fxForMoveWith(move, ctx);

// 랭크: 오르면 빨강 빛기둥, 내리면 파랑 연기 (짧게)
export const fxForStage = (applied) => (applied > 0
  ? spec('ui/level-up', { palette: RANK_UP_PAL, text: '' }, 2, 'front', { life: 0.9 })
  : spec('status/cursed', { palette: RANK_DOWN_PAL }, 1.5, 'front', { life: 0.6 }));

// 상태이상: 걸릴 때(한 번) + 지속 표시(루프)
const AILMENT_FX = {
  paralysis: { inflict: spec('impacts/hit-spark', { palette: PAL.volt }), loop: spec('status/stunned') },
  burn: { inflict: spec('status/burning', { light: 1.5 }, 1, 'front', { life: 0.6 }), loop: spec('status/burning', { light: 0.5 }) },
  poison: { inflict: spec('nature/acid-splash', { palette: POISON_PAL }, 2, 'front', { life: 0.6 }), loop: spec('status/poisoned', { palette: POISON_PAL }) },
  toxic: { inflict: spec('nature/acid-splash', { palette: POISON_PAL }, 2, 'front', { life: 0.6 }), loop: spec('status/poisoned', { palette: POISON_PAL, light: 1.5 }) },
  sleep: { loop: spec('status/sleep') },
  freeze: { inflict: spec('ice/frost-nova', { reach: AREA_REACH / 2 }, 2, 'back', { life: 0.8 }), loop: spec('status/frozen') },
  confusion: { loop: spec('status/confused') },
};
AILMENT_FX.infatuation = { inflict: spec('status/charmed', {}, 1, 'front', { life: 1.2 }), loop: AILMENT_FX.confusion.loop }; // 헤롱헤롱: 하트
export const fxForAilment = (ailment) => AILMENT_FX[ailment] ?? { loop: null };

// 이동 목적지 표시 (톡·클릭으로 걸어갈 칸): 통통 튀는 화살표 + 바닥 고리, 도착할 때까지
export const MOVE_MARKER = spec('pokemon/move-marker', {}, 1, 'back');
export const markerAt = (x, y, tile) => ({ x: x * tile + tile / 2, y: y * tile + tile - 4 }); // 칸 → 발밑 원점

// 회복 표시 (회복기·잠자기·흡수·차례 끝 회복): 짧고 분명하게 — 빛이 몸을 훑고 + 가 솟음
export const HEAL_FX = spec('pokemon/heal-glow', {}, 1, 'front', { life: 1.1 });
// 흡수: 대상(사용자 발밑 기준 px 위치)에서 구슬이 사용자에게 날아옴
export const drainFx = (fromX, fromY) => spec('pokemon/drain-orbs', { fromX, fromY }, 1, 'front', { life: 1.1 });

// 포켓몬에 붙는 효과 (변화기 묶음 1차): 걸릴 때 몸에 한 번. 큰 이펙트는 빠르게(timeScale) 짧게(life)
// 압정 던지기: 칸마다 하나씩 (원점 = 떨어질 칸 발밑, fromX/fromY = 던진 포켓몬 발밑의 상대 위치)
export const TOSS_FLIGHT = 0.45, TOSS_GAP = 0.08; // 날아가는 시간 (이펙트 FLIGHT 와 같음) · 칸 사이 간격
const CALTROP_PAL = ['#202028', '#4a4a58', '#8a8a9c', '#c8c8d8', '#f0f0f8'];
export const trapTossFx = (kind, fromX, fromY) => spec('pokemon/caltrop-toss', { palette: kind === 'toxicSpikes' ? POISON_PAL : CALTROP_PAL, fromX, fromY }, 1, 'front', { life: 0.75 });
const FOG_WHITE = ['#6a6a7a', '#9a9aac', '#c4c4d4', '#e2e2ee', '#f8f8ff'];
const FOG_DARK = ['#0c0814', '#1e1630', '#342a4a', '#4e4266', '#7a6a90'];
const fxOn = (id, opts = {}, timeScale = 2) => spec(id, opts, timeScale, 'front', { life: 1.2 });
export const EFFECT_FX = {
  protect: fxOn('holy/divine-shield', { palette: PAL.holy, radius: 14 }, 1.5),
  endure: fxOn('holy/divine-shield', { palette: PAL.ember, radius: 14 }, 1.5),
  focusEnergy: fxOn('status/rage', {}, 1.5),
  rest: HEAL_FX, // 회복 표시 (잠듦은 상태이상 표시가 따로)
  aquaRing: spec('pokemon/aqua-ring', {}, 1.2, 'front', { life: 1.3 }), // 파란 고리가 돌다 몸속으로
  ingrain: fxOn('nature/root-snare', { palette: PAL.leaf }),
  curse: fxOn('shadow/curse', {}, 2.5),
  yawn: fxOn('status/sleep', {}, 1),
  leechSeed: spec('pokemon/seed-scatter', {}, 1.2, 'front', { life: 1.3 }), // 씨앗이 날아와 박히고 싹이 남
  helpingHand: fxOn('holy/blessing', {}, 2),
  identNormal: fxOn('arcane/rune-circle', { palette: PAL.holy }),
  identPsychic: fxOn('arcane/rune-circle', { palette: PAL.arcane }),
  taunt: spec('pokemon/anger-mark', {}, 1.1, 'front', { life: 1.3 }), // 💢 화난 표시
  encore: fxOn('holy/blessing', { palette: PAL.candy }, 2),
  disable: spec('pokemon/chain-bind', {}, 1.2, 'front', { life: 1.3 }), // 굵은 쇠사슬
  torment: fxOn('status/slowed', {}, 1.5),
  healBlock: fxOn('pokemon/small-sigil', { palette: PAL.heal }, 3), // 작은 봉인 마법진
  noMove: fxOn('shadow/grasping-hands', {}, 2.5),
  abilityOff: fxOn('nature/acid-splash', { palette: POISON_PAL }, 2),
  worrySeed: spec('pokemon/seed-scatter', { head: true, palette: ['#1a1024', '#3a2448', '#64407a', '#9a6aae', '#d0a8e0'] }, 1.2, 'front', { life: 1.3 }), // 머리 위 보라 씨앗
  bond: fxOn('shadow/soul-drain', {}, 2.5),
  refresh: HEAL_FX, teamCure: HEAL_FX, wish: fxOn('holy/blessing', {}, 2), stockpile: fxOn('status/rage', { palette: PAL.gold }, 1.5), swallow: HEAL_FX,
  sacrificeHeal: HEAL_FX, memento: fxOn('status/cursed', { palette: PAL.water }, 1.5), painSplit: fxOn('shadow/soul-drain', {}, 2.5), bellyDrum: fxOn('status/rage', {}, 1.5),
  acupressure: fxOn('impacts/hit-spark', { palette: PAL.gold }, 1), psychUp: fxOn('arcane/rune-circle', { palette: PAL.arcane }), powerSwap: fxOn('arcane/rune-circle', { palette: PAL.ember }),
  guardSwap: fxOn('arcane/rune-circle', { palette: PAL.ice }), heartSwap: fxOn('arcane/rune-circle', { palette: PAL.candy }), psychoShift: fxOn('arcane/rune-circle', { palette: PAL.neon }),
  nightmare: fxOn('shadow/curse', {}, 2.5), teeterDance: fxOn('status/confused', {}, 1.5), splash: fxOn('nature/acid-splash', { palette: PAL.water }, 2),
  counterStance: fxOn('holy/divine-shield', { palette: PAL.ember, radius: 14 }, 1.5), // 반격 자세
  bide: fxOn('status/rage', {}, 1.5), // 참기
  bind: spec('pokemon/bind-coil', {}, 1, 'front', { life: 1.3 }), // 속박기 (기술별로는 bindFx)
  // 2차 오라: 발밑에서 퍼지는 고리 (종류별 색) · 장판: 방패 / 땅에 번지는 물·흙
  tailwind: spec('pokemon/tailwind-gust', {}, 1, 'back', { life: 1.3 }), // 주변 2칸에서 바람이 불어 들어옴
  safeguard: spec('pokemon/veil-dome', {}, 1, 'front', { life: 1.4 }), // 분홍 반투명 막
  mist: spec('pokemon/ground-fog', { palette: FOG_WHITE }, 1, 'back', { life: 1.7 }), // 바닥에 깔리는 흰 안개
  luckyChant: spec('pokemon/chant-pool', {}, 1, 'front', { life: 1.5 }), // 자주 웅덩이 + 솟는 물방울
  reflect: fxOn('holy/divine-shield', { palette: PAL.ember, radius: 20 }, 1.5),
  lightScreen: fxOn('holy/divine-shield', { palette: PAL.gold, radius: 20 }, 1.5),
  mudSport: fxOn('nature/acid-splash', { palette: PAL.earth }, 2),
  waterSport: fxOn('nature/acid-splash', { palette: PAL.water }, 2),
  weather: fxOn('arcane/spell-charge', { palette: PAL.holy }, 1.5), // 날씨 부르기 (기술별 색은 아래)
  spikes: trapTossFx('spikes', 0, 0), // 압정: 실제로는 칸마다 던짐 (mapAttack 이 trapTossFx 로)
  toxicSpikes: trapTossFx('toxicSpikes', 0, 0),
  push: fxOn('pokemon/sound-wave', { palette: PAL.bone }, 1.5), // 울부짖기·날려버리기 (사용자 앞 퍼지는 파동)
  haze: spec('pokemon/ground-fog', { palette: FOG_DARK }, 1, 'back', { life: 1.7 }), // 바닥에 깔리는 검은 안개
};
// 같은 효과라도 기술마다 인상이 다른 것: 거미집 = 실로 감은 고치, 블록 = 쌓이는 장난감 벽돌 (검은눈빛은 위 손 그대로)
const MOVE_EFFECT_FX = {
  'spider-web': spec('pokemon/silk-wrap', {}, 1.2, 'front', { life: 1.3 }),
  block: spec('pokemon/brick-stack', {}, 1.3, 'front', { life: 1.3 }),
  'rain-dance': fxOn('arcane/spell-charge', { palette: PAL.water }, 1.5),
  'sunny-day': fxOn('arcane/spell-charge', { palette: PAL.fire }, 1.5),
  sandstorm: fxOn('arcane/spell-charge', { palette: PAL.earth }, 1.5),
  hail: fxOn('arcane/spell-charge', { palette: PAL.ice }, 1.5),
};
// 속박기: 감는 기술은 몸을 감는 띠, 가두는 기술은 타입 색 소용돌이
const COIL_MOVES = new Set(['bind', 'wrap', 'clamp']);
export const bindFx = (moveId) => {
  const type = MOVES[moveId]?.type ?? 'normal';
  const palette = moveId === 'magma-storm' ? PAL.lava : moveId === 'clamp' ? PAL.water : pal(type);
  return spec(COIL_MOVES.has(moveId) ? 'pokemon/bind-coil' : 'pokemon/bind-vortex', { palette }, 1, 'front', { life: 1.3 });
};
export const fxForEffect = (effect, moveId) => (effect === 'bind' && moveId ? bindFx(moveId) : MOVE_EFFECT_FX[moveId] ?? EFFECT_FX[effect]);
// 밀어내기: 쓴 포켓몬 → 대상 쪽. 날려버리기는 대상까지 닿는 돌풍, 울부짖기는 음파 (tiles: 대상까지 칸 수)
export const pushFx = (moveId, tiles) => (moveId === 'whirlwind'
  ? spec('pokemon/gust-blast', { reach: Math.max(1, tiles) * 24 }, 1, 'front', { life: 0.8 })
  : EFFECT_FX.push);

// 기술 이펙트 고르기 (스펙 §3). 틀(모양·분류) × 타입 팔레트. 예외는 moveFx.json (2단계 조정 페이지가 고친다)
// FxSpec = { id, opts, timeScale, layer: 'back'|'front', life? (초, 루프를 그만큼만) }
import { PAL } from '../vendor/pixelfx/core/index.js';
import OVERRIDES from './moveFx.json' with { type: 'json' };

export const TYPE_PALETTE = {
  normal: 'bone', fire: 'fire', water: 'water', electric: 'volt', grass: 'leaf', ice: 'ice', fighting: 'ember',
  poison: 'poison', ground: 'earth', flying: 'smoke', psychic: 'neon', bug: 'matrix', rock: 'stone', ghost: 'shadow',
  dragon: 'arcane', dark: 'night', steel: 'metal',
};
export const RANK_UP_PAL = PAL.blood;   // 오르면 빨강
export const RANK_DOWN_PAL = PAL.water; // 내리면 파랑

const pal = (type) => PAL[TYPE_PALETTE[type]] ?? PAL.bone;
const bright = (p) => p.slice(-4); // 보조 색이 주인공처럼 보이는 이펙트용 밝은 쪽
const spec = (id, opts = {}, timeScale = 1, layer = 'front', extra = {}) => ({ id, opts, timeScale, layer, ...extra });
const SELF_KO = { 'self-destruct': 'explosions/small-explosion', explosion: 'explosions/big-explosion' };
const AREA_REACH = 40; // 주변 충격파 반경(px) ≈ 주변 1칸 + 여유

function rule(move, distance) {
  if (SELF_KO[move.id]) return { selfKO: spec(SELF_KO[move.id], {}, 2, 'front') }; // 원래 색, 크게
  const p = pal(move.type), type = move.shape?.type ?? 'single';
  const spark = spec('impacts/hit-spark', { palette: p }, 1);
  const thud = spec('impacts/blunt-hit', { palette: p }, 1.5);
  switch (type) {
    case 'line': return { travel: spec('arcane/arcane-beam', { palette: p }, 1.5, 'front', { life: 0.45, clip: true }), hit: spark };
    case 'cone': return { cast: spec(move.type === 'ice' ? 'ice/frost-breath' : 'fire/fire-breath', { palette: p }, 1, 'front', { life: 0.6 }), hit: spark };
    case 'around':
      if (move.type === 'ground' || move.type === 'rock') return { cast: spec('impacts/ground-slam', { palette: p, reach: AREA_REACH }, 2, 'back'), hit: thud };
      return { cast: spec('lightning/thunderclap', { palette: p, sparks: bright(p), reach: AREA_REACH }, 2, 'back'), hit: thud };
    case 'blast': return { travel: spec('projectiles/plasma-shot', { palette: p }, 1, 'front', { life: 0.3 }), burst: spec('impacts/blunt-hit', { palette: p, light: 1.3 }, 1.5) }; // 착탄 십자 5칸에 하나씩 (plasma-explosion 은 화면에 너무 큼)
    default:
      if (distance >= 2) {
        if (move.category === 'special') return { cast: spec('arcane/spell-charge', { palette: p }, 2, 'front', { life: 0.3 }), travel: spec('projectiles/plasma-shot', { palette: p }, 1, 'front', { life: 0.3 }), hit: thud };
        return { travel: spec('projectiles/energy-disc', { palette: p }, 1, 'front', { life: 0.3 }), hit: spark };
      }
      return { hit: spark };
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
  poison: { inflict: spec('nature/acid-splash', {}, 2, 'front', { life: 0.6 }), loop: spec('status/poisoned') },
  toxic: { inflict: spec('nature/acid-splash', {}, 2, 'front', { life: 0.6 }), loop: spec('status/poisoned', { light: 1.5 }) },
  sleep: { loop: spec('status/sleep') },
  freeze: { inflict: spec('ice/frost-nova', { reach: AREA_REACH / 2 }, 2, 'back', { life: 0.8 }), loop: spec('status/frozen') },
  confusion: { loop: spec('status/confused') },
};
export const fxForAilment = (ailment) => AILMENT_FX[ailment] ?? { loop: null };

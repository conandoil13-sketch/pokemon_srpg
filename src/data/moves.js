// 기술 = PokeAPI 생성 데이터 + SRPG 사거리. 키는 PokeAPI 식별자 (예: 'close-combat')
import POKEDEX from './generated/pokedex.js';
import OVERRIDES from './moveShapes.json' with { type: 'json' };
import { shapeFor } from './moveShapes.js';
import { coverage } from '../core/shapes.js';
import { TARGET_KIND, AREA_RADIUS } from './moveTargets.js';
import { EFFECT_MOVES, KIND_OVERRIDES, PLAIN_MOVES } from './moveEffects.js';

export const defaultRange = (category) => (category === 'physical' ? [1, 1] : [1, 2]);

const STATUS_RANGE = { self: [0, 0], enemy: [1, 2], enemies: [0, AREA_RADIUS], ally: [1, 1], allies: [0, AREA_RADIUS] };

export const MOVES = Object.fromEntries(
  Object.values(POKEDEX.moves).map((m) => {
    // 공격기: 단일 대상 (기존 사거리 규칙). 변화기: 대상 종류별 SRPG 규칙
    if (m.category !== 'status') {
      // 공격기: 범위 모양. range = 닿는 거리(coverage), aimRange = 단일·착탄의 조준 사거리
      const { shape, friendlyFire } = shapeFor(m, OVERRIDES);
      const aimRange = shape.type === 'single' || shape.type === 'blast' ? shape.range : null;
      return [m.api, { ...m, id: m.api, kind: 'enemy', area: shape.type !== 'single', shape, friendlyFire, aimRange, range: coverage({ shape }) }];
    }
    const kind = TARGET_KIND[m.target] ?? null;
    const range = STATUS_RANGE[kind] ?? [0, 0];
    return [m.api, { ...m, id: m.api, kind, area: kind === 'enemies' || kind === 'allies', range, shape: null, friendlyFire: false, aimRange: null }];
  }),
);

// 몸무게로 위력이 정해지는 기술 (위력은 데미지 계산 때 상대 몸무게로) · 헤롱헤롱 기술
for (const id of ['low-kick', 'grass-knot']) if (MOVES[id]) Object.assign(MOVES[id], { weightPower: true, learnable: true });
if (MOVES.attract) Object.assign(MOVES.attract, { ailment: 'infatuation', learnable: true });

// 고정 데미지 · 회복기 · 꿈먹기 (덮어쓰기 표, 2026-11-15)
const FIXED_DAMAGE = { 'seismic-toss': 'level', 'night-shade': 'level', 'dragon-rage': 40, 'sonic-boom': 20, psywave: 'psywave', 'super-fang': 'half', endeavor: 'endeavor', 'sheer-cold': 'ohko', fissure: 'ohko', guillotine: 'ohko', 'horn-drill': 'ohko' };
for (const [id, v] of Object.entries(FIXED_DAMAGE)) if (MOVES[id]) Object.assign(MOVES[id], { fixedDamage: v, learnable: true });
// 위력이 상황에 따라 바뀌는 기술 (power 는 메뉴·예상 창용 기준값, 실제는 damage.js varPower / 매그니튜드·프레젠트는 전투에서 굴림)
const VAR_POWER = { flail: ['lowHp', 20], reversal: ['lowHp', 20], 'wring-out': ['targetHp', 121], 'crush-grip': ['targetHp', 121], 'gyro-ball': ['speed', 25], 'trump-card': ['lastStand', 40], magnitude: ['magnitude', 71], present: ['present', 52] };
for (const [id, [varPower, power]] of Object.entries(VAR_POWER)) if (MOVES[id]) Object.assign(MOVES[id], { varPower, power, learnable: true });
if (MOVES['spit-up']) Object.assign(MOVES['spit-up'], { varPower: 'stock', power: 100, learnable: true }); // 토해내기: 비축 1개당 100
for (const id of ['frustration', 'return']) if (MOVES[id]) Object.assign(MOVES[id], { power: 60, learnable: true }); // 위력 60 + 화풀이는 한 칸 돌진, 은혜갚기는 한 칸 물러남
const HEAL_MOVES = { 'slack-off': {}, 'heal-order': {}, recover: {}, 'soft-boiled': {}, 'milk-drink': {}, roost: {}, synthesis: { weather: true }, 'morning-sun': { weather: true }, moonlight: { weather: true } };
for (const [id, v] of Object.entries(HEAL_MOVES)) if (MOVES[id]) Object.assign(MOVES[id], { heal: v, learnable: true, kind: 'self', range: [0, 0] });
if (MOVES['dream-eater']) MOVES['dream-eater'].dreamOnly = true;

// 포켓몬에 붙는 효과 변화기 (core/volatile.js)
// 필중: 명중 판정 없음 (방어·무효·숨기에는 막힘)
for (const id of ['aerial-ace', 'aura-sphere', 'feint-attack', 'magical-leaf', 'magnet-bomb', 'shadow-punch', 'shock-wave', 'swift', 'vital-throw']) if (MOVES[id]) MOVES[id].sure = true;
for (const [id, effect] of Object.entries(EFFECT_MOVES)) if (MOVES[id]) Object.assign(MOVES[id], { effect, learnable: true });
for (const [id, v] of Object.entries(KIND_OVERRIDES)) if (MOVES[id]) Object.assign(MOVES[id], v);
for (const id of PLAIN_MOVES) if (MOVES[id]) MOVES[id].learnable = true;

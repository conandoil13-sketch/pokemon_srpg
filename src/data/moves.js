// 기술 = PokeAPI 생성 데이터 + SRPG 사거리. 키는 PokeAPI 식별자 (예: 'close-combat')
import POKEDEX from './generated/pokedex.js';
import OVERRIDES from './moveShapes.json' with { type: 'json' };
import { shapeFor } from './moveShapes.js';
import { coverage } from '../core/shapes.js';
import { TARGET_KIND, AREA_RADIUS } from './moveTargets.js';

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

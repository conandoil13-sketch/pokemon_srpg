// 발전소 발전기 (순수). 지형 문자 `G` 2×2 — 벽처럼 못 지나감. state.generators = [{ x, y, phase }] (x,y = 왼쪽 위 칸)
// 2라운드마다(라운드 % 2 === phase) 적 페이즈 끝에 둘레 맨해튼 2칸으로 방출: 최대 HP 1/6 × 전기 상성.
// 그 라운드 내내 범위가 예고됨 (pulsePreview). 붙어 선 전기 타입의 전기 기술 ×1.2 (charged). 스펙 docs/superpowers/specs/2026-11-23-power-plant-design.md
import { typesOf, magicGuard } from './abilities.js';
import { typeMultiplier } from '../data/types.js';

export const GEN = 'G';
export const GEN_RANGE = 2;
export const CHARGE_MULT = 1.2;

export const genCells = (g) => [{ x: g.x, y: g.y }, { x: g.x + 1, y: g.y }, { x: g.x, y: g.y + 1 }, { x: g.x + 1, y: g.y + 1 }];
const distTo = (g, p) => Math.min(...genCells(g).map((c) => Math.abs(c.x - p.x) + Math.abs(c.y - p.y)));

export function genRange(state, g) {
  const out = [];
  for (let y = g.y - GEN_RANGE; y <= g.y + 1 + GEN_RANGE; y++) for (let x = g.x - GEN_RANGE; x <= g.x + 1 + GEN_RANGE; x++) {
    if (x < 0 || y < 0 || x >= state.width || y >= state.height || state.grid[y][x] === GEN) continue;
    const d = distTo(g, { x, y });
    if (d >= 1 && d <= GEN_RANGE) out.push({ x, y });
  }
  return out;
}

export const firesAt = (g, turn) => turn % 2 === g.phase;

// 이번 라운드(적 페이즈 끝)에 방출될 칸 — 예고 그림·AI 위험도
export function pulsePreview(state) {
  const seen = new Map();
  for (const g of state.generators ?? []) if (firesAt(g, state.turn)) for (const p of genRange(state, g)) seen.set(`${p.x},${p.y}`, p);
  return [...seen.values()];
}

const ABSORB = { 'volt-absorb': 'heal', 'motor-drive': 'spe', 'lightning-rod': 'spa' };

// 한 유닛이 받는 방출 효과: { damage, kind } · { heal, ability } · { boost, ability } · null(면역)
export function shockDamage(unit) {
  if (unit.burrow) return null; // 숨기 중(땅속·공중·물속·그림자)엔 닿지 않음
  const ab = unit.abilityOff ? null : unit.ability;
  if (ABSORB[ab] === 'heal') return { heal: Math.max(1, Math.floor(unit.maxHp / 4)), ability: ab }; // 전기 타입이라도 회복
  if (ABSORB[ab]) return { boost: ABSORB[ab], ability: ab };
  const t = typesOf(unit);
  if (t.includes('electric') || magicGuard(unit)) return null;
  const mult = typeMultiplier('electric', t);
  if (!mult) return null; // 땅
  return { damage: Math.max(1, Math.floor((unit.maxHp / 6) * mult)), kind: 'shock' };
}

// 상하좌우로 발전기에 붙어 섬
export function charged(state, u) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.grid[u.y + dy]?.[u.x + dx] === GEN);
}

// 이번 라운드 방출 칸 위에 서면 받을 피해 (AI 위험도)
export function pulseRisk(state, unit, p) {
  if (!(state.generators ?? []).some((g) => firesAt(g, state.turn) && genRange(state, g).some((c) => c.x === p.x && c.y === p.y))) return 0;
  return shockDamage(unit)?.damage ?? 0;
}

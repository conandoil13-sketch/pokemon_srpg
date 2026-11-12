// 진화 조건 분류 (순수). PokeAPI 진화 조건 → 게임 규칙
// 돌(use-item) → 진화의돌 / 순수 레벨 → 원작 레벨 / 친밀도·교환·기타 → 대체 레벨 매트릭스
import { BALANCE } from '../data/balance.js';

// details: [{ trigger, minLevel, minHappiness, item, extra }]
// line: { length: 2|3, order: 1|2, prevLevel: number|null }
export function classifyEvolution(details, line, balance = BALANCE) {
  if (details.some((x) => x.trigger === 'use-item')) return { kind: 'stone' };
  const pure = details.find((x) => x.trigger === 'level-up' && x.minLevel && !x.minHappiness && !x.extra);
  if (pure) return { kind: 'level', level: pure.minLevel, source: 'original' };
  const source = details.some((x) => x.minHappiness) ? 'friendship' : details.some((x) => x.trigger === 'trade') ? 'trade' : 'other';
  const cell = line.length === 2 ? 'two' : line.order === 1 ? 'three1' : 'three2';
  let level = balance.evoMatrix[cell][source];
  if (line.order === 2 && typeof line.prevLevel === 'number') level = Math.max(level, line.prevLevel + balance.secondStageMinGap);
  return { kind: 'level', level, source };
}

export const levelEvolutionReady = (sp, level) => sp.evolution?.rule.kind === 'level' && level >= sp.evolution.rule.level;
export const stoneEvolutionReady = (sp) => sp.evolution?.rule.kind === 'stone';

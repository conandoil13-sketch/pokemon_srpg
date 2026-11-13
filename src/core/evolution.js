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

// ---- 분기 진화 ----
// branches: [{ to, details }]. 같은 출발에서 '원작 레벨' 이 같은 갈래가 둘 이상이면 원작에서도 무작위(개무소) → random
export function classifyBranches(fromSpecies, branches, line, balance = BALANCE) {
  const out = branches.map(({ to, details }) => ({ to, rule: classifyEvolution(details, line, balance) }));
  const byLevel = {};
  for (const b of out) if (b.rule.source === 'original') (byLevel[b.rule.level] ??= []).push(b);
  for (const group of Object.values(byLevel)) if (group.length > 1) for (const b of group) b.rule = { ...b.rule, random: true };
  return out;
}

const evos = (sp) => sp.evolutions ?? [];
export const levelEvolutionOptions = (sp, level) => evos(sp).filter((e) => e.rule.kind === 'level' && level >= e.rule.level).map((e) => e.to);
export const stoneEvolutionOptions = (sp) => evos(sp).filter((e) => e.rule.kind === 'stone').map((e) => e.to);

// 0개 → null, 1개 → auto, 모두 무작위 갈래 → rng 로 auto, 그 외 → 플레이어가 고름
export function pickEvolution(options, sp, rng) {
  if (!options.length) return null;
  if (options.length === 1) return { auto: options[0] };
  const random = options.every((to) => evos(sp).find((e) => e.to === to)?.rule.random);
  if (random) return { auto: options[Math.min(options.length - 1, Math.floor(rng() * options.length))] };
  return { choose: options };
}

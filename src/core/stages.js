// 능력치 랭크 (순수). −6~+6, 3턴 지속 (그 유닛 편 페이즈 종료마다 −1)
import { stageGuard, speedMult, ignoresParalysisSlow } from './abilities.js';
export const STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];
export const API_STAT = { attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe', accuracy: 'acc', evasion: 'eva' };
export const STAT_KO = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드', acc: '명중률', eva: '회피율' };
export const STAGE_TURNS = 3;
export const AREA_STAGE_TURNS = 2; // 범위 기술(울음소리 등)로 바뀐 랭크는 더 짧게
export const ACC_PER_STAGE = 8; // 명중·회피 랭크당 %p (본가 공식 대신 완만하게)
const MAX = 6;

const zeros = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
export const newStages = () => ({ stages: zeros(), turns: zeros(), layers: [] });

export const stageMultiplier = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));

// 마비면 스피드 ×0.5 (status.js 와 같은 규칙, 순환 import 를 피해 여기서 직접 본다)
export const effectiveStat = (unit, key) => unit.stats[key] * stageMultiplier(unit.stages?.[key] ?? 0)
  * (key === 'spe' ? (unit.status === 'paralysis' && !ignoresParalysisSlow(unit) ? 0.5 : 1) * speedMult(unit) : 1);

export const accuracyShift = (attacker, defender) => ACC_PER_STAGE * ((attacker.stages?.acc ?? 0) - (defender.stages?.eva ?? 0));

// 랭크 변화 하나하나가 따로 시간을 갖는 '층'. 수치는 합쳐지지만(±6 한계) 각자 자기 턴이 다 되면 사라진다.
// 그래서 버프를 다시 써도 이전 버프가 연장되지 않는다 (무한 유지 불가).
// unit.layers = [{ key, amount, turns }], unit.stages = 키별 합, unit.turns = 키별 가장 긴 남은 턴(표시·AI 용)
function refresh(unit, key) {
  const ls = unit.layers.filter((l) => l.key === key);
  unit.stages[key] = Math.max(-MAX, Math.min(MAX, ls.reduce((s, l) => s + l.amount, 0)));
  unit.turns[key] = ls.reduce((m, l) => Math.max(m, l.turns), 0);
}

// 반환: { key, before, after, applied } — applied 0 이면 이미 한계 (새 층 없음)
export function applyStageChange(unit, key, change, turns = STAGE_TURNS, { fromOther = false, breaker = false } = {}) {
  if (!breaker) change = stageGuard(unit, key, change, fromOther); // 클리어바디·괴력집게·날카로운눈·단순 (틀깨기면 무시)
  unit.stages ??= zeros();
  unit.turns ??= zeros();
  unit.layers ??= [];
  const before = unit.stages[key];
  const after = Math.max(-MAX, Math.min(MAX, before + change));
  const applied = after - before;
  if (applied !== 0) { unit.layers.push({ key, amount: applied, turns }); refresh(unit, key); }
  return { key, before, after, applied };
}

// 페이즈 종료: 층마다 남은 턴 −1, 다 된 층은 사라진다. 값이 바뀐 키 목록 반환
export function tickStages(unit) {
  if (!unit.layers?.length) return [];
  const changed = new Set();
  for (const l of unit.layers) { l.turns -= 1; if (l.turns <= 0) changed.add(l.key); }
  unit.layers = unit.layers.filter((l) => l.turns > 0);
  for (const k of STAT_KEYS) if (unit.layers.some((l) => l.key === k) || changed.has(k)) refresh(unit, k);
  return [...changed];
}

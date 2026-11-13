// 능력치 랭크 (순수). −6~+6, 3턴 지속 (그 유닛 편 페이즈 종료마다 −1)
export const STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];
export const API_STAT = { attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe', accuracy: 'acc', evasion: 'eva' };
export const STAT_KO = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드', acc: '명중률', eva: '회피율' };
export const STAGE_TURNS = 3;
export const ACC_PER_STAGE = 8; // 명중·회피 랭크당 %p (본가 공식 대신 완만하게)
const MAX = 6;

const zeros = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
export const newStages = () => ({ stages: zeros(), turns: zeros() });

export const stageMultiplier = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));

export const effectiveStat = (unit, key) => unit.stats[key] * stageMultiplier(unit.stages?.[key] ?? 0);

export const accuracyShift = (attacker, defender) => ACC_PER_STAGE * ((attacker.stages?.acc ?? 0) - (defender.stages?.eva ?? 0));

// 반환: { key, before, after, applied } — applied 0 이면 이미 한계 (남은 턴도 그대로)
export function applyStageChange(unit, key, change) {
  unit.stages ??= zeros();
  unit.turns ??= zeros();
  const before = unit.stages[key];
  const after = Math.max(-MAX, Math.min(MAX, before + change));
  unit.stages[key] = after;
  if (after !== before) unit.turns[key] = after === 0 ? 0 : STAGE_TURNS; // 0 으로 돌아오면 지속도 끝
  return { key, before, after, applied: after - before };
}

// 페이즈 종료: 남은 턴 −1, 다 된 능력치는 원래대로. 원래대로 돌아온 키 목록 반환
export function tickStages(unit) {
  const expired = [];
  for (const k of STAT_KEYS) {
    if (!unit.turns?.[k]) continue;
    unit.turns[k] -= 1;
    if (unit.turns[k] <= 0) { unit.turns[k] = 0; if (unit.stages[k] !== 0) expired.push(k); unit.stages[k] = 0; }
  }
  return expired;
}

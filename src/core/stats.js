// 능력치 · 성장 곡선 · 경험치 (순수). IV 31, EV 0, 성격 무보정
const IV = 31;
export const MAX_LEVEL = 100;

export function statsAt(base, level) {
  const core = (b) => Math.floor((2 * b + IV) * level / 100);
  return {
    hp: core(base.hp) + level + 10,
    atk: core(base.atk) + 5,
    def: core(base.def) + 5,
    spa: core(base.spa) + 5,
    spd: core(base.spd) + 5,
    spe: core(base.spe) + 5,
  };
}

// PokeAPI growth_rate 이름별 원작 경험치 곡선 (해당 레벨에 도달하는 누적 경험치)
const CURVES = {
  fast: (n) => (4 * n ** 3) / 5,
  medium: (n) => n ** 3,
  'medium-slow': (n) => (6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140,
  slow: (n) => (5 * n ** 3) / 4,
  'slow-then-very-fast': (n) => { // erratic
    if (n < 50) return (n ** 3 * (100 - n)) / 50;
    if (n < 68) return (n ** 3 * (150 - n)) / 100;
    if (n < 98) return (n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500;
    return (n ** 3 * (160 - n)) / 100;
  },
  'fast-then-very-slow': (n) => { // fluctuating
    if (n < 15) return (n ** 3 * (Math.floor((n + 1) / 3) + 24)) / 50;
    if (n < 36) return (n ** 3 * (n + 14)) / 50;
    return (n ** 3 * (Math.floor(n / 2) + 32)) / 50;
  },
};

export function expForLevel(growth, level) {
  if (level <= 1) return 0;
  const f = CURVES[growth];
  if (!f) throw new Error(`unknown growth rate: ${growth}`);
  return Math.max(0, Math.floor(f(Math.min(level, MAX_LEVEL))));
}

export function levelForExp(growth, exp) {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expForLevel(growth, level + 1)) level++;
  return level;
}

export const expYield = (baseExp, enemyLevel, multiplier) => Math.floor((baseExp * enemyLevel) / 7) * multiplier;

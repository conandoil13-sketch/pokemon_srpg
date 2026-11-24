// 유닛의 켜진 특성 (1칸 + 2칸). 의존성 없음 — 어느 모듈에서나 순환 import 없이 쓰려고 따로 둔다
// 위액(abilityOff)이면 빈 목록, 두 칸이 같으면 하나
export const abilitiesOf = (u) => {
  if (!u || typeof u !== 'object' || u.abilityOff) return [];
  const a = u.ability ?? null, b = u.ability2 ?? null;
  return a && b && a !== b ? [a, b] : a ? [a] : b ? [b] : [];
};
export const has = (u, id) => abilitiesOf(u).includes(id);

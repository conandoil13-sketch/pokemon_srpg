// 기술 습득 규칙 (순수). learnset: [[level, moveApi]] 레벨 오름차순
export const FALLBACK_MOVE = 'tackle';
const MAX_MOVES = 4;

const learnable = (movesData, api) => movesData[api]?.learnable === true;

// 레벨 이하에서 배우는 공격기 중 가장 최근 4개 (같은 기술은 최근 위치로)
export function startingMoves(learnset, level, movesData) {
  const out = [];
  for (const [lv, api] of learnset) {
    if (lv > level || !learnable(movesData, api)) continue;
    const i = out.indexOf(api);
    if (i >= 0) out.splice(i, 1);
    out.push(api);
  }
  const picked = out.slice(-MAX_MOVES);
  // 공격기가 하나도 없으면 가장 최근 공격기(없으면 몸통박치기)로 가장 오래된 칸을 바꾼다
  const attacks = (ms) => ms.filter((m) => movesData[m]?.category !== 'status');
  if (attacks(picked).length) return picked;
  const attack = attacks(out).at(-1) ?? FALLBACK_MOVE;
  return [...picked.slice(picked.length >= MAX_MOVES ? 1 : 0), attack];
}

// (fromExclusive, toInclusive] 구간에서 배우는 공격기, 레벨 순
export function movesLearnedBetween(learnset, fromExclusive, toInclusive, movesData) {
  return learnset.filter(([lv, api]) => lv > fromExclusive && lv <= toInclusive && learnable(movesData, api)).map(([, api]) => api);
}

export function learnOutcome(knownMoves, move) {
  if (knownMoves.includes(move)) return 'known';
  return knownMoves.length < MAX_MOVES ? 'learn' : 'choose';
}

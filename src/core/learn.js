// 기술 습득 규칙 (순수). learnset: [[level, moveApi]] 레벨 오름차순
export const FALLBACK_MOVE = 'tackle';
const MAX_MOVES = 4;
const MAX_STATUS = 2; // 시작 기술 중 변화기 최대 개수

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
  // 최근 것부터 4칸: 변화기는 최대 2개, 남는 칸은 더 오래된 공격기로 (습득 순서 유지)
  const isStatus = (m) => movesData[m]?.category === 'status';
  const picked = [];
  let status = 0;
  for (let i = out.length - 1; i >= 0 && picked.length < MAX_MOVES; i--) {
    if (isStatus(out[i])) { if (status >= MAX_STATUS) continue; status++; }
    picked.unshift(out[i]);
  }
  if (picked.some((m) => !isStatus(m))) return picked;
  return [...picked.slice(picked.length >= MAX_MOVES ? 1 : 0), FALLBACK_MOVE]; // 공격기를 하나도 못 배웠으면 몸통박치기
}

// (fromExclusive, toInclusive] 구간에서 배우는 공격기, 레벨 순
export function movesLearnedBetween(learnset, fromExclusive, toInclusive, movesData) {
  return learnset.filter(([lv, api]) => lv > fromExclusive && lv <= toInclusive && learnable(movesData, api)).map(([, api]) => api);
}

export function learnOutcome(knownMoves, move) {
  if (knownMoves.includes(move)) return 'known';
  return knownMoves.length < MAX_MOVES ? 'learn' : 'choose';
}

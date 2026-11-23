// 기술 다시 떠올리기 (편성소). 후보 = 지금 모습 습득표(지금 레벨 이하) ∪ 그 개체가 익혔던 기술 − 지금 기술
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';

const MAX_MOVES = 4;
const history = (m) => m.learned ?? [...m.moves]; // 옛 저장: 이력이 없으면 지금 기술

// 익힌 기술을 개체 이력에 남김 (교체·진화해도 유지)
export function remember(member, move) {
  if (member.build) return;
  member.learned = history(member);
  if (!member.learned.includes(move)) member.learned.push(move);
}

export function relearnCandidates(member) {
  if (member.build || member.species === 'ditto') return [];
  const out = [];
  const add = (mv) => { if (MOVES[mv]?.learnable && !out.includes(mv) && !member.moves.includes(mv)) out.push(mv); };
  for (const [lv, mv] of SPECIES[member.species].learnset) if (lv <= member.level) add(mv);
  for (const mv of history(member)) add(mv);
  return out;
}

// slot: 바꿀 칸 (null = 빈 칸에 추가). 바뀐 기술은 이력에 남아 다시 후보가 됨
export function relearn(member, move, slot) {
  if (!relearnCandidates(member).includes(move)) return { ok: false, reason: 'candidate' };
  if (slot === null || slot === undefined) {
    if (member.moves.length >= MAX_MOVES) return { ok: false, reason: 'full' };
    for (const mv of member.moves) remember(member, mv);
    member.moves.push(move);
  } else {
    if (!Number.isInteger(slot) || slot < 0 || slot >= member.moves.length) return { ok: false, reason: 'slot' };
    for (const mv of member.moves) remember(member, mv);
    member.moves[slot] = move;
  }
  remember(member, move);
  return { ok: true };
}

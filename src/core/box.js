// 편성소 박스 (순수): 정렬과 30칸씩 나누기
import { SPECIES } from '../data/species.js';

export const SORT_KEYS = ['joined', 'level', 'dex'];
export const SORT_KO = { joined: '들어온 순', level: '레벨 순', dex: '도감 순' };
export const BOX_SIZE = 30;

// 새 배열. 같은 값이면 들어온 순(파티 배열 순서) 유지
export function sortMembers(party, key) {
  const list = party.map((m, i) => ({ m, i }));
  const by = { joined: () => 0, level: (a, b) => b.m.level - a.m.level, dex: (a, b) => SPECIES[a.m.species].dex - SPECIES[b.m.species].dex }[key] ?? (() => 0);
  return list.sort((a, b) => by(a, b) || a.i - b.i).map((x) => x.m);
}

export function boxesOf(list) {
  const out = [];
  for (let i = 0; i < list.length; i += BOX_SIZE) out.push(list.slice(i, i + BOX_SIZE));
  return out.length ? out : [[]];
}

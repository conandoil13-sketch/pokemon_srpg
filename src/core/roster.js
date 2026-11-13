// 출전 편성 (순수): 메타몽 + 출전 동료(최대 4)
import { SORTIE_SIZE } from './save.js';

export function deployed(game) {
  const ditto = game.party.find((m) => m.species === 'ditto');
  const rest = game.sortie.map((k) => game.party.find((m) => m.species === k)).filter(Boolean);
  return ditto ? [ditto, ...rest] : rest;
}

// 출전 ↔ 대기 전환. 꽉 찼으면 추가 불가, 마지막 1마리는 뺄 수 없음, 메타몽은 항상 출전
export function toggleSortie(game, species) {
  if (species === 'ditto') return { ok: false, reason: 'ditto' };
  const i = game.sortie.indexOf(species);
  if (i >= 0) {
    if (game.sortie.length <= 1) return { ok: false, reason: 'last' };
    game.sortie.splice(i, 1);
    return { ok: true };
  }
  if (game.sortie.length >= SORTIE_SIZE) return { ok: false, reason: 'full' };
  game.sortie.push(species);
  return { ok: true };
}

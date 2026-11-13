// 출전 편성 (순수): 메타몽 + 출전 동료(최대 4). 출전 목록은 종족 키라서 진화하면 이름을 바꿔 줘야 한다
import { SORTIE_SIZE, cleanSortie } from './save.js';

// 파티에 없는 항목(진화 후 옛 이름 등)을 정리 — 죽은 자리가 남지 않게
const sync = (game) => { game.sortie = cleanSortie(game.sortie, game.party); };

export function deployed(game) {
  sync(game);
  const ditto = game.party.find((m) => m.species === 'ditto');
  const rest = game.sortie.map((k) => game.party.find((m) => m.species === k)).filter(Boolean);
  return ditto ? [ditto, ...rest] : rest;
}

// 진화: 출전 목록의 같은 자리를 새 이름으로
export function renameSortie(game, from, to) {
  const i = game.sortie.indexOf(from);
  if (i >= 0) game.sortie[i] = to;
}

// 출전 ↔ 대기 전환. 꽉 찼으면 추가 불가, 마지막 1마리는 뺄 수 없음, 메타몽은 항상 출전
export function toggleSortie(game, species) {
  if (species === 'ditto') return { ok: false, reason: 'ditto' };
  sync(game);
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

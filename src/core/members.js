// 동료 구분 (순수): 고유 번호(uid) · 같은 계열 묶음 · 계열 공유 값(개체값·얻은 성별)
import { SPECIES } from '../data/species.js';
import { lineRoot } from './gacha.js';
import { IV_KEYS, genderFits } from './individual.js';

// 동료를 가리키는 열쇠: uid (없는 테스트용 멤버는 종 이름)
export const memberKey = (m) => m.uid ?? m.species;

// 열쇠로 찾기. JSON 키는 문자열이 되므로 문자열로 비교. uid 가 안 맞으면 종 이름으로(예전 형식 호환)
export function memberByKey(game, key) {
  if (key === null || key === undefined) return undefined;
  const k = String(key);
  return game.party.find((m) => String(memberKey(m)) === k) ?? game.party.find((m) => m.species === k);
}

const maxUid = (party) => party.reduce((n, m) => (Number.isInteger(m.uid) ? Math.max(n, m.uid) : n), 0);

// 새 uid 부여 (game.nextUid 증가)
export function giveUid(game, m) {
  const next = Math.max(Number.isInteger(game.nextUid) ? game.nextUid : 1, maxUid(game.party) + 1);
  m.uid = next;
  game.nextUid = next + 1;
  return m;
}

export const lineMembers = (game, root) => game.party.filter((m) => lineRoot(m.species) === root);

// 계열당 최대 마리 수: max(2, 최종 모습 수) — 이브이 7, 배루키 3
const finalsCache = {};
function finalsOf(key) {
  const s = SPECIES[key];
  if (!s.evolutions.length) return new Set([key]);
  const out = new Set();
  for (const e of s.evolutions) for (const f of finalsOf(e.to)) out.add(f);
  return out;
}
export const lineLimit = (root) => (finalsCache[root] ??= Math.max(2, finalsOf(root).size));

// 계열 모든 동료에게 같은 개체값·얻은 성별 (복사본으로)
export function syncLine(game, root, { ivs, genders }) {
  for (const m of lineMembers(game, root)) {
    if (m.species === 'ditto') continue;
    if (ivs) m.ivs = { ...ivs };
    if (genders) m.genders = [...genders];
  }
}

// 계열끼리 맞추기: 능력치별 큰 개체값, 얻은 성별 합집합(계열 뿌리에 맞는 것만)
export function unifyLines(game) {
  const roots = new Set(game.party.filter((m) => m.species !== 'ditto').map((m) => lineRoot(m.species)));
  for (const root of roots) {
    const ms = lineMembers(game, root);
    const ivs = Object.fromEntries(IV_KEYS.map((k) => [k, Math.max(...ms.map((m) => m.ivs?.[k] ?? 0))]));
    const genders = [...new Set(ms.flatMap((m) => [...(m.genders ?? []), ...(m.gender ? [m.gender] : [])]))].filter((g) => genderFits(root, g));
    syncLine(game, root, { ivs, genders });
  }
}

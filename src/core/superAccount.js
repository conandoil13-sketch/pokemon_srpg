// 테스트용 슈퍼계정 (재화 99 · 소모 0). 키는 코드에 없고 해시만 있다: 주소 ?k=<키> 로 켜고 ?k=off 로 끈다
import { lineRoot } from './gacha.js';
import { HELD_IDS } from '../data/heldItems.js';

const KEY_HASH = '25d4d9843bc20d50dc1e13c6e1dc9b86ce49ad013235e61badc1bf32f3943fa9';
export const FULL = 99;
const MAX_KEY = 64;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
// 키가 맞는지 (SHA-256). crypto.subtle 이 없으면(보안 아닌 주소) 그냥 아니다
export async function checkKey(key) {
  if (typeof key !== 'string' || !key || key.length > MAX_KEY) return false;
  try { return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pkt:${key}`))) === KEY_HASH; } catch { return false; }
}
export const keyLooksValid = (key) => typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY;

export { free } from './freeCost.js';

// 재화를 99 로 (이미 더 많으면 그대로): 코인·진화의돌·10연속 바우처·이상한사탕·파우더·동료 계열 결정
export function topUp(game) {
  const up = (n) => Math.max(Number.isFinite(n) ? n : 0, FULL);
  game.coins = up(game.coins);
  game.items ??= {};
  for (const k of ['evoStone', 'tenVoucher', 'rareCandy', 'suspiciousCandy']) game.items[k] = up(game.items[k]);
  game.items.powders ??= {};
  for (const k of Object.keys(game.items.powders)) game.items.powders[k] = up(game.items.powders[k]);
  game.shards ??= {};
  for (const m of game.party ?? []) { const r = lineRoot(m.species); game.shards[r] = up(game.shards[r]); }
  return game;
}

// 각 저장 데이터에서 도구 종류별로 한 번만 지급한다.
export function grantSuperItems(game) {
  game.items ??= {};
  game.items.held ??= {};
  const granted = new Set(game.superGrantedItems ?? []);
  for (const id of HELD_IDS) {
    if (granted.has(id)) continue;
    game.items.held[id] = Math.max(game.items.held[id] ?? 0, FULL);
    granted.add(id);
  }
  game.superGrantedItems = [...granted];
}

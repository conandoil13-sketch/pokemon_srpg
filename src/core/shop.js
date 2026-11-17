// 상점 (순수): 탐험이 끝날 때마다 바뀌는 8칸 진열. game.shop = { stock: [{ id, sold }], seq }
// 스펙 docs/superpowers/specs/2026-11-17-town-shop-design.md
import { HELD_ITEMS, HELD_IDS } from '../data/heldItems.js';
import { createRng } from './rng.js';

const SHOP_SALT = 0x5a0b1e;
const seedOf = (seq) => (SHOP_SALT ^ Math.imul(seq + 1, 0x9e3779b1)) >>> 0;
const tier = (p) => (p === 150 ? 'cheap' : p === 300 || p === 500 ? 'normal' : p === 600 ? 'high' : 'top');
const POOLS = Object.fromEntries(['cheap', 'normal', 'high', 'top'].map((t) => [t, HELD_IDS.filter((id) => tier(HELD_ITEMS[id].price) === t)]));
export const STOCK_SIZE = 8;

// 싼 3 · 보통 3 · 비쌈 1 · 마지막 칸 50% 최상 (아니면 비쌈). 중복 없음
export function rollStock(seq) {
  const rng = createRng(seedOf(seq)), out = [];
  const take = (pool) => { const left = pool.filter((id) => !out.some((s) => s.id === id)); out.push({ id: left[Math.floor(rng() * left.length)], sold: false }); };
  for (let i = 0; i < 3; i++) take(POOLS.cheap);
  for (let i = 0; i < 3; i++) take(POOLS.normal);
  take(POOLS.high);
  take(rng() < 0.5 ? POOLS.top : POOLS.high);
  return out;
}

export function refreshShop(game) {
  const seq = (game.shop?.seq ?? -1) + 1;
  game.shop = { seq, stock: rollStock(seq) };
}

export function buy(game, index) {
  const s = game.shop?.stock?.[index];
  if (!s) return { ok: false, reason: 'range' };
  if (s.sold) return { ok: false, reason: 'sold' };
  const price = HELD_ITEMS[s.id].price;
  if ((game.coins ?? 0) < price) return { ok: false, reason: 'coins' };
  game.coins -= price;
  game.items.held ??= {};
  game.items.held[s.id] = (game.items.held[s.id] ?? 0) + 1;
  s.sold = true;
  return { ok: true, id: s.id };
}

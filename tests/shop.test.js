import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELD_ITEMS, HELD_IDS } from '../src/data/heldItems.js';
import { rollStock, refreshShop, buy, STOCK_SIZE } from '../src/core/shop.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';
import { startRun, finishRun } from '../src/core/run.js';

const memStore = () => { const data = {}; return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };
const P = (id) => HELD_ITEMS[id].price;

test('every item has one of the five prices', () => {
  for (const id of HELD_IDS) assert.ok([150, 300, 500, 600, 1200].includes(P(id)), id);
  assert.equal(P('leftovers'), 1200); assert.equal(P('charcoal'), 300); assert.equal(P('flame-orb'), 150); assert.equal(P('light-ball'), 500); assert.equal(P('choice-band'), 600);
});

test('stock has 8 distinct items in the tier layout, deterministic per seq', () => {
  let top = 0;
  for (let n = 0; n < 200; n++) {
    const s = rollStock(n);
    assert.equal(s.length, STOCK_SIZE); assert.equal(new Set(s.map((x) => x.id)).size, 8);
    const p = s.map((x) => P(x.id));
    assert.deepEqual(p.slice(0, 3), [150, 150, 150]);
    assert.ok(p.slice(3, 6).every((v) => v === 300 || v === 500));
    assert.equal(p[6], 600); assert.ok(p[7] === 600 || p[7] === 1200);
    if (p[7] === 1200) top++;
  }
  assert.deepEqual(rollStock(7), rollStock(7));
  assert.ok(top / 200 > 0.35 && top / 200 < 0.65, String(top));
});

test('buying spends coins, fills the bag, marks sold, refuses when short', () => {
  const g = newGame(); g.coins = 400;
  const i = g.shop.stock.findIndex((s) => P(s.id) === 150);
  const id = g.shop.stock[i].id;
  assert.deepEqual(buy(g, i), { ok: true, id }); assert.equal(g.coins, 250); assert.equal(g.items.held[id], 1);
  assert.equal(buy(g, i).reason, 'sold');
  assert.equal(buy(g, 7).reason, 'coins');
  assert.equal(buy(g, 99).reason, 'range');
});

test('save keeps the stock; loading twice does not reroll; missing shop rolls once', () => {
  const s = memStore(), g = newGame(); g.shop.stock[0].sold = true;
  saveGame(s, g);
  const a = loadGame(s), b = loadGame(s);
  assert.deepEqual(a.shop, g.shop); assert.deepEqual(b.shop, g.shop);
  const raw = JSON.parse(s.data['pokemon-tactics-save']); delete raw.shop; s.data['pokemon-tactics-save'] = JSON.stringify(raw);
  const c = loadGame(s); assert.equal(c.shop.stock.length, 8); assert.deepEqual(loadGame(s).shop, c.shop);
});

test('every finished expedition rerolls the stock', () => {
  const g = newGame();
  for (const outcome of ['cleared', 'retreat', 'wiped']) {
    const before = JSON.stringify(g.shop);
    g.run = startRun('sinnoh-field', 1); finishRun(g, g.run, outcome);
    assert.notEqual(JSON.stringify(g.shop), before, outcome);
  }
});

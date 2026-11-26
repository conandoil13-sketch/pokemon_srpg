// 테스트용 슈퍼계정: 비밀 키로만 켜지고(코드엔 해시만), 켜지면 재화 99 · 소모 0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkKey, topUp, free, FULL } from '../src/core/superAccount.js';
import { newGame, loadGame, saveGame } from '../src/core/save.js';
import { newMember } from '../src/core/progress.js';
import { claimBall, claimBalls, rollBalls } from '../src/core/gacha.js';
import { rollExtra } from '../src/core/extraAbility.js';
import { unlockAbility, unlockHidden } from '../src/core/progress.js';
import { buy } from '../src/core/shop.js';
import { createRng } from '../src/core/rng.js';

const KEY = process.env.SUPER_TEST_KEY; // 진짜 키는 저장소에 없음: 있으면 맞는 키 확인, 없으면 건너뜀
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const superGame = () => { const g = newGame(); g.party.push(newMember('charmander', 30)); g.superActive = true; return g; };

test('wrong or odd keys never unlock', async () => {
  for (const k of ['', 'super', 'admin', '1234', null, undefined, 42, 'x'.repeat(500)]) assert.equal(await checkKey(k), false, String(k));
});

test('the real key unlocks', { skip: !KEY }, async () => {
  assert.equal(await checkKey(KEY), true);
});

test('free costs nothing only for a super game', () => {
  assert.equal(free({ superActive: true }, 4), 0);
  assert.equal(free({}, 4), 4);
  assert.equal(free(null, 4), 4);
});

test('topUp fills every currency to 99 and never lowers', () => {
  const g = superGame(); g.coins = 5000;
  topUp(g);
  assert.equal(FULL, 99);
  assert.equal(g.coins, 5000);
  assert.equal(g.items.evoStone, 99);
  assert.equal(g.items.tenVoucher, 99);
  assert.equal(g.items.rareCandy, 99);
  assert.ok(Object.values(g.items.powders).every((n) => n === 99));
  assert.equal(g.shards.charmander, 99);
  const n = newGame(); n.coins = 3; topUp(n); assert.equal(n.coins, 99);
});

test('a super game spends nothing', () => {
  const g = superGame(); g.coins = 0; g.shards = {}; g.items.tenVoucher = 0;
  const rng = createRng(3);
  assert.equal(claimBall(g, rollBalls(rng, 1)[0], rng).ok, true);
  assert.equal(claimBalls(g, rollBalls(rng, 10), rng).ok, true);
  assert.equal(g.coins, 0);
  const m = g.party.find((x) => x.species === 'charmander');
  assert.equal(rollExtra(g, m.uid ?? m.species).ok, true);
  assert.equal(g.shards.charmander ?? 0, 0);
  const b = g.party.find((x) => x.species === 'charmander');
  b.abilityUnlocked = false;
  const u = unlockAbility(g, b.uid ?? b.species);
  assert.ok(u.ok || u.reason === 'single');
  g.shop.stock[0].sold = false;
  assert.equal(buy(g, 0).ok, true);
  assert.equal(g.coins, 0);
});

test('a normal game still pays', () => {
  const g = newGame(); g.coins = 0;
  const rng = createRng(3);
  assert.equal(claimBall(g, rollBalls(rng, 1)[0], rng).ok, false);
});

test('save keeps the key but not the live flag', () => {
  const s = memStore(), g = superGame(); g.superKey = 'abc';
  saveGame(s, g);
  const back = loadGame(s);
  assert.equal(back.superKey, 'abc');
  assert.equal(back.superActive, undefined);
  g.superKey = 'x'.repeat(500); saveGame(s, g);
  assert.equal(loadGame(s).superKey, undefined);
});

test('super items are granted once per item and the grant survives save and reload', async () => {
  const { grantSuperItems } = await import('../src/core/superAccount.js');
  const { HELD_IDS } = await import('../src/data/heldItems.js');
  const store = memStore(), game = newGame();
  grantSuperItems(game);
  assert.ok(HELD_IDS.every(id => game.items.held[id] === 99));
  game.items.held.charcoal = 97;
  delete game.items.held.magnet;
  saveGame(store, game);
  const loaded = loadGame(store);
  grantSuperItems(loaded);
  assert.equal(loaded.items.held.charcoal, 97);
  assert.equal(loaded.items.held.magnet, undefined);
  assert.equal(loaded.superGrantedItems.length, HELD_IDS.length);
});

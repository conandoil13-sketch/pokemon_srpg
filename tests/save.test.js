import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, loadGame, saveGame, SAVE_KEY } from '../src/core/save.js';

const memStore = () => { const data = {}; return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } }; };

test('round trip', () => {
  const st = memStore();
  const g = newGame();
  g.party[0].level = 12; g.cleared.push('sinnoh-field'); g.items.evoStone = 2;
  // exp 는 레벨과 맞아야 하므로 저장 전 정합성 있는 값으로
  g.party[0].exp = 1000;
  assert.equal(saveGame(st, g), true);
  const back = loadGame(st);
  assert.equal(back.version, 1);
  assert.deepEqual(back.cleared, ['sinnoh-field']);
  assert.equal(back.items.evoStone, 2);
  assert.equal(back.party.length, 4);
  assert.deepEqual(back.party[1], g.party[1]);
});

test('no save → null', () => {
  assert.equal(loadGame(memStore()), null);
});

test('broken json / other version → null', () => {
  const st = memStore();
  st.setItem(SAVE_KEY, '{nope');
  assert.equal(loadGame(st), null);
  st.setItem(SAVE_KEY, JSON.stringify({ ...newGame(), version: 2 }));
  assert.equal(loadGame(st), null);
});

test('unknown species dropped, unknown moves removed and refilled', () => {
  const st = memStore();
  const g = newGame();
  g.party.push({ species: 'missingno', level: 5, exp: 0, moves: ['tackle'] });
  g.party[0].moves = ['not-a-move'];
  st.setItem(SAVE_KEY, JSON.stringify(g));
  const back = loadGame(st);
  assert.equal(back.party.length, 4);
  assert.ok(back.party[0].moves.length >= 1);
  assert.ok(!back.party[0].moves.includes('not-a-move'));
});

test('level and exp are clamped to valid values', () => {
  const st = memStore();
  const g = newGame();
  g.party[0].level = 999; g.party[0].exp = -5;
  st.setItem(SAVE_KEY, JSON.stringify(g));
  const m = loadGame(st).party[0];
  assert.equal(m.level, 100);
  assert.ok(m.exp >= 0);
});

test('empty party after cleanup → null', () => {
  const st = memStore();
  st.setItem(SAVE_KEY, JSON.stringify({ ...newGame(), party: [{ species: 'missingno', level: 5, exp: 0, moves: [] }] }));
  assert.equal(loadGame(st), null);
});

test('storage exceptions are contained', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.equal(loadGame(bad), null);
  assert.equal(saveGame(bad, newGame()), false);
});

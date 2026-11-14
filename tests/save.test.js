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
  assert.equal(back.version, 8);
  assert.deepEqual(back.cleared, ['sinnoh-field']);
  assert.equal(back.items.evoStone, 2);
  assert.equal(back.party.length, 5);
  assert.deepEqual(back.party[1], g.party[1]);
});

test('no save → null', () => {
  assert.equal(loadGame(memStore()), null);
});

test('broken json / other version → null', () => {
  const st = memStore();
  st.setItem(SAVE_KEY, '{nope');
  assert.equal(loadGame(st), null);
  st.setItem(SAVE_KEY, JSON.stringify({ ...newGame(), version: 9 }));
  assert.equal(loadGame(st), null);
});

test('unknown species dropped, unknown moves removed and refilled', () => {
  const st = memStore();
  const g = newGame();
  g.party.push({ species: 'missingno', level: 5, exp: 0, moves: ['tackle'] });
  g.party[0].moves = ['not-a-move'];
  st.setItem(SAVE_KEY, JSON.stringify(g));
  const back = loadGame(st);
  assert.equal(back.party.length, 5);
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

test('prototype-key species / moves never crash loading', () => {
  for (const sp of ['constructor', '__proto__', 'toString']) {
    const st = memStore();
    const g = newGame();
    g.party.push({ species: sp, level: 5, exp: 0, moves: ['constructor'] });
    g.party[0].moves = ['toString', 'scratch'];
    st.setItem(SAVE_KEY, JSON.stringify(g));
    let back;
    assert.doesNotThrow(() => { back = loadGame(st); }, sp);
    assert.equal(back.party.length, 5, sp);
    assert.deepEqual(back.party[0].moves, ['scratch']);
  }
});

test('any unexpected shape returns null instead of throwing', () => {
  const st = memStore();
  st.setItem(SAVE_KEY, JSON.stringify({ version: 1, party: [null, 5, 'x'], cleared: 'nope', items: null }));
  assert.doesNotThrow(() => loadGame(st));
  assert.equal(loadGame(st), null);
});

// ---- v2 ----
test('v2 new game shape', () => {
  const g = newGame();
  assert.equal(g.version, 8);
  assert.deepEqual(g.unlocked, ['sinnoh-field']);
  assert.deepEqual(g.best, {});
  assert.equal(g.run, null);
});

test('v2 round trip with an active run', () => {
  const st = memStore();
  const g = newGame();
  g.run = { dungeonId: 'sinnoh-field', floor: 3, seed: 777, faintedLast: ['piplup'], loot: { evoStone: 1, candy: [2], coins: 0, capsules: [{ kind: 'type', value: 'fire', from: 'charmander' }], powders: { hp: 0, atk: 2, def: 0, spa: 0, spd: 0, spe: 0 } } };
  g.best = { 'sinnoh-field': 3 };
  saveGame(st, g);
  const back = loadGame(st);
  assert.deepEqual(back.run, g.run);
  assert.deepEqual(back.best, g.best);
  assert.deepEqual(back.unlocked, ['sinnoh-field']);
});

test('v1 save migrates: party/items kept, fixed-stage clears dropped', () => {
  const st = memStore();
  const v1 = { version: 1, party: newGame().party, cleared: ['sinnoh-field'], items: { evoStone: 3 } };
  v1.party[0].level = 12; v1.party[0].exp = 1000;
  st.setItem(SAVE_KEY, JSON.stringify(v1));
  const g = loadGame(st);
  assert.equal(g.version, 8);
  assert.equal(g.party[0].level, 12);
  assert.equal(g.items.evoStone, 3);
  assert.deepEqual(g.cleared, []);
  assert.deepEqual(g.unlocked, ['sinnoh-field']);
  assert.equal(g.run, null);
});

test('invalid run or unknown dungeons are cleaned', () => {
  const st = memStore();
  const g = newGame();
  g.run = { dungeonId: 'nowhere', floor: 2, seed: 1, faintedLast: [], loot: { evoStone: 0, candy: [] } };
  g.unlocked = ['sinnoh-cave', 'constructor'];
  st.setItem(SAVE_KEY, JSON.stringify(g));
  let back = loadGame(st);
  assert.equal(back.run, null);
  assert.deepEqual(back.unlocked, ['sinnoh-field', 'sinnoh-cave']);
  g.run = { dungeonId: 'sinnoh-field', floor: 99, seed: 1, faintedLast: [], loot: { evoStone: 0, candy: [] } };
  st.setItem(SAVE_KEY, JSON.stringify(g));
  back = loadGame(st);
  assert.equal(back.run, null);
});

// ---- v3: 메타몽 주인공 ----
test('new game: ditto leads a party of 5', () => {
  const g = newGame();
  assert.equal(g.version, 8);
  assert.deepEqual(g.party.map((m) => m.species), ['ditto', 'chimchar', 'piplup', 'turtwig', 'shinx']);
});

test('v2 save gains ditto at the front', () => {
  const st = memStore();
  const g = newGame();
  const v2 = { ...g, version: 2, party: g.party.slice(1) };
  st.setItem(SAVE_KEY, JSON.stringify(v2));
  const back = loadGame(st);
  assert.equal(back.version, 8);
  assert.deepEqual(back.party.map((m) => m.species), ['ditto', 'chimchar', 'piplup', 'turtwig', 'shinx']);
});

test('ditto elsewhere in the party moves to the front, never duplicated', () => {
  const st = memStore();
  const g = newGame();
  const [ditto, ...rest] = g.party;
  ditto.level = 15; ditto.exp = 3375;
  st.setItem(SAVE_KEY, JSON.stringify({ ...g, party: [rest[0], rest[1], ditto, rest[2], rest[3]] }));
  const back = loadGame(st);
  assert.deepEqual(back.party.map((m) => m.species), ['ditto', 'chimchar', 'piplup', 'turtwig', 'shinx']);
  assert.equal(back.party[0].level, 15);
});

// ---- v4: 코인 · 결정 · 출전 ----
import { cleanSortie } from '../src/core/save.js';

test('v4 new game and round trip', () => {
  const st = memStore();
  const g = newGame();
  assert.equal(g.version, 8);
  assert.equal(g.coins, 0);
  assert.deepEqual(g.shards, {});
  assert.deepEqual(g.sortie, ['chimchar', 'piplup', 'turtwig', 'shinx']);
  g.coins = 340; g.shards = { chimchar: 2 }; g.sortie = ['piplup', 'shinx'];
  g.run = { dungeonId: 'sinnoh-field', floor: 2, seed: 5, faintedLast: [], loot: { evoStone: 0, candy: [], coins: 40 } };
  saveGame(st, g);
  const back = loadGame(st);
  assert.equal(back.coins, 340);
  assert.deepEqual(back.shards, { chimchar: 2 });
  assert.deepEqual(back.sortie, ['piplup', 'shinx']);
  assert.equal(back.run.loot.coins, 40);
});

test('v3 → v4 migration', () => {
  const st = memStore();
  const g = newGame();
  const v3 = { version: 3, party: g.party, items: g.items, unlocked: g.unlocked, best: {}, cleared: [], run: { dungeonId: 'sinnoh-field', floor: 2, seed: 5, faintedLast: [], loot: { evoStone: 0, candy: [] } } };
  st.setItem(SAVE_KEY, JSON.stringify(v3));
  const back = loadGame(st);
  assert.equal(back.version, 8);
  assert.equal(back.coins, 0);
  assert.deepEqual(back.shards, {});
  assert.deepEqual(back.sortie, ['chimchar', 'piplup', 'turtwig', 'shinx']);
  assert.equal(back.run.loot.coins, 0);
});

test('cleanSortie fixes broken lists', () => {
  const party = newGame().party;
  assert.deepEqual(cleanSortie(['ditto', 'missingno', 'chimchar', 'chimchar', 'piplup', 'turtwig', 'shinx'], party), ['chimchar', 'piplup', 'turtwig', 'shinx']);
  assert.deepEqual(cleanSortie([], party), ['chimchar', 'piplup', 'turtwig', 'shinx']);
  assert.deepEqual(cleanSortie('nope', party), ['chimchar', 'piplup', 'turtwig', 'shinx']);
  assert.deepEqual(cleanSortie(['shinx'], party), ['shinx']);
});

test('v4 → v5: every member gets an ability slot that fits its species', () => {
  const st = memStore();
  const g = newGame();
  const v4 = { ...g, version: 4, party: g.party.map(({ abilitySlot, ...m }) => m) };
  st.setItem(SAVE_KEY, JSON.stringify(v4));
  const back = loadGame(st);
  assert.equal(back.version, 8);
  for (const m of back.party) assert.ok(m.abilitySlot === 0 || m.abilitySlot === 1, m.species);
  const bad = { ...g, version: 5, party: g.party.map((m) => ({ ...m, abilitySlot: 7 })) };
  st.setItem(SAVE_KEY, JSON.stringify(bad));
  for (const m of loadGame(st).party) assert.equal(m.abilitySlot, 0);
});

test('v5 → v6: every member locked, slots kept; bad unlock flags cleaned', () => {
  const st = memStore();
  const g = newGame();
  g.party.push({ species: 'geodude', level: 5, exp: 135, moves: ['tackle'], abilitySlot: 1 });
  const v5 = { ...g, version: 5, party: g.party.map(({ abilityUnlocked, ...m }) => m) };
  st.setItem(SAVE_KEY, JSON.stringify(v5));
  const back = loadGame(st);
  assert.equal(back.version, 8);
  for (const m of back.party) assert.equal(m.abilityUnlocked, false, m.species);
  assert.equal(back.party.find((m) => m.species === 'geodude').abilitySlot, 1);
  const bad = { ...back, party: back.party.map((m) => ({ ...m, abilityUnlocked: m.species === 'geodude' ? 'yes' : m.species === 'shinx' })) };
  st.setItem(SAVE_KEY, JSON.stringify(bad));
  const again = loadGame(st);
  assert.equal(again.party.find((m) => m.species === 'geodude').abilityUnlocked, false);
  const geo = { ...back, party: back.party.map((m) => (m.species === 'geodude' ? { ...m, abilityUnlocked: true } : m)) };
  st.setItem(SAVE_KEY, JSON.stringify(geo));
  assert.equal(loadGame(st).party.find((m) => m.species === 'geodude').abilityUnlocked, true);
});

test('v6 → v7: ditto gets a default build, bag is empty, a run in progress keeps its loot', () => {
  const st = memStore();
  const g = newGame();
  const v6 = { ...g, version: 6, party: g.party.map(({ build, ...m }) => m), items: { evoStone: 2 },
    run: { dungeonId: 'sinnoh-field', floor: 2, seed: 5, faintedLast: [], loot: { evoStone: 1, candy: [1], coins: 40 } } };
  st.setItem(SAVE_KEY, JSON.stringify(v6));
  const back = loadGame(st);
  assert.equal(back.version, 8);
  const d = back.party.find((m) => m.species === 'ditto');
  assert.deepEqual(d.build, { types: ['normal'], bonus: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ability: 'limber' });
  assert.deepEqual(back.items, { evoStone: 2, powders: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, capsules: [] });
  assert.equal(back.run.loot.coins, 40);
  assert.deepEqual(back.run.loot.capsules, []);
  assert.deepEqual(back.run.loot.powders, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
});

test('v7 cleans a broken ditto build and bag; other members lose any build', () => {
  const st = memStore();
  const g = newGame();
  const d = g.party.find((m) => m.species === 'ditto');
  d.level = 8;
  d.build = { types: ['fire', 'fire', 'water'], bonus: { hp: 999, atk: -5, def: 'x', spa: 0, spd: 0, spe: 0 }, ability: 'nope' };
  g.party.find((m) => m.species === 'chimchar').build = { types: ['water'] };
  g.items.capsules = [{ kind: 'type', value: 'fire', from: 'charmander' }, { kind: 'type', value: 'bogus', from: 'charmander' }, { kind: 'move', value: 'transform', from: 'ditto' }, { kind: 'ability', value: 'blaze', from: 'charmander' }];
  g.items.powders = { atk: 3, hp: -2 };
  saveGame(st, g);
  const back = loadGame(st);
  const b = back.party.find((m) => m.species === 'ditto').build;
  assert.deepEqual(b.types, ['fire']); // 중복 제거, Lv.10 전 1개
  assert.ok(Object.values(b.bonus).every((v) => Number.isInteger(v) && v >= 0));
  assert.ok(Object.values(b.bonus).reduce((a, v) => a + v, 0) <= 320 - 288);
  assert.equal(b.ability, 'limber');
  assert.equal(back.party.find((m) => m.species === 'chimchar').build, undefined);
  assert.deepEqual(back.items.capsules.map((c) => c.value), ['fire', 'blaze']);
  assert.deepEqual(back.items.powders, { hp: 0, atk: 3, def: 0, spa: 0, spd: 0, spe: 0 });
});

test('v7 → v8: IVs and gender filled; ditto 31 and genderless; bad values fixed', () => {
  const st = memStore();
  const g = newGame();
  const v7 = { ...g, version: 7, party: g.party.map(({ ivs, gender, genders, ...m }) => m) };
  st.setItem(SAVE_KEY, JSON.stringify(v7));
  const back = loadGame(st);
  assert.equal(back.version, 8);
  for (const m of back.party) {
    assert.ok(Object.values(m.ivs).every((v) => Number.isInteger(v) && v >= 0 && v <= 31), m.species);
    if (m.species === 'ditto') { assert.equal(m.gender, null); assert.ok(Object.values(m.ivs).every((v) => v === 31)); }
    else { assert.ok(['male', 'female'].includes(m.gender)); assert.ok(m.genders.includes(m.gender)); }
  }
  const bad = { ...back, party: back.party.map((m) => (m.species === 'chimchar' ? { ...m, ivs: { hp: 99, atk: -1 }, gender: 'robot', genders: ['robot'] } : m)) };
  st.setItem(SAVE_KEY, JSON.stringify(bad));
  const c = loadGame(st).party.find((m) => m.species === 'chimchar');
  assert.equal(c.ivs.hp, 31);
  assert.equal(c.ivs.atk, 0);
  assert.ok(['male', 'female'].includes(c.gender));
  assert.deepEqual(c.genders, [c.gender]);
});

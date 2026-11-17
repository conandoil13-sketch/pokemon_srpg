import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELD_ITEMS, HELD_IDS, rollChestHeld } from '../src/data/heldItems.js';
import { equip, unequip } from '../src/core/heldBag.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';
import { startRun, addLoot, settleLoot } from '../src/core/run.js';
import { generateFloor, hashSeed } from '../src/core/floorgen.js';
import { dungeonById } from '../src/data/dungeons.js';
import { createBattle } from '../src/core/battle.js';

const memStore = () => { const data = {}; return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };

test('the item table has the first batch without berries', () => {
  assert.ok(HELD_IDS.length >= 45 && HELD_IDS.length <= 55, String(HELD_IDS.length));
  for (const id of HELD_IDS) { assert.ok(HELD_ITEMS[id].name, id); assert.ok(HELD_ITEMS[id].desc, id); }
  assert.ok(!HELD_IDS.some((id) => id.endsWith('-berry')));
});

test('save keeps held items and the bag, drops unknown ids', () => {
  const s = memStore(), g = newGame();
  g.party[0].held = 'leftovers'; g.items.held = { charcoal: 2, 'not-an-item': 3 };
  saveGame(s, g);
  const raw = JSON.parse(s.data['pokemon-tactics-save']); raw.party[1] && (raw.party[1].held = 'bogus'); s.data['pokemon-tactics-save'] = JSON.stringify(raw);
  const l = loadGame(s);
  assert.equal(l.party[0].held, 'leftovers'); assert.deepEqual(l.items.held, { charcoal: 2 });
  if (l.party[1]) assert.equal(l.party[1].held ?? null, null);
});

test('equip and unequip keep the bag counts right', () => {
  const g = newGame(); g.items.held = { charcoal: 1, leftovers: 1 };
  const [a, b] = g.party, ka = a.uid ?? a.species, kb = b?.uid ?? b?.species;
  assert.equal(equip(g, ka, 'charcoal'), true); assert.equal(a.held, 'charcoal'); assert.deepEqual(g.items.held, { leftovers: 1 });
  assert.equal(equip(g, ka, 'leftovers'), true); assert.equal(a.held, 'leftovers'); assert.deepEqual(g.items.held, { charcoal: 1 });
  if (b) { assert.equal(equip(g, kb, 'leftovers'), false); assert.equal(equip(g, kb, 'charcoal'), true); assert.deepEqual(g.items.held, {}); }
  assert.equal(unequip(g, ka), true); assert.equal(a.held, null); assert.equal(g.items.held.leftovers, 1);
  assert.equal(unequip(g, ka), false);
});

test('held loot is banked only when settled', () => {
  const g = newGame(), run = startRun('sinnoh-field', 1);
  addLoot(run, 'held-leftovers', 1); addLoot(run, 'held-leftovers', 2);
  settleLoot(g, run);
  assert.equal(g.items.held.leftovers, 2);
});

test('chests sometimes hold items, deterministically', () => {
  const d = dungeonById('sinnoh-field');
  let held = 0, all = 0;
  for (let seed = 1; seed <= 80; seed++) for (let f = 1; f <= 3; f++) {
    const m = generateFloor(d, f, seed);
    assert.deepEqual(generateFloor(d, f, seed).chests, m.chests);
    for (const c of m.chests) { all++; if (c.held) { held++; assert.ok(HELD_ITEMS[c.held]); } }
  }
  assert.ok(held / all > 0.08 && held / all < 0.35, `${held}/${all}`);
  assert.equal(rollChestHeld(hashSeed(5, 3000)), rollChestHeld(hashSeed(5, 3000)));
});

test('party held items reach battle units; enemies hold nothing', () => {
  const g = newGame(); g.party[0].held = 'leftovers';
  const m = generateFloor(dungeonById('sinnoh-field'), 1, 3);
  const s = createBattle(m, g.party);
  assert.equal(s.units.find((u) => u.side === 'ally').held, 'leftovers');
  assert.ok(s.units.filter((u) => u.side === 'enemy').every((u) => u.held === null));
});

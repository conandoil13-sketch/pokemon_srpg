import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';
import { SPECIES } from '../src/data/species.js';
import { generateFloor } from '../src/core/floorgen.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

const IC = DUNGEONS.find((d) => d.id === 'ice-cave');

test('ice cave is 8-1 next to the volcano; the power plant opens it', () => {
  const s8 = DUNGEONS.filter((d) => d.stage === 8);
  assert.deepEqual(s8.map((d) => [d.id, d.branch, d.unlock]), [['ice-cave', 1, 'power-plant'], ['volcano', 2, 'desert']]);
  assert.equal(IC.name, '얼음동굴'); assert.equal(IC.theme, 'ice'); assert.ok(IC.ice);
  assert.deepEqual(IC.baseLevel, s8[1].baseLevel); assert.equal(IC.floors, 9);
  assert.deepEqual(IC.weather, [{ id: 'hail', chance: 0.4 }]);
  assert.deepEqual(IC.piles, [2, 4]);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 9).unlock, ['ice-cave', 'volcano']);
});

test('ice cave: mostly ice types, water second', () => {
  const n = { ice: 0, water: 0, all: 0 };
  for (let seed = 1; seed <= 40; seed++) for (let f = 1; f < IC.floors; f++) for (const e of generateFloor(IC, f, seed).enemies) {
    const t = SPECIES[e.species].types; n.all++;
    if (t.includes('ice')) n.ice++; else if (t.includes('water')) n.water++;
  }
  assert.ok(n.ice / n.all >= 0.45, `ice ${n.ice}/${n.all}`);
  assert.ok(n.water > n.all - n.ice - n.water, `water ${n.water}`);
  assert.ok(encounterPool(IC, 1).includes('snorunt'));
});

test('ice cave: saves on the old 8-1 placeholder move to the ice cave', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'trial-6']; raw.cleared = ['trial-6']; raw.best = { 'trial-6': 5 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const g = loadGame(store);
  assert.ok(g.unlocked.includes('ice-cave') && g.cleared.includes('ice-cave')); assert.equal(g.best['ice-cave'], 5);
});

import { reachable } from '../src/core/pathfind.js';
test('ice floors: 50-60% of the open floor is ice, 3-6 icicles, start columns clear, everything reachable by sliding, deterministic', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const f = 1 + (seed % IC.floors), m = generateFloor(IC, f, seed), T = m.tiles, W = T[0].length, H = T.length;
    let ice = 0, open = 0, ici = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = T[y][x];
      if (x < 3) assert.ok(!'_Y'.includes(c), `seed ${seed}: start columns`);
      if (c === '_') ice++; if (c === 'Y') ici++;
      if (x >= 3 && '._'.includes(c)) open++;
    }
    assert.ok(ice / open >= 0.45 && ice / open <= 0.65, `seed ${seed}: ice ${ice}/${open}`);
    assert.ok(ici >= 3 && ici <= 6, `seed ${seed}: icicles ${ici}`);
    const s = m.allySlots[0], walker = { id: 'w', species: 'bidoof', side: 'ally', x: s.x, y: s.y, hp: 1 };
    const r = reachable(T, [], walker, Infinity);
    const at = (p) => r.has(`${p.x},${p.y}`);
    if (m.stairs) assert.ok(at(m.stairs), `seed ${seed}: stairs`);
    for (const c of m.chests) assert.ok(at(c), `seed ${seed}: chest`);
    for (const p of m.piles) assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at({ x: p.x + dx, y: p.y + dy })), `seed ${seed}: pile`);
    for (const a of m.allySlots) assert.ok(at(a), `seed ${seed}: ally slot`);
  }
  assert.deepEqual(generateFloor(IC, 3, 9).tiles, generateFloor(IC, 3, 9).tiles);
  assert.ok(!generateFloor(DUNGEONS[0], 1, 1).tiles.some((r) => /[_Y]/.test(r)));
});

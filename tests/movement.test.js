import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movementFor, SPECIES } from '../src/data/species.js';
import { moveBudget } from '../src/core/status.js';
import { makeUnit } from '../src/core/battle.js';

test('movement is 2-8 from base speed in 20-point steps; flying +1 up to 8', () => {
  const n = ['normal'];
  assert.deepEqual([29, 30, 49, 50, 69, 70, 89, 90, 109, 110, 129, 130, 160].map((v) => movementFor(n, v)), [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
  assert.equal(movementFor(['flying'], 109), 7); assert.equal(movementFor(['flying'], 110), 8); assert.equal(movementFor(['flying'], 160), 8);
  assert.equal(SPECIES.shuckle.move, 2); assert.equal(SPECIES.ninjask.move, 8);
});

test('ditto moves by its build: speed powders and a flying build type count', () => {
  const plain = makeUnit({ species: 'ditto', side: 'ally', x: 0, y: 0, level: 20 });
  assert.equal(moveBudget(plain), 3); // 48
  const fast = makeUnit({ species: 'ditto', side: 'ally', x: 0, y: 0, level: 20, base: { ...SPECIES.ditto.base, spe: 75 } });
  assert.equal(moveBudget(fast), 5);
  const bird = makeUnit({ species: 'ditto', side: 'ally', x: 0, y: 0, level: 20, base: { ...SPECIES.ditto.base, spe: 75 }, types: ['normal', 'flying'] });
  assert.equal(moveBudget(bird), 6);
});

import { generateFloor, reachableFrom } from '../src/core/floorgen.js';
import { dungeonById } from '../src/data/dungeons.js';
test('later trials get wider maps that still generate cleanly', () => {
  const size = (id, f = 1, s = 1) => { const m = generateFloor(dungeonById(id), f, s); return [m.tiles[0].length, m.tiles.length]; };
  assert.deepEqual(size('sinnoh-field'), [16, 12]); assert.deepEqual(size('city'), [16, 12]);
  assert.deepEqual(size('deep-cave'), [18, 13]); assert.deepEqual(size('trial-8'), [20, 14]);
  for (const id of ['deep-cave', 'trial-8']) {
    const d = dungeonById(id);
    for (let seed = 1; seed <= 3; seed++) for (let f = 1; f <= d.floors; f++) {
      const m = generateFloor(d, f, seed);
      assert.ok(m.tiles.every((r) => r.length === m.tiles[0].length));
      const reach = reachableFrom(m.tiles, { x: 1, y: Math.floor(m.tiles.length / 2) });
      m.tiles.forEach((row, y) => [...row].forEach((c, x) => { if ('."^>'.includes(c)) assert.ok(reach.has(`${x},${y}`), `${id} f${f} s${seed}`); }));
      assert.ok(m.enemies.length >= 1); assert.ok(m.allySlots.every((a) => a.x <= 2));
      if (f === d.floors) assert.ok(m.enemies.some((e) => e.boss)); else assert.ok(m.stairs);
    }
  }
});

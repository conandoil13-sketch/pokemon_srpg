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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFloor, hashSeed, reachableFrom } from '../src/core/floorgen.js';
import { DUNGEONS, dungeonById } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';

const field = dungeonById('sinnoh-field');
const cave = dungeonById('sinnoh-cave');
const key = (p) => `${p.x},${p.y}`;

test('dungeon table', () => {
  assert.deepEqual(DUNGEONS.map((d) => [d.id, d.floors, d.unlock]), [['sinnoh-field', 5, null], ['sinnoh-cave', 7, 'sinnoh-field']]);
  assert.equal(field.level(1), 8);
  assert.equal(field.count(1), 4);
  assert.equal(field.count(5), 6);
  assert.equal(cave.level(7), 19);
});

test('deterministic per seed, varied across seeds', () => {
  assert.deepEqual(generateFloor(field, 2, 123), generateFloor(field, 2, 123));
  const set = new Set(Array.from({ length: 10 }, (_, i) => generateFloor(field, 2, i + 1).tiles.join('')));
  assert.ok(set.size >= 9, `only ${set.size} distinct maps`);
  assert.notEqual(hashSeed(1, 1), hashSeed(1, 2));
});

test('property check: 300 seeds × first/boss floors of both dungeons', () => {
  for (const [d, f] of [[field, 1], [field, 5], [cave, 1], [cave, 7]]) {
    const isBoss = f === d.floors;
    for (let seed = 1; seed <= 300; seed++) {
      const m = generateFloor(d, f, seed);
      const tag = `${d.id} F${f} seed ${seed}`;
      assert.equal(m.tiles.length, 12, tag);
      for (const row of m.tiles) assert.match(row, /^[."^~#>]{16}$/, tag);
      const reach = reachableFrom(m.tiles, m.allySlots[0]);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
        if ('."^>'.includes(m.tiles[y][x])) assert.ok(reach.has(`${x},${y}`), `${tag}: (${x},${y}) unreachable`);
      }
      assert.equal(m.allySlots.length, 5, tag);
      for (const s of m.allySlots) assert.ok(s.x <= 2 && reach.has(key(s)), tag);
      for (const e of m.enemies) assert.ok(e.x >= 8 && reach.has(key(e)), tag);
      for (const c of m.chests) assert.ok(reach.has(key(c)) && ['evoStone', 'candy'].includes(c.item), tag);
      assert.ok(m.chests.length <= 2, tag);
      const spots = [...m.allySlots, ...m.enemies, ...m.chests, ...(m.stairs ? [m.stairs] : [])].map(key);
      assert.equal(new Set(spots).size, spots.length, `${tag}: overlapping positions`);
      const bosses = m.enemies.filter((e) => e.boss);
      const normal = m.enemies.filter((e) => !e.boss);
      assert.equal(normal.length, d.count(f), tag);
      for (const e of normal) {
        assert.equal(e.level, d.level(f), tag);
        assert.ok(encounterPool(d, f).includes(e.species), `${tag}: ${e.species}`);
      }
      if (isBoss) {
        assert.equal(m.stairs, null, tag);
        assert.equal(bosses.length, 1, tag);
        assert.ok(encounterPool(d, f, { boss: true }).includes(bosses[0].species), tag);
        assert.equal(bosses[0].level, d.level(f) + d.boss.levelBonus);
      } else {
        assert.ok(m.stairs, tag);
        assert.equal(m.tiles[m.stairs.y][m.stairs.x], '>', tag);
        assert.equal(bosses.length, 0, tag);
      }
    }
  }
});

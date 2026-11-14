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
  assert.deepEqual(field.baseLevel, [6, 7, 9, 10, 12]);
  assert.deepEqual(cave.baseLevel, [13, 14, 15, 16, 17, 18, 19]);
});

test('deterministic per seed, varied across seeds', () => {
  assert.deepEqual(generateFloor(field, 2, 123), generateFloor(field, 2, 123));
  const set = new Set(Array.from({ length: 10 }, (_, i) => generateFloor(field, 2, i + 1).tiles.join('')));
  assert.ok(set.size >= 9, `only ${set.size} distinct maps`);
  assert.notEqual(hashSeed(1, 1), hashSeed(1, 2));
});

test('property check: 300 seeds × first/boss floors of both dungeons', () => {
  const seenItems = new Set();
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
      for (const c of m.chests) { assert.ok(reach.has(key(c)) && (['evoStone', 'candy', 'coins'].includes(c.item) || /^powder-(hp|atk|def|spa|spd|spe)$/.test(c.item)), tag); seenItems.add(c.item); }
      assert.ok(m.chests.length <= 2, tag);
      const spots = [...m.allySlots, ...m.enemies, ...m.chests, ...(m.stairs ? [m.stairs] : [])].map(key);
      assert.equal(new Set(spots).size, spots.length, `${tag}: overlapping positions`);
      const bosses = m.enemies.filter((e) => e.boss);
      const normal = m.enemies.filter((e) => !e.boss);
      assert.ok(normal.length >= 1, tag); // 마릿수는 위협도 예산 (difficulty.test.js)
      for (const e of normal) {
        assert.ok(Math.abs(e.level - d.baseLevel[f - 1]) <= 2, tag);
        assert.ok(encounterPool(d, f).includes(e.species), `${tag}: ${e.species}`);
      }
      if (isBoss) {
        assert.equal(m.stairs, null, tag);
        assert.equal(bosses.length, 1, tag);
        assert.ok(encounterPool(d, f, { boss: true }).includes(bosses[0].species), tag);
        assert.equal(bosses[0].level, d.baseLevel[f - 1] + d.boss.levelBonus);
      } else {
        assert.ok(m.stairs, tag);
        assert.equal(m.tiles[m.stairs.y][m.stairs.x], '>', tag);
        assert.equal(bosses.length, 0, tag);
      }
    }
  }
  assert.deepEqual([...seenItems].map((i) => (i.startsWith('powder-') ? 'powder' : i)).filter((v, i, a) => a.indexOf(v) === i).sort(), ['candy', 'coins', 'evoStone', 'powder']);
});

// 파우더 도입 전 상자 (x, y, 아이템 첫 글자: e 진화의돌 · c 사탕 · c(oins) 코인 — 사탕 일부가 파우더가 될 수 있음)
const CHEST_SNAPSHOT = [["sinnoh-field",1,1,"2,0,c"],["sinnoh-field",2,1,"2,0,c"],["sinnoh-field",1,7,"11,1,c,0,1,e"],["sinnoh-field",2,7,"11,1,c,0,1,e"],["sinnoh-field",1,42,"4,8,c"],["sinnoh-field",2,42,"4,8,c"],["sinnoh-field",3,42,"4,1,c"],["sinnoh-field",1,99,"3,4,c"],["sinnoh-field",2,99,"3,4,c"],["sinnoh-field",3,99,"8,6,c"],["sinnoh-field",1,1234,"13,2,c,6,4,c"],["sinnoh-field",2,1234,"13,2,c,6,4,c"],["sinnoh-cave",1,1,"13,8,c"],["sinnoh-cave",2,1,"13,8,c"],["sinnoh-cave",3,1,"7,10,c"],["sinnoh-cave",3,42,"15,4,c"],["sinnoh-cave",1,99,"9,0,c"],["sinnoh-cave",2,99,"9,0,c"],["sinnoh-cave",1,1234,"0,2,c,8,5,e"],["sinnoh-cave",2,1234,"0,2,c,8,5,e"]];

test('powders in chests: same seeds keep chest spots and counts; only some candy became powder', () => {
  for (const [id, floor, seed, flat] of CHEST_SNAPSHOT) {
    const m = generateFloor(dungeonById(id), floor, seed);
    const old = flat.split(',');
    assert.equal(m.chests.length * 3, old.length, `${id} ${floor} ${seed}`);
    m.chests.forEach((c, i) => {
      assert.deepEqual([c.x, c.y], [Number(old[i * 3]), Number(old[i * 3 + 1])]);
      if (c.item.startsWith('powder-')) assert.equal(old[i * 3 + 2], 'c'); // 사탕 몫에서
    });
  }
  let n = 0, powders = 0;
  for (let seed = 1; seed <= 1500; seed++) for (const c of generateFloor(DUNGEONS[0], 2, seed).chests) { n++; if (c.item.startsWith('powder-')) powders++; }
  assert.ok(Math.abs(powders / n - 0.1) <= 0.03, `${powders}/${n}`);
});

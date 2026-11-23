// 이상한사탕 이스터에그 (2026-11-23): 마을 소품 셋에서 찾기 · 가방에서 쓰기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTown } from '../src/game/town.js';
import { createBag } from '../src/game/bag.js';
import { TOWN, CANDY_SPOTS } from '../src/data/town.js';
import { findCandy, candyExp } from '../src/core/candy.js';
import { newGame } from '../src/core/save.js';
import { deployed } from '../src/core/roster.js';
import { SPECIES } from '../src/data/species.js';
import { expForLevel } from '../src/core/stats.js';

const inB = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
const ahead = (s) => ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] })[s.facing];

test('three candy spots face the woodpile, the egg basket and the request lot crates', () => {
  assert.deepEqual(CANDY_SPOTS.map((s) => s.id), ['woodpile', 'basket', 'crates']);
  const into = { woodpile: 'team', basket: 'gacha', crates: 'lot-request' };
  for (const s of CANDY_SPOTS) {
    const [dx, dy] = ahead(s), b = TOWN.buildings.find((x) => x.id === into[s.id]);
    assert.ok(inB(b, s.x + dx, s.y + dy), `${s.id} faces ${b.id}`);
    assert.ok(!TOWN.buildings.some((x) => inB(x, s.x, s.y)), `${s.id} stands outside buildings`);
    assert.ok(!TOWN.tiles[s.y][s.x].match(/[#~]/) && !TOWN.objects.some((o) => o.x === s.x && o.y === s.y) && !TOWN.npcSpots.some((o) => o.x === s.x && o.y === s.y));
  }
});

test('examining a candy spot calls onCandy with its id and shows the find; again shows nothing', () => {
  const found = new Set();
  const onCandy = (id) => (found.has(id) ? 0 : (found.add(id), found.size));
  for (const s of CANDY_SPOTS) {
    const town = createTown({ onSortie() {}, onCandy });
    town.player.x = s.x; town.player.y = s.y; town.player.facing = s.facing;
    town.handle({ type: 'confirm' });
    assert.ok(town.message.lines.includes('이상한사탕을 손에 넣었다!'), s.id);
    assert.equal(town.message.lines.includes('이상한사탕을 전부 찾았다!'), s.id === 'crates');
    for (let i = 0; i < 5 && town.message; i++) town.handle({ type: 'confirm' });
    assert.equal(town.message, null);
    town.handle({ type: 'confirm' });
    assert.deepEqual(town.message.lines, ['아무것도 없다.']);
  }
  // 옆을 보면 아무 일 없음
  const town = createTown({ onSortie() {}, onCandy() { throw new Error('should not call'); } });
  town.player.x = CANDY_SPOTS[0].x; town.player.y = CANDY_SPOTS[0].y; town.player.facing = 'down';
  town.handle({ type: 'confirm' });
});

test('findCandy pays one rare candy per spot per save and counts how many are found', () => {
  const g = newGame();
  assert.equal(findCandy(g, 'woodpile'), 1);
  assert.equal(findCandy(g, 'woodpile'), 0);
  assert.equal(findCandy(g, 'basket'), 2);
  assert.equal(findCandy(g, 'crates'), 3);
  assert.equal(g.items.rareCandy, 3);
  assert.deepEqual(g.eggs.candies, ['woodpile', 'basket', 'crates']);
});

test('candyExp is exactly what the member needs to reach the next level', () => {
  const m = newGame().party[0];
  m.exp += 3;
  assert.equal(m.exp + candyExp(m), expForLevel(SPECIES[m.species].growth, m.level + 1));
});

test('bag: rare candy is used on a deployed member below the cap; at the cap it is refused and kept', () => {
  const g = newGame(); g.items.rareCandy = 2;
  const used = [];
  let saves = 0;
  const lead = deployed(g)[0];
  const b = createBag({ game: g, levelCap: lead.level + 1, onSave: () => { saves++; }, onBack() {}, onCandy: (m) => used.push(m) });
  b.handle({ type: 'dir', dx: 1, dy: 0 });
  const k = b.rows.findIndex((r) => r.act === 'candy');
  assert.ok(k >= 0 && b.rows[k].count === 2 && b.rows[k].label === '이상한사탕');
  for (let i = 0; i < k; i++) b.handle({ type: 'dir', dx: 0, dy: 1 });
  b.handle({ type: 'confirm' });
  assert.equal(b.mode, 'pick');
  b.handle({ type: 'confirm' }); // 첫 출전 멤버
  assert.deepEqual(used, [lead]);
  assert.equal(g.items.rareCandy, 1);
  assert.equal(saves, 1);
  // 상한에 닿음
  lead.level += 1;
  const b2 = createBag({ game: g, levelCap: lead.level, onSave() {}, onBack() {}, onCandy: (m) => used.push(m) });
  b2.handle({ type: 'dir', dx: 1, dy: 0 });
  for (let i = 0; i < b2.rows.findIndex((r) => r.act === 'candy'); i++) b2.handle({ type: 'dir', dx: 0, dy: 1 });
  b2.handle({ type: 'confirm' }); b2.handle({ type: 'confirm' });
  assert.equal(used.length, 1);
  assert.equal(g.items.rareCandy, 1);
  assert.ok(b2.message.join(' ').includes('더 이상 강해질 수 없다'));
});

test('rare candies and the found spots survive saving and loading', async () => {
  const { saveGame, loadGame } = await import('../src/core/save.js');
  const g = newGame();
  findCandy(g, 'basket'); findCandy(g, 'woodpile');
  const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  saveGame(storage, g);
  const back = loadGame(storage);
  assert.equal(back.items.rareCandy, 2);
  assert.deepEqual(back.eggs.candies, ['basket', 'woodpile']);
  assert.equal(findCandy(back, 'basket'), 0);
});

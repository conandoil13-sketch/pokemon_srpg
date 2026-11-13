import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTown } from '../src/game/town.js';
import { createDungeonSelect } from '../src/game/dungeonSelect.js';
import { createFloorMenu } from '../src/game/floorMenu.js';
import { CHOICE_LOCK } from '../src/game/learnFlow.js';
import { newGame } from '../src/core/save.js';
import { startRun } from '../src/core/run.js';
import { createGame } from '../src/game/states.js';
import { TOWN } from '../src/data/town.js';
import { MAP } from '../src/data/map.js';
import { createRng } from '../src/core/rng.js';

const tick = (scene, sec) => { for (let t = 0; t < sec; t += 0.02) scene.update(0.02); };

test('town map is a closed rectangle and objects stand on walkable tiles', () => {
  const w = TOWN.tiles[0].length;
  for (const row of TOWN.tiles) assert.equal(row.length, w);
  assert.match(TOWN.tiles[0], /^#+$/);
  for (const o of TOWN.objects) assert.ok(!'#^~'.includes(TOWN.tiles[o.y][o.x]), `${o.id} on blocked tile`);
  assert.ok(TOWN.objects.some((o) => o.action === 'sortie'));
});

test('walking: one tile per press, blocked by walls and objects', () => {
  const town = createTown({ onSortie() {} });
  const { x, y } = town.player;
  town.handle({ type: 'dir', dx: 0, dy: -1 });
  town.handle({ type: 'release', dx: 0, dy: -1 });
  tick(town, 0.5);
  assert.deepEqual([town.player.x, town.player.y], [x, y - 1]);
  // 출격 게시판 바로 아래에서 위로 가면 막힌다
  const board = TOWN.objects.find((o) => o.action === 'sortie');
  town.player.x = board.x; town.player.y = board.y + 1;
  town.handle({ type: 'dir', dx: 0, dy: -1 });
  town.handle({ type: 'release', dx: 0, dy: -1 });
  tick(town, 0.5);
  assert.deepEqual([town.player.x, town.player.y], [board.x, board.y + 1]);
});

test('confirm facing the sortie board calls onSortie; other signs show a message', () => {
  let sortie = 0;
  const town = createTown({ onSortie() { sortie++; } });
  const board = TOWN.objects.find((o) => o.action === 'sortie');
  town.player.x = board.x; town.player.y = board.y + 1; town.player.facing = 'up';
  town.handle({ type: 'confirm' });
  tick(town, 0.1);
  town.handle({ type: 'confirm' }); // 안내 대사 넘김 → 출격
  assert.equal(sortie, 1);

  const sign = TOWN.objects.find((o) => o.action === 'gacha');
  town.player.x = sign.x; town.player.y = sign.y + 1; town.player.facing = 'up';
  town.handle({ type: 'confirm' });
  assert.ok(town.message, 'shows a message');
  town.handle({ type: 'confirm' });
  assert.equal(town.message, null);
});

test('dungeon select: locked cave cannot be picked until unlocked', () => {
  const game = newGame();
  const started = [];
  const sel = createDungeonSelect({ game, onStart: (id) => started.push(id), onResume() {}, onBack() {} });
  sel.handle({ type: 'dir', dx: 0, dy: 1 }); sel.handle({ type: 'confirm' });
  assert.deepEqual(started, [], 'cave locked');
  game.unlocked.push('sinnoh-cave');
  const sel2 = createDungeonSelect({ game, onStart: (id) => started.push(id), onResume() {}, onBack() {} });
  sel2.handle({ type: 'dir', dx: 0, dy: 1 }); sel2.handle({ type: 'confirm' });
  assert.deepEqual(started, ['sinnoh-cave']);
});

test('dungeon select: active run shows resume first; other dungeon asks before abandoning (default 아니요)', () => {
  const game = newGame();
  game.run = { ...startRun('sinnoh-field', 9), floor: 3 };
  let resumed = 0;
  const started = [];
  const sel = createDungeonSelect({ game, onStart: (id) => started.push(id), onResume: () => resumed++, onBack() {} });
  sel.handle({ type: 'confirm' });
  assert.equal(resumed, 1);
  sel.handle({ type: 'dir', dx: 0, dy: 1 }); // 신오 들판
  sel.handle({ type: 'confirm' });
  assert.equal(sel.confirming, true);
  for (let i = 0; i < 20; i++) { sel.update(0.1); sel.handle({ type: 'confirm' }); }
  assert.deepEqual(started, [], 'mashing keeps the run');
  if (!sel.confirming) sel.handle({ type: 'confirm' });
  assert.equal(sel.confirming, true);
  sel.update(CHOICE_LOCK + 0.1);
  sel.handle({ type: 'dir', dx: 0, dy: -1 }); // 예
  sel.handle({ type: 'confirm' });
  assert.deepEqual(started, ['sinnoh-field']);
});

test('floor menu: lock ignores mashing, then pick', () => {
  const picks = [];
  const m = createFloorMenu({ lines: ['1층 돌파!'], options: ['다음 층으로', '마을로 돌아가기'], onPick: (i) => picks.push(i) });
  for (let i = 0; i < 5; i++) m.handle({ type: 'confirm' });
  assert.deepEqual(picks, []);
  m.update(CHOICE_LOCK + 0.05);
  m.handle({ type: 'dir', dx: 0, dy: 1 }); m.handle({ type: 'confirm' });
  assert.deepEqual(picks, [1]);
  m.handle({ type: 'confirm' });
  assert.deepEqual(picks, [1], 'only once');
});

test('battle starts without a title and exits to the lobby with the result', () => {
  const exits = [];
  const game = createGame({ rng: createRng(3), map: MAP, onExit: (r) => exits.push(r) });
  assert.equal(game.mode, 'banner');
  tick(game, 2);
  assert.equal(game.mode, 'idle');
  const s = game.state;
  s.units = s.units.filter((u) => u.side === 'ally' || u.id === 'enemy-riolu');
  const L = s.units.find((u) => u.id === 'enemy-riolu');
  L.x = 3; L.y = 5; L.hp = 1;
  s.units.find((u) => u.id === 'ally-chimchar').moves = ['scratch']; // 첫 기술 = 공격기
  const at = (x, y) => [{ type: 'cursor', px: x * 24 + 12, py: y * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...at(2, 5), ...at(2, 5)]) game.handle(e);
  tick(game, 0.5);
  assert.equal(game.mode, 'action');
  game.handle({ type: 'confirm' });
  game.handle({ type: 'confirm' });
  for (let i = 0; i < 300 && game.mode !== 'result'; i++) { game.update(0.05); game.handle({ type: 'confirm' }); }
  assert.equal(game.mode, 'result');
  game.handle({ type: 'confirm' }); // 잠금 중엔 무시
  assert.deepEqual(exits, []);
  tick(game, 1);
  game.handle({ type: 'confirm' });
  assert.deepEqual(exits, ['win']);
});

test('clicking an object walks next to it and examines it', () => {
  let sortie = 0;
  const town = createTown({ onSortie() { sortie++; } });
  town.update(0.02); // 카메라 위치 계산
  const board = TOWN.objects.find((o) => o.action === 'sortie');
  // 화면 좌표 = 월드 - 카메라. 카메라는 플레이어 중심(맵 경계로 고정)
  const cam = { x: Math.max(0, Math.min(20 * 24 - 256, town.playerWorld().x + 12 - 128)), y: Math.max(0, Math.min(14 * 24 - 192, town.playerWorld().y + 12 - 96)) };
  town.handle({ type: 'click', px: board.x * 24 + 12 - Math.round(cam.x), py: board.y * 24 + 12 - Math.round(cam.y) });
  tick(town, 2);
  assert.ok(town.message, 'reached the board and opened its message');
  assert.equal(Math.abs(town.player.x - board.x) + Math.abs(town.player.y - board.y), 1);
  town.handle({ type: 'confirm' });
  assert.equal(sortie, 1);
});

test('party office sign opens the party screen; leader is the first party member', () => {
  let opened = 0;
  const town = createTown({ onSortie() {}, onParty() { opened++; }, leader: 'piplup' });
  assert.equal(town.leader, 'piplup');
  const sign = TOWN.objects.find((o) => o.action === 'party');
  assert.ok(sign, 'party sign exists');
  town.player.x = sign.x; town.player.y = sign.y + 1; town.player.facing = 'up';
  town.handle({ type: 'confirm' });
  town.handle({ type: 'confirm' });
  assert.equal(opened, 1);
});

test('floor menu sits at the bottom right and clicks on its rows count', async () => {
  const { W, H } = await import('../src/render/screen.js');
  const picks = [];
  const m = createFloorMenu({ lines: ['x'], options: ['다음 층으로', '마을로 돌아가기'], onPick: (i) => picks.push(i) });
  m.update(CHOICE_LOCK + 0.05);
  m.handle({ type: 'click', px: 10, py: 10 }); // 왼쪽 위: 메뉴 아님
  assert.deepEqual(picks, []);
  const menuH = 2 * 16 + 8;
  m.handle({ type: 'click', px: W - 60, py: H - 54 - menuH + 4 + 16 + 8 }); // 두 번째 줄
  assert.deepEqual(picks, [1]);
});

test('town NPCs are the party companions (everyone but the leader)', () => {
  const town = createTown({ onSortie() {}, leader: 'ditto', companions: ['chimchar', 'piplup', 'turtwig', 'shinx'] });
  const npcs = town.objects.filter((o) => o.kind === 'npc');
  assert.deepEqual(npcs.map((o) => o.species), ['chimchar', 'piplup', 'turtwig', 'shinx']);
  for (const o of npcs) assert.ok(!'#^~'.includes(TOWN.tiles[o.y][o.x]), `${o.species} on blocked tile`);
  assert.ok(TOWN.npcSpots.length >= 6, 'room for more companions');
  // 동료가 없으면 NPC 도 없음
  assert.equal(createTown({ onSortie() {}, companions: [] }).objects.filter((o) => o.kind === 'npc').length, 0);
});

test('party office: sortie screen toggles members and explains refusals', async () => {
  const { createParty } = await import('../src/game/party.js');
  const { newMember } = await import('../src/core/progress.js');
  const game = newGame();
  game.party.push(newMember('pidgey', 8));
  const p = createParty({ game, onBack() {}, onEvolve() {} });
  p.handle({ type: 'confirm' });               // 출전 멤버 바꾸기
  assert.equal(p.mode, 'sortie');
  for (let i = 0; i < 4; i++) p.handle({ type: 'dir', dx: 0, dy: 1 }); // pidgey (5번째 동료)
  p.handle({ type: 'confirm' });
  assert.equal(p.mode, 'msg');                 // 꽉 찼다
  p.handle({ type: 'confirm' });
  assert.equal(p.mode, 'sortie');
  p.handle({ type: 'dir', dx: 0, dy: -1 });     // shinx
  p.handle({ type: 'confirm' });               // 빼기
  p.handle({ type: 'dir', dx: 0, dy: 1 });      // pidgey
  p.handle({ type: 'confirm' });               // 넣기
  assert.deepEqual(game.sortie, ['chimchar', 'piplup', 'turtwig', 'pidgey']);
});

test('recruit office sign opens the gacha; mashing after a pull never double-spends', async () => {
  let opened = 0;
  const town = createTown({ onSortie() {}, onGacha() { opened++; } });
  const sign = TOWN.objects.find((o) => o.action === 'gacha');
  assert.ok(sign);
  town.player.x = sign.x; town.player.y = sign.y + 1; town.player.facing = 'up';
  town.handle({ type: 'confirm' }); town.handle({ type: 'confirm' });
  assert.equal(opened, 1);

  const { createGachaScene } = await import('../src/game/gacha.js');
  const game = newGame();
  game.coins = 150;
  let pulled = 0;
  const g = createGachaScene({ game, rng: createRng(3), onBack() {}, onPulled() { pulled++; } });
  const before = game.party.length + Object.values(game.shards).reduce((a, b) => a + b, 0);
  for (let i = 0; i < 60; i++) { g.update(0.1); g.handle({ type: 'confirm' }); }
  const after = game.party.length + Object.values(game.shards).reduce((a, b) => a + b, 0);
  assert.equal(game.coins, 50);
  assert.equal(after - before, 1);
  assert.equal(pulled, 1);
});

test('easter egg: talking to Turtwig 5 times gives 200 coins once', () => {
  let gifts = 0;
  const spot = TOWN.npcSpots[0];
  const town = createTown({ onSortie() {}, companions: ['turtwig'], onTurtwigGift() { gifts++; return true; } });
  town.player.x = spot.x; town.player.y = spot.y + 1; town.player.facing = 'up';
  for (let i = 0; i < 6; i++) { town.handle({ type: 'confirm' }); tick(town, 0.1); town.handle({ type: 'confirm' }); tick(town, 0.1); }
  assert.equal(gifts, 1);
});

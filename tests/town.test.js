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
  for (let i = 0; i < 5; i++) g.update(0.1); // 들어온 직후 입력 잠금
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

test('party office: swap ability costs 3 line shards, refuses when short', async () => {
  const { createParty } = await import('../src/game/party.js');
  const { newMember, abilityOf } = await import('../src/core/progress.js');
  const game = newGame();
  const geo = newMember('geodude', 8);
  game.party.push(geo);
  let saved = 0;
  const p = createParty({ game, onBack() {}, onEvolve() {}, onSave() { saved++; } });
  for (let i = 0; i < 2; i++) p.handle({ type: 'dir', dx: 0, dy: 1 });
  p.handle({ type: 'confirm' });               // 특성 바꾸기
  assert.equal(p.mode, 'ability');
  p.handle({ type: 'dir', dx: 0, dy: -1 });     // 그만둔다
  p.handle({ type: 'dir', dx: 0, dy: -1 });     // geodude (마지막 동료)
  p.handle({ type: 'confirm' });
  assert.equal(p.mode, 'msg');                 // 결정 부족
  assert.equal(saved, 0);
  p.handle({ type: 'confirm' });
  game.shards.geodude = 3;
  const before = abilityOf(geo);
  p.handle({ type: 'confirm' });
  assert.notEqual(abilityOf(geo), before);
  assert.equal(game.shards.geodude, 0);
  assert.equal(saved, 1);
});

const gachaSeq = (vals) => { let i = 0; return () => vals[i++] ?? 0.5; };
const mash = (g, n, ev = { type: 'confirm' }) => { for (let i = 0; i < n; i++) { g.update(0.1); g.handle(ev); } };

test('gacha: cancel while choosing keeps coins; no coins → message', async () => {
  const { createGachaScene } = await import('../src/game/gacha.js');
  const game = newGame();
  game.coins = 150;
  let pulled = 0;
  const g = createGachaScene({ game, rng: createRng(3), onBack() {}, onPulled() { pulled++; } });
  for (let i = 0; i < 5; i++) g.update(0.1); // 들어온 직후 입력 잠금
  g.handle({ type: 'confirm' });
  assert.equal(g.mode, 'choose');
  assert.ok(g.balls.length === 3 && g.balls.every((b) => b.kind === 'poke'));
  g.handle({ type: 'cancel' });
  assert.equal(g.mode, 'menu');
  assert.equal(game.coins, 150);
  assert.equal(pulled, 0);
  game.coins = 0;
  mash(g, 5, { type: 'none' });
  g.handle({ type: 'confirm' });
  assert.equal(g.mode, 'msg');
});

test('gacha: an epic ball steps poke → great → ultra → open, then the others open too', async () => {
  const { createGachaScene } = await import('../src/game/gacha.js');
  const game = newGame();
  game.coins = 100;
  const g = createGachaScene({ game, rng: gachaSeq([0.97, 0.1, 0.1, 0.1, 0.5, 0.1]), onBack() {}, onPulled() {} });
  for (let i = 0; i < 5; i++) g.update(0.1); // 들어온 직후 입력 잠금
  g.handle({ type: 'confirm' });
  g.handle({ type: 'dir', dx: -1, dy: 0 }); // 첫 번째 볼
  assert.equal(g.cursor, 0);
  mash(g, 5, { type: 'none' });
  g.handle({ type: 'confirm' });
  assert.equal(g.mode, 'open');
  assert.equal(game.coins, 0);
  const kinds = [];
  for (let i = 0; i < 3; i++) { mash(g, 3, { type: 'none' }); g.handle({ type: 'confirm' }); kinds.push(g.balls[0].opened ? 'open' : g.balls[0].kind); }
  assert.deepEqual(kinds, ['great', 'ultra', 'open']);
  mash(g, 5, { type: 'none' });
  g.handle({ type: 'confirm' });
  assert.equal(g.mode, 'others');
  mash(g, 30, { type: 'none' });
  assert.ok(g.balls.every((b) => b.opened));
  const gained = game.party.length - 5 + Object.values(game.shards).reduce((a, b) => a + b, 0);
  assert.equal(gained, 1);
});

test('gacha: ten-pull charges 900 once, opens all ten (cancel = open all), lists results', async () => {
  const { createGachaScene } = await import('../src/game/gacha.js');
  const game = newGame();
  game.coins = 900;
  let pulled = 0;
  const g = createGachaScene({ game, rng: createRng(8), onBack() {}, onPulled() { pulled++; } });
  for (let i = 0; i < 5; i++) g.update(0.1); // 들어온 직후 입력 잠금
  g.handle({ type: 'dir', dx: 0, dy: 1 });
  g.handle({ type: 'confirm' });
  assert.equal(g.mode, 'ten');
  assert.equal(game.coins, 0);
  assert.equal(g.balls.length, 10);
  g.handle({ type: 'cancel' });
  mash(g, 40, { type: 'none' });
  assert.ok(g.balls.every((b) => b.opened));
  mash(g, 30); // 연타
  assert.equal(pulled, 1);
  assert.equal(game.coins, 0);
});

test('gacha: menu cursor returns to the last menu row after a pull', async () => {
  const { createGachaScene } = await import('../src/game/gacha.js');
  const game = newGame();
  game.coins = 100;
  const g = createGachaScene({ game, rng: createRng(5), onBack() {}, onPulled() {} });
  for (let i = 0; i < 5; i++) g.update(0.1); // 들어온 직후 입력 잠금
  g.handle({ type: 'confirm' });
  g.handle({ type: 'dir', dx: 1, dy: 0 }); // 세 번째 볼
  mash(g, 30);
  assert.equal(g.mode, 'menu');
  assert.equal(g.cursor, 0); // 고른 볼 번호(2)가 아니라 1회 뽑기 줄
});

test('gacha: mashing with coins for several pulls still buys only one (single and ten)', async () => {
  const { createGachaScene } = await import('../src/game/gacha.js');
  for (const [coins, rows] of [[1000, 0], [1900, 1]]) {
    const game = newGame();
    game.coins = coins;
    let pulled = 0;
    const g = createGachaScene({ game, rng: createRng(8), onBack() {}, onPulled() { pulled++; } });
  for (let i = 0; i < 5; i++) g.update(0.1); // 들어온 직후 입력 잠금
    for (let i = 0; i < rows; i++) g.handle({ type: 'dir', dx: 0, dy: 1 });
    g.handle({ type: 'confirm' });
    if (rows) g.handle({ type: 'cancel' }); // 모두 열기
    mash(g, 200, { type: 'none' }); // 혼자 끝나는 연출
    for (let i = 0; i < 4; i++) { mash(g, 5, { type: 'none' }); g.handle({ type: 'confirm' }); } // 결과 넘기기
    for (let i = 0; i < 30; i++) g.handle({ type: 'confirm' }); // 순간 연타 (시간 안 흐름)
    assert.equal(pulled, 1, `${coins}`);
  }
});

test('gacha: clicks only act on what was clicked', async () => {
  const { createGachaScene } = await import('../src/game/gacha.js');
  const game = newGame();
  game.coins = 1000;
  const g = createGachaScene({ game, rng: createRng(8), onBack() {}, onPulled() {} });
  mash(g, 5, { type: 'none' });
  g.handle({ type: 'dir', dx: 0, dy: 1 }); // 10연속 줄
  g.handle({ type: 'click', px: 10, py: 20 }); // 메뉴 밖
  assert.equal(g.mode, 'menu');
  assert.equal(game.coins, 1000);
  g.handle({ type: 'dir', dx: 0, dy: -1 });
  g.handle({ type: 'confirm' }); // 1회 뽑기
  mash(g, 5, { type: 'none' });
  g.handle({ type: 'dir', dx: -1, dy: 0 }); // 첫 볼
  g.handle({ type: 'click', px: 200, py: 170 }); // 대사 창 → 지금 커서 볼
  assert.equal(g.mode, 'open');
  assert.equal(g.balls[0].chosen, true);
});

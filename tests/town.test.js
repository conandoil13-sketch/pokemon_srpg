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

// ---- 편성소 박스 ----
const boxScene = async (extra = 0, opts = {}) => {
  const { createBox, resetBoxMemory } = await import('../src/game/box.js');
  const { newMember } = await import('../src/core/progress.js');
  const { gachaPool } = await import('../src/core/gacha.js');
  if (!opts.keepMemory) resetBoxMemory();
  const game = opts.game ?? newGame();
  const pool = [...gachaPool().common, ...gachaPool().rare].filter((k) => !game.party.some((m) => m.species === k));
  for (let i = 0; i < extra; i++) game.party.push(newMember(pool[i], 5 + (i % 7)));
  const calls = { save: 0, evolve: [] };
  const box = createBox({ game, onBack() {}, onEvolve(m, o) { calls.evolve.push([m.species, o]); }, onSave() { calls.save++; } });
  return { box, game, calls, createBox };
};

test('box: arrows move over 31 members across two boxes, never onto empty cells', async () => {
  const { box } = await boxScene(26);
  assert.equal(box.boxCount, 2);
  for (let i = 0; i < 5; i++) box.handle({ type: 'dir', dx: 1, dy: 0 }); // 첫 줄 오른쪽 끝
  box.handle({ type: 'dir', dx: 1, dy: 0 });
  assert.equal(box.box, 1);
  for (const [dx, dy] of [[1, 0], [1, 0], [0, -1], [0, 1], [0, -1], [-1, 0]]) {
    if (box.mode === 'grid' && box.box === 1) assert.ok(box.cursorMember, `${dx},${dy}`);
    box.handle({ type: 'dir', dx, dy });
  }
  assert.ok(box.cursorMember);
});

test('box: sortie toggle from the member menu, refusals and saves', async () => {
  const { box, game, calls } = await boxScene(2);
  // 커서를 대기 동료(6번째 칸)로
  while (box.cursorMember && game.sortie.includes(box.cursorMember.uid) || box.cursorMember?.species === 'ditto') box.handle({ type: 'dir', dx: 1, dy: 0 });
  const bench = box.cursorMember.species;
  box.handle({ type: 'confirm' });
  assert.equal(box.mode, 'menu');
  box.handle({ type: 'confirm' }); // 출전에 넣기 → 꽉 참
  assert.equal(box.mode, 'msg');
  assert.deepEqual(box.message, ['출전 자리가 꽉 찼다.', '먼저 다른 동료를 빼자.']);
  assert.equal(calls.save, 0);
  box.handle({ type: 'confirm' });
  // 출전 줄에서 불꽃숭이 빼기
  for (let i = 0; i < 3 && box.mode !== 'deploy'; i++) box.handle({ type: 'dir', dx: 0, dy: 1 });
  assert.equal(box.mode, 'deploy');
  while (box.cursorMember.species !== 'chimchar') box.handle({ type: 'dir', dx: box.cursorMember.species === 'ditto' ? 1 : -1, dy: 0 });
  box.handle({ type: 'confirm' }); box.handle({ type: 'confirm' });
  assert.ok(!game.sortie.includes(game.party.find((m) => m.species === 'chimchar').uid));
  assert.equal(calls.save, 1);
  // 메타몽은 뺄 수 없음
  while (box.cursorMember.species !== 'ditto') box.handle({ type: 'dir', dx: -1, dy: 0 });
  box.handle({ type: 'confirm' }); box.handle({ type: 'confirm' });
  assert.deepEqual(box.message, ['메타몽은 항상 출전한다.']);
  assert.ok(bench);
});

test('box: S cycles sort; grid bottom row goes to the deploy row', async () => {
  const { box } = await boxScene(0);
  assert.equal(box.sort, 'joined');
  const seen = [];
  for (let i = 0; i < 3; i++) { box.handle({ type: 'sort' }); seen.push(box.sort); }
  assert.deepEqual(seen, ['level', 'dex', 'joined']);
  box.handle({ type: 'dir', dx: 0, dy: 1 });
  assert.equal(box.mode, 'deploy');
  box.handle({ type: 'dir', dx: 0, dy: -1 });
  assert.equal(box.mode, 'grid');
});

test('summary: pages cycle, up/down changes member; ability unlock then free toggle', async () => {
  const { newMember, abilityOf } = await import('../src/core/progress.js');
  const game = newGame();
  game.party.push(newMember('geodude', 8, () => 0));
  const { box, calls } = await boxScene(0, { game });
  while (box.cursorMember.species !== 'geodude') box.handle({ type: 'dir', dx: 1, dy: 0 }); // 6번째 칸
  box.handle({ type: 'confirm' });
  for (let i = 0; i < 3; i++) box.handle({ type: 'dir', dx: 0, dy: 1 }); // 특성
  box.handle({ type: 'confirm' });
  assert.equal(box.mode, 'summary');
  const sm = box.summary;
  assert.equal(sm.page, 3);
  const geo = game.party.find((m) => m.species === 'geodude');
  const pass = () => { for (let i = 0; i < 5; i++) box.update(0.1); };
  box.handle({ type: 'confirm' }); // 결정 0
  assert.equal(sm.mode, 'msg');
  assert.equal(geo.abilityUnlocked, false);
  assert.equal(calls.save, 0);
  pass(); box.handle({ type: 'confirm' });
  game.shards.geodude = 3;
  box.handle({ type: 'confirm' }); // 해금 → 바로 바뀜
  assert.equal(abilityOf(geo), 'sturdy');
  assert.equal(game.shards.geodude, 0);
  for (let i = 0; i < 6; i++) { pass(); box.handle({ type: 'confirm' }); } // 연타: 공짜 왕복만
  assert.equal(game.shards.geodude, 0);
  assert.ok(geo.abilityUnlocked);
  assert.ok(calls.save >= 2);
  pass(); if (sm.mode === 'msg') box.handle({ type: 'confirm' });
  box.handle({ type: 'dir', dx: 1, dy: 0 });
  assert.equal(sm.page, 0);
  const before = sm.member.species;
  box.handle({ type: 'dir', dx: 0, dy: 1 });
  assert.notEqual(sm.member.species, before);
  box.handle({ type: 'cancel' });
  assert.equal(box.mode, 'grid');
});

test('box: reopening after an evolution keeps sort/box and the cursor on the evolved member', async () => {
  const { evolveMember } = await import('../src/core/progress.js');
  const { box, game, createBox } = await boxScene(0);
  box.handle({ type: 'sort' }); // 레벨 순
  while (box.cursorMember.species !== 'piplup') box.handle({ type: 'dir', dx: 1, dy: 0 });
  evolveMember(game.party.find((m) => m.species === 'piplup'), 'prinplup');
  const again = createBox({ game, onBack() {}, onEvolve() {} });
  assert.equal(again.sort, 'level');
  assert.equal(again.cursorMember.species, 'prinplup');
});

test('box review fixes: S on the deploy row keeps it; ▶ click; short next row; summary returns to deploy', async () => {
  const { box } = await boxScene(5); // 10마리: 둘째 줄 4칸
  box.handle({ type: 'dir', dx: 0, dy: 1 }); // 첫 줄 → 둘째 줄
  box.handle({ type: 'dir', dx: 0, dy: 1 }); // → 출전 줄
  assert.equal(box.mode, 'deploy');
  const on = box.cursorMember.species;
  box.handle({ type: 'sort' }); box.handle({ type: 'sort' });
  assert.equal(box.mode, 'deploy');
  assert.equal(box.cursorMember.species, on);
  // 출전 줄에서 자세히 보기 → 닫으면 출전 줄
  box.handle({ type: 'confirm' });
  box.handle({ type: 'dir', dx: 0, dy: 1 }); box.handle({ type: 'confirm' });
  assert.equal(box.mode, 'summary');
  box.handle({ type: 'cancel' });
  assert.equal(box.mode, 'deploy');
  // 첫 줄 끝(6번째)에서 아래 → 둘째 줄이 짧으면 마지막 동료
  box.handle({ type: 'dir', dx: 0, dy: -1 });
  box.handle({ type: 'sort' }); // joined 로 (3번째)
  while (box.mode === 'grid' && box.cursorMember) { const before = box.cursorMember; box.handle({ type: 'dir', dx: 0, dy: -1 }); if (box.cursorMember === before) break; }
  for (let i = 0; i < 6; i++) box.handle({ type: 'dir', dx: 1, dy: 0 });
  box.handle({ type: 'dir', dx: 0, dy: 1 });
  assert.equal(box.mode, 'grid');
});

test('box: clicking the drawn ▶ goes to the next box', async () => {
  const { box } = await boxScene(26);
  box.handle({ type: 'click', px: 108 + 52, py: 6 });
  assert.equal(box.box, 1);
  box.handle({ type: 'click', px: 110, py: 6 });
  assert.equal(box.box, 0);
});

// ---- 메타몽 빌드 화면 ----
const buildScene = async (setup) => {
  const { createDittoBuild } = await import('../src/game/dittoBuild.js');
  const game = newGame();
  const d = game.party.find((m) => m.species === 'ditto');
  setup?.(game, d);
  const calls = { save: 0, closed: 0 };
  const b = createDittoBuild({ game, onSave() { calls.save++; }, onClose() { calls.closed++; } });
  const pass = () => { for (let i = 0; i < 5; i++) b.update(0.1); };
  return { b, game, d, calls, pass };
};

test('ditto build: move capsule → slot → confirm applies, consumes and saves', async () => {
  const { b, game, d, calls, pass } = await buildScene((g) => { g.items.capsules = [{ kind: 'move', value: 'ember', from: 'charmander' }]; });
  assert.equal(b.mode, 'list');
  b.handle({ type: 'confirm' });
  assert.equal(b.mode, 'slot');
  b.handle({ type: 'confirm' }); // 첫 칸 (몸통박치기)
  assert.equal(b.mode, 'confirm');
  b.handle({ type: 'confirm' });
  assert.deepEqual(d.moves, ['ember']);
  assert.equal(game.items.capsules.length, 0);
  assert.equal(calls.save, 1);
  pass(); b.handle({ type: 'confirm' });
  assert.equal(b.mode, 'list');
});

test('ditto build: cancelling at slot or confirm keeps everything', async () => {
  const { b, game, d, calls } = await buildScene((g) => { g.items.capsules = [{ kind: 'move', value: 'ember', from: 'charmander' }]; });
  b.handle({ type: 'confirm' }); b.handle({ type: 'cancel' });
  assert.equal(b.mode, 'list');
  b.handle({ type: 'confirm' }); b.handle({ type: 'confirm' }); b.handle({ type: 'cancel' }); // 확인에서 아니오
  assert.equal(b.mode, 'list');
  assert.deepEqual(d.moves, ['tackle']);
  assert.equal(game.items.capsules.length, 1);
  assert.equal(calls.save, 0);
  b.handle({ type: 'cancel' });
  assert.equal(calls.closed, 1);
});

test('ditto build: powder over the cap is refused; Lv.9 type capsule has one slot only', async () => {
  const { b, game, d, calls } = await buildScene((g, dd) => {
    dd.level = 9; dd.build.bonus.atk = 30; // 합계 318, 상한 320
    g.items.powders.atk = 2;
    g.items.capsules = [{ kind: 'type', value: 'fire', from: 'charmander' }];
  });
  // 목록: [타입 캡슐, 공격파우더]
  b.handle({ type: 'confirm' });
  assert.equal(b.mode, 'confirm'); // 칸이 하나뿐이면 바로 확인
  b.handle({ type: 'confirm' });
  assert.deepEqual(d.build.types, ['fire']);
  b.handle({ type: 'confirm' }); // (잠금 전) 대사 유지
  for (let i = 0; i < 5; i++) b.update(0.1);
  b.handle({ type: 'confirm' });
  b.handle({ type: 'confirm' }); // 공격파우더 → 상한 거절
  assert.equal(b.mode, 'msg');
  assert.equal(game.items.powders.atk, 2);
  assert.equal(calls.save, 1);
});

test('box: only ditto has the build menu item', async () => {
  const { box } = await boxScene(0);
  box.handle({ type: 'confirm' }); // 첫 칸 = 메타몽
  assert.equal(box.cursorMember.species, 'ditto');
  const labels = () => box.menuLabels;
  assert.ok(labels().includes('메타몽 빌드'));
  box.handle({ type: 'cancel' });
  box.handle({ type: 'dir', dx: 1, dy: 0 });
  box.handle({ type: 'confirm' });
  assert.ok(!labels().includes('메타몽 빌드'));
});

test('review: clicks outside the build list do nothing; town shows a second message page', async () => {
  const { b, calls } = await buildScene((g) => { g.items.capsules = [{ kind: 'move', value: 'ember', from: 'charmander' }]; });
  b.handle({ type: 'click', px: 100, py: 40 }); // 위쪽 패널
  assert.equal(b.mode, 'list');
  b.handle({ type: 'click', px: 100, py: 186 }); // 목록 아래 (6번째 줄 자리)
  assert.equal(b.mode, 'list');
  assert.equal(calls.save, 0);
  const town = createTown({ onSortie() {}, message: [['마을로 돌아왔다.', '코인 10'], ['가방이 가득 차서', '오래된 캡슐 1개를 버렸다.']] });
  assert.deepEqual(town.message.lines, ['마을로 돌아왔다.', '코인 10']);
  town.handle({ type: 'confirm' });
  assert.deepEqual(town.message.lines, ['가방이 가득 차서', '오래된 캡슐 1개를 버렸다.']);
  town.handle({ type: 'confirm' });
  assert.equal(town.message, null);
});

// ---- 성별 전환 · 뽑기 중복 대사 ----
test('summary: gender switch needs the other gender unlocked, then saves', async () => {
  const { newMember } = await import('../src/core/progress.js');
  const game = newGame();
  const p = newMember('pikachu', 10);
  p.gender = 'male'; p.genders = ['male'];
  game.party.push(p);
  const { box, calls } = await boxScene(0, { game });
  while (box.cursorMember.species !== 'pikachu') box.handle({ type: 'dir', dx: 1, dy: 0 });
  box.handle({ type: 'confirm' }); box.handle({ type: 'dir', dx: 0, dy: 1 }); box.handle({ type: 'confirm' }); // 자세히 보기
  const sm = box.summary;
  assert.equal(sm.page, 0);
  box.handle({ type: 'confirm' });
  assert.equal(sm.mode, 'msg');
  assert.match(sm.message.join(' '), /다른 성별/);
  for (let i = 0; i < 5; i++) box.update(0.1);
  box.handle({ type: 'confirm' });
  p.genders.push('female');
  box.handle({ type: 'confirm' });
  assert.equal(p.gender, 'female');
  assert.equal(calls.save, 1);
});

test('gacha duplicate lines mention IVs and a new gender', async () => {
  const { duplicateLines } = await import('../src/game/gacha.js');
  const lines = duplicateLines({ species: 'eevee', duplicate: true, ivUp: ['atk', 'spe'], newGender: 'female' });
  assert.match(lines.join(' '), /결정/);
  assert.match(lines.join(' '), /공격·스피드 개체값이 올랐다/);
  assert.match(lines.join(' '), /♀/);
});

test('box: "한 마리 더" is grey with a reason when short, asks before spending 4 shards, then focuses the new one', async () => {
  const { box, game, calls } = await boxScene(0);
  while (box.cursorMember.species !== 'chimchar') box.handle({ type: 'dir', dx: 1, dy: 0 });
  const pick = () => {
    box.handle({ type: 'confirm' });
    const i = box.menuLabels.findIndex((l) => l.startsWith('한 마리 더'));
    assert.ok(i >= 0, box.menuLabels.join(','));
    for (let k = 0; k < i; k++) box.handle({ type: 'dir', dx: 0, dy: 1 });
    return i;
  };
  const i = pick();
  assert.equal(box.menuEnabled[i], false, 'grey when shards are short');
  box.handle({ type: 'confirm' });
  assert.deepEqual(box.message, ['결정이 모자라다. (4개 필요)']);
  assert.equal(game.party.length, 5);
  box.handle({ type: 'confirm' });
  game.shards = { chimchar: 4 };
  const j = pick();
  assert.equal(box.menuEnabled[j], true);
  box.handle({ type: 'confirm' });
  assert.deepEqual(box.menuLabels, ['데려온다 (결정 4개 사용)', '그만둔다']); // 확인 먼저
  box.handle({ type: 'dir', dx: 0, dy: 1 }); box.handle({ type: 'confirm' }); // 그만둔다
  assert.equal(game.party.length, 5);
  assert.equal(game.shards.chimchar, 4);
  pick(); box.handle({ type: 'confirm' }); box.handle({ type: 'confirm' }); // 데려온다
  assert.equal(game.party.length, 6);
  assert.deepEqual(box.message, ['불꽃숭이가 한 마리 더 합류했다!']);
  assert.equal(calls.save, 1);
  box.handle({ type: 'confirm' });
  assert.equal(box.cursorMember, game.party[5]);
});

test('tapping a tile in town shows a destination marker until arrival', () => {
  const t = createTown({ onSortie() {}, onParty() {}, onGacha() {} });
  t.handle({ type: 'click', px: 40, py: 70 });
  assert.ok(t.fx.log.includes('pokemon/move-marker'));
  assert.equal(t.fx.following, 1);
  for (let i = 0; i < 200; i++) t.update(0.05);
  assert.equal(t.fx.following, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTown } from '../src/game/town.js';
import { createStageSelect } from '../src/game/stageSelect.js';
import { createGame } from '../src/game/states.js';
import { TOWN } from '../src/data/town.js';
import { STAGES } from '../src/data/stages.js';
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

  const sign = TOWN.objects.find((o) => o.action === 'soon');
  town.player.x = sign.x; town.player.y = sign.y + 1; town.player.facing = 'up';
  town.handle({ type: 'confirm' });
  assert.ok(town.message, 'shows a message');
  town.handle({ type: 'confirm' });
  assert.equal(town.message, null);
});

test('stage select: locked stages cannot be picked, first stage can', () => {
  const picked = [];
  let back = 0;
  const sel = createStageSelect({ cleared: new Set(), onPick: (s) => picked.push(s), onBack: () => back++ });
  sel.handle({ type: 'dir', dx: 0, dy: 1 });
  sel.handle({ type: 'confirm' });
  assert.equal(picked.length, 0, 'locked');
  sel.handle({ type: 'dir', dx: 0, dy: -1 });
  sel.handle({ type: 'confirm' });
  assert.equal(picked[0], STAGES[0]);
  sel.handle({ type: 'cancel' });
  assert.equal(back, 1);
});

test('battle starts without a title and exits to the lobby with the result', () => {
  const exits = [];
  const game = createGame({ rng: createRng(3), map: STAGES[0].map, onExit: (r) => exits.push(r) });
  assert.equal(game.mode, 'banner');
  tick(game, 2);
  assert.equal(game.mode, 'idle');
  const s = game.state;
  s.units = s.units.filter((u) => u.side === 'ally' || u.id === 'enemy-lucario');
  const L = s.units.find((u) => u.id === 'enemy-lucario');
  L.x = 3; L.y = 5; L.hp = 1;
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

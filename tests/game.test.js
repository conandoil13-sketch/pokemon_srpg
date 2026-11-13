import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/states.js';
import { createRng } from '../src/core/rng.js';

// 화면 없이 상태 머신만 돌린다 (draw 는 호출하지 않음)
function run(game, until, spam, maxSec = 120) {
  for (let t = 0; t < maxSec; t += 0.05) {
    game.update(0.05);
    if (spam) for (const ev of spam) game.handle(ev);
    if (until(game.mode)) return true;
  }
  return false;
}

test('mashing confirm/click through a whole enemy phase never throws', () => {
  const game = createGame({ rng: createRng(7) });
  game.handle({ type: 'confirm' }); // title → player phase
  assert.ok(run(game, (m) => m === 'idle'));
  // 적이 바로 공격할 수 있게 아군을 강 건너 적 앞에 배치
  const s = game.state;
  const pos = { 'ally-chimchar': [11, 5], 'ally-shinx': [12, 6], 'ally-piplup': [11, 3], 'ally-turtwig': [12, 8] };
  for (const u of s.units) if (pos[u.id]) [u.x, u.y] = pos[u.id];
  game.handle({ type: 'endTurn' });
  const spam = [{ type: 'confirm' }, { type: 'click', x: 0, y: 0, px: 0, py: 0 }, { type: 'cancel' }, { type: 'dir', dx: 1, dy: 0 }];
  assert.doesNotThrow(() => {
    assert.ok(run(game, (m) => m === 'idle' || m === 'result', spam), `stuck in ${game.mode}`);
  });
  const allies = s.units.filter((u) => u.side === 'ally');
  assert.ok(allies.length < 4 || allies.some((u) => u.hp < u.maxHp), 'enemies attacked');
});

test('mashing confirm right after the last KO does not skip the result screen', () => {
  const game = createGame({ rng: createRng(1) });
  game.handle({ type: 'confirm' });
  assert.ok(run(game, (m) => m === 'idle'));
  const s = game.state;
  s.units = s.units.filter((u) => u.side === 'ally' || u.id === 'enemy-riolu');
  const L = s.units.find((u) => u.id === 'enemy-riolu');
  L.x = 3; L.y = 5; L.hp = 1;
  s.units.find((u) => u.id === 'ally-chimchar').moves = ['scratch']; // 첫 기술 = 공격기
  const at = (x, y) => [{ type: 'cursor', x, y, px: x * 24 + 12, py: y * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...at(2, 5), ...at(2, 5)]) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  game.handle({ type: 'confirm' }); // 첫 기술
  game.handle({ type: 'confirm' }); // 대상
  assert.ok(run(game, (m) => m === 'result', [{ type: 'confirm' }]));
  game.handle({ type: 'confirm' }); // 결과 화면 진입 직후 연타
  assert.equal(game.mode, 'result');
});

// ---- 던전: 계단 · 상자 ----
import { MAP } from '../src/data/map.js';
const stairsMap = () => {
  const tiles = MAP.tiles.slice();
  tiles[5] = tiles[5].slice(0, 4) + '>' + tiles[5].slice(5);
  return { ...MAP, tiles, stairs: { x: 4, y: 5 }, chests: [{ x: 2, y: 4, item: 'evoStone' }] };
};
const at = (x, y) => ({ type: 'cursor', px: x * 24 + 12, py: y * 24 + 12 });

test('reaching the stairs clears the floor immediately (no action menu, no cancel)', () => {
  const exits = [];
  const game = createGame({ rng: createRng(5), map: stairsMap(), onExit: (r, log) => exits.push([r, log]) });
  assert.ok(run(game, (m) => m === 'idle'));
  game.handle(at(2, 5)); game.handle({ type: 'confirm' });
  game.handle(at(4, 5)); game.handle({ type: 'confirm' });
  assert.ok(run(game, (m) => m === 'notice'), `mode ${game.mode}`);
  game.handle({ type: 'cancel' });
  assert.equal(game.mode, 'notice');
  game.handle({ type: 'confirm' });
  assert.equal(game.mode, 'result');
  assert.ok(run(game, () => false, null, 1) === false);
  game.handle({ type: 'confirm' });
  assert.equal(exits[0][0], 'stairs');
});

test('stepping on a chest opens it, then the action menu opens', () => {
  const game = createGame({ rng: createRng(5), map: stairsMap(), onExit() {} });
  assert.ok(run(game, (m) => m === 'idle'));
  game.handle(at(2, 5)); game.handle({ type: 'confirm' });
  game.handle(at(2, 4)); game.handle({ type: 'confirm' });
  assert.ok(run(game, (m) => m === 'notice'));
  assert.deepEqual(game.state.log.loot, ['evoStone']);
  game.handle({ type: 'confirm' });
  assert.equal(game.mode, 'action');
});

test('after opening a chest the move is committed (cancel cannot undo it)', () => {
  const game = createGame({ rng: createRng(5), map: stairsMap(), onExit() {} });
  assert.ok(run(game, (m) => m === 'idle'));
  game.handle(at(2, 5)); game.handle({ type: 'confirm' });
  game.handle(at(2, 4)); game.handle({ type: 'confirm' });
  assert.ok(run(game, (m) => m === 'notice'));
  game.handle({ type: 'confirm' });
  assert.equal(game.mode, 'action');
  game.handle({ type: 'cancel' });
  assert.equal(game.mode, 'action', 'cancel ignored');
  const u = game.state.units.find((x) => x.id === 'ally-chimchar');
  assert.deepEqual([u.x, u.y], [2, 4]);
});

// ---- 변화기 화면 흐름 ----
import { stageMessages } from '../src/render/mapAttack.js';

const openMenuWith = (moves) => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const c = game.state.units.find((u) => u.id === 'ally-chimchar');
  c.moves = moves;
  const sel = [{ type: 'cursor', px: 2 * 24 + 12, py: 5 * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...sel, ...sel]) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  return { game, c };
};

test('swords dance: no target pick, one confirm, then atk +2', () => {
  const { game, c } = openMenuWith(['swords-dance', 'scratch']);
  assert.equal(game.menu[0].enabled, true);
  assert.equal(game.menu[0].tag, '변화');
  game.handle({ type: 'confirm' }); // 칼춤
  assert.equal(game.mode, 'target');
  game.handle({ type: 'dir', dx: 1, dy: 0 }); // 자신 대상: 순환 없음
  game.handle({ type: 'confirm' });
  assert.equal(game.mode, 'anim');
  assert.ok(run(game, (m) => m === 'idle', [{ type: 'confirm' }]));
  assert.deepEqual([c.stages.atk, c.turns.atk, c.acted], [2, 3, true]);
});

test('growl is greyed out with no enemy within 2', () => {
  const { game } = openMenuWith(['growl', 'scratch']);
  assert.equal(game.menu[0].enabled, false);
});

test('stage messages', () => {
  const u = { id: 'a', species: 'chimchar', side: 'ally' };
  const e = { id: 'e', species: 'riolu', side: 'enemy' };
  const by = { a: u, e };
  assert.deepEqual(stageMessages([{ unitId: 'a', key: 'atk', change: 2, applied: 2 }], by), ['불꽃숭이의 공격이 크게 올라갔다!']);
  assert.deepEqual(stageMessages([{ unitId: 'e', key: 'def', change: -1, applied: -1 }], by), ['상대 리오르의 방어가 떨어졌다!']);
  assert.deepEqual(stageMessages([{ unitId: 'a', key: 'spe', change: 3, applied: 3 }], by), ['불꽃숭이의 스피드가 매우 크게 올라갔다!']);
  assert.deepEqual(stageMessages([{ unitId: 'a', key: 'atk', change: 2, applied: 0 }], by), ['불꽃숭이의 공격은 더 이상 오르지 않는다!']);
  assert.deepEqual(stageMessages([{ unitId: 'e', key: 'atk', change: -1, applied: 0 }], by), ['상대 리오르의 공격은 더 이상 떨어지지 않는다!']);
});

test('action menu cursor starts on the first attack, not a status move', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const st = game.state;
  st.units.find((u) => u.id === 'ally-chimchar').moves = ['swords-dance', 'scratch'];
  const r = st.units.find((u) => u.id === 'enemy-riolu'); r.x = 3; r.y = 5;
  const sel = [{ type: 'cursor', px: 2 * 24 + 12, py: 5 * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...sel, ...sel]) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  assert.equal(game.menu[game.menuSel].moveId, 'scratch');
});

// ---- 상태이상 화면 흐름 ----
import { statusMessages } from '../src/render/mapAttack.js';
// 대사·연출만 넘기는 진행 (빈 칸 확인으로 턴을 끝내지 않도록)
function advance(game, until, maxSec = 120) {
  for (let t = 0; t < maxSec; t += 0.05) {
    game.update(0.05);
    if (game.mode === 'notice' || game.mode === 'anim') game.handle({ type: 'confirm' });
    if (until(game)) return true;
  }
  return false;
}

test('a paralyzed ally that fails still ends its action', () => {
  const game = createGame({ rng: () => 0.1 });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  const st = game.state;
  const c = st.units.find((u) => u.id === 'ally-chimchar'); c.moves = ['scratch']; c.status = 'paralysis';
  const r = st.units.find((u) => u.id === 'enemy-riolu'); r.x = 3; r.y = 5;
  const hp = r.hp;
  const sel = [{ type: 'cursor', px: 2 * 24 + 12, py: 5 * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...sel, ...sel]) game.handle(e);
  assert.ok(advance(game, (g) => g.mode === 'action'));
  game.handle({ type: 'confirm' }); game.handle({ type: 'confirm' });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  assert.deepEqual([c.acted, r.hp], [true, hp]);
});

test('when every ally sleeps, the player phase passes on its own', () => {
  const game = createGame({ rng: createRng(4) });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  for (const u of game.state.units) if (u.side === 'ally') { u.status = 'sleep'; u.statusTurns = 3; }
  game.handle({ type: 'endTurn' });
  assert.ok(advance(game, (g) => g.state.turn >= 3), `stuck in ${game.mode} turn ${game.state.turn}`);
});

test('the last enemy fainting from poison ends the floor', () => {
  const game = createGame({ rng: createRng(4) });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  const st = game.state;
  st.units = st.units.filter((u) => u.side === 'ally' || u.id === 'enemy-riolu');
  const r = st.units.find((u) => u.id === 'enemy-riolu'); r.status = 'poison'; r.hp = 1;
  game.handle({ type: 'endTurn' });
  assert.ok(advance(game, (g) => g.mode === 'result'), `mode ${game.mode}`);
  assert.equal(st.result, 'win');
});

test('status messages', () => {
  const by = { a: { id: 'a', species: 'chimchar', side: 'ally' }, e: { id: 'e', species: 'riolu', side: 'enemy' } };
  assert.deepEqual(statusMessages([{ unitId: 'e', ailment: 'paralysis', ok: true }], by, true), ['상대 리오르는 마비되어 기술이 나오기 어려워졌다!']);
  assert.deepEqual(statusMessages([{ unitId: 'a', ailment: 'burn', ok: true }], by, false), ['불꽃숭이는 화상을 입었다!']);
  assert.deepEqual(statusMessages([{ unitId: 'e', ailment: 'sleep', ok: true }], by, true), ['상대 리오르는 잠들어 버렸다!']);
  assert.deepEqual(statusMessages([{ unitId: 'e', ailment: 'sleep', ok: false, reason: 'already' }], by, true), ['상대 리오르에게는 효과가 없는 것 같다...']);
  assert.deepEqual(statusMessages([{ unitId: 'e', ailment: 'burn', ok: false, reason: 'already' }], by, false), []);
});

test('no next-phase banner once status damage decides the floor', () => {
  const game = createGame({ rng: createRng(4) });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  const st = game.state;
  st.units = st.units.filter((u) => u.side === 'ally' || u.id === 'enemy-riolu');
  const r = st.units.find((u) => u.id === 'enemy-riolu'); r.status = 'poison'; r.hp = 1;
  game.handle({ type: 'endTurn' });
  let bannerAfter = false;
  assert.ok(advance(game, (g) => { if (st.result && g.mode === 'banner') bannerAfter = true; return g.mode === 'result'; }));
  assert.equal(bannerAfter, false);
});

import { ailmentNote } from '../src/game/states.js';
test('status forecast warns about immune or already-affected targets', () => {
  const ground = { species: 'gible', status: null, confusion: 0 };
  assert.equal(ailmentNote(ground, { id: 'thunder-wave', type: 'electric', ailment: 'paralysis' }), '효과 없음');
  assert.equal(ailmentNote({ species: 'pikachu', status: 'poison', confusion: 0 }, { id: 'sleep-powder', type: 'grass', ailment: 'sleep' }), '이미 상태이상');
  assert.equal(ailmentNote({ species: 'pikachu', status: null, confusion: 0 }, { id: 'sleep-powder', type: 'grass', ailment: 'sleep' }), null);
});

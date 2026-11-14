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

// ---- 페이즈 알림 순서·HP 연출 ----
import { phaseNotices } from '../src/game/states.js';
test('phase notices: end damage → stage expiry → phase start, damage carries HP', () => {
  const units = { a: { id: 'a', species: 'chimchar', side: 'ally', x: 1, y: 2 }, e: { id: 'e', species: 'riolu', side: 'enemy', x: 5, y: 5 } };
  const events = [
    { unitId: 'e', kind: 'asleep' },
    { unitId: 'a', kind: 'poison', damage: 5, hpBefore: 20, maxHp: 40, x: 1, y: 2 },
  ];
  const out = phaseNotices(events, [{ unitId: 'a', keys: ['atk'] }], (id) => units[id]);
  assert.deepEqual(out.map((n) => n.lines.join(' ')), [
    '불꽃숭이는 독의 데미지를 입었다!', '불꽃숭이의 공격이 원래대로 돌아왔다!', '상대 리오르는 쿨쿨 잠들어 있다',
  ]);
  assert.deepEqual(out[0].hp, { from: 20, to: 15, max: 40 });
  assert.deepEqual(out[0].at, { x: 1, y: 2 });
  assert.deepEqual(out[2].at, { x: 5, y: 5 });
});

// ---- 범위 모양 화면 ----
import { shapeLabel } from '../src/render/ui.js';
import { MOVES as MV2 } from '../src/data/moves.js';
function setupWith(moves, place = {}) {
  const game = createGame({ rng: () => 0.5 });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  const st = game.state;
  st.units = st.units.filter((u) => u.side === 'ally' || ['enemy-riolu', 'enemy-gible'].includes(u.id));
  const c = st.units.find((u) => u.id === 'ally-chimchar'); c.moves = moves;
  for (const [id, [x, y]] of Object.entries(place)) { const u = st.units.find((o) => o.id === id); u.x = x; u.y = y; u.hp = u.maxHp = 500; }
  const sel = [{ type: 'cursor', px: c.x * 24 + 12, py: c.y * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...sel, ...sel]) game.handle(e);
  assert.ok(advance(game, (g) => g.mode === 'action'));
  return { game, st, c };
}

test('line aiming: best direction first, can turn, hits everyone on the line', () => {
  const { game, st } = setupWith(['hydro-pump'], { 'enemy-riolu': [3, 5], 'enemy-gible': [4, 5] });
  game.handle({ type: 'confirm' });
  assert.equal(game.mode, 'target');
  assert.deepEqual(game.aim, { dir: 'right' });
  game.handle({ type: 'dir', dx: 0, dy: -1 }); // 위쪽엔 적이 없음 → 그대로
  assert.deepEqual(game.aim, { dir: 'right' });
  game.handle({ type: 'confirm' });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  for (const id of ['enemy-riolu', 'enemy-gible']) { const u = st.units.find((o) => o.id === id); assert.ok(u.hp < 500, id); }
});

test('line aiming turns toward another foe', () => {
  const { game } = setupWith(['hydro-pump'], { 'enemy-riolu': [3, 5], 'enemy-gible': [2, 4] });
  game.handle({ type: 'confirm' });
  game.handle({ type: 'dir', dx: 0, dy: -1 });
  assert.deepEqual(game.aim, { dir: 'up' });
  game.handle({ type: 'dir', dx: 1, dy: 0 });
  assert.deepEqual(game.aim, { dir: 'right' });
});

test('around: one confirm', () => {
  const { game, st } = setupWith(['earthquake'], { 'enemy-riolu': [3, 5] });
  game.handle({ type: 'confirm' });
  game.handle({ type: 'confirm' });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  assert.ok(st.units.find((o) => o.id === 'enemy-riolu').hp < 500);
});

test('menu greys out shapes that hit no foe (corner line, quake on allies only)', () => {
  const a = setupWith(['hydro-pump', 'scratch'], { 'enemy-riolu': [10, 10], 'enemy-gible': [11, 10] });
  assert.equal(a.game.menu[0].enabled, false);
  const b = setupWith(['earthquake', 'scratch'], { 'enemy-riolu': [10, 10], 'enemy-gible': [11, 10], 'ally-piplup': [2, 4] });
  assert.equal(b.game.menu[0].enabled, false);
});

test('self-destruct removes the user after the animation', () => {
  const { game, st } = setupWith(['self-destruct'], { 'enemy-riolu': [3, 5] });
  game.handle({ type: 'confirm' }); game.handle({ type: 'confirm' });
  assert.ok(advance(game, (g) => g.mode === 'idle' || g.mode === 'result'));
  assert.equal(st.units.find((o) => o.id === 'ally-chimchar'), undefined);
});

test('shape labels', () => {
  assert.deepEqual(['tackle', 'shadow-ball', 'hydro-pump', 'heat-wave', 'earthquake', 'fire-blast'].map((k) => shapeLabel(MV2[k])),
    ['단일 1', '단일 2~3', '직선 3', '앞 부채꼴', '주변 (아군도)', '착탄 2~3 십자']);
});

test('pointing at a tile picks the aim centred there, a click on another aim only selects it', () => {
  const { game } = setupWith(['fire-blast'], { 'enemy-riolu': [5, 5], 'enemy-gible': [4, 4] });
  game.handle({ type: 'confirm' });
  const cam = game.camera, at = (x, y, type) => ({ type, px: x * 24 + 12 - Math.round(cam.x), py: y * 24 + 12 - Math.round(cam.y) });
  game.handle(at(5, 5, 'cursor'));
  assert.deepEqual(game.aim, { x: 5, y: 5 });
  game.handle(at(4, 4, 'click'));
  assert.equal(game.mode, 'target');
  assert.deepEqual(game.aim, { x: 4, y: 4 });
  game.handle(at(4, 4, 'click'));
  assert.equal(game.mode, 'anim');
});

// ---- 이펙트 연결 ----
const fxCount = (game, id) => game.fx.log.filter((x) => x === id).length;
const playOut = (game) => assert.ok(advance(game, (g) => g.mode === 'idle' || g.mode === 'result'));

test('a weak contact hit spawns one small burst', () => {
  const { game } = setupWith(['scratch'], { 'enemy-riolu': [3, 5] });
  game.handle({ type: 'confirm' }); game.handle({ type: 'confirm' });
  playOut(game);
  assert.equal(fxCount(game, 'pickups/collect-burst'), 1); // 할퀴기 위력 40 → 약
});

test('earthquake: one quake cast, one thud per target; mashing does not duplicate', () => {
  const { game } = setupWith(['earthquake'], { 'enemy-riolu': [3, 5], 'enemy-gible': [2, 6] });
  game.handle({ type: 'confirm' }); game.handle({ type: 'confirm' });
  for (let i = 0; i < 400 && game.mode !== 'idle'; i++) { game.update(0.02); game.handle({ type: 'confirm' }); }
  assert.equal(fxCount(game, 'impacts/ground-slam'), 1);
  assert.ok(fxCount(game, 'impacts/blunt-hit') >= 4 && fxCount(game, 'impacts/blunt-hit') <= 6); // 지진(강): 대상마다 충격 2겹
});

test('swords dance shows one rank-up effect', () => {
  const { game } = setupWith(['swords-dance'], {});
  game.handle({ type: 'confirm' }); game.handle({ type: 'confirm' });
  playOut(game);
  assert.equal(fxCount(game, 'ui/level-up'), 1);
});

test('self-destruct shows its explosion and shakes the screen', () => {
  const { game } = setupWith(['self-destruct'], { 'enemy-riolu': [3, 5] });
  game.handle({ type: 'confirm' }); game.handle({ type: 'confirm' });
  let shook = false;
  for (let i = 0; i < 400 && !['idle', 'result'].includes(game.mode); i++) { game.update(0.02); if (game.shake) shook = true; if (game.mode !== 'anim' || i % 20 === 0) game.handle({ type: 'confirm' }); }
  assert.equal(fxCount(game, 'explosions/small-explosion'), 1);
  assert.ok(shook);
});

test('a throwing effect manager never blocks the battle', () => {
  const { game } = setupWith(['scratch'], { 'enemy-riolu': [3, 5] });
  game.fx.spawn = () => { throw new Error('boom'); };
  game.handle({ type: 'confirm' }); game.handle({ type: 'confirm' });
  playOut(game);
});

// ---- 상태이상 지속 표시 ----
test('lingering status effects follow status changes and vanished units', () => {
  const game = createGame({ rng: () => 0.5 });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  const st = game.state;
  const c = st.units.find((u) => u.id === 'ally-chimchar');
  c.status = 'burn';
  game.update(0.02);
  assert.equal(game.fx.following, 1);
  c.status = null;
  for (let i = 0; i < 60; i++) game.update(0.02);
  assert.equal(game.fx.following, 0);
  c.status = 'paralysis'; c.confusion = 2;
  game.update(0.02);
  assert.equal(game.fx.following, 2);
  st.units = st.units.filter((u) => u !== c); // 기절해 사라짐
  assert.doesNotThrow(() => { for (let i = 0; i < 5; i++) game.update(0.02); });
  assert.equal(game.fx.following, 0);
});

test('a new battle starts with no effects', () => {
  const game = createGame({ rng: () => 0.5 });
  assert.equal(game.fx.count, 0);
});

test('every chest item opens without freezing (coin pouch too)', () => {
  for (const item of ['evoStone', 'candy', 'coins']) {
    const map = stairsMap(); map.chests = [{ x: 2, y: 4, item }];
    const game = createGame({ rng: createRng(5), map, onExit() {} });
    assert.ok(run(game, (m) => m === 'idle'));
    game.handle(at(2, 5)); game.handle({ type: 'confirm' });
    assert.doesNotThrow(() => { game.handle(at(2, 4)); game.handle({ type: 'confirm' }); run(game, (m) => m === 'notice'); }, item);
    assert.equal(game.mode, 'notice', item);
    game.handle({ type: 'confirm' });
    assert.equal(game.mode, 'action', item);
  }
});

// ---- 날씨 화면 ----
import { drawWeather } from '../src/render/weatherFx.js';
test('weather shows in the phase banner', () => {
  const game = createGame({ rng: createRng(1), map: { ...MAP, weather: 'rain' } });
  assert.match(game.bannerSub ?? '', /비/);
  const plain = createGame({ rng: createRng(1) });
  assert.doesNotMatch(plain.bannerSub ?? '', /비|쾌청|안개/);
});

test('fog hides far enemies until an ally comes within 4 tiles', () => {
  const game = createGame({ rng: createRng(1), map: { ...MAP, weather: 'fog' } });
  const st = game.state;
  const e = st.units.find((u) => u.id === 'enemy-riolu');
  for (const a of st.units.filter((u) => u.side === 'ally')) { a.x = 0; a.y = 0; }
  e.x = 10; e.y = 5;
  assert.ok(game.hiddenIds.has('enemy-riolu'));
  const c = st.units.find((u) => u.id === 'ally-chimchar'); c.x = 7; c.y = 5;
  assert.ok(!game.hiddenIds.has('enemy-riolu'));
});

test('weather damage notice text', () => {
  const u = { id: 'a', species: 'chimchar', side: 'ally', x: 1, y: 1 };
  const out = phaseNotices([{ unitId: 'a', kind: 'sand', damage: 3, hpBefore: 20, maxHp: 40, x: 1, y: 1 }], [], () => u);
  assert.deepEqual(out[0].lines, ['불꽃숭이는 모래바람에 휘말렸다!']);
  const out2 = phaseNotices([{ unitId: 'a', kind: 'hail', damage: 3, hpBefore: 20, maxHp: 40, x: 1, y: 1 }], [], () => u);
  assert.deepEqual(out2[0].lines, ['불꽃숭이는 싸라기눈을 맞았다!']);
});

test('no weather draws nothing', () => {
  assert.equal(drawWeather(null, null, 0), false);
});

// ---- 날씨 리뷰 수정 ----
import { forecastFor } from '../src/game/states.js';
import { makeUnit as mkG } from '../src/core/battle.js';
test('forecast numbers include the weather', () => {
  const a = mkG({ species: 'piplup', side: 'ally', x: 0, y: 0, level: 30, moves: ['water-gun'] });
  const d = mkG({ species: 'pikachu', side: 'enemy', x: 1, y: 0, level: 30, moves: ['tackle'] });
  const dry = forecastFor(a, d, MV2['water-gun'], '.', null), wet = forecastFor(a, d, MV2['water-gun'], '.', 'rain');
  assert.ok(wet.max > dry.max);
  assert.equal(forecastFor(a, d, MV2.tackle, '.', 'fog').hit, forecastFor(a, d, MV2.tackle, '.', null).hit - 10);
  assert.equal(forecastFor(a, d, MV2.thunder, '"', 'rain').hit, 100);
});

test('a hidden enemy in fog stays silent (no self-buff that would name it)', () => {
  const game = createGame({ rng: createRng(1), map: { ...MAP, weather: 'fog' } });
  assert.ok(advance(game, (g) => g.mode === 'idle'));
  const st = game.state;
  st.units = st.units.filter((u) => u.side === 'ally' || u.id === 'enemy-bronzor');
  for (const a of st.units.filter((u) => u.side === 'ally')) { a.x = 0; a.y = a.y; }
  const b = st.units.find((u) => u.id === 'enemy-bronzor'); b.x = 15; b.y = 11; b.moves = ['defense-curl'];
  game.handle({ type: 'endTurn' });
  assert.ok(advance(game, (g) => g.state.turn >= 2 && g.mode === 'idle'));
  assert.equal(b.stages.def, 0);
});

test('no lingering status effects on units hidden in fog', () => {
  const game = createGame({ rng: createRng(1), map: { ...MAP, weather: 'fog' } });
  const st = game.state;
  for (const a of st.units.filter((u) => u.side === 'ally')) { a.x = 0; a.y = 0; }
  const e = st.units.find((u) => u.id === 'enemy-riolu'); e.x = 12; e.y = 5; e.status = 'burn';
  game.update(0.02);
  assert.equal(game.fx.following, 0);
});

test('expiry text: back to normal vs only part of the change', () => {
  const full = { id: 'a', species: 'chimchar', side: 'ally', x: 0, y: 0, stages: { atk: 0 } };
  const part = { ...full, stages: { atk: 2 } };
  const text = (u) => phaseNotices([], [{ unitId: 'a', keys: ['atk'] }], () => u)[0].lines.join(' ');
  assert.equal(text(full), '불꽃숭이의 공격이 원래대로 돌아왔다!');
  assert.equal(text(part), '불꽃숭이의 공격 변화 일부가 풀렸다!');
});

import { abilityNotices, dangerWarning } from '../src/game/states.js';

test('ability events become lines: intimidate, sturdy, trace; speed boost stays quiet', () => {
  const units = {
    a: { id: 'a', side: 'ally', species: 'shinx', x: 1, y: 1 },
    e: { id: 'e', side: 'enemy', species: 'geodude', x: 2, y: 1 },
  };
  const get = (id) => units[id];
  const join = (n) => n.lines.join(' ');
  const out = abilityNotices([
    { unitId: 'a', ability: 'intimidate', target: 'e', applied: true },
    { unitId: 'e', ability: 'sturdy' },
    { unitId: 'a', ability: 'speed-boost' },
    { unitId: 'a', ability: 'trace', copied: 'static' },
  ], get);
  assert.equal(out.length, 3);
  assert.match(join(out[0]), /위협.*상대 꼬마돌의 공격이 떨어졌다/);
  assert.match(join(out[1]), /옹골참으로 버텼다/);
  assert.match(join(out[2]), /트레이스로 정전기를 복사했다/);
  assert.deepEqual(out[1].at, { x: 2, y: 1 });
});

test('anticipation warns when an enemy has a super-effective move against the holder', () => {
  const ally = { id: 'a', side: 'ally', species: 'croagunk', ability: 'anticipation' };
  const foe = { id: 'e', side: 'enemy', species: 'abra', moves: ['confusion'], ability: 'synchronize' };
  assert.match(dangerWarning(foe, [ally, foe]), /삐딱구리에게 효과 굉장/);
  assert.equal(dangerWarning({ ...foe, moves: ['tackle'] }, [ally, foe]), null);
  assert.equal(dangerWarning(foe, [{ ...ally, ability: 'dry-skin' }, foe]), null);
});

import { itemName } from '../src/game/states.js';
import { settleLoot, startRun, addLoot } from '../src/core/run.js';
import { newGame } from '../src/core/save.js';

test('chest powder names and run loot reaching the bag', () => {
  assert.equal(itemName('powder-atk'), '공격파우더');
  assert.equal(itemName('mystery'), '아이템');
  const g = newGame();
  const run = startRun('sinnoh-field', 1);
  addLoot(run, 'powder-spe', 1);
  addLoot(run, { kind: 'type', value: 'fire', from: 'charmander' }, 1);
  const r = settleLoot(g, run);
  assert.equal(g.items.powders.spe, 1);
  assert.deepEqual(g.items.capsules, [{ kind: 'type', value: 'fire', from: 'charmander' }]);
  assert.equal(r.capsules, 1);
  assert.equal(r.dropped, 0);
});

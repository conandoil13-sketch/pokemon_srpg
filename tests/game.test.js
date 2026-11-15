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

test('infatuation notices: wearing off', () => {
  const u = { id: 'a', side: 'ally', species: 'pikachu', x: 1, y: 1 };
  const out = phaseNotices([{ unitId: 'a', kind: 'infatuationEnd' }], [], () => u);
  assert.match(out[0].lines.join(' '), /헤롱헤롱이 풀렸다/);
});

// ---- 변화기 묶음 1차: 화면 ----
import { volatileTags } from '../src/render/ui.js';
import { effectMessages, blockedText } from '../src/render/mapAttack.js';
test('volatileTags lists active effects with turns', () => {
  const tags = volatileTags({ taunt: 3, noMove: 2, focusEnergy: true, encore: { move: 'tackle', turns: 2 }, guard: null });
  for (const t of ['도발3', '이동불가2', '기충전', '앙코르2']) assert.ok(tags.includes(t), `${t} in ${tags}`);
  assert.deepEqual(volatileTags({}), []);
});

test('effect messages: protect, endure, bond, failures', () => {
  const units = { a: { id: 'a', species: 'pikachu', side: 'ally' }, e: { id: 'e', species: 'pidgey', side: 'enemy' } };
  const get = (id) => units[id];
  assert.deepEqual(effectMessages({ effects: [{ unitId: 'a', effect: 'protect', ok: true }] }, get), ['피카츄는 방어 태세에 들어갔다!']);
  assert.deepEqual(effectMessages({ effects: [{ unitId: 'e', effect: 'taunt', ok: false, reason: 'already' }] }, get), ['그러나 실패했다!']);
  assert.deepEqual(effectMessages({ protectedIds: ['a'] }, get), ['피카츄는 몸을 지켰다!']);
  assert.deepEqual(effectMessages({ hits: [{ unitId: 'a', protected: true }] }, get), ['피카츄는 몸을 지켰다!']);
  assert.deepEqual(effectMessages({ hits: [{ unitId: 'a', endured: true, hit: true }] }, get), ['피카츄는 공격을 버텼다!']);
  assert.equal(blockedText('taunt'), '도발당해서 변화기를 쓸 수 없다!');
  assert.equal(blockedText('healBlock'), '회복봉인으로 회복할 수 없다!');
});

test('move menu greys out blocked moves with a reason', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const c = game.state.units.find((u) => u.id === 'ally-chimchar');
  c.moves = ['scratch', 'swords-dance']; c.taunt = 3;
  const sel = [{ type: 'cursor', px: 2 * 24 + 12, py: 5 * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...sel, ...sel]) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  const sd = game.menu.find((i) => i.moveId === 'swords-dance');
  assert.equal(sd.enabled, false);
  assert.equal(sd.why, '도발당해서 변화기를 쓸 수 없다!');
  assert.equal(game.menu.find((i) => i.moveId === 'scratch').why, undefined); // 공격기는 도발과 무관 (여기선 닿는 적이 없어 회색일 뿐)
});

test('review fix: a ghost ally can curse an enemy through the menu', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const st = game.state;
  const c = st.units.find((u) => u.id === 'ally-chimchar');
  c.types = ['ghost']; c.moves = ['curse'];
  const foe = st.units.find((u) => u.side === 'enemy');
  foe.x = c.x + 1; foe.y = c.y; foe.hp = foe.maxHp = 999;
  const at = (x, y) => [{ type: 'cursor', px: x * 24 + 12 - Math.round(game.camera.x), py: y * 24 + 12 - Math.round(game.camera.y) }, { type: 'confirm' }];
  for (const e of at(c.x, c.y)) game.handle(e);
  for (const e of at(c.x, c.y)) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  game.handle({ type: 'confirm' }); // 저주 (유일한 기술)
  assert.equal(game.mode, 'target');
  game.handle({ type: 'confirm' });
  assert.equal(foe.cursed, true);
});

test('review fix: ghost curse that knocks out its user says so', () => {
  const units = { a: { id: 'a', species: 'gastly', side: 'ally' } };
  assert.ok(effectMessages({ effects: [], selfFainted: 'a' }, (id) => units[id]).includes('고오스는 쓰러졌다!'));
});
test('phase-end heals show a heal on the healed unit', () => {
  const units = { a: { id: 'a', species: 'squirtle', side: 'ally', x: 1, y: 1 }, e: { id: 'e', species: 'pidgey', side: 'enemy', x: 2, y: 1 } };
  const get = (id) => units[id];
  const [ring] = phaseNotices([{ unitId: 'a', kind: 'aquaRing', healed: 3 }], [], get);
  assert.deepEqual(ring.heal, ['a']);
  const [leech] = phaseNotices([{ unitId: 'e', kind: 'leech', by: 'a', damage: 4, healed: 4, hpBefore: 20, maxHp: 30 }], [], get);
  assert.deepEqual(leech.heal, ['a']);
  const [none] = phaseNotices([{ unitId: 'e', kind: 'leech', by: 'a', damage: 4, healed: 0, hpBefore: 20, maxHp: 30 }], [], get);
  assert.equal(none.heal, undefined);
});

// ---- 변화기 묶음 2차: 화면 ----
import { trapNotices } from '../src/game/states.js';
import { drawTraps } from '../src/render/ui.js';
test('field messages for each cast, push, haze, safeguard and weather', () => {
  const units = { a: { id: 'a', species: 'pikachu', side: 'ally' }, e: { id: 'e', species: 'pidgey', side: 'enemy' } };
  const get = (id) => units[id];
  const one = (effect, moveId) => effectMessages({ effects: [{ unitId: 'a', effect, ok: true }] }, get, moveId)[0];
  assert.equal(one('tailwind'), '순풍이 불기 시작했다!');
  assert.equal(one('reflect'), '리플렉터로 물리 공격에 강해졌다!');
  assert.equal(one('weather', 'rain-dance'), '비가 내리기 시작했다!');
  assert.equal(one('weather', 'hail'), '싸라기눈이 내리기 시작했다!');
  assert.equal(one('spikes'), '발밑에 압정이 뿌려졌다!');
  assert.deepEqual(effectMessages({ effects: [{ unitId: 'e', effect: 'push', ok: true }], pushed: { unitId: 'e' } }, get), ['상대 구구는 날려가 버렸다!']);
  assert.deepEqual(effectMessages({ effects: [{ unitId: 'e', effect: 'push', ok: false, reason: 'stuck' }] }, get), ['상대 구구는 꿈쩍도 하지 않았다!']);
  assert.deepEqual(effectMessages({ effects: [{ unitId: 'a', effect: 'haze', ok: true }], hazed: ['a', 'e'] }, get), ['모든 랭크 변화가 원래대로 돌아왔다!']);
  assert.deepEqual(effectMessages({ effects: [{ unitId: 'a', effect: 'yawn', ok: false, reason: 'safeguard' }] }, get), ['피카츄는 신비의 베일이 지켜 주고 있다!']);
});

test('trap step notices', () => {
  const units = { e: { id: 'e', species: 'pidgey', side: 'enemy', x: 3, y: 1 } };
  const get = (id) => units[id];
  const lines = trapNotices([{ unitId: 'e', kind: 'spikes', damage: 3, hpBefore: 10, maxHp: 24, x: 3, y: 1 }, { unitId: 'e', kind: 'toxicSpikes', x: 4, y: 1 }, { unitId: 'e', kind: 'cleared', x: 5, y: 1, fainted: true }], get);
  assert.deepEqual(lines.map((l) => l.lines.join(' ')), ['상대 구구는 압정에 찔렸다!', '상대 구구는 독압정을 밟았다!', '상대 구구는 독압정을 치웠다!', '상대 구구는 쓰러졌다!']);
  assert.deepEqual(lines[0].hp, { from: 10, to: 7, max: 24 });
});

test('enemy traps are not drawn unless revealed; ally traps are', () => {
  const ctx = { fillRect() {}, set fillStyle(v) {} };
  const st = { spikes: [{ x: 1, y: 1, kind: 'spikes', side: 'ally', revealed: false }, { x: 2, y: 1, kind: 'spikes', side: 'enemy', revealed: false }, { x: 3, y: 1, kind: 'toxicSpikes', side: 'enemy', revealed: true }] };
  assert.deepEqual(drawTraps(ctx, st).map((t) => [t.x, t.y]), [[1, 1], [3, 1]]);
  assert.deepEqual(drawTraps(ctx, st, [{ x: 2, y: 1 }]).map((t) => [t.x, t.y]), [[1, 1], [2, 1], [3, 1]]); // 까는 연출 중
});

test('spikes are aimed at a tile from the menu', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const c = game.state.units.find((u) => u.id === 'ally-chimchar');
  c.moves = ['spikes'];
  const at = (x, y) => [{ type: 'cursor', px: x * 24 + 12 - Math.round(game.camera.x), py: y * 24 + 12 - Math.round(game.camera.y) }, { type: 'confirm' }];
  for (const e of at(c.x, c.y)) game.handle(e);
  for (const e of at(c.x, c.y)) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  game.handle({ type: 'confirm' });
  assert.equal(game.mode, 'target');
  game.handle({ type: 'confirm' });
  assert.ok(game.state.spikes.length >= 3);
});

test('an ally that faints on spikes ends its action without getting stuck', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const st = game.state, c = st.units.find((u) => u.id === 'ally-chimchar');
  st.spikes.push({ x: c.x + 1, y: c.y, kind: 'spikes', side: 'enemy', revealed: false });
  c.hp = 1;
  const at = (x, y) => [{ type: 'cursor', px: x * 24 + 12 - Math.round(game.camera.x), py: y * 24 + 12 - Math.round(game.camera.y) }, { type: 'confirm' }];
  for (const e of at(c.x, c.y)) game.handle(e);
  for (const e of at(c.x + 1, c.y)) game.handle(e);
  assert.ok(run(game, (m) => m === 'idle' || m === 'result' || m === 'enemy', [{ type: 'confirm' }]), `stuck in ${game.mode}`);
  assert.ok(!st.units.includes(c));
});
test('review fix: cancelling a move refreshes aura flags', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const st = game.state, c = st.units.find((u) => u.id === 'ally-chimchar'), p = st.units.find((u) => u.id === 'ally-piplup');
  st.auras.push({ kind: 'tailwind', ownerId: c.id, side: 'ally', turns: 5 });
  const free = (x, y) => st.grid[y]?.[x] === '.' && !st.units.some((u) => u !== p && u.x === x && u.y === y);
  const [dx, dy] = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => free(c.x + dx, c.y + dy) && free(c.x - 2 * dx, c.y - 2 * dy));
  p.x = c.x - 2 * dx; p.y = c.y - 2 * dy; // 오라 안 (거리 2), 주인이 한 칸 비키면 밖 (거리 3)
  const at = (x, y) => [{ type: 'cursor', px: x * 24 + 12 - Math.round(game.camera.x), py: y * 24 + 12 - Math.round(game.camera.y) }, { type: 'confirm' }];
  for (const e of at(c.x, c.y)) game.handle(e);
  const ox = c.x, oy = c.y;
  for (const e of at(ox + dx, oy + dy)) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  game.handle({ type: 'cancel' });
  assert.deepEqual([c.x, c.y], [ox, oy]);
  assert.equal(p.field.tailwind, true);
});
test('review fix: spikes stepped on during a push are announced', () => {
  const units = { e: { id: 'e', species: 'pidgey', side: 'enemy' } };
  const msgs = effectMessages({ effects: [{ unitId: 'e', effect: 'push', ok: true }], pushed: { unitId: 'e', fainted: true }, trapEvents: [{ unitId: 'e', kind: 'spikes', damage: 3, x: 1, y: 1, fainted: true }] }, (id) => units[id]);
  assert.deepEqual(msgs, ['상대 구구는 날려가 버렸다!', '상대 구구는 압정에 찔렸다!', '상대 구구는 쓰러졌다!']);
});
test('review fix: on touch, the first tap on a new aim only selects it; the second fires', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const st = game.state, c = st.units.find((u) => u.id === 'ally-chimchar');
  c.moves = ['spikes'];
  const px = (x) => x * 24 + 12 - Math.round(game.camera.x), py = (y) => y * 24 + 12 - Math.round(game.camera.y);
  const tap = (x, y) => { game.handle({ type: 'cursor', px: px(x), py: py(y), touch: true }); game.handle({ type: 'click', px: px(x), py: py(y), touch: true }); };
  tap(c.x, c.y); tap(c.x, c.y);
  assert.ok(run(game, (m) => m === 'action'));
  game.handle({ type: 'confirm' });
  assert.equal(game.mode, 'target');
  const cur = game.aim;
  const t = [[0, -2], [0, 2], [-2, 0], [2, 0], [1, 1], [-1, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).find((p) => st.grid[p.y]?.[p.x] && st.grid[p.y][p.x] !== '#' && !(p.x === cur.x && p.y === cur.y));
  tap(t.x, t.y);
  assert.equal(st.spikes.length, 0);
  assert.equal(game.mode, 'target');
  tap(t.x, t.y);
  assert.ok(st.spikes.length > 0);
});

test('moving an ally shows a destination marker until it arrives', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const st = game.state, c = st.units.find((u) => u.id === 'ally-chimchar');
  const at = (x, y) => [{ type: 'cursor', px: x * 24 + 12 - Math.round(game.camera.x), py: y * 24 + 12 - Math.round(game.camera.y), touch: true }, { type: 'click', px: x * 24 + 12 - Math.round(game.camera.x), py: y * 24 + 12 - Math.round(game.camera.y), touch: true }];
  for (const e of at(c.x, c.y)) game.handle(e);
  const free = (x, y) => st.grid[y]?.[x] === '.' && !st.units.some((u) => u.x === x && u.y === y);
  const t = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).find((p) => free(p.x, p.y));
  for (const e of at(t.x, t.y)) game.handle(e);
  assert.equal(game.mode, 'walking');
  assert.ok(game.fx.log.includes('pokemon/move-marker'));
  assert.equal(game.fx.following, 1);
  assert.ok(run(game, (m) => m === 'action'));
  assert.equal(game.fx.following, 0);
});

// ---- 2차 변화기 이펙트: 상태 연출 ----
import { createMapAttack } from '../src/render/mapAttack.js';
const statusAnim = (moveId, result, units, fx = null) => createMapAttack({ attacker: units[0], defender: units[1] ?? null, move: { ...MV2[moveId], id: moveId }, result: { kind: 'status', stageChanges: [], statusChanges: [], ...result }, lookup: (id) => units.find((u) => u.id === id), fx });
const runFor = (anim, sec) => { for (let t = 0; t < sec - 1e-9; t += 0.05) anim.update(0.05); };
test('weather shows the old weather until the screen-wide burst, then the new one', () => {
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 };
  const anim = statusAnim('rain-dance', { effects: [{ unitId: 'a', effect: 'weather', ok: true, from: 'sun', to: 'rain' }] }, [me]);
  assert.equal(anim.weatherShown, 'sun');
  runFor(anim, 0.45 + 0.6 - 0.1); assert.equal(anim.weatherShown, 'sun'); // 모으는 중
  runFor(anim, 0.2); assert.equal(anim.weatherShown, 'rain'); // 펑
  while (!anim.done) { anim.advance(); anim.update(0.05); }
  assert.equal(anim.weatherShown, undefined);
});
test('a failed weather call has no burst and leaves the weather alone', () => {
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 };
  const anim = statusAnim('rain-dance', { effects: [{ unitId: 'a', effect: 'weather', ok: false, reason: 'already' }] }, [me]);
  assert.equal(anim.weatherShown, undefined);
  runFor(anim, 1.2); assert.equal(anim.weatherShown, undefined);
});

import { TOSS_FLIGHT, TOSS_GAP } from '../src/data/moveFx.js';
test('tossed spikes stay hidden until each one lands', () => {
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 };
  const laid = [{ x: 5, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 3 }]; // 벽·이미 깔린 칸 빼고 3칸만
  const anim = statusAnim('spikes', { effects: [{ unitId: 'a', effect: 'spikes', ok: true }], trapsLaid: laid }, [me]);
  assert.equal(anim.trapsHidden.length, 3);
  runFor(anim, 0.45 + TOSS_FLIGHT + 0.05); assert.equal(anim.trapsHidden.length, 2); // 첫 압정 착지
  runFor(anim, TOSS_GAP * 2); assert.equal(anim.trapsHidden.length, 0);
  assert.equal(anim.trapsShown.length, 3); // 적 압정이어도 연출 중엔 보임 (기존)
});
test('hidden trap tiles are not drawn', () => {
  const ctx = { fillRect() {}, set fillStyle(v) {} };
  const st = { spikes: [{ x: 1, y: 1, kind: 'spikes', side: 'ally', revealed: false }, { x: 2, y: 1, kind: 'spikes', side: 'ally', revealed: false }] };
  assert.deepEqual(drawTraps(ctx, st, [], [{ x: 2, y: 1 }]).map((t) => [t.x, t.y]), [[1, 1]]);
});

test('push moves blow toward the target even when it does not budge', () => {
  const made = [];
  const fx = { spawn: (spec, at, o) => { made.push({ id: spec.id, dir: o?.dir }); return {}; } };
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 }, foe = { id: 'e', species: 'geodude', side: 'enemy', x: 2, y: 4 };
  statusAnim('whirlwind', { effects: [{ unitId: 'e', effect: 'push', ok: false, reason: 'immune' }] }, [me, foe], fx);
  assert.deepEqual(made.find((m) => m.id === 'pokemon/gust-blast'), { id: 'pokemon/gust-blast', dir: 'down' });
  made.length = 0;
  statusAnim('roar', { effects: [{ unitId: 'e', effect: 'push', ok: true }], pushed: { unitId: 'e', from: { x: 4, y: 2 }, to: { x: 7, y: 2 }, path: [] } }, [me, foe], fx);
  assert.deepEqual(made.find((m) => m.id === 'pokemon/sound-wave'), { id: 'pokemon/sound-wave', dir: 'right' }); // 밀린 칸의 원래 위치 쪽
});

test('skipping the spikes message still waits for every caltrop to land', () => {
  const me = { id: 'a', species: 'squirtle', side: 'enemy', x: 2, y: 2 };
  const laid = [{ x: 5, y: 2 }, { x: 6, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 1 }];
  const anim = statusAnim('spikes', { effects: [{ unitId: 'a', effect: 'spikes', ok: true }], trapsLaid: laid }, [me]);
  runFor(anim, 0.5); // 던지기 시작
  anim.advance(); anim.update(0.05); // 대사 넘김
  assert.equal(anim.done, false);
  assert.ok(anim.trapsHidden.length > 0);
  assert.equal(anim.trapsShown.length, 5);
  runFor(anim, TOSS_GAP * 4 + TOSS_FLIGHT + 0.5);
  assert.equal(anim.trapsHidden.length, 0);
  assert.equal(anim.done, true);
});
test('a diagonal push target gets a gust that reaches level with it', () => {
  const made = [];
  const fx = { spawn: (spec, at, o) => { made.push({ id: spec.id, reach: spec.opts?.reach, dir: o?.dir }); return {}; } };
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 }, foe = { id: 'e', species: 'geodude', side: 'enemy', x: 3, y: 3 };
  statusAnim('whirlwind', { effects: [{ unitId: 'e', effect: 'push', ok: false, reason: 'immune' }] }, [me, foe], fx);
  assert.equal(made.find((m) => m.id === 'pokemon/gust-blast').reach, 24);
});

// ---- 속박기 표시 ----
import { bindLine } from '../src/render/mapAttack.js';
import { bindNote } from '../src/game/states.js';
test('bind tag, catch lines, forecast note and phase notices', () => {
  assert.ok(volatileTags({ bound: { by: 'a', moveId: 'wrap', turns: 2, reach: 1 } }).includes('속박2'));
  assert.equal(bindLine('꼬마돌', 'wrap'), '꼬마돌은 김밥말이에 묶였다!');
  assert.equal(bindLine('꼬마돌', 'fire-spin'), '꼬마돌은 회오리불꽃에 갇혔다!');
  assert.equal(bindNote('wrap'), '맞으면 3턴 속박');
  assert.equal(bindNote('tackle'), null);
  const u = { id: 'e', species: 'geodude', side: 'ally', x: 1, y: 1 };
  const out = phaseNotices([{ unitId: 'e', kind: 'bind', moveId: 'wrap', damage: 3, hpBefore: 20, maxHp: 40, x: 1, y: 1 }, { unitId: 'e', kind: 'bindEnd', moveId: 'wrap' }], [], () => u);
  assert.equal(out[0].lines.join(' '), '꼬마돌은 김밥말이의 데미지를 입고 있다!');
  assert.ok(out[0].hp);
  assert.equal(out[1].lines.join(' '), '꼬마돌은 김밥말이에서 풀려났다!');
});

// ---- 공격기 고유 효과 2차: 대사 ----
import { attackExtraLines } from '../src/render/mapAttack.js';
test('recharge notice, crash, screen and spin lines', () => {
  const u = { id: 'a', species: 'pidgey', side: 'ally', x: 1, y: 1 };
  assert.equal(phaseNotices([{ unitId: 'a', kind: 'recharge' }], [], () => u)[0].lines.join(' '), '구구는 반동으로 기술을 쓸 수 없다!');
  const msgs = attackExtraLines({ crash: 10, screensBroken: ['reflect'], spun: { freed: true, cleared: 2 } }, u).map((l) => l.text);
  assert.ok(msgs.includes('구구는 땅에 부딪혔다!'));
  assert.ok(msgs.includes('장벽이 깨졌다!'));
  assert.ok(msgs.includes('구구는 몸이 자유로워졌다!'));
  assert.ok(msgs.includes('압정이 날아갔다!'));
});

import { drawBurrowMark } from '../src/render/ui.js';
test('burrow mark draws by kind', () => {
  for (const kind of ['ground', 'water', 'sky', 'shadow']) {
    let n = 0;
    const ctx = { fillRect() { n++; }, set fillStyle(v) {}, set globalAlpha(v) {}, get globalAlpha() { return 1; }, save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() { n++; } };
    drawBurrowMark(ctx, { burrow: { kind } }, 24, 24);
    assert.ok(n > 0, kind);
  }
});

test('a charged move rushes and fires by itself at the start of the next ally phase', () => {
  const game = createGame({ rng: createRng(2) });
  assert.ok(run(game, (m) => m === 'idle'));
  const st = game.state, c = st.units.find((u) => u.id === 'ally-chimchar');
  const foe = st.units.find((u) => u.side === 'enemy');
  c.maxHp = c.hp = 999;
  foe.maxHp = foe.hp = 999; // 반격·기절 없이 확인
  c.charging = { moveId: 'sky-attack', targetId: foe.id };
  const before = foe.hp;
  game.handle({ type: 'endTurn' });
  assert.ok(run(game, () => c.charging === null && st.phase === 'player', [{ type: 'confirm' }], 200), `mode ${game.mode} phase ${st.phase}`);
  assert.ok(run(game, (m) => m === 'idle', null, 60), `stuck in ${game.mode}`); // 대사는 자동으로 넘어감
  assert.ok(foe.hp < before || !st.units.includes(foe));
  assert.equal(c.acted, true);
});

test('hiding a newly tossed caltrop does not hide toxic spikes on the same tile', () => {
  const ctx = { fillRect() {}, set fillStyle(v) {} };
  const st = { spikes: [{ x: 2, y: 1, kind: 'toxicSpikes', side: 'ally' }, { x: 2, y: 1, kind: 'spikes', side: 'ally' }] };
  assert.deepEqual(drawTraps(ctx, st, [], [{ x: 2, y: 1, kind: 'spikes' }]).map((t) => t.kind), ['toxicSpikes']);
});

test('frustration slides attacker and shoved foe from their old tiles', () => {
  const me = { id: 'a', species: 'rattata', side: 'ally', x: 2, y: 1, hp: 30, maxHp: 30 }, foe = { id: 'e', species: 'geodude', side: 'enemy', x: 3, y: 1, hp: 30, maxHp: 30 };
  const result = { kind: 'attack', hits: [{ unitId: 'e', hit: true, typeMult: 1, damage: 5, hpBefore: 35, fainted: false, crit: false }], stageChanges: [], statusChanges: [], stepped: { unitId: 'a', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }, shoved: { unitId: 'e', from: { x: 2, y: 1 }, to: { x: 3, y: 1 } } };
  const anim = createMapAttack({ attacker: me, defenders: [foe], move: { ...MV2.frustration, id: 'frustration' }, result, lookup: (id) => [me, foe].find((u) => u.id === id), fx: null });
  assert.equal(anim.unitPose(me).dx, -24); // 아직 원래 칸
  assert.equal(anim.unitPose(foe).dx, -24);
  while (!anim.done) { anim.advance(); anim.update(0.05); }
});
test('the summoned gyarados stays hidden until its geyser has risen', () => {
  const me = { id: 'a', species: 'magikarp', side: 'ally', x: 2, y: 2 }, g = { id: 'g', species: 'gyarados', side: 'ally', x: 3, y: 2 };
  const anim = statusAnim('splash', { effects: [{ unitId: 'a', effect: 'splash', ok: true, summoned: 'g' }], summoned: 'g' }, [me, g]);
  assert.equal(anim.unitPose(g)?.hidden, true);
  runFor(anim, 0.45 + 1.2);
  assert.notEqual(anim.unitPose(g)?.hidden, true);
});

test('pain split makes both pokemon flinch when the orbs land', () => {
  const me = { id: 'a', species: 'pidgey', side: 'ally', x: 2, y: 2 }, foe = { id: 'e', species: 'geodude', side: 'enemy', x: 3, y: 2 };
  const anim = statusAnim('pain-split', { effects: [{ unitId: 'e', effect: 'painSplit', ok: true }] }, [me, foe]);
  runFor(anim, 0.45 + 0.6);
  assert.equal(anim.unitPose(me)?.anim, 'Hurt');
  assert.equal(anim.unitPose(foe)?.anim, 'Hurt');
});

test('teeter dance spins the dancer before the confusion', () => {
  const me = { id: 'a', species: 'pidgey', side: 'ally', x: 2, y: 2 };
  const anim = statusAnim('teeter-dance', { effects: [{ unitId: 'a', effect: 'teeterDance', ok: true }] }, [me]);
  runFor(anim, 0.5);
  assert.ok(['Twirl', 'Rotate'].includes(anim.unitPose(me)?.anim));
});

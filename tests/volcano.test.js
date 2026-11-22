import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';

const VC = DUNGEONS.find((d) => d.id === 'volcano');

test('volcano is 8-2 next to the stage 8 placeholder; desert opens it', () => {
  const s8 = DUNGEONS.filter((d) => d.stage === 8);
  assert.deepEqual(s8.map((d) => [d.id, d.branch, d.unlock]), [['trial-6', 1, 'power-plant'], ['volcano', 2, 'desert']]);
  assert.equal(VC.name, '화산동굴'); assert.equal(VC.theme, 'volcano');
  assert.deepEqual(VC.baseLevel, s8[0].baseLevel);
  assert.ok(VC.volcano);
  assert.deepEqual(VC.weather, [{ id: 'sun', chance: 0.3 }]);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 9).unlock, ['trial-6', 'volcano']);
});

test('volcano: slugma line always in the pool within the stage cap', () => {
  for (let f = 1; f <= VC.floors; f++) {
    const pool = encounterPool(VC, f);
    assert.ok(pool.includes('slugma'), `floor ${f}`);
    assert.equal(pool.includes('magcargo'), VC.stageCap(f) >= 1, `floor ${f}`);
  }
});

// ---- 규칙 ----
import { createBattle, endPhase, basaltHeat } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { canEnter, reachable } from '../src/core/pathfind.js';
import { steamPath, ventFires, steamPreview, steamRisk } from '../src/core/vent.js';
import { tilesOf } from '../src/core/shapes.js';
import { planEnemyAction } from '../src/core/ai.js';

//            0123456789
const ROWS = ['V.....LL..', // 0  분출구 (오른쪽으로 뿜음)
              '..........', // 1
              '...v......', // 2
              '..........'];// 3
function setup(allies, foes = [['bidoof', 9, 3]], { rows = ROWS, vents = [{ x: 0, y: 0, dir: 'right', phase: 1 }] } = {}) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, vents, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 192; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}

test('lava: grounded units cannot enter; flyers, dragons and the slugma line can', () => {
  const { at } = setup([['bidoof', 1, 1], ['starly', 2, 1], ['slugma', 3, 1], ['psyduck', 4, 1], ['dratini', 5, 1]]);
  assert.equal(canEnter('L', at(1, 1)), false);
  assert.equal(canEnter('L', at(4, 1)), false); // 물 타입도 용암은 못 감
  assert.ok(canEnter('L', at(2, 1)) && canEnter('L', at(3, 1)) && canEnter('L', at(5, 1)));
  assert.equal(canEnter('V', at(2, 1)), false);
  const r = reachable(ROWS, [at(3, 1)], at(3, 1), 6);
  assert.ok(r.has('6,0')); // 마그마그는 용암 위에 설 수 있음
});

test('vent: path runs up to 6 cells until a wall/rock/vent; fires every 3rd round by phase; line moves stop at a vent', () => {
  const { s } = setup([['bidoof', 9, 2]]);
  const v = s.vents[0];
  assert.deepEqual(steamPath(s, v).map((p) => p.x), [1, 2, 3, 4, 5, 6]);
  const rock = setup([['bidoof', 9, 2]], undefined, { rows: ['V..^......', '..........'] });
  assert.deepEqual(steamPath(rock.s, rock.s.vents[0]).map((p) => p.x), [1, 2]);
  assert.ok(ventFires(v, 1) && ventFires(v, 4) && !ventFires(v, 2) && !ventFires(v, 3));
  s.turn = 1; assert.equal(steamPreview(s).length, 6);
  s.turn = 2; assert.equal(steamPreview(s).length, 0);
  const line = tilesOf(s, { x: 3, y: 0, side: 'ally' }, { shape: { type: 'line', length: 4 } }, { dir: 'left' });
  assert.deepEqual(line.map((p) => p.x), [2, 1]);
});

test('steam: 1/16 water damage, pushed until blocked — grounded units stop at the lava bank, flyers sail over it; far one first', () => {
  const { s, at } = setup([['geodude', 2, 0], ['bidoof', 4, 0], ['starly', 5, 0]]); // geodude: 물 4배
  const geo = at(2, 0), bid = at(4, 0), sta = at(5, 0);
  s.turn = 1; endPhase(s, createRng(1)); endPhase(s, createRng(1)); // 아군 → 적 페이즈 끝 = 분출
  assert.equal(bid.hp, 192 - 12); // 1/16
  assert.equal(geo.hp, 192 - 48); // 1/16 × 4
  assert.deepEqual([sta.x, sta.y], [9, 0]); // 용암 넘어 맵 끝까지
  assert.deepEqual([bid.x, bid.y], [5, 0]); // 용암(6) 앞 둑에서 멈춤
  assert.deepEqual([geo.x, geo.y], [4, 0]); // 앞서 밀린 포켓몬 바로 앞
  assert.equal(s.log.steamPushes.length, 3);
  assert.deepEqual(s.log.steamed, [{ x: 0, y: 0, dir: 'right' }]);
});

test('steam ignores hidden units and units out of the path; not on other rounds', () => {
  const { s, at } = setup([['bidoof', 2, 0], ['bidoof', 2, 1]]);
  const a = at(2, 0), b = at(2, 1);
  s.turn = 2; endPhase(s, createRng(1)); endPhase(s, createRng(1)); // 분출 없는 라운드
  assert.equal(a.hp, 192); assert.deepEqual([a.x, a.y], [2, 0]);
  a.burrow = { kind: 'ground' };
  s.turn = 1; endPhase(s, createRng(1)); endPhase(s, createRng(1));
  assert.equal(a.hp, 192); assert.deepEqual([a.x, a.y], [2, 0]); // 숨기 중
  assert.equal(b.hp, 192); assert.deepEqual([b.x, b.y], [2, 1]); // 경로 밖
});

test('basalt: ending an action there burns 1/12; fire types, flyers and hidden units are immune', () => {
  const { s, at } = setup([['bidoof', 3, 2], ['ponyta', 9, 1], ['starly', 8, 1]]);
  const ev = basaltHeat(s, at(3, 2));
  assert.equal(ev[0].damage, 16); assert.equal(at(3, 2).hp, 176); assert.equal(ev[0].kind, 'basalt');
  assert.deepEqual(basaltHeat(s, at(9, 1)), []); // 평지
  for (const u of [at(9, 1), at(8, 1)]) { u.x = 3; u.y = 2; assert.deepEqual(basaltHeat(s, u), []); u.x = 9; }
});

test('AI: an enemy does not end its move in a steam path that fires this round', () => {
  const rows = ['V.........', '..........', '..........'];
  const { s } = setup([['bidoof', 0, 2]], [['bidoof', 5, 0]], { rows });
  for (const u of s.units) u.moves = ['tackle'];
  s.turn = 1;
  const foe = s.units.find((u) => u.side === 'enemy');
  assert.ok(steamRisk(s, foe, { x: 3, y: 0 }) > 0);
  const plan = planEnemyAction(s, foe);
  assert.notEqual(plan.moveTo.y, 0, JSON.stringify(plan.moveTo));
});

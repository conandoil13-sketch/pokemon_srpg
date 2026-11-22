import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';

const VC = DUNGEONS.find((d) => d.id === 'volcano');

test('volcano is 8-2 next to the stage 8 placeholder; desert opens it', () => {
  const s8 = DUNGEONS.filter((d) => d.stage === 8);
  assert.deepEqual(s8.map((d) => [d.id, d.branch, d.unlock]), [['ice-cave', 1, 'power-plant'], ['volcano', 2, 'desert']]);
  assert.equal(VC.name, '화산동굴'); assert.equal(VC.theme, 'volcano');
  assert.deepEqual(VC.baseLevel, s8[0].baseLevel);
  assert.ok(VC.volcano);
  assert.deepEqual(VC.weather, [{ id: 'sun', chance: 0.3 }]);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 9).unlock, ['ice-cave', 'volcano']);
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

// ---- 층 생성 ----
import { generateFloor } from '../src/core/floorgen.js';
import { VEC as V4 } from '../src/core/vent.js';

test('volcano floors: lava rivers, 2-3 vents facing a straight run of ground, basalt only next to lava/water, nothing in the start columns, stairs reachable on foot', () => {
  let slugOnLava = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const f = 1 + (seed % VC.floors), m = generateFloor(VC, f, seed), T = m.tiles, W = T[0].length, H = T.length;
    const cells = (c) => { const o = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T[y][x] === c) o.push({ x, y }); return o; };
    assert.ok(cells('L').length >= 8, `seed ${seed}: lava`);
    assert.ok(m.vents.length >= 2 && m.vents.length <= 3, `seed ${seed}: ${m.vents.length} vents`);
    for (const v of m.vents) {
      assert.equal(T[v.y][v.x], 'V'); assert.ok(v.x >= 3); assert.ok([0, 1, 2].includes(v.phase));
      const [dx, dy] = V4[v.dir];
      for (let i = 1; i <= 4; i++) assert.ok('.v'.includes(T[v.y + dy * i]?.[v.x + dx * i]) && v.x + dx * i >= 3, `seed ${seed}: vent run`);
      for (const c of steamPath({ grid: T }, v)) assert.ok(c.x >= 3, `seed ${seed}: steam reaches the start columns`);
    }
    for (const c of cells('v')) assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => 'L~'.includes(T[c.y + dy]?.[c.x + dx] ?? '#')), `seed ${seed}: basalt`);
    for (const c of [...cells('L'), ...cells('V'), ...cells('v')]) assert.ok(c.x >= 3, `seed ${seed}: start columns`);
    for (const e of m.enemies) if (T[e.y][e.x] === 'L') { assert.ok(['slugma', 'magcargo'].includes(e.species)); slugOnLava++; }
    for (const p of [...m.allySlots, ...m.chests, ...(m.stairs ? [m.stairs] : [])]) assert.ok(!'LVv'.includes(T[p.y][p.x]));
    if (m.stairs) {
      const s = createBattle(m, [newMember('bidoof', 40, createRng(1))]);
      assert.ok(reachable(s.grid, [s.units[0]], s.units[0], 999).has(`${m.stairs.x},${m.stairs.y}`), `seed ${seed}: stairs`);
    }
  }
  assert.ok(slugOnLava > 0);
  assert.equal(generateFloor(DUNGEONS[0], 1, 1).vents, undefined);
});

const vmap = (tiles, enemies) => ({ tiles, allySlots: [{ x: 0, y: 0 }, { x: 0, y: 2 }], enemies, vents: [{ x: 5, y: 0, dir: 'down', phase: 2 }] });
const tick = (game, until, sec = 60) => { for (let t = 0; t < sec; t += 0.05) { if (game.mode === 'notice') game.handle({ type: 'confirm' }); game.update(0.05); if (until()) return true; } return false; };

test('scene: basalt knocking out the last real ally while a bot is still unsettled ends the battle (no loop)', async () => {
  const { createGame } = await import('../src/game/states.js');
  const game = createGame({ rng: createRng(3), map: vmap(['v....V', '......', '......'], [{ species: 'machop', x: 4, y: 2, level: 5 }]), party: [newMember('bidoof', 40, createRng(1)), newMember('bidoof', 40, createRng(2))], theme: 'volcano' });
  game.handle({ type: 'confirm' }); tick(game, () => game.mode === 'idle');
  const s = game.state, [a, b] = s.units.filter((u) => u.side === 'ally');
  a.x = 0; a.y = 0; a.hp = 1; b.bot = true; b.acted = b.moved = true;
  assert.doesNotThrow(() => game.handle({ type: 'endTurn' }));
  assert.ok(tick(game, () => game.mode === 'result')); assert.equal(s.result, 'lose');
});

test('scene: an enemy releasing a charged move on basalt is burned once', async () => {
  const { createGame } = await import('../src/game/states.js');
  const game = createGame({ rng: createRng(3), map: vmap(['.....V', '......', '....vv'], [{ species: 'machop', x: 5, y: 2, level: 40 }]), party: [newMember('bidoof', 5, createRng(1)), newMember('bidoof', 5, createRng(2))], theme: 'volcano' });
  game.handle({ type: 'confirm' }); tick(game, () => game.mode === 'idle');
  const s = game.state, e = s.units.find((u) => u.side === 'enemy');
  let burns = 0; const hp0 = e.hp;
  e.charging = { moveId: 'solar-beam', targetId: s.units.find((u) => u.side === 'ally').id };
  game.handle({ type: 'endTurn' });
  tick(game, () => s.phase === 'player' && s.turn === 2);
  burns = Math.round((hp0 - e.hp) / Math.max(1, Math.floor(e.maxHp / 12)));
  assert.ok(burns <= 1, `burned ${burns} times`);
});

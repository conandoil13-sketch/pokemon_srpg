import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';

test('power plant is 7-1 next to the stage 7 placeholder; sewer opens it, deep cave opens 7-2', () => {
  const s7 = DUNGEONS.filter((d) => d.stage === 7);
  assert.deepEqual(s7.map((d) => [d.id, d.branch, d.unlock]), [['power-plant', 1, 'sewer'], ['trial-5', 2, 'deep-cave']]);
  const pp = s7[0];
  assert.equal(pp.name, '발전소'); assert.equal(pp.theme, 'power-plant');
  assert.deepEqual(pp.baseLevel, s7[1].baseLevel); // 같은 자리 곡선
  assert.ok(pp.power && pp.ambush.species === 'voltorb' && pp.ambush.drop === 12);
  assert.deepEqual(pp.weather, []);
  assert.equal(pp.clusters['~'], 0);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 8).unlock, ['power-plant', 'trial-5']);
});

// ---- 발전기 ----
import { createBattle, endPhase } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { genRange, firesAt, pulsePreview, shockDamage, charged } from '../src/core/generator.js';
import { expectedDamage, terrainCtx } from '../src/core/damage.js';
import { tilesOf } from '../src/core/shapes.js';
import { planEnemyAction } from '../src/core/ai.js';
import { MOVES } from '../src/data/moves.js';

const ROWS = ['..........', '...GG.....', '...GG.....', '..........', '..........'];
function setup(allies, foes = [['bidoof', 9, 4]], { rows = ROWS, gens = [{ x: 3, y: 1, phase: 0 }] } = {}) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, generators: gens, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 120; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}
const k = (cells) => new Set(cells.map((p) => `${p.x},${p.y}`));

test('generator: range is 1-2 tiles (manhattan) around the 2x2 body, inside the map', () => {
  const { s } = setup([['bidoof', 0, 4]]);
  const r = k(genRange(s, s.generators[0]));
  for (const c of ['2,1', '1,1', '5,2', '6,2', '3,0', '3,3', '3,4', '2,0', '5,3']) assert.ok(r.has(c), c);
  for (const c of ['0,1', '3,1', '4,2', '7,2', '1,0', '2,4']) assert.ok(!r.has(c), c);
});

test('generator: fires every second round by phase; the preview shows this round\'s cells', () => {
  const g0 = { phase: 0 }, g1 = { phase: 1 };
  assert.deepEqual([1, 2, 3, 4].map((t) => firesAt(g0, t)), [false, true, false, true]);
  assert.deepEqual([1, 2, 3, 4].map((t) => firesAt(g1, t)), [true, false, true, false]);
  const { s } = setup([['bidoof', 0, 4]]);
  s.turn = 1; assert.equal(pulsePreview(s).length, 0);
  s.turn = 2; assert.ok(k(pulsePreview(s)).has('2,1'));
});

test('shock: 1/6 x electric effectiveness, immunities, absorbing abilities', () => {
  const { s, at } = setup([['bidoof', 0, 0], ['psyduck', 1, 0], ['turtwig', 2, 0], ['pikachu', 0, 3], ['geodude', 1, 3], ['starly', 2, 3]]);
  assert.deepEqual(shockDamage(at(0, 0)), { damage: 20, kind: 'shock' });
  assert.equal(shockDamage(at(1, 0)).damage, 40); // 물: 약점
  assert.equal(shockDamage(at(2, 0)).damage, 10); // 풀: 반감
  assert.equal(shockDamage(at(0, 3)), null); // 전기
  assert.equal(shockDamage(at(1, 3)), null); // 땅 (꼬마돌 바위·땅)
  assert.equal(shockDamage(at(2, 3)).damage, 40); // 비행: 약점 (떠 있어도 맞음)
  const b = at(0, 0);
  b.ability = 'magic-guard'; assert.equal(shockDamage(b), null);
  b.ability = null; b.burrow = { kind: 'ground' }; assert.equal(shockDamage(b), null); b.burrow = null;
  const p = at(0, 3);
  p.ability = 'volt-absorb'; assert.deepEqual(shockDamage(p), { heal: 30, ability: 'volt-absorb' }); // 전기 타입이라도 회복
  p.ability = 'motor-drive'; assert.deepEqual(shockDamage(p), { boost: 'spe', ability: 'motor-drive' });
  p.ability = 'lightning-rod'; assert.deepEqual(shockDamage(p), { boost: 'spa', ability: 'lightning-rod' });
});

test('shock fires at the end of the enemy phase on its round, hitting both sides in range', () => {
  const { s, at } = setup([['bidoof', 2, 1], ['bidoof', 0, 4]], [['bidoof', 5, 1]]);
  const near = at(2, 1), far = at(0, 4), foe = at(5, 1);
  s.turn = 2; endPhase(s, () => 0.99); // 아군 페이즈 끝: 없음
  assert.equal(near.hp, 120);
  endPhase(s, () => 0.99); // 적 페이즈 끝 (라운드 2): 방출
  assert.equal(near.hp, 100); assert.equal(foe.hp, 100); assert.equal(far.hp, 120);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'shock' && e.unitId === near.id));
  endPhase(s, () => 0.99); endPhase(s, () => 0.99); // 라운드 3: 없음
  assert.equal(near.hp, 100);
});

test('charged: an electric type touching a generator hits 1.2x harder with electric moves only', () => {
  const { s, at } = setup([['pikachu', 2, 1], ['pikachu', 0, 3], ['bidoof', 2, 2]], [['bidoof', 6, 4]]);
  const on = at(2, 1), off = at(0, 3), normal = at(2, 2), foe = at(6, 4);
  for (const u of [on, off]) { u.stats = { ...off.stats }; u.stages = {}; }
  assert.ok(charged(s, on) && !charged(s, off) && charged(s, normal)); // 자리만 봄 — 타입은 데미지에서
  assert.equal(expectedDamage(normal, foe, MOVES.thunderbolt, '.', 1, null, terrainCtx(s, normal, foe)), expectedDamage(normal, foe, MOVES.thunderbolt, '.', 1, null, { ...terrainCtx(s, normal, foe), charged: false })); // 전기 타입 아님
  const tb = MOVES.thunderbolt, dmg = (a, mv) => expectedDamage(a, foe, mv, '.', 1, null, terrainCtx(s, a, foe));
  assert.ok(Math.abs(dmg(on, tb) / dmg(off, tb) - 1.2) < 1e-9);
  assert.equal(dmg(on, MOVES.tackle), dmg(off, MOVES.tackle));
});

test('generators block straight-line moves like walls', () => {
  const { s, at } = setup([['bidoof', 0, 1]]);
  const line = tilesOf(s, at(0, 1), { shape: { type: 'line', length: 5 } }, { dir: 'right' });
  assert.deepEqual(line.map((p) => p.x), [1, 2]);
});

test('AI: steps off a cell that is about to be shocked when the attack is the same', () => {
  const rows = ['.....', '.GG..', '.GG..', '.....', '.....', '.....'];
  const { s, at } = setup([['bidoof', 0, 4]], [['bidoof', 3, 5]], { rows, gens: [{ x: 1, y: 1, phase: 0 }] }); // 공격 자리: (0,3)·(1,4) 는 방출 칸, (0,5) 만 안전
  for (const u of s.units) u.moves = ['tackle'];
  s.turn = 2; s.phase = 'enemy';
  const plan = planEnemyAction(s, at(3, 5));
  assert.equal(plan.attack?.moveId, 'tackle');
  assert.ok(!k(pulsePreview(s)).has(`${plan.moveTo.x},${plan.moveTo.y}`), JSON.stringify(plan.moveTo));
});

// ---- 층 생성 ----
import { generateFloor, reachableFrom } from '../src/core/floorgen.js';
const PP = DUNGEONS.find((d) => d.id === 'power-plant');

test('power floors: 2-3 generators of 2x2 G, apart, outside the start columns, alternating phase, paths intact', () => {
  for (let seed = 1; seed <= 24; seed++) for (const floor of [1, 4, PP.floors]) {
    const f = generateFloor(PP, floor, seed * 977);
    const gs = f.generators;
    assert.ok(gs.length >= 2 && gs.length <= 3, `${seed}/${floor}: ${gs.length}`);
    gs.forEach((g, i) => {
      assert.equal(g.phase, i % 2);
      assert.ok(g.x >= 3);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.equal(f.tiles[g.y + dy][g.x + dx], 'G');
    });
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
      const d = Math.min(...[0, 1].flatMap((ax) => [0, 1].flatMap((ay) => [0, 1].flatMap((bx) => [0, 1].map((by) => Math.abs(gs[i].x + ax - gs[j].x - bx) + Math.abs(gs[i].y + ay - gs[j].y - by))))));
      assert.ok(d >= 3, `${seed}/${floor} gap ${d}`);
    }
    const gCount = f.tiles.join('').split('G').length - 1;
    assert.equal(gCount, gs.length * 4);
    const H = f.tiles.length, reach = reachableFrom(f.tiles, { x: 1, y: Math.floor(H / 2) });
    for (let y = 0; y < H; y++) for (let x = 0; x < f.tiles[0].length; x++) if ('."^>'.includes(f.tiles[y][x])) assert.ok(reach.has(`${x},${y}`), `${seed}/${floor} cut ${x},${y}`);
    assert.ok(!f.tiles.join('').includes('~') && !f.tiles.join('').includes('"'));
  }
});

test('other dungeons get no generators', () => {
  const f = generateFloor(DUNGEONS.find((d) => d.id === 'city'), 2, 4242);
  assert.equal(f.generators, undefined);
  assert.ok(!f.tiles.join('').includes('G'));
});

// ---- 찌리리공 기습 ----
import { ambushPlan, AMBUSH_SIGHT } from '../src/core/ambush.js';
import { hiddenFrom } from '../src/core/stealth.js';
import { moveUnit } from '../src/core/battle.js';

const OPEN = Array.from({ length: 6 }, () => '............');
function ambushSetup(allies, voltorbs, extra = []) {
  const ms = allies.map(([sp]) => newMember(sp, 50, createRng(1)));
  const map = { tiles: OPEN, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: [...voltorbs.map(([x, y]) => ({ species: 'voltorb', x, y, level: 30, ambush: true })), ...extra.map(([species, x, y]) => ({ species, x, y, level: 30 }))] };
  const s = createBattle(map, ms);
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}

test('ambush voltorb: hidden and still until an ally comes within 3 or hits it', () => {
  const { s, at } = ambushSetup([['bidoof', 0, 2]], [[8, 2]]);
  const v = at(8, 2);
  assert.ok(v.moves.includes('self-destruct'));
  assert.ok(hiddenFrom(s, 'ally').has(v.id));
  assert.deepEqual(ambushPlan(s, v), { moveTo: { x: 8, y: 2 }, attack: null });
  const b = at(0, 2);
  moveUnit(s, b.id, 5, 2); // 3칸 안
  assert.equal(AMBUSH_SIGHT, 3);
  assert.equal(v.ambush, 'awake');
  moveUnit(s, b.id, 0, 2); // 멀어져도 다시 숨지 않음
  assert.ok(!hiddenFrom(s, 'ally').has(v.id));
  const w = ambushSetup([['bidoof', 0, 2]], [[9, 4]]);
  const v2 = w.at(9, 4); v2.revealed = true; // 맞음
  assert.notDeepEqual(ambushPlan(w.s, v2).moveTo, { x: 9, y: 4 });
  assert.equal(v2.ambush, 'awake');
});

test('awake voltorb rushes the nearest ally and always self-destructs when it can reach one', () => {
  const { s, at } = ambushSetup([['bidoof', 2, 2], ['bidoof', 2, 4]], [[5, 2]]);
  const v = at(5, 2); v.ambush = 'awake';
  const plan = ambushPlan(s, v);
  assert.equal(plan.attack?.moveId, 'self-destruct');
  const d = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  assert.ok(Math.max(Math.abs(plan.moveTo.x - 2), Math.abs(plan.moveTo.y - 2)) <= 1 && Math.max(Math.abs(plan.moveTo.x - 2), Math.abs(plan.moveTo.y - 4)) <= 1, JSON.stringify(plan.moveTo)); // 둘 다 맞는 자리
  const far = ambushSetup([['bidoof', 0, 0]], [[11, 5]]);
  const fv = far.at(11, 5); fv.ambush = 'awake';
  const p2 = ambushPlan(far.s, fv);
  assert.equal(p2.attack, null);
  assert.ok(d(p2.moveTo, { x: 0, y: 0 }) < d(fv, { x: 0, y: 0 }) - 2); // 전력으로 다가감
});

test('power floors place 2 ambush voltorbs (3 on the last two floors), 12 levels under the floor, away from the start', () => {
  for (let seed = 1; seed <= 12; seed++) for (const floor of [1, PP.floors - 1, PP.floors]) {
    const f = generateFloor(PP, floor, seed * 131);
    const am = f.enemies.filter((e) => e.ambush);
    assert.equal(am.length, floor >= PP.floors - 1 ? 3 : 2, `${seed}/${floor}`);
    for (const e of am) {
      assert.equal(e.species, 'voltorb');
      assert.equal(e.level, PP.baseLevel[floor - 1] - 12);
      assert.ok(e.x >= 8 && f.tiles[e.y][e.x] === '.');
    }
    const spots = f.enemies.map((e) => `${e.x},${e.y}`);
    assert.equal(new Set(spots).size, spots.length);
  }
});

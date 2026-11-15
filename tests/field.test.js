import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase, moveUnit } from '../src/core/battle.js';
import { critRate } from '../src/core/abilities.js';
import { moveBudget } from '../src/core/status.js';
import { effectiveStat } from '../src/core/stages.js';
import { calcDamage } from '../src/core/damage.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.01;
// allies: [[species, x, y]], foes: [[species, x, y, level?]]
const field = (allies, foes, { w = 12, h = 8, weather = null } = {}) => {
  const ms = allies.map(([sp], i) => newMember(sp, 40, createRng(i + 1)));
  const map = { tiles: Array.from({ length: h }, () => '.'.repeat(w)), allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y, level = 40]) => ({ species, x, y, level })), weather };
  const s = createBattle(map, ms);
  return { s, a: s.units.filter((u) => u.side === 'ally'), f: s.units.filter((u) => u.side === 'enemy') };
};
const round = (s) => { endPhase(s, () => 0.9); endPhase(s, () => 0.9); };
const AURA_ZONE = ['tailwind', 'safeguard', 'mist', 'lucky-chant', 'reflect', 'light-screen', 'mud-sport', 'water-sport'];

test('field moves become learnable as self moves', () => {
  for (const id of AURA_ZONE) {
    assert.equal(MOVES[id].learnable, true, id);
    assert.equal(MOVES[id].kind, 'self', id);
    assert.ok(MOVES[id].effect, id);
  }
});

test('tailwind aura: +1 move and x1.25 speed for allies within 2 of the user, follows the user', () => {
  const { s, a } = field([['pidgey', 1, 1], ['pikachu', 3, 1], ['chimchar', 7, 1]], [['geodude', 11, 7]]);
  const [u, near, far] = a;
  const base = { near: moveBudget(near), far: moveBudget(far), spe: effectiveStat(near, 'spe') };
  assert.equal(applyMove(s, u.id, 'tailwind', u.id, hit).effects[0].ok, true);
  assert.equal(moveBudget(near), base.near + 1);
  assert.equal(effectiveStat(near, 'spe'), base.spe * 1.25);
  assert.equal(moveBudget(far), base.far);
  moveUnit(s, u.id, 6, 1);
  assert.equal(moveBudget(far), base.far + 1);
  assert.equal(moveBudget(near), base.near); // 거리 3
});

test('aura ends after 5 turns of its side, or when its owner faints; recast refreshes to 5', () => {
  const { s, a } = field([['pidgey', 1, 1], ['pikachu', 2, 1]], [['geodude', 11, 7]]);
  const [u, m] = a;
  applyMove(s, u.id, 'tailwind', u.id, hit);
  for (let i = 0; i < 4; i++) round(s);
  assert.equal(m.field.tailwind, true);
  u.acted = false;
  applyMove(s, u.id, 'tailwind', u.id, hit); // 다시 → 5턴
  for (let i = 0; i < 4; i++) round(s);
  assert.equal(m.field.tailwind, true);
  endPhase(s, () => 0.9); // 아군 페이즈 끝 (5번째)
  assert.equal(m.field.tailwind, false);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'fieldEnd' && e.what === 'tailwind'));
  const k = field([['pidgey', 1, 1], ['pikachu', 2, 1]], [['geodude', 11, 7]]);
  applyMove(k.s, k.a[0].id, 'tailwind', k.a[0].id, hit);
  k.a[0].hp = 1; k.a[0].status = 'poison';
  endPhase(k.s, () => 0.9); // 독으로 쓰러짐
  assert.equal(k.a[1].field.tailwind, false);
});

test('safeguard blocks new ailments and yawn from foes; mist blocks foe stat drops; lucky chant stops crits', () => {
  const { s, a, f } = field([['clefairy', 1, 1], ['pikachu', 2, 1]], [['oddish', 3, 1]]);
  const [u, m] = a;
  applyMove(s, u.id, 'safeguard', u.id, hit);
  endPhase(s);
  const r = applyMove(s, f[0].id, 'poison-powder', m.id, hit);
  assert.equal(r.statusChanges[0].reason, 'safeguard');
  f[0].acted = false;
  assert.equal(applyMove(s, f[0].id, 'yawn', m.id, hit).effects[0].reason, 'safeguard');
  const t = field([['clefairy', 1, 1], ['pikachu', 2, 1]], [['meowth', 3, 1]]);
  applyMove(t.s, t.a[0].id, 'mist', t.a[0].id, hit);
  endPhase(t.s);
  const g = applyMove(t.s, t.f[0].id, 'growl', t.a[1].id, hit);
  assert.equal(t.a[1].stages.atk, 0);
  assert.ok(g.stageChanges.every((c) => !c.applied));
  const l = field([['clefairy', 1, 1], ['pikachu', 2, 1]], [['meowth', 3, 1]]);
  applyMove(l.s, l.a[0].id, 'lucky-chant', l.a[0].id, hit);
  assert.equal(critRate(l.f[0], l.a[1], MOVES.slash), 0);
});

test('reflect and light screen halve hits on their side inside the zone, crits ignore them', () => {
  const mk = () => field([['clefairy', 1, 1], ['snorlax', 2, 1]], [['machamp', 3, 1]]);
  const plain = mk(), shield = mk();
  applyMove(shield.s, shield.a[0].id, 'reflect', shield.a[0].id, hit);
  const roll = () => 0.5;
  const d0 = calcDamage(plain.f[0], plain.a[1], MOVES['karate-chop'], { rng: () => 0.5, defTile: '.' }).damage;
  const d1 = calcDamage(shield.f[0], shield.a[1], MOVES['karate-chop'], { rng: roll, defTile: '.' }).damage;
  assert.ok(Math.abs(d1 - Math.floor(d0 / 2)) <= 1, `${d0} → ${d1}`);
  const crit = (u) => { const seq = [0.01, 0, 0.5]; let i = 0; return () => seq[i++] ?? 0.5; };
  shield.f[0].focusEnergy = true; plain.f[0].focusEnergy = true; // 급소율 1/4 → 두 번째 난수 0 이면 급소
  const c0 = calcDamage(plain.f[0], plain.a[1], MOVES['karate-chop'], { rng: crit(), defTile: '.' });
  const c1 = calcDamage(shield.f[0], shield.a[1], MOVES['karate-chop'], { rng: crit(), defTile: '.' });
  assert.equal(c0.crit, true);
  assert.equal(c1.damage, c0.damage);
  // 적이 장판 칸에 서도 적은 혜택 없음
  shield.f[0].x = 2; shield.f[0].y = 2;
  moveUnit(shield.s, shield.f[0].id, 2, 2);
  assert.equal(shield.f[0].field.reflect, false);
  // 쓴 포켓몬이 나가도 장판은 그 자리에
  moveUnit(shield.s, shield.a[0].id, 9, 6);
  assert.equal(shield.a[1].field.reflect, true);
  assert.equal(shield.a[0].field.reflect, false);
});

test('mud sport and water sport halve electric and fire if either side stands in the zone', () => {
  const run = (ax, fx) => {
    const t = field([['diglett', 1, 1], ['pikachu', ax, 1]], [['snorlax', fx, 1]]);
    t.f[0].hp = t.f[0].maxHp = 9999;
    const before = calcDamage(t.a[1], t.f[0], MOVES['thunder-shock'], { rng: () => 0.5, defTile: '.' }).damage;
    applyMove(t.s, t.a[0].id, 'mud-sport', t.a[0].id, hit);
    moveUnit(t.s, t.a[0].id, 1, 1);
    return calcDamage(t.a[1], t.f[0], MOVES['thunder-shock'], { rng: () => 0.5, defTile: '.' }).damage / before;
  };
  assert.ok(Math.abs(run(2, 8) - 0.5) < 0.1); // 공격자만 안
  assert.ok(Math.abs(run(8, 3) - 0.5) < 0.1); // 대상만 안
  assert.equal(run(8, 10), 1); // 둘 다 밖
});

// ---- Task 2: 날씨 부르기 ----
test('weather moves set the weather for 5 turns of the user side, then the floor weather returns', () => {
  const { s, a } = field([['squirtle', 1, 1]], [['geodude', 11, 7]]);
  assert.equal(MOVES['rain-dance'].learnable, true);
  assert.equal(applyMove(s, a[0].id, 'rain-dance', a[0].id, hit).effects[0].ok, true);
  assert.equal(s.weather, 'rain');
  for (let i = 0; i < 4; i++) round(s);
  assert.equal(s.weather, 'rain');
  endPhase(s, () => 0.9);
  assert.equal(s.weather, null);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'weatherEnd'));
});

test('weather move fails on the same weather and on a fog floor; overrides an ability weather and returns to it', () => {
  const r = field([['squirtle', 1, 1]], [['geodude', 11, 7]], { weather: 'rain' });
  assert.equal(applyMove(r.s, r.a[0].id, 'rain-dance', r.a[0].id, hit).effects[0].reason, 'already');
  const f = field([['squirtle', 1, 1]], [['geodude', 11, 7]], { weather: 'fog' });
  assert.equal(applyMove(f.s, f.a[0].id, 'rain-dance', f.a[0].id, hit).effects[0].reason, 'fog');
  assert.equal(f.s.weather, 'fog');
  const d = field([['squirtle', 1, 1]], [['vulpix', 11, 7]]);
  // 가뭄 특성 적: 층 시작 때 쾌청 (createBattle 뒤 특성을 바꾸면 반영되지 않으므로 맵에 특성을 넣어 다시 만든다)
  const ms = [newMember('squirtle', 40, createRng(1))];
  const map = { tiles: Array.from({ length: 8 }, () => '.'.repeat(12)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: 'vulpix', x: 11, y: 7, level: 40, ability: 'drought' }] };
  const s = createBattle(map, ms);
  void d;
  assert.equal(s.weather, 'sun');
  applyMove(s, s.units[0].id, 'rain-dance', s.units[0].id, hit);
  assert.equal(s.weather, 'rain');
  for (let i = 0; i < 4; i++) round(s);
  endPhase(s, () => 0.9);
  assert.equal(s.weather, 'sun');
});

// ---- Task 3: 압정뿌리기 · 독압정 ----
const P = (...xy) => xy.map(([x, y]) => ({ x, y }));
test('spikes lay on the aimed tile and its 4 neighbours, walls skipped, no duplicates', () => {
  const { s, a } = field([['cloyster', 1, 1]], [['geodude', 11, 7]]);
  s.grid[3] = s.grid[3].slice(0, 3) + '#' + s.grid[3].slice(4); // (3,3) 벽
  assert.equal(MOVES.spikes.learnable, true);
  const r = applyMove(s, a[0].id, 'spikes', { x: 3, y: 2 }, hit);
  assert.equal(r.effects[0].ok, true);
  assert.equal(r.trapsLaid.length, 4);
  assert.ok(!s.spikes.some((t) => t.x === 3 && t.y === 3));
  a[0].acted = false;
  applyMove(s, a[0].id, 'spikes', { x: 3, y: 2 }, hit);
  assert.equal(s.spikes.length, 4);
  a[0].acted = false;
  assert.equal(applyMove(s, a[0].id, 'spikes', { x: 9, y: 1 }, hit).effects[0].reason, 'range');
});

test('a foe walking through spikes takes 1/8 per tile; flying and levitate are immune; own side is safe', () => {
  const { s, a, f } = field([['cloyster', 1, 1]], [['snorlax', 6, 1]]);
  applyMove(s, a[0].id, 'spikes', { x: 4, y: 1 }, hit); // (3,1)(4,1)(5,1)(4,0)(4,2)
  const hp = f[0].hp, d = Math.max(1, Math.floor(f[0].maxHp / 8));
  moveUnit(s, f[0].id, 2, 1, 0, P([6, 1], [5, 1], [4, 1], [3, 1], [2, 1]));
  assert.equal(f[0].hp, hp - 3 * d);
  assert.equal(s.log.trapEvents.length, 3);
  const fly = field([['cloyster', 1, 1]], [['pidgey', 6, 1]]);
  applyMove(fly.s, fly.a[0].id, 'spikes', { x: 4, y: 1 }, hit);
  const fh = fly.f[0].hp;
  moveUnit(fly.s, fly.f[0].id, 3, 1, 0, P([6, 1], [5, 1], [4, 1], [3, 1]));
  assert.equal(fly.f[0].hp, fh);
  const lev = field([['cloyster', 1, 1]], [['gastly', 6, 1]]);
  applyMove(lev.s, lev.a[0].id, 'spikes', { x: 4, y: 1 }, hit);
  lev.f[0].ability = 'levitate';
  const lh = lev.f[0].hp;
  moveUnit(lev.s, lev.f[0].id, 3, 1, 0, P([6, 1], [5, 1], [4, 1], [3, 1]));
  assert.equal(lev.f[0].hp, lh);
  const own = a[0].hp;
  moveUnit(s, a[0].id, 4, 2, 0, P([1, 1], [2, 1], [3, 1], [3, 2], [4, 2]));
  assert.equal(a[0].hp, own);
});

test('toxic spikes poison; a poison-type foe clears them; steel is immune', () => {
  const { s, a, f } = field([['roselia', 1, 1]], [['meowth', 6, 1]]);
  applyMove(s, a[0].id, 'toxic-spikes', { x: 4, y: 1 }, hit);
  moveUnit(s, f[0].id, 4, 1, 0, P([6, 1], [5, 1], [4, 1]));
  assert.equal(f[0].status, 'poison');
  const c = field([['roselia', 1, 1]], [['grimer', 6, 1]]);
  applyMove(c.s, c.a[0].id, 'toxic-spikes', { x: 4, y: 1 }, hit);
  moveUnit(c.s, c.f[0].id, 5, 1, 0, P([6, 1], [5, 1]));
  assert.ok(!c.s.spikes.some((t) => t.x === 5 && t.y === 1));
  assert.equal(c.s.log.trapEvents[0].kind, 'cleared');
  const st = field([['roselia', 1, 1]], [['steelix', 6, 1]]);
  applyMove(st.s, st.a[0].id, 'toxic-spikes', { x: 4, y: 1 }, hit);
  moveUnit(st.s, st.f[0].id, 5, 1, 0, P([6, 1], [5, 1]));
  assert.equal(st.f[0].status, null);
});

test('enemy traps stay hidden until an ally steps on that tile', () => {
  const { s, a, f } = field([['snorlax', 8, 1]], [['cloyster', 1, 1]]);
  endPhase(s);
  applyMove(s, f[0].id, 'spikes', { x: 4, y: 1 }, hit);
  assert.ok(s.spikes.every((t) => t.side === 'enemy' && !t.revealed));
  endPhase(s);
  moveUnit(s, a[0].id, 5, 1, 0, P([8, 1], [7, 1], [6, 1], [5, 1]));
  assert.deepEqual(s.spikes.filter((t) => t.revealed).map((t) => [t.x, t.y]), [[5, 1]]);
});

test('a foe that faints on spikes stops on that tile', () => {
  const { s, a, f } = field([['cloyster', 1, 1]], [['snorlax', 6, 1]]);
  applyMove(s, a[0].id, 'spikes', { x: 4, y: 1 }, hit);
  f[0].hp = 1;
  moveUnit(s, f[0].id, 2, 1, 0, P([6, 1], [5, 1], [4, 1], [3, 1], [2, 1]));
  assert.ok(!s.units.includes(f[0]));
  assert.deepEqual([f[0].x, f[0].y], [5, 1]);
  assert.equal(s.log.trapEvents.at(-1).fainted, true);
  assert.equal(s.log.trapEvents.length, 1);
});

// ---- Task 4: 울부짖기 · 날려버리기 · 흑안개 ----
test('roar pushes the target 3 tiles away and clears its stat changes', () => {
  const { s, a, f } = field([['growlithe', 1, 1]], [['meowth', 2, 1]]);
  f[0].stages.atk = 2; f[0].layers = [{ key: 'atk', amount: 2, turns: 3 }];
  const r = applyMove(s, a[0].id, 'roar', f[0].id, hit);
  assert.deepEqual([f[0].x, f[0].y], [5, 1]);
  assert.deepEqual(r.pushed, { unitId: f[0].id, from: { x: 2, y: 1 }, to: { x: 5, y: 1 }, path: P([2, 1], [3, 1], [4, 1], [5, 1]) });
  assert.equal(f[0].stages.atk, 0);
});

test('push stops before walls, water it cannot enter, other units and the map edge', () => {
  const wall = field([['growlithe', 1, 1]], [['meowth', 2, 1]]);
  wall.s.grid[1] = wall.s.grid[1].slice(0, 4) + '#' + wall.s.grid[1].slice(5); // (4,1)
  applyMove(wall.s, wall.a[0].id, 'roar', wall.f[0].id, hit);
  assert.deepEqual([wall.f[0].x, wall.f[0].y], [3, 1]);
  const water = field([['growlithe', 1, 1]], [['meowth', 2, 1]]);
  water.s.grid[1] = water.s.grid[1].slice(0, 3) + '~' + water.s.grid[1].slice(4); // (3,1)
  const r = applyMove(water.s, water.a[0].id, 'roar', water.f[0].id, hit);
  assert.equal(r.effects[0].reason, 'stuck');
  assert.deepEqual([water.f[0].x, water.f[0].y], [2, 1]);
  const unit = field([['growlithe', 1, 1]], [['meowth', 2, 1], ['geodude', 4, 1]]);
  applyMove(unit.s, unit.a[0].id, 'roar', unit.f[0].id, hit);
  assert.deepEqual([unit.f[0].x, unit.f[0].y], [3, 1]);
  const edge = field([['growlithe', 9, 1]], [['meowth', 10, 1]], { w: 12 });
  applyMove(edge.s, edge.a[0].id, 'roar', edge.f[0].id, hit);
  assert.deepEqual([edge.f[0].x, edge.f[0].y], [11, 1]);
});

test('bosses and ingrain users are not pushed; mean look victims are', () => {
  const b = field([['growlithe', 1, 1]], [['meowth', 2, 1]]);
  b.f[0].boss = true;
  assert.equal(applyMove(b.s, b.a[0].id, 'roar', b.f[0].id, hit).effects[0].reason, 'immune');
  const g = field([['growlithe', 1, 1]], [['meowth', 2, 1]]);
  g.f[0].rooted = true;
  assert.equal(applyMove(g.s, g.a[0].id, 'roar', g.f[0].id, hit).effects[0].reason, 'immune');
  const m = field([['growlithe', 1, 1]], [['meowth', 2, 1]]);
  m.f[0].noMove = 2;
  applyMove(m.s, m.a[0].id, 'roar', m.f[0].id, hit);
  assert.deepEqual([m.f[0].x, m.f[0].y], [5, 1]);
});

test('diagonal push goes along the larger axis, ties along x', () => {
  const y = field([['pidgeot', 3, 1]], [['meowth', 3, 3]]); // 세로가 큼 → 아래로 (사거리 2 안에서 대각선은 1·1 동률뿐)
  applyMove(y.s, y.a[0].id, 'whirlwind', y.f[0].id, hit);
  assert.deepEqual([y.f[0].x, y.f[0].y], [3, 6]);
  const t = field([['pidgeot', 3, 3]], [['meowth', 4, 4]]); // dx 1, dy 1 → 오른쪽
  applyMove(t.s, t.a[0].id, 'whirlwind', t.f[0].id, hit);
  assert.deepEqual([t.f[0].x, t.f[0].y], [7, 4]);
});

test('a push through spikes triggers them', () => {
  const { s, a, f } = field([['cloyster', 1, 1], ['growlithe', 2, 2]], [['meowth', 3, 2]]);
  applyMove(s, a[0].id, 'spikes', { x: 4, y: 1 }, hit); // (4,2) 포함
  const hp = f[0].hp;
  applyMove(s, a[1].id, 'roar', f[0].id, hit);
  assert.ok(f[0].hp < hp);
  assert.ok(s.log.trapEvents.length >= 1);
});

test('haze clears stat changes of everyone within 2, including the user', () => {
  const { s, a, f } = field([['koffing', 1, 1], ['pikachu', 2, 1]], [['meowth', 3, 1], ['geodude', 9, 6]]);
  for (const u of [...a, ...f]) { u.stages.atk = 2; u.layers = [{ key: 'atk', amount: 2, turns: 3 }]; }
  const r = applyMove(s, a[0].id, 'haze', a[0].id, hit);
  assert.deepEqual([a[0].stages.atk, a[1].stages.atk, f[0].stages.atk, f[1].stages.atk], [0, 0, 0, 2]);
  assert.deepEqual(r.hazed.sort(), [a[0].id, a[1].id, f[0].id].sort());
});

// ---- 최종 검토 수정 ----
import { lethalTrapCut } from '../src/core/field.js';
test('review fix: when a called weather ends, units drop its speed bonuses at once', () => {
  const { s, a, f } = field([['squirtle', 1, 1]], [['squirtle', 11, 7]]); // 고라파덕은 날씨부정이 나올 수 있어 피함
  a[0].ability = 'swift-swim'; f[0].ability = 'torrent';
  const base = moveBudget(a[0]);
  endPhase(s, () => 0.9); // 적 차례
  applyMove(s, f[0].id, 'rain-dance', f[0].id, hit);
  assert.equal(moveBudget(a[0]), base + 1);
  for (let i = 0; i < 4; i++) { endPhase(s, () => 0.9); endPhase(s, () => 0.9); }
  endPhase(s, () => 0.9); // 적 페이즈 끝 5번째 → 바로 아군 차례 (다음 페이즈 갱신 전)
  assert.equal(s.weather, null);
  assert.equal(a[0].fieldWeather, null);
  assert.equal(moveBudget(a[0]), base);
});

test('review fix: a walk is cut at the tile where spikes would knock the unit out', () => {
  const { s, a, f } = field([['cloyster', 1, 1]], [['snorlax', 6, 1]]);
  applyMove(s, a[0].id, 'spikes', { x: 4, y: 1 }, hit);
  const path = P([6, 1], [5, 1], [4, 1], [3, 1], [2, 1]);
  assert.equal(lethalTrapCut(s, f[0], path).length, 5); // 버틸 수 있으면 그대로
  f[0].hp = 1;
  assert.deepEqual(lethalTrapCut(s, f[0], path), P([6, 1], [5, 1]));
});

test('review fix: a push reports its trap hits and where the target really stopped', () => {
  const { s, a, f } = field([['cloyster', 1, 1], ['growlithe', 2, 2]], [['meowth', 3, 2]]);
  applyMove(s, a[0].id, 'spikes', { x: 4, y: 1 }, hit); // (4,2) 포함
  f[0].hp = 1;
  const r = applyMove(s, a[1].id, 'roar', f[0].id, hit);
  assert.deepEqual(r.pushed.to, { x: 4, y: 2 });
  assert.equal(r.pushed.fainted, true);
  assert.equal(r.trapEvents[0].kind, 'spikes');
});

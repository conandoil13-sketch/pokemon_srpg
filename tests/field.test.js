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

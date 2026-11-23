import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyTurnOrder, planEnemyAction } from '../src/core/ai.js';
import { createBattle } from '../src/core/battle.js';
import { makeUnit } from '../src/core/battle.js';
import { manhattan } from '../src/core/pathfind.js';
import { unitsHit } from '../src/core/shapes.js';
import { MOVES as MV } from '../src/data/moves.js';

const MOVESET = { garchomp: ['earthquake', 'dragon-claw', 'crunch'], bronzong: ['tackle'], torterra: ['razor-leaf'] };
const mk = (species, side, x, y, hp) => {
  const u = makeUnit({ species, side, x, y, level: 50, moves: MOVESET[species] ?? ['tackle'] });
  if (hp !== undefined) u.hp = hp;
  return u;
};
const state = (w, h, units) => ({
  grid: Array.from({ length: h }, () => '.'.repeat(w)), width: w, height: h, units, phase: 'enemy', turn: 1, result: null,
});

test('prefers the target it can KO', () => {
  const foe = mk('garchomp', 'enemy', 4, 2);
  const weak = mk('luxray', 'ally', 2, 2, 1);
  const full = mk('empoleon', 'ally', 6, 2);
  const s = state(9, 5, [foe, weak, full]);
  const plan = planEnemyAction(s, foe);
  const at = { ...s, units: s.units.map((u) => (u === foe ? { ...foe, ...plan.moveTo } : u)) };
  const hit = unitsHit(at, at.units[0], MV[plan.attack.moveId], plan.attack.aim).map((u) => u.id);
  assert.ok(hit.includes('ally-luxray'), JSON.stringify(plan)); // 범위기면 둘 다 맞을 수도
});

test('never picks a zero-damage (immune) move', () => {
  const foe = mk('garchomp', 'enemy', 3, 2);
  const bird = mk('honchkrow', 'ally', 1, 2);
  const s = state(6, 5, [foe, bird]);
  const plan = planEnemyAction(s, foe);
  assert.ok(plan.attack);
  assert.ok(['crunch', 'dragon-claw'].includes(plan.attack.moveId), plan.attack.moveId);
});

test('approaches when nothing is in range', () => {
  const foe = mk('bronzong', 'enemy', 15, 5);
  const ally = mk('luxray', 'ally', 0, 5);
  const s = state(16, 12, [foe, ally]);
  const plan = planEnemyAction(s, foe);
  assert.equal(plan.attack, null);
  assert.ok(manhattan(plan.moveTo, ally) < manhattan(foe, ally));
});

test('turn order: fastest enemy first (by its own stats)', () => {
  const order = enemyTurnOrder(createBattle());
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1].stats.spe >= order[i].stats.spe);
  assert.equal(order[0].species, 'murkrow');
});

test('approach uses walking distance, not straight-line distance across water', () => {
  // 물 건너편 아군. 직선거리로는 물가가 가깝지만 다리(아래쪽)로 가야 실제로 가까워진다
  const grid = ['...~...', '...~...', '...~...', '...~...', '.......'];
  const foe = mk('torterra', 'enemy', 6, 0);  // 물 진입 불가, 이동력 3
  const ally = mk('luxray', 'ally', 0, 0);
  const s = { grid, width: 7, height: 5, units: [foe, ally], phase: 'enemy', turn: 1, result: null };
  const plan = planEnemyAction(s, foe);
  assert.equal(plan.attack, null);
  // 물가(4,0)이 아니라 아래쪽 우회로로 내려가야 한다
  assert.ok(plan.moveTo.y > 0, JSON.stringify(plan.moveTo));
});

// ---- 변화기 ----
const mkm = (species, side, x, y, moves) => makeUnit({ species, side, x, y, level: 30, moves });

test('buffs itself when no foe can be attacked this turn, still approaching', () => {
  const foe = mkm('scyther', 'enemy', 15, 5, ['swords-dance', 'slash']);
  const ally = mkm('luxray', 'ally', 0, 5, ['tackle']);
  const s = state(16, 12, [foe, ally]);
  const plan = planEnemyAction(s, foe);
  assert.deepEqual(plan.attack, { moveId: 'swords-dance', targetId: foe.id });
  assert.ok(manhattan(plan.moveTo, ally) < manhattan(foe, ally));
});

test('does not buff a stat already at +2 or with 2+ turns left', () => {
  const foe = mkm('scyther', 'enemy', 15, 5, ['swords-dance', 'slash']);
  const ally = mkm('luxray', 'ally', 0, 5, ['tackle']);
  foe.stages.atk = 2; foe.turns.atk = 1;
  assert.equal(planEnemyAction(state(16, 12, [foe, ally]), foe).attack, null);
  foe.stages.atk = 1; foe.turns.atk = 2;
  assert.equal(planEnemyAction(state(16, 12, [foe, ally]), foe).attack, null);
});

test('no area debuff when no foe ends up within range', () => {
  const foe = mkm('bidoof', 'enemy', 15, 5, ['growl']);
  const ally = mkm('luxray', 'ally', 0, 5, ['tackle']);
  assert.equal(planEnemyAction(state(16, 12, [foe, ally]), foe).attack, null);
});

test('uses an area debuff on foes in range when it has no attack', () => {
  const foe = mkm('bidoof', 'enemy', 4, 2, ['growl']);
  const ally = mkm('luxray', 'ally', 2, 2, ['tackle']);
  const plan = planEnemyAction(state(9, 5, [foe, ally]), foe);
  assert.equal(plan.attack?.moveId, 'growl');
  assert.ok(manhattan(plan.moveTo, ally) <= 2);
});

test('attacks instead of buffing when it can hit hard now', () => {
  const foe = mkm('scyther', 'enemy', 4, 2, ['swords-dance', 'slash']);
  const ally = mkm('luxray', 'ally', 2, 2, ['tackle']);
  ally.hp = 10;
  const plan = planEnemyAction(state(9, 5, [foe, ally]), foe);
  assert.equal(plan.attack.moveId, 'slash');
});

test('idle self buff beats a weak debuff when nothing is attackable', () => {
  // 공격(사거리 1)은 닿지 않지만 째려보기(거리 2) 범위엔 들어갈 수 있다
  const foe = mkm('machop', 'enemy', 6, 2, ['bulk-up', 'leer', 'karate-chop']);
  const ally = mkm('luxray', 'ally', 1, 2, ['tackle']);
  const plan = planEnemyAction(state(16, 5, [foe, ally]), foe);
  assert.equal(plan.attack?.moveId, 'bulk-up');
});

// ---- 상태이상 ----
test('a sleeping/frozen enemy (acted) stays put and does nothing', () => {
  const foe = mkm('garchomp', 'enemy', 4, 2, ['dragon-claw']); foe.acted = true; foe.status = 'sleep';
  const ally = mkm('luxray', 'ally', 3, 2, ['tackle']);
  assert.deepEqual(planEnemyAction(state(9, 5, [foe, ally]), foe), { moveTo: { x: 4, y: 2 }, attack: null });
});

test('no status move on an already-statused target', () => {
  const foe = mkm('pikachu', 'enemy', 6, 2, ['thunder-wave']);
  const ally = mkm('luxray', 'ally', 1, 2, ['tackle']); ally.status = 'paralysis';
  assert.equal(planEnemyAction(state(16, 5, [foe, ally]), foe).attack, null);
});

test('prefers putting a strong foe to sleep over a weak hit', () => {
  const foe = mkm('oddish', 'enemy', 6, 2, ['sleep-powder', 'absorb']);
  const ally = mkm('luxray', 'ally', 1, 2, ['bite']);
  const other = mkm('pikachu', 'ally', 15, 4, ['tackle']); // 깨어 있는 아군이 하나 더
  const plan = planEnemyAction(state(16, 5, [foe, ally, other]), foe);
  assert.equal(plan.attack?.moveId, 'sleep-powder');
});

test('no sleep move once two foes are asleep or frozen', () => {
  const foe = mkm('oddish', 'enemy', 6, 2, ['sleep-powder', 'absorb']);
  const a = mkm('luxray', 'ally', 1, 2, ['bite']);
  const b = mkm('pikachu', 'ally', 0, 0, ['tackle']); b.status = 'sleep';
  const c = mkm('piplup', 'ally', 0, 4, ['tackle']); c.status = 'freeze';
  assert.notEqual(planEnemyAction(state(16, 5, [foe, a, b, c]), foe).attack?.moveId, 'sleep-powder');
});

test('never puts the last awake foe to sleep (small parties)', () => {
  const foe = mkm('oddish', 'enemy', 6, 2, ['sleep-powder', 'absorb']);
  const ally = mkm('luxray', 'ally', 1, 2, ['bite']);
  assert.notEqual(planEnemyAction(state(16, 5, [foe, ally]), foe).attack?.moveId, 'sleep-powder');
  const b = mkm('pikachu', 'ally', 15, 4, ['tackle']); b.status = 'sleep';
  assert.notEqual(planEnemyAction(state(16, 5, [foe, ally, b]), foe).attack?.moveId, 'sleep-powder');
});

import { isThreat } from '../src/core/ai.js';
test('sleeping (with turns left) or frozen units are not threats next phase', () => {
  assert.equal(isThreat({ status: null }), true);
  assert.equal(isThreat({ status: 'sleep', statusTurns: 1 }), false);
  assert.equal(isThreat({ status: 'sleep', statusTurns: 0 }), true); // 다음 페이즈 시작에 깨어남
  assert.equal(isThreat({ status: 'freeze', statusTurns: 2 }), false);
  assert.equal(isThreat({ status: 'paralysis' }), true);
});

// ---- 범위기 조준 ----
test('aims a beam down the line that hits two foes', () => {
  const foe = mkm('starmie', 'enemy', 4, 2, ['hydro-pump']);
  const a = mkm('rhydon', 'ally', 7, 3, ['tackle']), b = mkm('golem', 'ally', 7, 4, ['tackle']);
  foe.stats.spe = 1;
  const plan = planEnemyAction(state(12, 7, [foe, a, b]), foe);
  assert.equal(plan.attack?.moveId, 'hydro-pump');
  const hit = ['ally-rhydon', 'ally-golem'];
  const s = state(12, 7, [{ ...foe, x: plan.moveTo.x, y: plan.moveTo.y }, a, b]);
  assert.deepEqual(unitsHit(s, s.units[0], MV['hydro-pump'], plan.attack.aim).map((u) => u.id).sort(), hit.sort());
});

test('does not hit its own teammate when it can avoid it', () => {
  const foe = mkm('rhydon', 'enemy', 4, 2, ['earthquake', 'horn-attack']);
  const mate = mkm('golem', 'enemy', 4, 1, ['tackle']);
  const ally = mkm('pikachu', 'ally', 5, 2, ['tackle']);
  foe.stats.spe = 1;
  const s = state(9, 5, [foe, mate, ally]);
  const plan = planEnemyAction(s, foe);
  const at = { ...s, units: s.units.map((u) => (u === foe ? { ...foe, ...plan.moveTo } : u)) };
  const hit = unitsHit(at, at.units[0], MV[plan.attack.moveId], plan.attack.aim);
  assert.ok(!hit.some((u) => u.side === 'enemy'), JSON.stringify(plan));
});

test('no earthquake when it would only hit teammates', () => {
  const foe = mkm('rhydon', 'enemy', 4, 2, ['earthquake']);
  const mate = mkm('golem', 'enemy', 4, 1, ['tackle']);
  const ally = mkm('pikachu', 'ally', 15, 4, ['tackle']);
  assert.equal(planEnemyAction(state(16, 5, [foe, mate, ally]), foe).attack, null);
});

test('voltorb blows itself up next to two foes; others stay careful', () => {
  const v = mkm('voltorb', 'enemy', 4, 2, ['self-destruct', 'tackle']); v.stats.spe = 1;
  const a = mkm('pikachu', 'ally', 3, 2, ['tackle']), b = mkm('piplup', 'ally', 5, 2, ['tackle']);
  assert.equal(planEnemyAction(state(9, 5, [v, a, b]), v).attack?.moveId, 'self-destruct');
  const g = mkm('geodude', 'enemy', 4, 2, ['self-destruct', 'tackle']); g.stats.spe = 1;
  const a2 = mkm('pikachu', 'ally', 3, 2, ['tackle']), b2 = mkm('piplup', 'ally', 5, 2, ['tackle']);
  a2.hp = a2.maxHp = 999; b2.hp = b2.maxHp = 999;
  assert.equal(planEnemyAction(state(9, 5, [g, a2, b2]), g).attack?.moveId, 'tackle');
});

test('planning one enemy stays fast', () => {
  const foe = mkm('rhydon', 'enemy', 8, 4, ['earthquake', 'horn-attack', 'rock-slide', 'stomp']);
  const allies = [[1, 1], [2, 6], [5, 3], [6, 7]].map(([x, y], i) => mkm(['pikachu', 'piplup', 'chimchar', 'turtwig'][i], 'ally', x, y, ['tackle', 'ember', 'water-gun', 'hydro-pump']));
  const t0 = performance.now();
  planEnemyAction(state(16, 12, [foe, ...allies]), foe);
  assert.ok(performance.now() - t0 < 50, `${performance.now() - t0}ms`);
});

test('no area move whose net effect hurts its own side', () => {
  const foe = mkm('rhydon', 'enemy', 2, 0, ['earthquake']);
  const mate = mkm('pikachu', 'enemy', 1, 0, ['tackle']);
  const ally = mkm('golem', 'ally', 3, 0, ['tackle']); ally.hp = ally.maxHp = 999;
  const s = { grid: ['#...#'], width: 5, height: 1, units: [foe, mate, ally], phase: 'enemy', turn: 1, result: null };
  assert.equal(planEnemyAction(s, foe).attack, null);
});

// ---- 날씨 · 안개 ----
test('in rain the AI prefers water over fire', () => {
  const foe = mkm('vulpix', 'enemy', 4, 2, ['ember', 'water-gun']);
  const ally = mkm('pikachu', 'ally', 3, 2, ['tackle']); ally.hp = ally.maxHp = 999;
  const s = { ...state(9, 5, [foe, ally]), weather: 'rain' };
  assert.equal(planEnemyAction(s, foe).attack?.moveId, 'water-gun');
  const s2 = { ...state(9, 5, [foe, ally]), weather: 'sun' };
  assert.equal(planEnemyAction(s2, foe).attack?.moveId, 'ember');
});

test('in fog the AI does not attack allies it has not seen', () => {
  const foe = mkm('garchomp', 'enemy', 4, 2, ['dragon-claw']);
  const ally = mkm('pikachu', 'ally', 3, 2, ['tackle']);
  const s = { ...state(9, 5, [foe, ally]), weather: 'fog' };
  assert.equal(planEnemyAction(s, foe, { unseen: new Set(['ally-pikachu']) }).attack, null);
  assert.ok(planEnemyAction(s, foe).attack);
});

// ---- 변화기 묶음 1차: 새 변화기 ----
test('enemy protects only when threatened and hurt', () => {
  const plan = (hpRate, extra = {}) => {
    const foe = makeUnit({ species: 'pidgey', side: 'enemy', x: 4, y: 2, level: 30, moves: ['tackle', 'protect'] });
    foe.hp = Math.floor(foe.maxHp * hpRate); Object.assign(foe, extra);
    const ally = mk('garchomp', 'ally', 2, 2);
    return planEnemyAction(state(9, 5, [foe, ally]), foe);
  };
  assert.equal(plan(0.4).attack?.moveId, 'protect');
  assert.notEqual(plan(0.9).attack?.moveId, 'protect');
  assert.notEqual(plan(0.4, { guardPrev: true }).attack?.moveId, 'protect');
});

test('enemy does not pick moves blocked by taunt', () => {
  const foe = makeUnit({ species: 'pidgey', side: 'enemy', x: 4, y: 2, level: 30, moves: ['tackle', 'protect'] });
  foe.hp = Math.floor(foe.maxHp * 0.4); foe.taunt = 3;
  const plan = planEnemyAction(state(9, 5, [foe, mk('garchomp', 'ally', 2, 2)]), foe);
  assert.notEqual(plan.attack?.moveId, 'protect');
});

test('enemy yawns an awake target and skips already yawned ones', () => {
  const run = (extra) => {
    const foe = makeUnit({ species: 'slowpoke', side: 'enemy', x: 4, y: 2, level: 30, moves: ['yawn'] });
    const ally = mk('luxray', 'ally', 2, 2);
    Object.assign(ally, extra);
    return planEnemyAction(state(9, 5, [foe, ally, mk('bronzong', 'ally', 8, 4)]), foe); // 깨어 있는 마지막 하나는 재우지 않으므로 하나 더
  };
  assert.equal(run({}).attack?.moveId, 'yawn');
  assert.notEqual(run({ yawnBy: 'enemy-x' }).attack?.moveId, 'yawn');
});

test('enemy rooted by ingrain stays put', () => {
  const foe = makeUnit({ species: 'oddish', side: 'enemy', x: 6, y: 2, level: 30, moves: ['absorb'] });
  foe.rooted = true;
  const plan = planEnemyAction(state(9, 5, [foe, mk('luxray', 'ally', 1, 2)]), foe);
  assert.deepEqual(plan.moveTo, { x: 6, y: 2 });
});

// ---- 변화기 묶음 2차: 전장 기술 ----
const en = (species, x, y, moves, extra = {}) => Object.assign(makeUnit({ species, side: 'enemy', x, y, level: 30, moves }), extra);
test('enemy sets reflect when allies are near and not already covered', () => {
  const run = (mates, zones = []) => {
    const u = en('mr-mime', 6, 2, ['reflect'], zones.length ? { noMove: 2 } : {}); // 덮인 경우: 제자리 (걸어 나가 새 장판을 까는 건 정상)
    const s = state(12, 6, [u, ...mates, mk('luxray', 'ally', 1, 2)]);
    s.zones = zones;
    return planEnemyAction(s, u);
  };
  assert.equal(run([en('pidgey', 7, 2, ['tackle']), en('rattata', 6, 3, ['tackle'])]).attack?.moveId, 'reflect');
  assert.notEqual(run([]).attack?.moveId, 'reflect'); // 혼자면 안 씀
  assert.notEqual(run([en('pidgey', 7, 2, ['tackle'])], [{ kind: 'reflect', side: 'enemy', x: 6, y: 2, turns: 3 }]).attack?.moveId, 'reflect');
});

test('a water enemy calls rain only when it is not already raining', () => {
  const run = (weather) => {
    const u = en('squirtle', 6, 2, ['rain-dance']);
    const s = state(12, 6, [u, mk('luxray', 'ally', 1, 2)]);
    s.weather = weather;
    return planEnemyAction(s, u);
  };
  assert.equal(run(null).attack?.moveId, 'rain-dance');
  assert.notEqual(run('rain').attack?.moveId, 'rain-dance');
  assert.notEqual(run('fog').attack?.moveId, 'rain-dance');
});

test('enemy roars an adjacent foe', () => {
  const u = en('growlithe', 3, 2, ['roar']);
  const foe = makeUnit({ species: 'luxray', side: 'ally', x: 2, y: 2, level: 30, moves: ['tackle'] }); // 같은 레벨 (9세대 몸통박치기 40)
  const plan = planEnemyAction(state(9, 5, [u, foe]), u);
  assert.equal(plan.attack?.moveId, 'roar');
});

test('enemy lays spikes on a tile, not a unit', () => {
  const u = en('cloyster', 6, 2, ['spikes']);
  const plan = planEnemyAction(state(12, 6, [u, mk('luxray', 'ally', 1, 2)]), u);
  assert.equal(plan.attack?.moveId, 'spikes');
  assert.ok(Number.isInteger(plan.attack.aim?.x) && Number.isInteger(plan.attack.aim?.y));
  const d = Math.abs(plan.attack.aim.x - plan.moveTo.x) + Math.abs(plan.attack.aim.y - plan.moveTo.y);
  assert.ok(d >= 1 && d <= 3);
});
test('review fix: an enemy with spikes walks toward far foes instead of camping', () => {
  const u = en('cloyster', 28, 8, ['spikes']);
  const plan = planEnemyAction(state(30, 10, [u, mk('luxray', 'ally', 1, 1)]), u);
  assert.notEqual(plan.attack?.moveId, 'spikes');
  assert.ok(plan.moveTo.x < 28 || plan.moveTo.y !== 8);
});

import { bindValue, HINDER_SCORE } from '../src/core/ai.js';
test('binding an unbound foe is worth a little more than hitting a bound one', () => {
  assert.equal(bindValue(MV.wrap, { bound: null, hp: 50 }), (HINDER_SCORE / 2) * (MV.wrap.accuracy / 100));
  assert.equal(bindValue(MV.wrap, { bound: { by: 'x' }, hp: 50 }), 0);
  assert.equal(bindValue(MV.tackle, { bound: null, hp: 50 }), 0);
});

test('bind value scales with accuracy', () => {
  assert.ok(bindValue({ ...MV.wrap, accuracy: 50 }, { bound: null }) < bindValue({ ...MV.wrap, accuracy: 100 }, { bound: null }));
});

test('final gambit is a self-KO move: only when it knocks the target out', () => {
  const s = mkm('sawk', 'enemy', 4, 2, ['final-gambit', 'tackle']);
  const a = mkm('snorlax', 'ally', 3, 2, ['tackle']);
  a.hp = a.maxHp = 999;
  assert.equal(planEnemyAction(state(9, 5, [s, a]), s).attack?.moveId, 'tackle');
  const s2 = mkm('sawk', 'enemy', 4, 2, ['final-gambit', 'tackle']);
  const b = mkm('pikachu', 'ally', 3, 2, ['tackle']); b.hp = 5;
  assert.notEqual(planEnemyAction(state(9, 5, [s2, b]), s2).attack, undefined);
});

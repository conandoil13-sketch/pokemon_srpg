import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, unitAt, moveUnit, applyAttack, endPhase, checkResult } from '../src/core/battle.js';
import { newParty } from '../src/core/progress.js';
import { statsAt, expYield } from '../src/core/stats.js';
import { SPECIES } from '../src/data/species.js';
import { BALANCE } from '../src/data/balance.js';

const zero = () => 0;
const find = (s, id) => s.units.find((u) => u.id === id);

test('createBattle builds level-based units from the party and the map', () => {
  const s = createBattle();
  assert.equal(s.units.length, 10);
  const allies = s.units.filter((u) => u.side === 'ally');
  assert.deepEqual(allies.map((u) => u.species), ['ditto', 'chimchar', 'piplup', 'turtwig', 'shinx']);
  assert.deepEqual(find(s, 'ally-ditto').moves, ['tackle']);
  for (const u of allies) {
    assert.equal(u.level, BALANCE.startLevel);
    assert.deepEqual(u.stats, statsAt(SPECIES[u.species].base, u.level));
    assert.equal(u.hp, u.stats.hp);
    assert.ok(u.moves.length >= 1 && u.moves.length <= 4);
  }
  assert.equal(find(s, 'enemy-gible').level, 9);
  assert.equal(s.phase, 'player');
  assert.deepEqual(s.log, { exp: {}, fainted: [], loot: [], coins: 0, expired: [], defeated: [] });
});

test('party levels and moves carry into battle', () => {
  const party = newParty();
  party[1].level = 20; party[1].moves = ['ember'];
  const u = find(createBattle(undefined, party), 'ally-chimchar');
  assert.equal(u.level, 20);
  assert.deepEqual(u.moves, ['ember']);
});

test('moveUnit updates position and flag', () => {
  const s = createBattle();
  moveUnit(s, 'ally-chimchar', 3, 5);
  assert.equal(unitAt(s, 3, 5).id, 'ally-chimchar');
  assert.equal(find(s, 'ally-chimchar').moved, true);
});

test('KO awards exp: attacker 100%, other living allies 50%', () => {
  const s = createBattle();
  const budew = find(s, 'enemy-budew');
  budew.hp = 1;
  const r = applyAttack(s, 'ally-chimchar', 'enemy-budew', 'ember', zero);
  assert.equal(r.fainted, true);
  const full = expYield(SPECIES.budew.baseExp, 7, BALANCE.expMultiplier);
  assert.equal(r.expGained.chimchar, full);
  for (const sp of ['piplup', 'turtwig', 'shinx']) assert.equal(r.expGained[sp], Math.floor(full * BALANCE.shareRatio));
  assert.deepEqual(s.log.exp, r.expGained);
  assert.equal(s.units.some((u) => u.id === 'enemy-budew'), false);
});

test('exp share skips allies already gone; earned exp stays after fainting', () => {
  const s = createBattle();
  s.units = s.units.filter((u) => u.side === 'enemy' || u.id === 'ally-chimchar');
  find(s, 'enemy-budew').hp = 1;
  applyAttack(s, 'ally-chimchar', 'enemy-budew', 'ember', zero);
  assert.deepEqual(Object.keys(s.log.exp), ['chimchar']);
  const earned = s.log.exp.chimchar;
  find(s, 'ally-chimchar').hp = 1;
  applyAttack(s, 'enemy-gible', 'ally-chimchar', 'tackle', zero);
  assert.equal(s.result, 'lose');
  assert.equal(s.log.exp.chimchar, earned);
});

test('ally fainting gives no exp to enemies', () => {
  const s = createBattle();
  find(s, 'ally-shinx').hp = 1;
  const r = applyAttack(s, 'enemy-gible', 'ally-shinx', 'tackle', zero);
  assert.equal(r.fainted, true);
  assert.deepEqual(r.expGained, {});
});

test('immune attack leaves hp unchanged', () => {
  const s = createBattle();
  const murkrow = find(s, 'enemy-murkrow');
  const before = murkrow.hp;
  const r = applyAttack(s, 'ally-chimchar', 'enemy-murkrow', 'mud-slap', zero); // 단일 땅 기술 (지진은 이제 범위기)
  assert.equal(r.damage, 0);
  assert.equal(murkrow.hp, before);
});

test('endPhase twice → player, turn 2, flags reset', () => {
  const s = createBattle();
  const a = find(s, 'ally-chimchar');
  a.moved = true; a.acted = true;
  endPhase(s); endPhase(s);
  assert.equal(s.phase, 'player');
  assert.equal(s.turn, 2);
  assert.equal(a.acted, false);
});

test('all enemies gone → win', () => {
  const s = createBattle();
  s.units = s.units.filter((u) => u.side === 'ally');
  assert.equal(checkResult(s), 'win');
});

// ---- 던전 규칙 ----
import { arrive } from '../src/core/battle.js';
import { MAP } from '../src/data/map.js';
import { canEnter, TILE_COST } from '../src/core/pathfind.js';

const dungeonMap = (extra = {}) => {
  const tiles = MAP.tiles.slice();
  tiles[5] = tiles[5].slice(0, 4) + '>' + tiles[5].slice(5); // (4,5) 계단
  return { ...MAP, tiles, stairs: { x: 4, y: 5 }, chests: [{ x: 3, y: 5, item: 'candy' }], ...extra };
};

test('hpRatio: listed species start at half (min 1), others full', () => {
  const s = createBattle(dungeonMap(), newParty(), { hpRatio: { piplup: 0.5 } });
  const p = find(s, 'ally-piplup');
  assert.equal(p.hp, Math.max(1, Math.floor(p.maxHp * 0.5)));
  assert.equal(find(s, 'ally-chimchar').hp, find(s, 'ally-chimchar').maxHp);
});

test('arrive: stairs → result stairs; enemies ignore stairs', () => {
  const s = createBattle(dungeonMap());
  const g = find(s, 'enemy-gible');
  g.x = 4; g.y = 5;
  assert.deepEqual(arrive(s, 'enemy-gible'), { stairs: false, item: null });
  assert.equal(s.result, null);
  moveUnit(s, 'ally-chimchar', 4, 5);
  assert.equal(arrive(s, 'ally-chimchar').stairs, true);
  assert.equal(s.result, 'stairs');
  assert.equal(checkResult(s), 'stairs', 'stairs result is not overwritten');
});

test('arrive: chest opens once and is logged', () => {
  const s = createBattle(dungeonMap());
  moveUnit(s, 'ally-chimchar', 3, 5);
  assert.deepEqual(arrive(s, 'ally-chimchar'), { stairs: false, item: 'candy' });
  assert.deepEqual(s.chests, []);
  assert.deepEqual(s.log.loot, ['candy']);
  assert.equal(arrive(s, 'ally-chimchar').item, null);
});

test('boss floor: defeating the boss wins even with enemies left', () => {
  const map = dungeonMap({ stairs: null, enemies: [...MAP.enemies, { species: 'riolu', level: 15, x: 15, y: 11, boss: true }] });
  const s = createBattle(map);
  const boss = s.units.find((u) => u.boss);
  assert.ok(boss);
  boss.x = 3; boss.y = 5; boss.hp = 1;
  applyAttack(s, 'ally-chimchar', boss.id, 'ember', zero);
  assert.equal(s.result, 'win');
  assert.ok(s.units.some((u) => u.side === 'enemy'));
});

test('fainted allies are logged once', () => {
  const s = createBattle();
  find(s, 'ally-shinx').hp = 1;
  applyAttack(s, 'enemy-gible', 'ally-shinx', 'tackle', zero);
  assert.deepEqual(s.log.fainted, ['shinx']);
});

test('stairs tile is walkable at cost 1', () => {
  assert.equal(canEnter('>', 'chimchar'), true);
  assert.equal(TILE_COST['>'], 1);
});

test('enemy KO by an ally gives coins 3 + floor(lv/3); ally fainting gives none', () => {
  const s = createBattle();
  find(s, 'enemy-gible').hp = 1; // Lv9
  applyAttack(s, 'ally-chimchar', 'enemy-gible', 'ember', zero);
  assert.equal(s.log.coins, 6);
  find(s, 'ally-shinx').hp = 1;
  applyAttack(s, 'enemy-riolu', 'ally-shinx', 'tackle', zero);
  assert.equal(s.log.coins, 6);
});

// ---- 변화기 · 부가효과 · 만료 ----
import { applyMove, targetsOf } from '../src/core/battle.js';
import { MOVES as ALL_MOVES } from '../src/data/moves.js';

const stageBattle = () => {
  const s = createBattle();
  // 위치를 단순하게: 아군 chimchar (5,5), 적 riolu (6,5) 거리1, gible (7,5) 거리2, murkrow (8,5) 거리3
  const put = (id, x, y) => { const u = find(s, id); u.x = x; u.y = y; };
  put('ally-chimchar', 5, 5); put('enemy-riolu', 6, 5); put('enemy-gible', 7, 5); put('enemy-murkrow', 8, 5);
  put('ally-piplup', 4, 5); put('enemy-budew', 12, 0); put('enemy-bronzor', 12, 1);
  return s;
};

test('self buff: swords dance +2 for 3 turns', () => {
  const s = stageBattle();
  const r = applyMove(s, 'ally-chimchar', 'swords-dance', null, zero);
  assert.equal(r.kind, 'status');
  const c = find(s, 'ally-chimchar');
  assert.deepEqual([c.stages.atk, c.turns.atk], [2, 3]);
  assert.equal(c.acted, true);
});

test('area debuff: growl hits enemies within 2 only', () => {
  const s = stageBattle();
  applyMove(s, 'ally-chimchar', 'growl', null, zero);
  assert.equal(find(s, 'enemy-riolu').stages.atk, -1);
  assert.equal(find(s, 'enemy-gible').stages.atk, -1);
  assert.equal(find(s, 'enemy-murkrow').stages.atk, 0);
});

test('ally-target kind picks an adjacent ally', () => {
  const s = stageBattle();
  const fake = { ...ALL_MOVES.growl, kind: 'ally', area: false, range: [1, 1] };
  assert.deepEqual(targetsOf(s, find(s, 'ally-chimchar'), fake, find(s, 'ally-piplup')).map((u) => u.id), ['ally-piplup']);
  assert.deepEqual(targetsOf(s, find(s, 'ally-chimchar'), fake, find(s, 'enemy-riolu')), []);
});

test('secondary: close combat lowers own def/spd (100%)', () => {
  const s = stageBattle();
  find(s, 'enemy-riolu').hp = 999;
  const r = applyMove(s, 'ally-chimchar', 'close-combat', 'enemy-riolu', () => 0.5);
  assert.equal(r.kind, 'attack');
  assert.equal(r.hit, true);
  const c = find(s, 'ally-chimchar');
  assert.deepEqual([c.stages.def, c.stages.spd], [-1, -1]);
  assert.deepEqual(r.stageChanges.map((x) => [x.unitId, x.key, x.applied]), [['ally-chimchar', 'def', -1], ['ally-chimchar', 'spd', -1]]);
});

test('secondary chance: crunch lowers target def only when the roll succeeds', () => {
  const run = (roll) => {
    const s = stageBattle();
    const t = find(s, 'enemy-gible'); t.x = 5; t.y = 6; t.hp = 999; t.maxHp = 999;
    let i = 0; const rng = () => [0.5, 0.99, 0, roll][i++] ?? 0.5; // 명중, 급소X, 난수, 부가효과
    applyMove(s, 'ally-chimchar', 'crunch', 'enemy-gible', rng);
    return t.stages.def;
  };
  assert.equal(run(0.1), -1);
  assert.equal(run(0.5), 0);
});

test('target effect skipped when it faints, self effect kept', () => {
  const s = stageBattle();
  find(s, 'enemy-riolu').hp = 1;
  const r = applyMove(s, 'ally-chimchar', 'close-combat', 'enemy-riolu', () => 0.5);
  assert.equal(r.fainted, true);
  assert.equal(find(s, 'ally-chimchar').stages.def, -1);
});

test('no secondary on miss or immunity', () => {
  const s = stageBattle();
  const r = find(s, 'enemy-riolu'); r.stages.eva = 6; r.hp = 999;
  const res = applyMove(s, 'ally-chimchar', 'close-combat', 'enemy-riolu', () => 0.9);
  assert.equal(res.hit, false);
  assert.equal(find(s, 'ally-chimchar').stages.def, 0);
  const s2 = stageBattle();
  const g = find(s2, 'enemy-riolu'); g.species = 'gastly'; g.types = ['ghost', 'poison']; // 고스트 → 격투 면역 (타입은 유닛 기준)
  const res2 = applyMove(s2, 'ally-chimchar', 'close-combat', 'enemy-riolu', () => 0.5);
  assert.equal(res2.typeMult, 0);
  assert.equal(find(s2, 'ally-chimchar').stages.def, 0);
});

test('status move vs enemy can miss (evasion)', () => {
  const s = stageBattle();
  find(s, 'enemy-riolu').stages.eva = 6;
  const r = applyMove(s, 'ally-chimchar', 'growl', null, () => 0.9);
  assert.equal(find(s, 'enemy-riolu').stages.atk, 0);
  assert.equal(find(s, 'enemy-gible').stages.atk, -1);
  assert.ok(r.missed.includes('enemy-riolu'));
});

test('stages tick only at the end of the owner side phase, expire after 3', () => {
  const s = stageBattle();
  applyMove(s, 'ally-chimchar', 'swords-dance', null, zero);
  const c = find(s, 'ally-chimchar');
  endPhase(s); // 아군 페이즈 끝 → 2
  assert.equal(c.turns.atk, 2);
  endPhase(s); // 적 페이즈 끝 → 그대로
  assert.equal(c.turns.atk, 2);
  endPhase(s); endPhase(s); endPhase(s); // 아군 끝 → 1, 적, 아군 끝 → 0
  assert.equal(c.stages.atk, 0);
  assert.deepEqual(s.log.expired, [{ unitId: 'ally-chimchar', keys: ['atk'] }]);
  assert.equal(createBattle().units[0].stages.atk, 0, 'new floor starts clean');
});

// ---- 상태이상 ----
import { confusionDamage } from '../src/core/damage.js';
const rs = (vals) => { let i = 0; return () => vals[i++] ?? 0.5; };

test('thunder wave paralyzes; ground is immune; already-statused fails', () => {
  const s = stageBattle();
  const r = applyMove(s, 'ally-chimchar', 'thunder-wave', 'enemy-riolu', rs([0]));
  assert.equal(find(s, 'enemy-riolu').status, 'paralysis');
  assert.deepEqual(r.statusChanges, [{ unitId: 'enemy-riolu', ailment: 'paralysis', ok: true }]);
  const r2 = applyMove(stageBattle(), 'ally-chimchar', 'thunder-wave', 'enemy-gible', rs([0]));
  assert.equal(r2.statusChanges[0].reason, 'immune');
  const s3 = stageBattle(); find(s3, 'enemy-riolu').status = 'poison';
  const r3 = applyMove(s3, 'ally-chimchar', 'sleep-powder', 'enemy-riolu', rs([0]));
  assert.equal(r3.statusChanges[0].reason, 'already');
});

test('ember burns 10% (roll), not when the target faints', () => {
  const run = (roll, hp = 999) => {
    const s = stageBattle(); const t = find(s, 'enemy-riolu'); t.hp = hp;
    applyMove(s, 'ally-chimchar', 'ember', 'enemy-riolu', rs([0.5, 0.99, 0, roll]));
    return t.status;
  };
  assert.equal(run(0.05), 'burn');
  assert.equal(run(0.5), null);
  assert.equal(run(0.05, 1), null);
});

test('paralysis can stop the move; the unit still ends its action', () => {
  const s = stageBattle(); const c = find(s, 'ally-chimchar'); c.status = 'paralysis';
  const hp = find(s, 'enemy-riolu').hp;
  const r = applyMove(s, 'ally-chimchar', 'scratch', 'enemy-riolu', rs([0.1]));
  assert.equal(r.blocked, 'paralysis');
  assert.equal(find(s, 'enemy-riolu').hp, hp);
  assert.equal(c.acted, true);
});

test('confusion self-hit', () => {
  const s = stageBattle(); const c = find(s, 'ally-chimchar'); c.confusion = 2;
  const before = c.hp, dmg = confusionDamage(c);
  const r = applyMove(s, 'ally-chimchar', 'scratch', 'enemy-riolu', rs([0.4]));
  assert.equal(r.blocked, 'confusion');
  assert.deepEqual(r.selfHit, { damage: dmg, fainted: false });
  assert.equal(c.hp, before - dmg);
});

test('an enemy knocking itself out by confusion pays shared exp and coins', () => {
  const s = stageBattle(); const r = find(s, 'enemy-riolu'); r.confusion = 2; r.hp = 1;
  const res = applyMove(s, 'enemy-riolu', 'quick-attack', 'ally-chimchar', rs([0.4]));
  assert.equal(res.selfHit.fainted, true);
  assert.equal(find(s, 'enemy-riolu'), undefined);
  assert.ok(s.log.coins > 0);
  assert.ok(s.log.exp.chimchar > 0);
});

test('fire attacks thaw a frozen target; sleep and fire status moves do not', () => {
  const s = stageBattle(); const t = find(s, 'enemy-riolu'); t.hp = 999; t.status = 'freeze'; t.statusTurns = 3;
  const r = applyMove(s, 'ally-chimchar', 'ember', 'enemy-riolu', rs([0.5, 0.99, 0, 0.99]));
  assert.deepEqual([r.thawed, t.status], [['enemy-riolu'], null]);
  const s2 = stageBattle(); const t2 = find(s2, 'enemy-riolu'); t2.hp = 999; t2.status = 'sleep'; t2.statusTurns = 2;
  applyMove(s2, 'ally-chimchar', 'ember', 'enemy-riolu', rs([0.5, 0.99, 0, 0.99]));
  assert.equal(t2.status, 'sleep');
  const s3 = stageBattle(); const t3 = find(s3, 'enemy-riolu'); t3.status = 'freeze'; t3.statusTurns = 3;
  const r3 = applyMove(s3, 'ally-chimchar', 'will-o-wisp', 'enemy-riolu', rs([0]));
  assert.deepEqual([r3.statusChanges[0].reason, t3.status], ['already', 'freeze']);
});

test('phase end: poison damage event; confusion end event', () => {
  const s = stageBattle(); const c = find(s, 'ally-chimchar'); c.status = 'poison'; c.confusion = 1;
  const hp = c.hp;
  endPhase(s, rs([]));
  assert.equal(c.hp, hp - Math.floor(c.maxHp / 8));
  assert.deepEqual(s.log.statusEvents.filter((e) => e.unitId === 'ally-chimchar'), [
    { unitId: 'ally-chimchar', kind: 'poison', damage: Math.floor(c.maxHp / 8), hpBefore: hp, maxHp: c.maxHp, x: 5, y: 5 },
    { unitId: 'ally-chimchar', kind: 'confusionEnd' },
  ]);
});

test('last enemy fainting from poison wins the floor', () => {
  const s = stageBattle();
  s.units = s.units.filter((u) => u.side === 'ally' || u.id === 'enemy-riolu');
  const r = find(s, 'enemy-riolu'); r.status = 'poison'; r.hp = 1;
  endPhase(s, rs([])); // 아군 끝 → 적 시작
  endPhase(s, rs([])); // 적 끝: 독
  assert.equal(s.result, 'win');
  assert.ok(s.log.statusEvents.some((e) => e.unitId === 'enemy-riolu' && e.kind === 'fainted'));
});

test('a sleeping enemy skips its phase', () => {
  const s = stageBattle(); const r = find(s, 'enemy-riolu'); r.status = 'sleep'; r.statusTurns = 2;
  endPhase(s, rs([])); // 적 페이즈 시작
  assert.deepEqual([r.acted, r.moved, r.statusTurns], [true, true, 1]);
  assert.ok(s.log.statusEvents.some((e) => e.unitId === 'enemy-riolu' && e.kind === 'asleep'));
  assert.equal(createBattle().units[0].status, null);
});

test('status damage events carry hpBefore, maxHp and position', () => {
  const s = stageBattle(); const c = find(s, 'ally-chimchar'); c.status = 'burn'; c.hp = 30;
  endPhase(s, rs([]));
  const e = s.log.statusEvents.find((x) => x.unitId === 'ally-chimchar');
  assert.deepEqual([e.hpBefore, e.maxHp, e.x, e.y], [30, c.maxHp, 5, 5]);
});

// ---- 범위 공격 · 자폭 ----
const quakeBattle = () => { const s = stageBattle(); const g = find(s, 'enemy-gible'); g.x = 6; g.y = 6; return s; };

test('earthquake hits foes and allies around, not the user, each ×0.75', () => {
  const single = stageBattle();
  single.units = single.units.filter((u) => u.id === 'ally-chimchar' || u.id === 'enemy-riolu');
  const r1 = applyMove(single, 'ally-chimchar', 'earthquake', { self: true }, () => 0.5);
  const s = quakeBattle(); const c = find(s, 'ally-chimchar'); const hp = c.hp;
  const r = applyMove(s, 'ally-chimchar', 'earthquake', { self: true }, () => 0.5);
  assert.deepEqual(r.hits.map((h) => h.unitId).sort(), ['ally-piplup', 'enemy-gible', 'enemy-riolu']);
  assert.equal(c.hp, hp);
  const multi = r.hits.find((h) => h.unitId === 'enemy-riolu').damage;
  assert.ok(Math.abs(multi - r1.damage * 0.75) <= 1, `${multi} vs ${r1.damage}`);
});

test('each target rolls its own accuracy', () => {
  const s = quakeBattle(); find(s, 'enemy-riolu').stages.eva = 2;
  const rng = rs([0.5, 0.99, 0.5, 0.999, 0.5, 0.5, 0.99, 0.5]); // 팽도리 맞음, 리오르 빗나감, 딥상어동 맞음
  const r = applyMove(s, 'ally-chimchar', 'earthquake', { self: true }, rng);
  assert.deepEqual(r.hits.map((h) => [h.unitId, h.hit]), [['ally-piplup', true], ['enemy-riolu', false], ['enemy-gible', true]]);
});

test('user-side secondary effect applies once on a multi-target move', () => {
  const m = ALL_MOVES['heat-wave'];
  const saved = { effectKind: m.effectKind, statChanges: m.statChanges, statChance: m.statChance };
  Object.assign(m, { effectKind: 'damage-raise', statChanges: [{ stat: 'defense', change: -1 }], statChance: 0 });
  try {
    const s = stageBattle(); const g = find(s, 'enemy-gible'); g.x = 6; g.y = 4; // 부채꼴(→): (6,5),(6,4),(6,6),(7,5)
    applyMove(s, 'ally-chimchar', 'heat-wave', { dir: 'right' }, () => 0.5);
    assert.equal(find(s, 'ally-chimchar').stages.def, -1);
  } finally { Object.assign(m, saved); }
});

test('one quake knocking out a foe and an ally: exp only for the foe, ally logged', () => {
  const s = quakeBattle(); find(s, 'enemy-riolu').hp = 1; find(s, 'ally-piplup').hp = 1;
  applyMove(s, 'ally-chimchar', 'earthquake', { self: true }, () => 0.5);
  assert.deepEqual(s.log.fainted, ['piplup']);
  assert.ok(s.log.exp.chimchar > 0);
  assert.equal(s.log.coins, 3 + Math.floor(find(createBattle(), 'enemy-riolu').level / 3));
});

test('self-destruct faints the user; enemy self-destruct pays nothing', () => {
  const s = stageBattle(); find(s, 'enemy-riolu').hp = 999;
  const r = applyMove(s, 'ally-chimchar', 'self-destruct', { self: true }, () => 0.5);
  assert.equal(r.selfKO, true);
  assert.equal(find(s, 'ally-chimchar'), undefined);
  assert.ok(s.log.fainted.includes('chimchar'));
  const s2 = stageBattle(); find(s2, 'ally-chimchar').hp = 999; find(s2, 'ally-piplup').hp = 999;
  applyMove(s2, 'enemy-riolu', 'self-destruct', { self: true }, () => 0.5);
  assert.deepEqual([s2.log.coins, Object.keys(s2.log.exp).length], [0, 0]);
});

test('self-destruct taking out the last foe and the last ally is a win', () => {
  const s = stageBattle();
  s.units = s.units.filter((u) => u.id === 'ally-chimchar' || u.id === 'enemy-riolu');
  find(s, 'enemy-riolu').hp = 1;
  applyMove(s, 'ally-chimchar', 'self-destruct', { self: true }, () => 0.5);
  assert.equal(s.result, 'win');
});

test('a confused user that hits itself does not self-destruct', () => {
  const s = stageBattle(); const c = find(s, 'ally-chimchar'); c.confusion = 2; c.hp = 999; c.maxHp = 999;
  const r = applyMove(s, 'ally-chimchar', 'self-destruct', { self: true }, rs([0.4]));
  assert.equal(r.blocked, 'confusion');
  assert.ok(find(s, 'ally-chimchar'));
});

test('single-target results keep top-level fields', () => {
  const s = stageBattle(); find(s, 'enemy-riolu').hp = 999;
  const r = applyMove(s, 'ally-chimchar', 'scratch', 'enemy-riolu', () => 0.5);
  assert.equal(r.hits.length, 1);
  assert.deepEqual([r.hit, r.damage, r.fainted], [r.hits[0].hit, r.hits[0].damage, false]);
});

test('exp shares go to allies still standing after the whole attack', () => {
  const s = quakeBattle();
  const p = find(s, 'ally-piplup'); p.hp = 1;
  s.units = [...s.units.filter((u) => u !== p), p]; // 팽도리를 목록 끝으로 (리오르보다 뒤)
  find(s, 'enemy-riolu').hp = 1;
  applyMove(s, 'ally-chimchar', 'earthquake', { self: true }, () => 0.5);
  assert.equal(s.log.exp.piplup, undefined);
  assert.ok(s.log.exp.chimchar > 0);
});

// ---- 날씨 ----
test('sandstorm chips non rock/ground/steel units at their phase end', () => {
  const s = stageBattle(); s.weather = 'sand';
  const c = find(s, 'ally-chimchar'), hp = c.hp;
  endPhase(s, rs([]));
  assert.equal(c.hp, hp - Math.max(1, Math.floor(c.maxHp / 16)));
  assert.ok(s.log.statusEvents.some((e) => e.unitId === 'ally-chimchar' && e.kind === 'sand'));
});

test('last enemy falling to hail wins the floor and pays the shared reward', () => {
  const s = stageBattle(); s.weather = 'hail';
  s.units = s.units.filter((u) => u.side === 'ally' || u.id === 'enemy-riolu');
  find(s, 'enemy-riolu').hp = 1;
  endPhase(s, rs([])); endPhase(s, rs([]));
  assert.equal(s.result, 'win');
  assert.ok(s.log.coins > 0);
});

test('harsh sun blocks freezing and thaws frozen units at their phase start', () => {
  const s = stageBattle(); s.weather = 'sun';
  const t = find(s, 'enemy-riolu'); t.hp = 999;
  const r = applyMove(s, 'ally-chimchar', 'ice-beam', 'enemy-riolu', rs([0.5, 0.99, 0, 0.01]));
  assert.equal(t.status, null);
  assert.equal(r.statusChanges[0]?.reason, 'weather');
  t.status = 'freeze'; t.statusTurns = 3;
  endPhase(s, rs([0.9])); // 적 페이즈 시작
  assert.equal(t.status, null);
  assert.ok(s.log.statusEvents.some((e) => e.unitId === 'enemy-riolu' && e.kind === 'thawed'));
});

test('area stat drops (growl) last 2 turns, single-target buffs 3', () => {
  const s = stageBattle();
  applyMove(s, 'ally-chimchar', 'growl', null, zero);
  const r = find(s, 'enemy-riolu');
  assert.equal(r.stages.atk, -1);
  endPhase(s); endPhase(s); // 적 페이즈 끝 1번
  assert.equal(r.stages.atk, -1);
  endPhase(s); endPhase(s); // 적 페이즈 끝 2번 → 풀림
  assert.equal(r.stages.atk, 0);
});

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
  assert.equal(s.units.length, 9);
  const allies = s.units.filter((u) => u.side === 'ally');
  assert.deepEqual(allies.map((u) => u.species), ['chimchar', 'piplup', 'turtwig', 'shinx']);
  for (const u of allies) {
    assert.equal(u.level, BALANCE.startLevel);
    assert.deepEqual(u.stats, statsAt(SPECIES[u.species].base, u.level));
    assert.equal(u.hp, u.stats.hp);
    assert.ok(u.moves.length >= 1 && u.moves.length <= 4);
  }
  assert.equal(find(s, 'enemy-gible').level, 9);
  assert.equal(s.phase, 'player');
  assert.deepEqual(s.log, { exp: {}, fainted: [], loot: [] });
});

test('party levels and moves carry into battle', () => {
  const party = newParty();
  party[0].level = 20; party[0].moves = ['ember'];
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
  const r = applyAttack(s, 'ally-chimchar', 'enemy-murkrow', 'earthquake', zero);
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

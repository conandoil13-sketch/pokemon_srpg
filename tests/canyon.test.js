import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';
import { generateFloor } from '../src/core/floorgen.js';
import { fillerStage } from '../src/data/fillerStages.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';

const CY = DUNGEONS.find((d) => d.id === 'canyon');

test('canyon is 9-1 next to the graveyard; the ice cave opens it', () => {
  const s9 = DUNGEONS.filter((d) => d.stage === 9);
  assert.deepEqual(s9.map((d) => [d.id, d.branch, d.unlock]), [['canyon', 1, 'ice-cave'], ['graveyard', 2, 'volcano']]);
  assert.equal(CY.name, '협곡'); assert.equal(CY.theme, 'canyon'); assert.ok(CY.canyon);
  const c = fillerStage(7);
  assert.deepEqual(CY.baseLevel, c.baseLevel); assert.equal(CY.floors, 9); assert.equal(CY.levelCap, 73); assert.deepEqual(CY.size, [20, 14]);
  assert.equal(CY.weather ?? null, null);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 10).unlock, ['canyon', 'graveyard']);
  assert.ok(!DUNGEONS.some((d) => d.id === 'trial-7'));
});

test('canyon: flying and dragon lead, dragons are not drowned out', () => {
  const n = { fly: 0, dragon: 0, all: 0 };
  for (let seed = 1; seed <= 40; seed++) for (let f = 1; f < CY.floors; f++) for (const e of generateFloor(CY, f, seed).enemies) {
    const t = SPECIES[e.species].types; n.all++;
    if (t.includes('dragon')) n.dragon++; else if (t.includes('flying')) n.fly++;
  }
  assert.ok((n.fly + n.dragon) / n.all >= 0.6, `fly+dragon ${n.fly + n.dragon}/${n.all}`);
  assert.ok(n.dragon / n.all >= 0.2, `dragon ${n.dragon}/${n.all}`);
});

test('canyon: saves on the old 9-1 placeholder move to the canyon', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'trial-7']; raw.cleared = ['trial-7']; raw.best = { 'trial-7': 4 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const g = loadGame(store);
  assert.ok(g.unlocked.includes('canyon') && g.cleared.includes('canyon')); assert.equal(g.best.canyon, 4);
});

// ---- 고지·덩굴·낭떠러지 ----
import { reachable, pathCost, canEnter } from '../src/core/pathfind.js';
import { makeUnit } from '../src/core/battle.js';
import { hitChance } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';

const G = ['HHHHH', 'HHHHH', '.|...', '.....', '..X..'];
const U = (species, x, y, extra = {}) => Object.assign(makeUnit({ species, side: 'ally', x, y, level: 50 }), extra);
const has = (r, x, y) => r.has(`${x},${y}`);

test('ridge: ground walkers cannot climb a bare cliff', () => {
  const r = reachable(G, [], U('bidoof', 0, 3), 6);
  assert.ok(!has(r, 0, 1) && !has(r, 2, 1) && !has(r, 1, 1));
});

test('ridge: a ground walker starting on a vine climbs one step and its move ends', () => {
  const u = U('bidoof', 1, 2), r = reachable(G, [], u, 4);
  assert.ok(has(r, 1, 1)); assert.ok(!has(r, 1, 0) && !has(r, 0, 1) && !has(r, 2, 1));
  assert.equal(pathCost(G, u, [{ x: 1, y: 2 }, { x: 1, y: 1 }]) >= 4, true, 'climbing spends the whole move');
  const v = U('bidoof', 0, 2), rv = reachable(G, [], v, 6); // 덩굴까지 걸어가서는 못 오름
  assert.ok(!has(rv, 1, 1));
});

test('ridge: walk along the top for 1, jump down anywhere for 1', () => {
  const r = reachable(G, [], U('bidoof', 2, 0), 3);
  assert.equal(r.get('3,0'), 1); assert.equal(r.get('2,1'), 1); assert.equal(r.get('2,2'), 2); assert.equal(r.get('2,3'), 3);
});

test('ridge: flyers and dragons climb anywhere for 2', () => {
  assert.equal(reachable(G, [], U('pidgey', 0, 3), 6).get('0,1'), 3);
  assert.equal(reachable(G, [], U('bagon', 3, 2), 6).get('3,1'), 2);
});

test('chasm: only floaters and dragons go in and may stop there', () => {
  assert.ok(!has(reachable(G, [], U('bidoof', 2, 3), 4), 2, 4));
  for (const sp of ['pidgey', 'bagon']) assert.ok(has(reachable(G, [], U(sp, 2, 3), 4), 2, 4), sp);
  assert.ok(has(reachable(G, [], U('gastly', 2, 3, { ability: 'levitate' }), 4), 2, 4));
  assert.ok(!canEnter('X', U('pidgey', 0, 0, { grounded: true })), 'gravity');
  assert.ok(!canEnter('H', U('bidoof', 0, 0)) && canEnter('H', U('pidgey', 0, 0)));
});

test('ridge: +10 accuracy shooting down, -10 shooting up', () => {
  const a = U('bidoof', 0, 0), d = Object.assign(U('bidoof', 0, 1), { side: 'enemy' }), mv = MOVES['cross-chop'];
  const flat = hitChance(a, d, mv, '.', null, { atkTile: '.' });
  assert.equal(hitChance(a, d, mv, '.', null, { atkTile: 'H' }), flat + 10);
  assert.equal(hitChance(a, d, mv, 'H', null, { atkTile: '.' }), flat - 10);
  assert.equal(hitChance(a, d, mv, 'H', null, { atkTile: 'H' }), flat);
});

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

// ---- 낙사 ----
import { createBattle, applyMove, endPhase, pushPreview } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { effectMessages } from '../src/render/mapAttack.js';

const hit = () => 0.01;
const field = (rows, foes) => {
  const map = { tiles: rows, allySlots: [{ x: 1, y: 1 }], enemies: foes.map(([species, x, y, extra]) => ({ species, x, y, level: 40, ...extra })) };
  const s = createBattle(map, [newMember('growlithe', 40, createRng(1))]);
  const a = s.units.find((u) => u.side === 'ally'); a.moves = ['roar', ...a.moves.slice(1)];
  return { s, a, f: s.units.filter((u) => u.side === 'enemy') };
};
const ROW = (r1) => ['........', r1, '........'];

test('chasm fall: a pushed ground pokemon drops in and faints, credited to the pusher', () => {
  const { s, a, f } = field(ROW('...X....'), [['meowth', 2, 1], ['rattata', 7, 2]]);
  const r = applyMove(s, a.id, 'roar', f[0].id, hit);
  assert.ok(!s.units.includes(f[0]));
  assert.equal(r.pushed.fell, true); assert.equal(r.pushed.fainted, true); assert.deepEqual(r.pushed.to, { x: 3, y: 1 });
  assert.ok(s.log.defeated.some((d) => d.species === 'meowth'));
  assert.ok(Object.values(s.log.exp).some((v) => v > 0));
  assert.deepEqual(effectMessages(r, (id) => (id === f[0].id ? f[0] : a)).slice(0, 2), ['상대 나옹은 날려가 버렸다!', '상대 나옹은 낭떠러지로 떨어졌다!']);
});

test('chasm fall: the last enemy falling wins the floor; floaters glide over and may stop on the chasm', () => {
  const one = field(ROW('...X....'), [['meowth', 2, 1]]);
  applyMove(one.s, one.a.id, 'roar', one.f[0].id, hit);
  assert.equal(one.s.result, 'win');
  const fl = field(ROW('...XX...'), [['pidgey', 2, 1]]);
  applyMove(fl.s, fl.a.id, 'roar', fl.f[0].id, hit);
  assert.ok(fl.s.units.includes(fl.f[0])); assert.deepEqual([fl.f[0].x, fl.f[0].y], [5, 1]);
  const fl2 = field(ROW('...XXX..'), [['pidgey', 2, 1]]);
  applyMove(fl2.s, fl2.a.id, 'roar', fl2.f[0].id, hit);
  assert.deepEqual([fl2.f[0].x, fl2.f[0].y], [5, 1], 'stops over the chasm');
});

test('ridge pushes: along the top and off the edge, never up the cliff', () => {
  const top = field(ROW('..HHHHH.'), [['meowth', 2, 1]]);
  applyMove(top.s, top.a.id, 'roar', top.f[0].id, hit);
  assert.deepEqual([top.f[0].x, top.f[0].y], [5, 1]);
  const off = field(ROW('..HH....'), [['meowth', 2, 1]]);
  applyMove(off.s, off.a.id, 'roar', off.f[0].id, hit);
  assert.deepEqual([off.f[0].x, off.f[0].y], [5, 1]);
  const up = field(ROW('...H....'), [['meowth', 2, 1]]);
  const r = applyMove(up.s, up.a.id, 'roar', up.f[0].id, hit);
  assert.equal(r.effects[0].reason, 'stuck');
});

test('chasm: a floater grounded over the chasm falls at the end of the phase', () => {
  const { s, f } = field(ROW('........').map((r, i) => (i === 2 ? '.....X..' : r)), [['pidgey', 5, 2], ['rattata', 7, 0]]);
  s.gravity = { side: 'ally', turns: 5 }; f[0].grounded = true; // 중력
  endPhase(s, () => 0.5);
  assert.ok(!s.units.includes(f[0]));
  assert.deepEqual(s.log.falls, [{ unitId: f[0].id, x: 5, y: 2 }]);
});

test('push preview marks a fall', () => {
  const { s, a, f } = field(ROW('...X....'), [['meowth', 2, 1], ['pidgey', 2, 0], ['rattata', 7, 2]]);
  a.x = 1; a.y = 1;
  assert.equal(pushPreview(s, a, f[0]).fall, true);
  assert.equal(pushPreview(s, a, f[1]).fall, false);
});

import { fallNotices } from '../src/game/states.js';
test('fall notice at phase end', () => {
  assert.deepEqual(fallNotices([{ unitId: 'e', x: 5, y: 2 }], () => ({ side: 'enemy', species: 'pidgey' })), [{ lines: ['상대 구구는 낭떠러지로 떨어졌다!'], at: { x: 5, y: 2 }, hp: null }]);
});

// ---- 층 생성 ----
import { floats } from '../src/core/pathfind.js';
// 지상 포켓몬이 여러 차례에 걸쳐 닿는 칸 (차례마다 reachable, 덩굴 오르기 포함)
const overTurns = (tiles, start) => {
  const seen = new Set([`${start.x},${start.y}`]), q = [start];
  while (q.length) {
    const p = q.shift(), u = U('bidoof', p.x, p.y);
    for (const k of reachable(tiles, [], u, 4).keys()) if (!seen.has(k)) { seen.add(k); const [x, y] = k.split(',').map(Number); q.push({ x, y }); }
  }
  return seen;
};

test('canyon floors: a ridge up top, a creek below, big chasms (16+ cells, 2+ wide), vines under the ridge, start columns clean, everything reachable on foot over turns', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const f = 1 + (seed % CY.floors), m = generateFloor(CY, f, seed), T = m.tiles, H = T.length;
    const count = (ch) => T.join('').split(ch).length - 1;
    assert.ok(count('H') >= 20, `seed ${seed}: ridge ${count('H')}`);
    assert.ok(count('X') >= 16, `seed ${seed}: chasm ${count('X')}`);
    assert.ok(T.some((row) => row.includes('XX')), `seed ${seed}: a gorge 2+ wide`);
    assert.ok(count('|') >= 1, `seed ${seed}: vines`);
    assert.ok(T.slice(H - 2).join('').includes('~'), `seed ${seed}: creek`);
    T.forEach((row, y) => [...row].forEach((c, x) => {
      if (x < 3) assert.ok(!'HX|'.includes(c), `seed ${seed}: start column ${x},${y}`);
      if (c === '|') assert.equal(T[y - 1]?.[x], 'H', `seed ${seed}: vine ${x},${y}`);
      if (c === 'H') assert.ok(y < H / 2, `seed ${seed}: ridge stays up top`);
    }));
    for (const e of m.enemies) if (T[e.y][e.x] === 'X') assert.ok(floats(e.species) || SPECIES[e.species].types.includes('dragon'), `seed ${seed}: ${e.species} on a chasm`);
    const r = overTurns(T, m.allySlots[0]);
    for (const p of [...(m.stairs ? [m.stairs] : []), ...m.chests]) assert.ok(r.has(`${p.x},${p.y}`), `seed ${seed}: ${JSON.stringify(p)}`);
  }
  assert.deepEqual(generateFloor(CY, 4, 9), generateFloor(CY, 4, 9));
  for (const d of DUNGEONS.filter((x) => x.id !== 'canyon')) assert.ok(!/[HX|]/.test(generateFloor(d, 1, 3).tiles.join('')), d.id);
});

// ---- 최종 리뷰 수정 ----
test('vine: no climb with a zero move budget (rooted, bound, mean look)', () => {
  assert.ok(!has(reachable(G, [], U('bidoof', 1, 2), 0), 1, 1));
});
test('vine: a retreat after moving onto the vine cannot climb', () => {
  const u = U('bidoof', 1, 2, { moved: true, spent: 2 });
  assert.ok(!has(reachable(G, [], u, 2), 1, 1));
});
test('vine: with an unlimited budget the climb still ends on the first ridge tile', () => {
  const r = reachable(G, [], U('bidoof', 1, 2), Infinity);
  assert.ok(has(r, 1, 1)); assert.ok(!has(r, 1, 0) && !has(r, 2, 1));
});
test('frustration: a ground user does not follow its shove onto a chasm or up a ridge', () => {
  for (const tile of ['X', 'H']) {
    const { s, a, f } = field(['........', `..${tile}.....`, '........'], [['pidgey', 2, 1], ['rattata', 7, 2]]);
    a.x = 1; a.y = 1; a.moves = ['frustration'];
    applyMove(s, a.id, 'frustration', f[0].id, hit);
    assert.deepEqual([a.x, a.y], [1, 1], tile);
  }
});
test('chasm: a boss grounded over the chasm does not fall', () => {
  const { s, f } = field(ROW('........').map((r, i) => (i === 2 ? '.....X..' : r)), [['pidgey', 5, 2, { boss: true }], ['rattata', 7, 0]]);
  const b = f[0]; b.boss = true;
  s.gravity = { side: 'ally', turns: 5 }; b.grounded = true;
  endPhase(s, () => 0.5);
  assert.ok(s.units.includes(b));
});

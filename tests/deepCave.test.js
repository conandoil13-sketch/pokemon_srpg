import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, moveUnit } from '../src/core/battle.js';
import { seenCells, sightOf } from '../src/core/vision.js';
import { hiddenFrom } from '../src/core/stealth.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';

const ROWS = Array.from({ length: 7 }, () => '............');
function setup(allies, foes = [['geodude', 9, 3]], { dark = true, rows = ROWS } = {}) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, dark, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y, boss]) => ({ species, x, y, level: 40, ...(boss ? { boss: true } : {}) })) };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 999; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  return { s, at };
}

test('vision: allies see 2 tiles (manhattan), illuminate sees 4, union of the party', () => {
  const { s, at } = setup([['geodude', 1, 3], ['geodude', 6, 0]]);
  const seen = seenCells(s, 'ally');
  assert.ok(seen.has('3,3') && seen.has('2,4') && seen.has('6,2'));
  assert.ok(!seen.has('4,3') && !seen.has('3,4'));
  at(1, 3).ability = 'illuminate';
  assert.equal(sightOf(at(1, 3)), 4);
  assert.ok(seenCells(s, 'ally').has('5,3'));
});

test('vision: on the boss floor the boss and its surroundings stay lit', () => {
  const { s } = setup([['geodude', 0, 0]], [['onix', 9, 4, true]]);
  const seen = seenCells(s, 'ally');
  assert.ok(seen.has('9,4') && seen.has('11,4') && seen.has('9,6'));
  assert.ok(!seen.has('9,1'));
});

test('darkness hides enemies out of sight until they are revealed; other maps unchanged', () => {
  const { s, at } = setup([['geodude', 1, 3]], [['geodude', 4, 3], ['geodude', 3, 3]]);
  const far = at(4, 3), near = at(3, 3);
  assert.deepEqual([...hiddenFrom(s, 'ally')], [far.id]);
  far.revealed = true;
  assert.equal(hiddenFrom(s, 'ally').size, 0);
  assert.equal(hiddenFrom(s, 'enemy', { dark: false }).size, 0); // 아군 반투명 표시는 어둠으로 안 켜짐
  const lit = setup([['geodude', 1, 3]], [['geodude', 9, 3]], { dark: false });
  assert.equal(hiddenFrom(lit.s, 'ally').size, 0);
  assert.ok(near);
});

test('explored memory: cells once seen stay remembered after moving away', () => {
  const { s, at } = setup([['geodude', 1, 3]]);
  assert.ok(s.explored.has('2,3'));
  assert.ok(!s.explored.has('8,3'));
  moveUnit(s, at(1, 3).id, 6, 3);
  assert.ok(s.explored.has('8,3') && s.explored.has('2,3'));
  const lit = setup([['geodude', 1, 3]], undefined, { dark: false });
  assert.equal(lit.s.explored, undefined);
});

// ---- 적의 탐색·추적 ----
import { huntPlan, TRACK_CHANCE } from '../src/core/hunt.js';
import { applyMove } from '../src/core/battle.js';
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const WIDE = Array.from({ length: 7 }, () => '....................');

test('patrol: an enemy that has seen nobody walks at half speed; the boss waits', () => {
  const { s, at } = setup([['geodude', 0, 0]], [['geodude', 15, 3]], { rows: WIDE });
  const e = at(15, 3);
  const plan = huntPlan(s, e, () => 0.1);
  assert.equal(plan.attack, null);
  assert.ok(dist(plan.moveTo, e) >= 1 && dist(plan.moveTo, e) <= 2, JSON.stringify(plan.moveTo)); // geodude 이동 4 → 2
  const b = setup([['geodude', 0, 0]], [['onix', 15, 3, true]], { rows: WIDE });
  assert.deepEqual(huntPlan(b.s, b.at(15, 3), () => 0.1).moveTo, { x: 15, y: 3 });
});

test('spotting: an ally within 2 starts the chase and leaves the normal AI in charge', () => {
  const { s, at } = setup([['geodude', 5, 3]], [['geodude', 7, 3]]);
  const e = at(7, 3);
  assert.equal(huntPlan(s, e, () => 0.1), null);
  assert.equal(e.hunt.mode, 'chase');
  assert.deepEqual(e.hunt.last, { x: 5, y: 3 });
});

test('losing sight rolls once: 60% track to the real spot, 40% lose the trail at the last seen cell', () => {
  assert.equal(TRACK_CHANCE, 0.6);
  for (const [roll, mode] of [[0.59, 'track'], [0.6, 'lost']]) {
    const { s, at } = setup([['geodude', 2, 6]], [['geodude', 15, 3]], { rows: WIDE });
    const a = at(2, 6), e = at(15, 3);
    e.hunt = { mode: 'chase', last: { x: 10, y: 3 }, targetId: a.id };
    const plan = huntPlan(s, e, () => roll);
    assert.equal(e.hunt.mode, mode);
    assert.deepEqual(e.hunt.goal, mode === 'track' ? { x: 2, y: 6 } : { x: 10, y: 3 });
    assert.ok(dist(plan.moveTo, e.hunt.goal) < dist({ x: 15, y: 3 }, e.hunt.goal)); // 목표 쪽으로
  }
});

test('track that finds nobody turns into a search; the search gives up after 2 turns', () => {
  const { s, at } = setup([['geodude', 0, 6]], [['geodude', 12, 3]], { rows: WIDE });
  const e = at(12, 3);
  e.hunt = { mode: 'track', goal: { x: 12, y: 3 } };
  huntPlan(s, e, () => 0.3);
  assert.equal(e.hunt.mode, 'lost');
  e.hunt = { mode: 'lost', goal: { x: 12, y: 3 }, turns: 2 };
  const p1 = huntPlan(s, e, () => 0.3);
  assert.ok(dist(p1.moveTo, { x: 12, y: 3 }) <= 3);
  huntPlan(s, e, () => 0.3);
  assert.equal(e.hunt.mode, 'patrol');
});

test('hit from the dark: the enemy learns where the attacker stands', () => {
  const { s, at } = setup([['geodude', 1, 3]], [['geodude', 4, 3]]);
  const a = at(1, 3), e = at(4, 3);
  a.moves = ['dark-pulse'];
  e.revealed = true; // 파티에겐 보이지만(먼저 맞아 드러남) 적은 3칸 밖 공격자를 못 봄
  applyMove(s, a.id, 'dark-pulse', e.id, () => 0.5);
  assert.equal(e.hunt?.mode, 'track');
  assert.deepEqual(e.hunt.goal, { x: 1, y: 3 });
});

// ---- 데이터 · 저장 · 층 ----
import { saveGame, loadGame, newGame } from '../src/core/save.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { generateFloor } from '../src/core/floorgen.js';

test('old saves move the 6-2 placeholder (trial-4) to deep cave', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'trial-4']; raw.cleared = ['trial-4']; raw.best = { 'trial-4': 3 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const l = loadGame(store);
  assert.ok(l.unlocked.includes('deep-cave') && l.cleared.includes('deep-cave')); assert.equal(l.best['deep-cave'], 3);
});

test('deep cave floors are dark, rock/steel themed, no weather', () => {
  const d = DUNGEONS.find((x) => x.id === 'deep-cave');
  assert.equal(d.name, '깊은 동굴'); assert.deepEqual(d.bossTypes, ['rock', 'steel']);
  for (let seed = 1; seed <= 6; seed++) { const f = generateFloor(d, 1 + (seed % d.floors), seed); assert.equal(f.dark, true); assert.equal(f.weather, null); }
  assert.equal(generateFloor(DUNGEONS[0], 1, 1).dark, undefined);
});

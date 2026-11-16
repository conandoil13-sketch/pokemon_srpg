import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';
import { encounterPool } from '../src/core/encounters.js';
import { threat, bossLevel, levelCapFor } from '../src/core/difficulty.js';
import { BALANCE } from '../src/data/balance.js';

test('every dungeon follows the dungeon guide (fields, budgets, early species, caps, unlock chain)', () => {
  DUNGEONS.forEach((d, i) => {
    assert.equal(d.baseLevel.length, d.floors, d.id);
    assert.equal(d.budget.length, d.floors, d.id);
    for (let f = 1; f < d.floors; f++) {
      assert.ok(d.budget[f] > d.budget[f - 1], `${d.id} budget ${f}`);
      assert.ok(d.baseLevel[f] >= d.baseLevel[f - 1], `${d.id} level ${f}`);
    }
    assert.ok(d.filler || d.early.length >= 4, d.id); // 임시 단계는 초반 종 없음
    for (const k of d.early) {
      assert.ok(SPECIES[k], `${d.id}: ${k}`);
      assert.equal(SPECIES[k].stage, 0, k);
      assert.ok(SPECIES[k].types.some((t) => d.types.includes(t)), `${d.id}: ${k} type`);
    }
    assert.equal(d.levelCap, bossLevel(d), d.id);
    assert.equal(d.unlock, i === 0 ? null : DUNGEONS[i - 1].id, d.id);
    assert.equal(d.level, undefined, `${d.id}: old level() removed`);
    assert.equal(d.count, undefined, `${d.id}: old count() removed`);
  });
  assert.ok(!DUNGEONS[0].types.includes('electric') && !DUNGEONS[0].types.includes('fairy'));
});

test('field floors 1-2 only use early species; threat and exp multiplier', () => {
  const d = DUNGEONS[0];
  for (const f of [1, 2]) for (const k of encounterPool(d, f)) assert.ok(d.early.includes(k), `${f}: ${k}`);
  assert.ok(encounterPool(d, 3).length > encounterPool(d, 1).length);
  assert.ok(Math.abs(threat(7, 'pidgey') - 17.57) < 0.01);
  assert.equal(BALANCE.expMultiplier, 1);
});

test('level cap: first uncleared dungeon in the chain, last one stays after everything is cleared', () => {
  assert.equal(levelCapFor({ cleared: [] }), 15);
  assert.equal(levelCapFor({ cleared: ['sinnoh-field'] }), 22);
  assert.equal(levelCapFor({ cleared: ['sinnoh-field', 'sinnoh-cave'] }), 31); // 다음은 시련의 들판 Ⅰ
});

// ---- 적 굴림 ----
import { rollEnemies, budgetBonusMax } from '../src/core/difficulty.js';
import { generateFloor } from '../src/core/floorgen.js';
import { createHash } from 'node:crypto';

const total = (list) => list.reduce((s, e) => s + threat(e.level, e.species), 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

test('rollEnemies: deterministic, within budget, at least 2, early-only small floors 1-2', () => {
  for (const d of DUNGEONS) {
    assert.deepEqual(rollEnemies(d, 1, 42), rollEnemies(d, 1, 42));
    for (let f = 1; f <= d.floors; f++) {
      for (let seed = 1; seed <= 300; seed++) {
        const list = rollEnemies(d, f, seed), tag = `${d.id} ${f} ${seed}`;
        assert.ok(list.length >= 2, tag);
        assert.ok(total(list) <= d.budget[f - 1] * (1 + budgetBonusMax(d, f)) + 1e-9, `${tag}: ${total(list)}`);
        if (f <= 2) {
          assert.ok(list.length <= 4, tag);
          if (!d.filler) for (const e of list) assert.ok(d.early.includes(e.species), `${tag}: ${e.species}`); // 임시 단계는 초반 종 없음
          for (const e of list) assert.ok(e.level <= d.baseLevel[f - 1] + 1, tag); // 준보스(+2) 없음
        }
      }
    }
  }
});

test('threat medians rise floor by floor inside each dungeon (300 seeds)', () => {
  for (const d of DUNGEONS) {
    const meds = Array.from({ length: d.floors }, (_, i) => median(Array.from({ length: 300 }, (_, s) => total(rollEnemies(d, i + 1, s + 1)))));
    for (let i = 1; i < meds.length; i++) assert.ok(meds[i] > meds[i - 1], `${d.id}: ${meds.join(' ')}`);
  }
});

test('same seeds keep terrain, chests, stairs, ally slots and weather (enemies only change)', () => {
  const h = createHash('sha1');
  for (const dg of DUNGEONS.slice(0, 2)) for (let seed = 1; seed <= 40; seed++) for (let fl = 1; fl <= dg.floors; fl++) { const m = generateFloor(dg, fl, seed); h.update(JSON.stringify([m.tiles, m.chests, m.weather, m.stairs, m.allySlots])); }
  assert.equal(h.digest('hex'), '19fa3023a2062ce5e5b58bcd5597a142541b88e8');
});

test('generated floors place the rolled enemies (minus missing spots) plus the boss', () => {
  for (const d of DUNGEONS) for (let seed = 1; seed <= 60; seed++) for (const f of [1, d.floors]) {
    const m = generateFloor(d, f, seed);
    const normal = m.enemies.filter((e) => !e.boss);
    const rolled = rollEnemies(d, f, seed);
    assert.ok(normal.length <= rolled.length && normal.length >= Math.min(2, rolled.length), `${d.id} ${f} ${seed}`);
    assert.deepEqual(normal.map((e) => e.species), rolled.slice(0, normal.length).map((e) => e.species));
    assert.equal(m.enemies.filter((e) => e.boss).length, f === d.floors ? 1 : 0);
  }
});

// ---- 레벨 상한 ----
import { applyExp, newMember } from '../src/core/progress.js';
import { expForLevel } from '../src/core/stats.js';
import { joinLevel } from '../src/core/gacha.js';
import { newGame } from '../src/core/save.js';

test('level cap: overflow exp is discarded at the cap; over-cap members keep their level', () => {
  const m = newMember('pidgey', 14);
  const ev = applyExp([m], { pidgey: 999999 }, Math.random, 15);
  assert.equal(m.level, 15);
  assert.equal(m.exp, expForLevel(SPECIES.pidgey.growth, 15)); // 상한 레벨 시작점
  assert.ok(ev.some((e) => e.capped));
  const old = newMember('rattata', 18);
  const before = old.exp;
  applyExp([old], { rattata: 5000 }, Math.random, 15);
  assert.equal(old.level, 18);
  assert.equal(old.exp, before);
});

test('level cap: evolving exactly at the cap still happens', () => {
  const m = newMember('caterpie', 6); // 캐터피 → 단데기 Lv.7
  const evoLevel = SPECIES.caterpie.evolutions[0].rule.level;
  const ev = applyExp([m], { caterpie: 999999 }, Math.random, evoLevel);
  assert.equal(m.level, evoLevel);
  assert.ok(ev.some((e) => e.type === 'evolve'));
});

test('gacha joins never exceed the cap', () => {
  const g = newGame();
  for (const m of g.party) m.level = 40;
  assert.equal(joinLevel(g), 15);
  g.cleared = ['sinnoh-field'];
  assert.equal(joinLevel(g), 22);
});

test('budget bonus: none on floors 1-2, grows with depth and later dungeons, capped at 25%', () => {
  const [field, cave] = DUNGEONS;
  assert.equal(budgetBonusMax(field, 1), 0);
  assert.equal(budgetBonusMax(field, 2), 0);
  assert.ok(Math.abs(budgetBonusMax(field, 3) - 0.05) < 1e-9);
  assert.ok(Math.abs(budgetBonusMax(field, 5) - 0.15) < 1e-9);
  assert.ok(budgetBonusMax(cave, 3) > budgetBonusMax(field, 3));
  assert.equal(budgetBonusMax(cave, 7), 0.25);
  // 실제로 예산보다 큰 층이 가끔 나온다
  let over = 0;
  for (let seed = 1; seed <= 500; seed++) if (total(rollEnemies(cave, 6, seed)) > cave.budget[5]) over++;
  assert.ok(over > 0);
});

import { placeEnemies } from '../src/core/floorgen.js';

test('review: enemies fall back to the left area when the right side runs out; never crash', () => {
  const rolled = [{ species: 'pidgey', level: 6 }, { species: 'rattata', level: 6 }, { species: 'caterpie', level: 6 }];
  const out = placeEnemies(rolled, [{ x: 9, y: 1 }], [{ x: 10, y: 2 }], [{ x: 7, y: 5 }, { x: 6, y: 5 }]);
  assert.deepEqual(out.map((e) => [e.x, e.y]), [[9, 1], [10, 2], [7, 5]]);
  assert.equal(placeEnemies(rolled, [], [{ x: 9, y: 1 }], []).length, 1);
  assert.equal(placeEnemies(rolled, [], [], []).length, 0);
});

test('review: capped event comes after level events and only below the max level', () => {
  const m = newMember('pidgey', 14);
  const ev = applyExp([m], { pidgey: 999999 }, Math.random, 15);
  assert.equal(ev[0].type, 'level');
  assert.equal(ev.at(-1).type, 'capped');
  const free = newMember('pidgey', 99);
  assert.ok(!applyExp([free], { pidgey: 1e9 }).some((e) => e.capped));
});

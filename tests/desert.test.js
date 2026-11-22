import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '../src/data/dungeons.js';
import { encounterPool } from '../src/core/encounters.js';
import { loadGame, saveGame, newGame } from '../src/core/save.js';

const DS = DUNGEONS.find((d) => d.id === 'desert');

test('desert is 7-2 next to the power plant; deep cave opens it', () => {
  const s7 = DUNGEONS.filter((d) => d.stage === 7);
  assert.deepEqual(s7.map((d) => [d.id, d.branch, d.unlock]), [['power-plant', 1, 'sewer'], ['desert', 2, 'deep-cave']]);
  assert.equal(DS.name, '사막'); assert.equal(DS.theme, 'desert');
  assert.deepEqual(DS.baseLevel, s7[0].baseLevel);
  assert.ok(DS.desert);
  assert.deepEqual(DS.weather, [{ id: 'sand', chance: 0.6 }]);
  assert.equal(DS.clusters['~'], 0); assert.equal(DS.clusters['"'], 0);
  assert.deepEqual(DUNGEONS.find((d) => d.stage === 8).unlock, ['power-plant', 'desert']);
});

test('desert: the cacnea line is always in the pool (within the stage cap), mostly ground', () => {
  for (let f = 1; f <= DS.floors; f++) {
    const pool = encounterPool(DS, f);
    assert.ok(pool.includes('cacnea'), `floor ${f}`);
    if (DS.stageCap(f) >= 1) assert.ok(pool.includes('cacturne'), `floor ${f}`);
    else assert.ok(!pool.includes('cacturne'));
  }
  assert.ok(encounterPool(DS, 1).length > 3); // 1~2층이 선인왕 계열만으로 좁아지지 않음
});

test('desert: saves on the old 7-2 placeholder move to the desert', () => {
  const data = {};
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  saveGame(store, newGame());
  const raw = JSON.parse(data['pokemon-tactics-save']);
  raw.unlocked = ['sinnoh-field', 'trial-5']; raw.cleared = ['trial-5']; raw.best = { 'trial-5': 4 };
  data['pokemon-tactics-save'] = JSON.stringify(raw);
  const g = loadGame(store);
  assert.ok(g.unlocked.includes('desert') && g.cleared.includes('desert')); assert.equal(g.best.desert, 4);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, speedBonusUnit, endPhase } from '../src/core/battle.js';
import { newParty } from '../src/core/progress.js';

const setup = () => {
  const party = newParty().slice(0, 2);
  const s = createBattle({ tiles: ['........', '........'], allySlots: [{ x: 0, y: 0 }, { x: 0, y: 1 }], enemies: [{ species: 'bidoof', level: 5, x: 7, y: 0 }, { species: 'bidoof', level: 5, x: 7, y: 1 }], stairs: null, chests: [] }, party);
  const [a, b] = s.units.filter((u) => u.side === 'ally'), [e, f] = s.units.filter((u) => u.side === 'enemy');
  a.stats.spe = 100; b.stats.spe = 150; e.stats.spe = 50; f.stats.spe = 60;
  return { s, a, b, e, f };
};

test('the side whose slowest is twice the foes slowest gets its fastest unit', () => {
  const { s, b } = setup();
  assert.equal(speedBonusUnit(s, 'ally'), b);
  assert.equal(speedBonusUnit(s, 'enemy'), null);
});

test('the 2x edge, paralysis and stat stages count', () => {
  let t = setup(); t.e.stats.spe = 50.1; assert.equal(speedBonusUnit(t.s, 'ally'), null);
  t = setup(); t.a.status = 'paralysis'; assert.equal(speedBonusUnit(t.s, 'ally'), null); // 100 → 50
  t = setup(); t.e.stats.spe = 80; t.f.stats.spe = 80; t.a.stages.spe = 2; assert.equal(speedBonusUnit(t.s, 'ally'), null); // a 200 · b 150 < 160
  t = setup(); t.e.stats.spe = 70; t.f.stats.spe = 70; t.a.stages.spe = 2; assert.equal(speedBonusUnit(t.s, 'ally'), t.a); // a 200 · b 150 ≥ 140
});

test('fainted units and bots are ignored; a sleeping fastest unit gives nothing', () => {
  let t = setup(); t.e.hp = 0; t.f.stats.spe = 80; assert.equal(speedBonusUnit(t.s, 'ally'), null); // 최저 적 = 80
  t = setup(); t.e.bot = true; t.f.stats.spe = 40; assert.equal(speedBonusUnit(t.s, 'ally'), t.b);
  t = setup(); t.b.status = 'sleep'; t.b.statusTurns = 2; assert.equal(speedBonusUnit(t.s, 'ally'), null);
});

test('enemies follow the same rule', () => {
  const { s, a, b, e, f } = setup();
  a.stats.spe = 30; b.stats.spe = 40; e.stats.spe = 90; f.stats.spe = 80;
  assert.equal(speedBonusUnit(s, 'enemy'), e);
});

test('once per phase, reset when the phase ends', () => {
  const { s } = setup();
  s.bonusGiven = true; assert.equal(speedBonusUnit(s, 'ally'), null);
  endPhase(s, () => 0.5); assert.equal(s.bonusGiven, false);
});

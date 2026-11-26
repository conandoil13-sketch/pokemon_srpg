import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackMult, defendMult, immunity, speedMult, moveBonus, phaseEndHp, weatherChipImmune } from '../src/core/abilities.js';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { extraCandidates } from '../src/core/extraAbility.js';
import { expectedDamage } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';

test('custom slot abilities are eligible in their intended tiers', () => {
  for (const id of ['sun-force', 'rain-force', 'fog-stride', 'mental-barrier', 'poison-siphon', 'iron-eater']) assert.ok(extraCandidates('A').includes(id));
  for (const id of ['blizzard-force', 'fog-force', 'rain-veil', 'heat-haze-veil']) assert.ok(extraCandidates('B').includes(id));
  for (const id of ['photosynthetic-skin', 'dew-absorb', 'sand-eater']) assert.ok(extraCandidates('C').includes(id));
  for (const id of ['turboblaze', 'teravolt', 'innate-strength', 'imperfect-guard']) assert.ok(extraCandidates('S').includes(id));
});

test('weather abilities react to the active weather and both slots', () => {
  for (const [ability, weather, type] of [['sun-force','sun','fire'], ['rain-force','rain','electric'], ['blizzard-force','hail','ice'], ['fog-force','fog','ghost']]) {
    const unit = { ability2: ability };
    assert.equal(attackMult(unit, {}, {type, category:'physical'}, {weather, typeMult:1}), 1.3);
    assert.equal(attackMult(unit, {}, {type, category:'physical'}, {weather:null, typeMult:1}), 1);
  }
  assert.equal(speedMult({ability2:'fog-stride', fieldWeather:'fog'}), 2);
  assert.equal(moveBonus({ability2:'fog-stride', fieldWeather:'fog'}), 1);
  assert.equal(phaseEndHp({ability2:'dew-absorb'}, 'fog'), 1 / 16);
  assert.equal(weatherChipImmune({ability2:'sand-eater'}, 'sand'), true);
});

test('power and defensive effects compose and honor mold breaker', () => {
  assert.equal(attackMult({ability:'huge-power', ability2:'innate-strength'}, {}, {type:'normal',category:'physical'}, {weather:null,typeMult:1}), 3);
  for (const [typeMult, result] of [[0.5, 0.5], [1, 0.5], [2, 1.5], [4, 1.5]]) {
    assert.equal(defendMult({}, {ability2:'imperfect-guard'}, {type:'fire',category:'special'}, {typeMult}), result);
  }
  assert.equal(defendMult({ability:'mold-breaker'}, {ability2:'mental-barrier'}, {type:'psychic',category:'special'}, {typeMult:1}), 1);
  assert.deepEqual(immunity({}, {ability2:'poison-siphon'}, {type:'poison',category:'status'}), {ability:'poison-siphon',boost:{spa:1}});
});

test('iron eater selects one outcome on absorption, not during damage estimation', () => {
  for (const [random, heal] of [[0.1, true], [0.9, false]]) {
    const state = createBattle();
    const attacker = state.units.find(u => u.id === 'ally-chimchar');
    const defender = state.units.find(u => u.id === 'enemy-riolu');
    attacker.x = 5; attacker.y = 5; defender.x = 6; defender.y = 5;
    defender.ability2 = 'iron-eater'; defender.hp = 5;
    assert.equal(expectedDamage(attacker, defender, MOVES['bullet-punch'], '.'), 0);
    applyMove(state, attacker.id, 'bullet-punch', defender.id, () => random);
    assert.equal(defender.hp, heal ? Math.min(defender.maxHp, 5 + Math.max(1, Math.floor(defender.maxHp / 4))) : 5);
    assert.equal(defender.stages.atk, heal ? 0 : 1);
  }
});

test('new C-tier abilities apply their smaller bonuses', () => {
  for (const id of ['thin-fat', 'practice-expert', 'minor-recovery']) assert.ok(extraCandidates('C').includes(id));
  assert.equal(attackMult({ability2:'practice-expert'}, {}, {type:'normal',category:'physical',power:60}, {weather:null,typeMult:1}), 1.1);
  assert.equal(attackMult({ability2:'practice-expert'}, {}, {type:'normal',category:'physical',power:61}, {weather:null,typeMult:1}), 1);
  assert.equal(defendMult({}, {ability2:'thin-fat'}, {type:'ice',category:'special'}, {typeMult:1}), 0.9);
  assert.equal(defendMult({ability:'mold-breaker'}, {ability2:'thin-fat'}, {type:'fire',category:'special'}, {typeMult:1}), 1);
});


test('minor recovery follows regenerator combat and heal-block conditions', () => {
  const state = createBattle();
  const unit = state.units.find(u => u.id === 'ally-chimchar');
  unit.ability2 = 'minor-recovery';
  unit.hp = 1;
  endPhase(state, () => 0.5);
  assert.equal(unit.hp, 1 + Math.max(1, Math.floor(unit.maxHp / 16)));
  const previous = unit.hp;
  unit.ncTouched = true;
  endPhase(state, () => 0.5);
  assert.equal(unit.hp, previous);
  unit.healBlock = 3;
  endPhase(state, () => 0.5);
  assert.equal(unit.hp, previous);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemDefMult } from '../src/core/items.js';
import { createBattle, applyMove } from '../src/core/battle.js';
import { isHeldItem } from '../src/data/heldItems.js';

test('eviolite and relic vase reduce the correct damage', () => {
  assert.ok(isHeldItem('eviolite'));
  assert.equal(itemDefMult({side:'ally',species:'bulbasaur',held:'eviolite'}, {category:'physical'}), 1 / 1.5);
  assert.equal(itemDefMult({side:'ally',species:'venusaur',held:'eviolite'}, {category:'physical'}), 1);
  assert.equal(itemDefMult({side:'ally',species:'venusaur',held:'relic-vase'}, {category:'physical'}, 2), 0.75);
});

test('rocky helmet damages the attacker on contact', () => {
  const s = createBattle();
  const a = s.units.find(u => u.id === 'enemy-riolu');
  const d = s.units.find(u => u.id === 'ally-chimchar');
  a.x = 6; a.y = 5; d.x = 5; d.y = 5; d.held = 'rocky-helmet';
  const hp = a.hp;
  applyMove(s, a.id, 'scratch', d.id, () => 0.5);
  assert.equal(a.hp, hp - Math.max(1, Math.floor(a.maxHp / 6)));
});

test('eviolite blocks level and stone evolution while equipped', async () => {
  const { newMember, applyExp, stoneTargets } = await import('../src/core/progress.js');
  const member = newMember('chimchar', 13);
  member.held = 'eviolite';
  assert.equal(applyExp([member], { chimchar: 100000 }).some(e => e.type === 'evolve'), false);
  const roselia = newMember('roselia', 20);
  roselia.held = 'eviolite';
  assert.equal(stoneTargets([roselia]).length, 0);
  roselia.held = null;
  assert.equal(stoneTargets([roselia]).length, 1);
});

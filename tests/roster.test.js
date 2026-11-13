import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployed, toggleSortie } from '../src/core/roster.js';
import { newGame } from '../src/core/save.js';
import { newMember } from '../src/core/progress.js';

test('deployed = ditto + sortie in order', () => {
  const g = newGame();
  g.sortie = ['shinx', 'chimchar'];
  assert.deepEqual(deployed(g).map((m) => m.species), ['ditto', 'shinx', 'chimchar']);
});

test('toggleSortie: full, last one, ditto, toggles', () => {
  const g = newGame();
  g.party.push(newMember('pidgey', 8));
  assert.deepEqual(toggleSortie(g, 'pidgey'), { ok: false, reason: 'full' });
  assert.deepEqual(toggleSortie(g, 'ditto'), { ok: false, reason: 'ditto' });
  assert.deepEqual(toggleSortie(g, 'chimchar'), { ok: true });
  assert.deepEqual(g.sortie, ['piplup', 'turtwig', 'shinx']);
  assert.deepEqual(toggleSortie(g, 'pidgey'), { ok: true });
  assert.deepEqual(g.sortie, ['piplup', 'turtwig', 'shinx', 'pidgey']);
  g.sortie = ['piplup'];
  assert.deepEqual(toggleSortie(g, 'piplup'), { ok: false, reason: 'last' });
  assert.deepEqual(g.sortie, ['piplup']);
});

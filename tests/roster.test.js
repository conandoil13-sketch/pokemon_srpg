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

// ---- 진화한 출전 멤버 ----
import { renameSortie } from '../src/core/roster.js';
import { evolveMember } from '../src/core/progress.js';

test('evolving a sortie member keeps it deployed in the same slot', () => {
  const g = newGame();
  const m = g.party.find((x) => x.species === 'chimchar');
  m.level = 14;
  evolveMember(m, 'monferno');
  renameSortie(g, 'chimchar', 'monferno');
  assert.deepEqual(g.sortie, ['monferno', 'piplup', 'turtwig', 'shinx']);
  assert.deepEqual(deployed(g).map((x) => x.species), ['ditto', 'monferno', 'piplup', 'turtwig', 'shinx']);
});

test('stale sortie entries never leave a dead slot', () => {
  const g = newGame();
  g.party.find((x) => x.species === 'chimchar').species = 'monferno'; // rename 누락 상황
  assert.deepEqual(deployed(g).map((x) => x.species), ['ditto', 'piplup', 'turtwig', 'shinx']);
  assert.deepEqual(toggleSortie(g, 'monferno'), { ok: true }, 'room for it again');
  g.sortie = ['ghost-entry', 'piplup'];
  assert.deepEqual(toggleSortie(g, 'piplup'), { ok: false, reason: 'last' }, 'stale entries do not count');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployed, toggleSortie } from '../src/core/roster.js';
import { newGame } from '../src/core/save.js';
import { newMember } from '../src/core/progress.js';
import { memberByKey } from '../src/core/members.js';
const sortieSpecies = (g) => g.sortie.map((k) => memberByKey(g, k).species);

test('deployed = ditto + sortie in order', () => {
  const g = newGame();
  g.sortie = [5, 2]; // 꼬링크, 침착
  assert.deepEqual(deployed(g).map((m) => m.species), ['ditto', 'shinx', 'chimchar']);
});

test('toggleSortie: full, last one, ditto, toggles', () => {
  const g = newGame();
  g.party.push(newMember('pidgey', 8));
  g.party.at(-1).uid = 6;
  assert.deepEqual(toggleSortie(g, 6), { ok: false, reason: 'full' });
  assert.deepEqual(toggleSortie(g, 1), { ok: false, reason: 'ditto' });
  assert.deepEqual(toggleSortie(g, 2), { ok: true });
  assert.deepEqual(sortieSpecies(g), ['piplup', 'turtwig', 'shinx']);
  assert.deepEqual(toggleSortie(g, 6), { ok: true });
  assert.deepEqual(sortieSpecies(g), ['piplup', 'turtwig', 'shinx', 'pidgey']);
  g.sortie = [3];
  assert.deepEqual(toggleSortie(g, 3), { ok: false, reason: 'last' });
  assert.deepEqual(g.sortie, [3]);
  assert.deepEqual(toggleSortie(g, 99), { ok: false, reason: 'missing' });
});

// ---- 진화한 출전 멤버 ----
import { evolveMember } from '../src/core/progress.js';

test('evolving a sortie member keeps it deployed in the same slot (uid does not change)', () => {
  const g = newGame();
  const m = g.party.find((x) => x.species === 'chimchar');
  m.level = 14;
  evolveMember(m, 'monferno');
  assert.deepEqual(g.sortie, [2, 3, 4, 5]);
  assert.deepEqual(deployed(g).map((x) => x.species), ['ditto', 'monferno', 'piplup', 'turtwig', 'shinx']);
});

test('stale sortie entries never leave a dead slot', () => {
  const g = newGame();
  g.sortie = [77, 'ghost-entry', 3];
  assert.deepEqual(deployed(g).map((x) => x.species), ['ditto', 'piplup']);
  assert.deepEqual(toggleSortie(g, 3), { ok: false, reason: 'last' }, 'stale entries do not count');
});

test('two of the same species: only the deployed one goes out, toggled by uid', async () => {
  const { giveUid } = await import('../src/core/members.js');
  const g = newGame();
  const a = giveUid(g, newMember('pidgey', 8)); g.party.push(a);
  const b = giveUid(g, newMember('pidgey', 8)); g.party.push(b);
  g.sortie = [b.uid];
  assert.deepEqual(deployed(g).map((m) => m.uid), [1, b.uid]);
  assert.deepEqual(toggleSortie(g, a.uid), { ok: true });
  assert.deepEqual(g.sortie, [b.uid, a.uid]);
  assert.deepEqual(toggleSortie(g, b.uid), { ok: true });
  assert.deepEqual(deployed(g).map((m) => m.uid), [1, a.uid]);
});

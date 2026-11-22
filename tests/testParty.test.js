import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleTestParty } from '../src/core/testParty.js';
import { newGame } from '../src/core/save.js';
import { newMember } from '../src/core/progress.js';
import { DUNGEONS } from '../src/data/dungeons.js';

test('test party: every member scaled to the dungeon level, fully evolved, ids kept; earlier stages opened', () => {
  const g = newGame();
  g.party = [{ ...newMember('ditto', 8), uid: 1 }, { ...newMember('chimchar', 8), uid: 2 }, { ...newMember('pichu', 6), uid: 3 }, { ...newMember('turtwig', 70), uid: 4 }];
  g.run = { dungeonId: 'city', floor: 3 };
  const d = DUNGEONS.find((x) => x.id === 'deep-cave');
  const lv = scaleTestParty(g, 'deep-cave');
  assert.equal(lv, Math.round(d.baseLevel.reduce((a, b) => a + b) / d.baseLevel.length));
  assert.deepEqual(g.party.map((m) => [m.uid, m.species, m.level]), [[1, 'ditto', lv], [2, 'infernape', lv], [3, 'raichu', lv], [4, 'torterra', lv]]); // 위로도 아래로도 맞춤
  assert.ok(g.party.every((m) => m.moves.length > 0));
  assert.equal(g.run, null);
  assert.ok(g.unlocked.includes('deep-cave') && g.cleared.includes('city') && !g.cleared.includes('deep-cave'));
});

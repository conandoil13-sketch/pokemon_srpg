import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberKey, memberByKey, giveUid, lineLimit, lineMembers, unifyLines } from '../src/core/members.js';
import { newGame } from '../src/core/save.js';
import { newMember } from '../src/core/progress.js';

test('line limit: max(2, final forms)', () => {
  assert.equal(lineLimit('eevee'), 7);
  assert.equal(lineLimit('tyrogue'), 3);
  assert.equal(lineLimit('ralts'), 2);
  assert.equal(lineLimit('chimchar'), 2);
});

test('uids: new game numbers the party, giveUid counts up, lookup by key', () => {
  const g = newGame();
  assert.deepEqual(g.party.map((m) => m.uid), [1, 2, 3, 4, 5]);
  assert.equal(g.nextUid, 6);
  const m = giveUid(g, newMember('pidgey', 5));
  g.party.push(m);
  assert.equal(m.uid, 6);
  assert.equal(g.nextUid, 7);
  assert.equal(memberByKey(g, '3'), g.party[2]);
  assert.equal(memberByKey(g, 6), m);
  assert.equal(memberKey(newMember('pidgey', 5)), 'pidgey'); // uid 없으면 종 이름
});

test('unifyLines: per-stat max IVs, union of genders, copies not shared objects', () => {
  const g = newGame();
  const a = giveUid(g, { ...newMember('ralts', 10), ivs: { hp: 1, atk: 10, def: 5, spa: 0, spd: 0, spe: 0 }, gender: 'female', genders: ['female'] });
  g.party.push(a);
  const b = giveUid(g, { ...newMember('gardevoir', 30), ivs: { hp: 0, atk: 25, def: 1, spa: 3, spd: 0, spe: 0 }, gender: 'male', genders: ['male'] });
  g.party.push(b);
  unifyLines(g);
  assert.deepEqual(lineMembers(g, 'ralts').length, 2);
  assert.deepEqual(a.ivs, { hp: 1, atk: 25, def: 5, spa: 3, spd: 0, spe: 0 });
  assert.deepEqual(b.ivs, a.ivs);
  assert.notEqual(a.ivs, b.ivs);
  assert.deepEqual([...a.genders].sort(), ['female', 'male']);
  assert.deepEqual(b.genders, a.genders);
});

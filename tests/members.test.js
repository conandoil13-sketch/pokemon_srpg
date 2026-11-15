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

// ---- 한 마리 더 꺼내기 ----
import { copyMember, COPY_COST } from '../src/core/members.js';
import { createRng } from '../src/core/rng.js';
import { setGender } from '../src/core/individual.js';

const withMember = (species, level, extra = {}) => {
  const g = newGame();
  const m = giveUid(g, { ...newMember(species, level), ...extra });
  g.party.push(m);
  return { g, m };
};

test('copyMember: 4 shards, first stage at 80% level, ability locked, line values copied, not deployed', () => {
  assert.equal(COPY_COST, 4);
  const { g, m } = withMember('gardevoir', 40, { gender: 'female', genders: ['female', 'male'], ivs: { hp: 31, atk: 2, def: 3, spa: 30, spd: 4, spe: 5 }, abilityUnlocked: true });
  g.shards = { ralts: 5 };
  const sortie = [...g.sortie];
  const r = copyMember(g, m.uid, createRng(1));
  assert.equal(r.ok, true);
  const c = r.member;
  assert.equal(c.species, 'ralts');
  assert.equal(c.level, 32);
  assert.equal(c.abilityUnlocked, false);
  assert.deepEqual(c.ivs, m.ivs); assert.notEqual(c.ivs, m.ivs);
  assert.deepEqual(c.genders, m.genders); assert.notEqual(c.genders, m.genders);
  assert.equal(c.gender, 'female');
  assert.equal(c.uid, m.uid + 1);
  assert.equal(g.party.at(-1), c);
  assert.equal(g.shards.ralts, 1);
  assert.deepEqual(g.sortie, sortie);
});

test('copyMember: refusals — shards, line limit (2, eevee 7), ditto, missing; low level floors at 5', () => {
  const { g, m } = withMember('pidgey', 5);
  g.shards = { pidgey: 3 };
  assert.deepEqual(copyMember(g, m.uid, createRng(1)), { ok: false, reason: 'shards' });
  g.shards.pidgey = 8;
  assert.equal(copyMember(g, m.uid, createRng(1)).member.level, 5);
  assert.deepEqual(copyMember(g, m.uid, createRng(1)), { ok: false, reason: 'limit' }); // 구구 계열 2마리
  assert.equal(g.shards.pidgey, 4);
  assert.deepEqual(copyMember(g, 1, createRng(1)), { ok: false, reason: 'ditto' });
  assert.deepEqual(copyMember(g, 99, createRng(1)), { ok: false, reason: 'missing' });
  const e = withMember('eevee', 20);
  e.g.shards = { eevee: 40 };
  for (let i = 0; i < 6; i++) assert.equal(copyMember(e.g, e.m.uid, createRng(i)).ok, true);
  assert.deepEqual(copyMember(e.g, e.m.uid, createRng(9)), { ok: false, reason: 'limit' });
});

test('a ralts taken from a male gallade can switch to female if the line ever got one', () => {
  const { g, m } = withMember('gallade', 30, { gender: 'male', genders: ['male', 'female'] });
  g.shards = { ralts: 4 };
  const c = copyMember(g, m.uid, createRng(1)).member;
  assert.equal(c.gender, 'male');
  assert.deepEqual(setGender(g, c.uid, 'female'), { ok: true });
  assert.equal(m.gender, 'male');
});

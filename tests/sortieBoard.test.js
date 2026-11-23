import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDungeonSelect, mainTypes } from '../src/game/dungeonSelect.js';
import { CHOICE_LOCK } from '../src/game/learnFlow.js';
import { DUNGEONS, dungeonById } from '../src/data/dungeons.js';
import { newGame } from '../src/core/save.js';
import { startRun } from '../src/core/run.js';
import { newMember, abilityOf } from '../src/core/progress.js';
import { deployed } from '../src/core/roster.js';
import { createRng } from '../src/core/rng.js';

const open = (game) => { const started = []; const sel = createDungeonSelect({ game, onStart: (id) => started.push(id), onResume() {}, onBack() {} }); return { sel, started }; };
const ok = (sel) => { sel.update(CHOICE_LOCK + 0.1); sel.handle({ type: 'confirm' }); };

test('main types: the first two non-minor types, the desert shows only ground', () => {
  assert.deepEqual(mainTypes(dungeonById('beach')), ['water', 'flying']);
  assert.deepEqual(mainTypes(dungeonById('sinnoh-cave')), ['rock', 'ground']);
  assert.deepEqual(mainTypes(dungeonById('desert')), ['ground']);
  for (const d of DUNGEONS) { const t = mainTypes(d); assert.ok(t.length >= 1 && t.length <= 2, d.id); assert.ok(!t.some((x) => d.minorTypes?.includes(x)), d.id); }
});

test('picking an unlocked dungeon always asks first, listing the sortie members in order with current types and ability', () => {
  const game = newGame();
  const { sel, started } = open(game);
  sel.handle({ type: 'confirm' });
  assert.deepEqual(started, []);
  assert.equal(sel.confirming, true);
  const c = sel.confirmInfo;
  assert.equal(c.dungeon, 'sinnoh-field'); assert.equal(c.warn, false);
  assert.deepEqual(c.lines[0], '이 멤버로 신오 들판에 출전할까?');
  const team = deployed(game);
  assert.deepEqual(c.members.map((m) => m.member), team);
  const ditto = c.members[0];
  assert.deepEqual(ditto.types, team[0].build.types); assert.equal(ditto.ability, team[0].build.ability);
  for (const m of c.members.slice(1)) assert.equal(m.ability, abilityOf(m.member));
  ok(sel);
  assert.deepEqual(started, ['sinnoh-field']);
});

test('backing out keeps the cursor on the dungeon; locked dungeons never ask', () => {
  const game = newGame(); game.unlocked.push('sinnoh-cave');
  const { sel, started } = open(game);
  sel.handle({ type: 'dir', dx: 0, dy: 1 }); sel.handle({ type: 'confirm' });
  sel.update(1); sel.handle({ type: 'dir', dx: 0, dy: 1 }); sel.handle({ type: 'confirm' }); // 돌아간다
  assert.equal(sel.confirming, false); assert.deepEqual(started, []);
  sel.handle({ type: 'confirm' }); sel.handle({ type: 'cancel' });
  assert.equal(sel.confirming, false);
  sel.handle({ type: 'confirm' }); ok(sel);
  assert.deepEqual(started, ['sinnoh-cave']);
  const g2 = newGame(); const o2 = open(g2);
  o2.sel.handle({ type: 'dir', dx: 0, dy: 1 }); o2.sel.handle({ type: 'confirm' }); // 잠긴 동굴
  assert.equal(o2.sel.confirming, false);
});

test('with a run in progress the same window warns about the treasure and defaults to going back', () => {
  const game = newGame(); game.run = { ...startRun('sinnoh-field', 9), floor: 3 };
  const { sel, started } = open(game);
  sel.handle({ type: 'dir', dx: 0, dy: 1 }); sel.handle({ type: 'confirm' });
  assert.equal(sel.confirmInfo.warn, true);
  assert.equal(sel.confirmInfo.lines.slice(1).join(' '), '새로 출전하면 진행 중인 탐험에서 모은 보물을 잃는다.');
  ok(sel); assert.deepEqual(started, [], 'default 돌아간다');
  sel.handle({ type: 'confirm' }); sel.update(1); sel.handle({ type: 'dir', dx: 0, dy: -1 }); sel.handle({ type: 'confirm' });
  assert.deepEqual(started, ['sinnoh-field']);
});

test('a full sortie of five (two of the same species) shows every member', () => {
  const game = newGame();
  const a = { ...newMember('shinx', 20, createRng(1)), uid: 901 }, b = { ...newMember('shinx', 22, createRng(2)), uid: 902 };
  game.party.push(a, b); game.sortie = [...game.sortie.slice(0, 2), 901, 902];
  const { sel } = open(game); sel.handle({ type: 'confirm' });
  const ms = sel.confirmInfo.members.map((m) => m.member);
  assert.equal(ms.length, deployed(game).length); assert.ok(ms.includes(a) && ms.includes(b));
});

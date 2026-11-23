import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDittoBuild } from '../src/game/dittoBuild.js';
import { newGame } from '../src/core/save.js';

const scene = (capsules) => {
  const game = newGame(), d = game.party.find((m) => m.species === 'ditto');
  d.level = 20; d.moves = ['tackle', 'growl', 'scratch', 'leer'];
  game.items.capsules = capsules;
  let saves = 0;
  const b = createDittoBuild({ game, onSave: () => saves++, onClose() {} });
  return { b, game, d, saves: () => saves };
};
const press = (b, type, extra = {}) => b.handle({ type, ...extra });

test('a capsule opens its description first; backing out of the description, the slot or the question uses nothing', () => {
  const { b, game, d, saves } = scene([{ kind: 'move', value: 'ember', from: 'charmander' }]);
  press(b, 'confirm'); assert.equal(b.mode, 'preview'); assert.deepEqual(b.preview, { kind: 'move', value: 'ember' });
  press(b, 'cancel'); assert.equal(b.mode, 'list');
  press(b, 'confirm'); press(b, 'confirm'); assert.equal(b.mode, 'slot');
  assert.deepEqual(b.compare, { old: 'tackle', new: 'ember' });
  press(b, 'dir', { dx: 0, dy: 1 }); assert.deepEqual(b.compare, { old: 'growl', new: 'ember' });
  press(b, 'cancel'); assert.equal(b.mode, 'list');
  press(b, 'confirm'); press(b, 'confirm'); press(b, 'confirm'); assert.equal(b.mode, 'confirm');
  press(b, 'cancel');
  assert.equal(game.items.capsules.length, 1); assert.deepEqual(d.moves, ['tackle', 'growl', 'scratch', 'leer']); assert.equal(saves(), 0);
  press(b, 'confirm'); press(b, 'confirm'); press(b, 'dir', { dx: 0, dy: 1 }); press(b, 'confirm'); press(b, 'confirm');
  assert.equal(game.items.capsules.length, 0); assert.equal(d.moves[1], 'ember'); assert.equal(saves(), 1);
});

test('ability and type capsules preview against what ditto has now', () => {
  const { b, d } = scene([{ kind: 'type', value: 'fire', from: 'charmander' }, { kind: 'ability', value: 'blaze', from: 'charmander' }]);
  press(b, 'confirm'); // 최근 순: 특성 캡슐이 먼저
  assert.deepEqual(b.preview, { kind: 'ability', value: 'blaze', current: d.build.ability });
  press(b, 'cancel'); press(b, 'dir', { dx: 0, dy: 1 }); press(b, 'confirm');
  assert.deepEqual(b.preview, { kind: 'type', value: 'fire', current: d.build.types });
});

test('the current moves and ability can be looked at without a capsule', () => {
  const { b, d } = scene([]);
  press(b, 'confirm'); // 빈 가방: 살펴보기 항목만
  assert.equal(b.mode, 'view');
  assert.deepEqual(b.viewing, { kind: 'move', value: 'tackle' });
  for (let i = 0; i < 4; i++) press(b, 'dir', { dx: 0, dy: 1 });
  assert.deepEqual(b.viewing, { kind: 'ability', value: d.build.ability });
  press(b, 'cancel'); assert.equal(b.mode, 'list');
  press(b, 'click', { px: 130, py: 94 }); // 위쪽 기술 칸 (오른쪽 아래 = 4번째)
  assert.deepEqual(b.viewing, { kind: 'move', value: 'leer' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResults, CHOICE_LOCK } from '../src/game/results.js';
import { newGame } from '../src/core/save.js';
import { expForLevel } from '../src/core/stats.js';
import { SPECIES } from '../src/data/species.js';

const tick = (s, sec) => { for (let t = 0; t < sec; t += 0.02) s.update(0.02); };
const toLevel = (m, lv) => expForLevel(SPECIES[m.species].growth, lv) - m.exp;

test('bars → events → onDone once with evolutions', () => {
  const game = newGame();
  const done = [];
  const r = createResults({ game, result: 'win', log: { exp: { chimchar: toLevel(game.party[1], 15) } }, firstClear: true, onDone: (ev) => done.push(ev) });
  assert.equal(game.items.evoStone, 1);
  assert.equal(r.phase, 'bars');
  r.handle({ type: 'confirm' }); // 바 즉시 완료
  assert.equal(r.phase, 'events');
  for (let i = 0; i < 30 && !done.length; i++) { tick(r, 0.5); r.handle({ type: 'confirm' }); }
  assert.equal(done.length, 1);
  assert.deepEqual(done[0], [{ species: 'chimchar', options: ['monferno'] }]);
});

test('lose: no stone, exp still applied', () => {
  const game = newGame();
  createResults({ game, result: 'lose', log: { exp: { piplup: toLevel(game.party[2], 10) } }, firstClear: true, onDone() {} });
  assert.equal(game.items.evoStone, 0);
  assert.equal(game.party[2].level, 10);
});

test('choose menu: mashing Z (even after the lock) never forgets or gives up a move', () => {
  const game = newGame();
  const m = game.party[1];
  m.moves = ['scratch', 'ember', 'tackle', 'peck'];
  let done = 0;
  const r = createResults({ game, result: 'win', log: { exp: { chimchar: toLevel(m, 15) } }, firstClear: false, onDone: () => done++ });
  r.handle({ type: 'confirm' });
  for (let i = 0; i < 40 && r.pending?.type !== 'choose'; i++) { tick(r, 0.3); r.handle({ type: 'confirm' }); }
  assert.equal(r.pending.type, 'choose');
  for (let i = 0; i < 60; i++) { tick(r, 0.1); r.handle({ type: 'confirm' }); r.handle({ type: 'click', px: 5, py: 5 }); }
  assert.equal(r.pending.type, 'choose', 'still deciding');
  assert.deepEqual(m.moves, ['scratch', 'ember', 'tackle', 'peck']);
  assert.equal(done, 0);
});

test('choose menu: pick a move → confirm 예 → replaced', () => {
  const game = newGame();
  const m = game.party[1];
  m.moves = ['scratch', 'ember', 'tackle', 'peck'];
  const r = createResults({ game, result: 'win', log: { exp: { chimchar: toLevel(m, 15) } }, firstClear: false, onDone() {} });
  r.handle({ type: 'confirm' });
  for (let i = 0; i < 40 && r.pending?.type !== 'choose'; i++) { tick(r, 0.3); r.handle({ type: 'confirm' }); }
  const wanted = r.pending.move;
  tick(r, CHOICE_LOCK + 0.05);
  // 커서는 '배우지 않는다'(맨 아래)에서 시작 → 위로 4번 = 0번(scratch), 아래로 1번 = ember
  for (let i = 0; i < 4; i++) r.handle({ type: 'dir', dx: 0, dy: -1 });
  r.handle({ type: 'dir', dx: 0, dy: 1 });
  r.handle({ type: 'confirm' });           // 확인창 (기본 아니요)
  assert.deepEqual(m.moves, ['scratch', 'ember', 'tackle', 'peck']);
  tick(r, CHOICE_LOCK + 0.05);
  r.handle({ type: 'dir', dx: 0, dy: -1 }); // 예
  r.handle({ type: 'confirm' });
  assert.deepEqual(m.moves, ['scratch', wanted, 'tackle', 'peck']);
});

test('choose menu: clicking a menu row picks it, clicking elsewhere does nothing', async () => {
  const { W, H } = await import('../src/render/screen.js');
  const game = newGame();
  const m = game.party[1];
  m.moves = ['scratch', 'ember', 'tackle', 'peck'];
  const r = createResults({ game, result: 'win', log: { exp: { chimchar: toLevel(m, 15) } }, firstClear: false, onDone() {} });
  r.handle({ type: 'confirm' });
  for (let i = 0; i < 40 && r.pending?.type !== 'choose'; i++) { tick(r, 0.3); r.handle({ type: 'confirm' }); }
  tick(r, CHOICE_LOCK + 0.05);
  r.handle({ type: 'click', px: 5, py: 5 });
  assert.equal(r.pending.confirming, false, 'outside click ignored');
  // 메뉴: 5줄(기술 4 + 배우지 않는다), 오른쪽 아래. 1번째 줄(scratch) 클릭
  const menuH = 5 * 16 + 8, x = W - 120 - 4 + 10, y = H - 54 - menuH + 4 + 8;
  r.handle({ type: 'click', px: x, py: y });
  assert.equal(r.pending.confirming, true);
});

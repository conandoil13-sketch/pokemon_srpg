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
  const r = createResults({ game, result: 'win', log: { exp: { chimchar: toLevel(game.party[0], 15) } }, firstClear: true, onDone: (ev) => done.push(ev) });
  assert.equal(game.items.evoStone, 1);
  assert.equal(r.phase, 'bars');
  r.handle({ type: 'confirm' }); // 바 즉시 완료
  assert.equal(r.phase, 'events');
  for (let i = 0; i < 30 && !done.length; i++) { tick(r, 0.5); r.handle({ type: 'confirm' }); }
  assert.equal(done.length, 1);
  assert.deepEqual(done[0], [{ species: 'chimchar', to: 'monferno' }]);
});

test('lose: no stone, exp still applied', () => {
  const game = newGame();
  createResults({ game, result: 'lose', log: { exp: { piplup: toLevel(game.party[1], 10) } }, firstClear: true, onDone() {} });
  assert.equal(game.items.evoStone, 0);
  assert.equal(game.party[1].level, 10);
});

test('choose menu: mashing during the lock does nothing; then pick replaces a move', () => {
  const game = newGame();
  const m = game.party[0];
  m.moves = ['scratch', 'ember', 'tackle', 'peck'];
  let done = 0;
  const r = createResults({ game, result: 'win', log: { exp: { chimchar: toLevel(m, 15) } }, firstClear: false, onDone: () => done++ });
  r.handle({ type: 'confirm' });
  for (let i = 0; i < 40 && r.pending?.type !== 'choose'; i++) { tick(r, 0.3); r.handle({ type: 'confirm' }); }
  assert.equal(r.pending.type, 'choose');
  const wanted = r.pending.move;
  for (let i = 0; i < 10; i++) r.handle({ type: 'confirm' }); // 잠금 중 연타
  assert.equal(r.pending.type, 'choose');
  assert.deepEqual(m.moves, ['scratch', 'ember', 'tackle', 'peck']);
  tick(r, CHOICE_LOCK + 0.05);
  r.handle({ type: 'dir', dx: 0, dy: 1 }); // 1번(ember) 선택
  r.handle({ type: 'confirm' });
  assert.deepEqual(m.moves, ['scratch', wanted, 'tackle', 'peck']);
  assert.equal(done, 0);
});

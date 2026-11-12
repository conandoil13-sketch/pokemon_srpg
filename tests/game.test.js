import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/states.js';
import { createRng } from '../src/core/rng.js';

// 화면 없이 상태 머신만 돌린다 (draw 는 호출하지 않음)
function run(game, until, spam, maxSec = 120) {
  for (let t = 0; t < maxSec; t += 0.05) {
    game.update(0.05);
    if (spam) for (const ev of spam) game.handle(ev);
    if (until(game.mode)) return true;
  }
  return false;
}

test('mashing confirm/click through a whole enemy phase never throws', () => {
  const game = createGame({ rng: createRng(7) });
  game.handle({ type: 'confirm' }); // title → player phase
  assert.ok(run(game, (m) => m === 'idle'));
  // 적이 바로 공격할 수 있게 아군을 강 건너 적 앞에 배치
  const s = game.state;
  const pos = { 'ally-chimchar': [11, 5], 'ally-shinx': [12, 6], 'ally-piplup': [11, 3], 'ally-turtwig': [12, 8] };
  for (const u of s.units) if (pos[u.id]) [u.x, u.y] = pos[u.id];
  game.handle({ type: 'endTurn' });
  const spam = [{ type: 'confirm' }, { type: 'click', x: 0, y: 0, px: 0, py: 0 }, { type: 'cancel' }, { type: 'dir', dx: 1, dy: 0 }];
  assert.doesNotThrow(() => {
    assert.ok(run(game, (m) => m === 'idle' || m === 'result', spam), `stuck in ${game.mode}`);
  });
  const allies = s.units.filter((u) => u.side === 'ally');
  assert.ok(allies.length < 4 || allies.some((u) => u.hp < u.maxHp), 'enemies attacked');
});

test('mashing confirm right after the last KO does not skip the result screen', () => {
  const game = createGame({ rng: createRng(1) });
  game.handle({ type: 'confirm' });
  assert.ok(run(game, (m) => m === 'idle'));
  const s = game.state;
  s.units = s.units.filter((u) => u.side === 'ally' || u.id === 'enemy-riolu');
  const L = s.units.find((u) => u.id === 'enemy-riolu');
  L.x = 3; L.y = 5; L.hp = 1;
  const at = (x, y) => [{ type: 'cursor', x, y, px: x * 24 + 12, py: y * 24 + 12 }, { type: 'confirm' }];
  for (const e of [...at(2, 5), ...at(2, 5)]) game.handle(e);
  assert.ok(run(game, (m) => m === 'action'));
  game.handle({ type: 'confirm' }); // 첫 기술
  game.handle({ type: 'confirm' }); // 대상
  assert.ok(run(game, (m) => m === 'result', [{ type: 'confirm' }]));
  game.handle({ type: 'confirm' }); // 결과 화면 진입 직후 연타
  assert.equal(game.mode, 'result');
});

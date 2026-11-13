import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxManager } from '../src/render/fx.js';
import { actorFor } from '../src/render/fxActor.js';
import { fxForAilment } from '../src/data/moveFx.js';
import { PAL } from '../src/vendor/pixelfx/core/index.js';

const spark = { id: 'impacts/hit-spark', opts: { palette: PAL.fire }, timeScale: 1, layer: 'front' };
const run = (m, sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) m.update(dt); };

test('one-shots end and leave the list', () => {
  const m = createFxManager();
  m.spawn(spark, { x: 50, y: 50 });
  assert.equal(m.count, 1);
  run(m, 2);
  assert.equal(m.count, 0);
});

test('timeScale 2 ends in about half the time', () => {
  const m = createFxManager();
  m.spawn({ ...spark, timeScale: 2 }, { x: 50, y: 50 });
  run(m, 0.3);
  assert.equal(m.count, 0);
});

test('delay: not drawn before it starts', () => {
  const m = createFxManager();
  m.spawn(spark, { x: 50, y: 50 }, { delay: 0.08 });
  const f = m.draw(null, 'front', { x: 0, y: 0 });
  assert.ok(f.color.every((c) => c === 0));
  run(m, 0.12);
  assert.ok(m.draw(null, 'front', { x: 0, y: 0 }).color.some((c) => c !== 0));
});

test('follow loops stay until unfollowed; a vanished target removes them', () => {
  const m = createFxManager();
  let pos = { x: 60, y: 60 };
  const loop = fxForAilment('confusion').loop;
  m.follow('a:confusion', loop, () => pos, actorFor('pikachu', null));
  run(m, 3);
  assert.equal(m.count, 1);
  m.unfollow('a:confusion');
  run(m, 1);
  assert.equal(m.count, 0);
  m.follow('b:sleep', fxForAilment('sleep').loop, () => pos, actorFor('pikachu', null));
  pos = null;
  run(m, 0.05);
  assert.equal(m.count, 0);
});

test('off-screen camera and broken specs do not throw', () => {
  const m = createFxManager();
  m.spawn(spark, { x: 10, y: 10 });
  assert.doesNotThrow(() => m.draw(null, 'front', { x: 900, y: 900 }));
  assert.doesNotThrow(() => m.spawn({ id: 'nope/none', opts: {} }, { x: 0, y: 0 }));
  assert.equal(m.failed, 1);
});

test('placeholder actor before the sprite loads, cached', () => {
  const a = actorFor('pikachu', null);
  assert.equal(a.mask.data.length, a.mask.w * a.mask.h);
  assert.equal(a.pixels.length, a.mask.w * a.mask.h);
  assert.equal(actorFor('pikachu', null), a);
});

test('performance: 10 lingering status loops + 1 attack under 4ms per frame', () => {
  const m = createFxManager();
  const kinds = ['burn', 'poison', 'sleep', 'freeze', 'confusion', 'paralysis', 'toxic', 'burn', 'sleep', 'confusion'];
  kinds.forEach((k, i) => m.follow(`u${i}:${k}`, fxForAilment(k).loop, () => ({ x: 20 + i * 22, y: 80 }), actorFor('pikachu', null)));
  run(m, 0.5);
  m.spawn(spark, { x: 120, y: 120 });
  // 다른 테스트 파일과 동시에 돌아 CPU 를 나눠 쓰므로 20프레임씩 3번 재고 가장 빠른 값을 본다
  let per = Infinity;
  for (let r = 0; r < 3; r++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) { m.update(1 / 60); m.draw(null, 'back', { x: 0, y: 0 }); m.draw(null, 'front', { x: 0, y: 0 }); }
    per = Math.min(per, (performance.now() - t0) / 20);
  }
  assert.ok(per < 4, `${per.toFixed(2)}ms`);
});

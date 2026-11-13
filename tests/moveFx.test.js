import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxForMove, fxForStage, fxForAilment, TYPE_PALETTE, RANK_UP_PAL, RANK_DOWN_PAL } from '../src/data/moveFx.js';
import { MOVES } from '../src/data/moves.js';
import { FX } from '../src/vendor/pixelfx/fx-index.js';
import { PAL } from '../src/vendor/pixelfx/core/index.js';

const f = (id, distance = 1) => fxForMove(MOVES[id], { distance });

test('templates by shape and category', () => {
  assert.deepEqual([f('tackle').hit.id, f('tackle').hit.opts.palette], ['pickups/collect-burst', PAL.bone]); // 위력 35 → 약
  const sb = f('shadow-ball', 2);
  assert.deepEqual([sb.travel.id, sb.hit.id, sb.hit.opts.palette], ['projectiles/plasma-shot', 'impacts/blunt-hit', PAL.shadow]);
  assert.equal(f('shadow-ball', 1).travel, undefined);
  assert.deepEqual([f('hydro-pump').travel.id, f('hydro-pump').travel.opts.palette], ['arcane/arcane-beam', PAL.water]);
  assert.deepEqual([f('heat-wave').cast.id, f('heat-wave').cast.opts.palette], ['fire/fire-breath', PAL.fire]);
  assert.equal(f('earthquake').cast.id, 'impacts/ground-slam');
  assert.deepEqual([f('discharge').cast.id, f('discharge').cast.opts.palette], ['lightning/thunderclap', PAL.volt]);
  assert.equal(f('fire-blast').burst.id, 'impacts/blunt-hit');
  assert.equal(f('self-destruct').selfKO.id, 'explosions/small-explosion');
  assert.equal(f('explosion').selfKO.id, 'explosions/big-explosion');
});

test('palettes, stage colors, ailments', () => {
  assert.equal(Object.keys(TYPE_PALETTE).length, 17);
  for (const p of Object.values(TYPE_PALETTE)) assert.ok(PAL[p], p);
  assert.notEqual(f('crunch').hit.opts.palette, PAL.night); // 악은 밝힌 전용 색
  assert.equal(fxForStage(2).opts.palette, RANK_UP_PAL);
  assert.equal(fxForStage(-1).opts.palette, RANK_DOWN_PAL);
  assert.deepEqual(['paralysis', 'burn', 'poison', 'toxic', 'sleep', 'freeze', 'confusion'].map((a) => fxForAilment(a).loop.id),
    ['status/stunned', 'status/burning', 'status/poisoned', 'status/poisoned', 'status/sleep', 'status/frozen', 'status/confused']);
});

test('every spec points at a vendored effect and runs at most 2x', () => {
  const specs = [];
  for (const m of Object.values(MOVES)) if (m.learnable && m.category !== 'status') for (const d of [1, 2]) specs.push(...Object.values(fxForMove(m, { distance: d })));
  specs.push(fxForStage(1), fxForStage(-1));
  for (const a of ['paralysis', 'burn', 'poison', 'toxic', 'sleep', 'freeze', 'confusion']) specs.push(...Object.values(fxForAilment(a)));
  for (const s of specs.filter(Boolean)) { assert.ok(FX[s.id], s.id); assert.ok(s.timeScale <= 2, s.id); }
});

test('json overrides win', async () => {
  const { fxForMoveWith } = await import('../src/data/moveFx.js');
  const r = fxForMoveWith(MOVES.tackle, { distance: 1 }, { tackle: { hit: { id: 'impacts/crit-hit' } } });
  assert.equal(r.hit.id, 'impacts/crit-hit');
  assert.equal(r.hit.opts.palette, PAL.bone);
});

test('power tiers: weak is small and cute, strong is layered and bigger', () => {
  assert.equal(f('tackle').hit.id, 'pickups/collect-burst');            // 40 → 약
  assert.equal(f('ember').hit.id, 'pickups/collect-burst');
  assert.equal(f('crunch').hit.id, 'impacts/hit-spark');                // 80 → 중
  assert.equal(f('crunch').hit2, undefined);
  const tb = f('thunderbolt');                                           // 95 → 강
  assert.deepEqual([tb.hit.id, tb.hit2.id, tb.hit.opts.light], ['impacts/hit-spark', 'impacts/blunt-hit', 1.4]);
  assert.ok(f('earthquake').cast.opts.reach > f('discharge').cast.opts.reach); // 100 vs 80: 충격파 더 넓게
  assert.ok(tb.travel.life > f('bubble-beam').travel.life);              // 강한 빔은 더 오래
});

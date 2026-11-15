import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxForMove, fxForStage, fxForAilment, TYPE_PALETTE, RANK_UP_PAL, RANK_DOWN_PAL } from '../src/data/moveFx.js';
import { MOVES } from '../src/data/moves.js';
import { FX as VFX } from '../src/vendor/pixelfx/fx-index.js';
import { CUSTOM_FX } from '../src/fx-custom/index.js';
const FX = { ...VFX, ...CUSTOM_FX };
import { PAL } from '../src/vendor/pixelfx/core/index.js';

const f = (id, distance = 1) => fxForMove(MOVES[id], { distance });

test('templates by shape and category', () => {
  assert.deepEqual([f('tackle').hit.id, f('tackle').hit.opts.palette], ['pickups/collect-burst', PAL.bone]); // 위력 35 → 약
  const sb = f('shadow-ball', 2);
  assert.deepEqual([sb.travel.id, sb.hit.id, sb.hit.opts.palette], ['projectiles/plasma-shot', 'impacts/blunt-hit', PAL.shadow]);
  assert.equal(f('shadow-ball', 1).travel.id, 'projectiles/plasma-shot'); // 특수는 붙어서도 탄이 날아간다
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
  for (const a of ['paralysis', 'burn', 'poison', 'toxic', 'sleep', 'freeze', 'confusion', 'infatuation']) specs.push(...Object.values(fxForAilment(a)));
  specs.push(HEAL_FX, drainFx(24, 0)); // mapAttack 의 회복·흡수 연출
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
  assert.equal(f('headbutt').hit.id, 'impacts/hit-spark');              // 70 → 중 (계열 없는 물리)
  assert.equal(f('headbutt').hit2, undefined);
  const tb = f('thunderbolt');                                           // 95 → 강 (직선 기술)
  assert.deepEqual([tb.hit.id, tb.hit2.id, tb.hit.opts.light], ['impacts/hit-spark', 'impacts/blunt-hit', 1.4]);
  assert.ok(f('earthquake').cast.opts.reach > f('discharge').cast.opts.reach); // 100 vs 80: 충격파 더 넓게
  assert.ok(tb.travel.life > f('bubble-beam').travel.life);              // 강한 빔은 더 오래
});

test('melee families and special shots look different', () => {
  assert.equal(f('bite').hit.id, 'pokemon/bite');
  assert.equal(f('fire-fang').hit.opts.palette, f('ember', 2).hit.opts.palette); // 불꽃엄니는 불꽃 색 이빨
  assert.equal(f('double-kick').hit.id, 'pokemon/kick');
  assert.equal(f('fire-punch').hit.id, 'impacts/crit-hit');
  assert.equal(f('scratch').cast.id, 'melee/claw-swipe');
  assert.equal(f('peck').cast.id, 'melee/thrust');
  assert.equal(f('hyper-voice').cast.id, 'pokemon/sound-wave');
  assert.equal(f('ember', 1).travel.id, 'fire/fireball');
  assert.equal(f('water-gun', 1).travel.id, 'projectiles/plasma-shot'); // 물 구슬은 천천히 생겨 짧은 탄으로 안 보임
  assert.equal(fxForMove({ ...MOVES.ember, type: 'ice' }, { distance: 1 }).travel.id, 'ice/ice-lance');
  const ids = new Set(['scratch', 'bite', 'fire-punch', 'ember', 'hyper-voice', 'double-kick'].map((m) => JSON.stringify(f(m, 1))));
  assert.equal(ids.size, 6);
});

test('every move in a family exists and is learnable', async () => {
  const { BITE, KICK, SLASH, STAB } = await import('../src/data/moveFamilies.js');
  for (const id of [...BITE, ...KICK, ...SLASH, ...STAB]) assert.ok(MOVES[id]?.learnable, id);
});

// ---- 변화기 묶음 1차 ----
import { EFFECT_FX } from '../src/data/moveFx.js';
import { EFFECT_MOVES } from '../src/data/moveEffects.js';
test('every effect has an fx that is registered', () => {
  for (const e of new Set(Object.values(EFFECT_MOVES))) {
    assert.ok(EFFECT_FX[e], e);
    assert.ok(FX[EFFECT_FX[e].id], `${e}: ${EFFECT_FX[e].id}`);
  }
});

import { fxForEffect } from '../src/data/moveFx.js';
test('spider web and block get their own fx; mean look keeps the hands', () => {
  assert.equal(fxForEffect('noMove', 'spider-web').id, 'pokemon/silk-wrap');
  assert.equal(fxForEffect('noMove', 'block').id, 'pokemon/brick-stack');
  assert.equal(fxForEffect('noMove', 'mean-look').id, 'shadow/grasping-hands');
  assert.equal(fxForEffect('taunt', 'taunt'), EFFECT_FX.taunt);
});
test('aqua ring is rings, leech seed and worry seed are real seeds', () => {
  assert.equal(fxForEffect('aquaRing', 'aqua-ring').id, 'pokemon/aqua-ring');
  assert.equal(fxForEffect('leechSeed', 'leech-seed').id, 'pokemon/seed-scatter');
  const w = fxForEffect('worrySeed', 'worry-seed');
  assert.deepEqual([w.id, w.opts.head], ['pokemon/seed-scatter', true]);
});
test('taunt is an anger mark, disable is chains, heal block is a smaller sigil', () => {
  assert.equal(fxForEffect('taunt', 'taunt').id, 'pokemon/anger-mark');
  assert.equal(fxForEffect('disable', 'disable').id, 'pokemon/chain-bind');
  assert.equal(fxForEffect('healBlock', 'heal-block').id, 'pokemon/small-sigil');
});
import { HEAL_FX, drainFx } from '../src/data/moveFx.js';
test('heal moves, rest and drain use the short heal glow and drain orbs', () => {
  assert.equal(HEAL_FX.id, 'pokemon/heal-glow');
  assert.equal(fxForEffect('rest', 'rest').id, 'pokemon/heal-glow');
  const d = drainFx(-48, 24);
  assert.deepEqual([d.id, d.opts.fromX, d.opts.fromY], ['pokemon/drain-orbs', -48, 24]);
});

test('auras and fog get their own fx: wind, a see-through veil, rolling fog, a purple pool', () => {
  assert.equal(fxForEffect('tailwind', 'tailwind').id, 'pokemon/tailwind-gust');
  assert.equal(fxForEffect('safeguard', 'safeguard').id, 'pokemon/veil-dome');
  assert.equal(fxForEffect('mist', 'mist').id, 'pokemon/ground-fog');
  assert.equal(fxForEffect('haze', 'haze').id, 'pokemon/ground-fog');
  assert.notDeepEqual(fxForEffect('mist', 'mist').opts.palette, fxForEffect('haze', 'haze').opts.palette); // 흰 / 검정
  assert.equal(fxForEffect('luckyChant', 'lucky-chant').id, 'pokemon/chant-pool');
});

import { trapTossFx, TOSS_FLIGHT, TOSS_GAP, POISON_PAL as POISON } from '../src/data/moveFx.js';
test('spikes are tossed one by one, toxic spikes in purple', () => {
  const s = trapTossFx('spikes', -48, 0), t = trapTossFx('toxicSpikes', -48, 0);
  assert.equal(s.id, 'pokemon/caltrop-toss');
  assert.equal(s.opts.fromX, -48);
  assert.deepEqual(t.opts.palette, POISON);
  assert.equal(fxForEffect('spikes', 'spikes').id, 'pokemon/caltrop-toss');
  assert.ok(TOSS_FLIGHT > 0 && TOSS_GAP > 0);
});

import { pushFx } from '../src/data/moveFx.js';
test('whirlwind is a gust that reaches the target, roar keeps the sound wave', () => {
  assert.equal(pushFx('whirlwind', 2).id, 'pokemon/gust-blast');
  assert.equal(pushFx('whirlwind', 2).opts.reach, 48);
  assert.equal(pushFx('roar', 1).id, 'pokemon/sound-wave');
});

import { bindFx } from '../src/data/moveFx.js';
test('wrap-like moves coil, vortex moves swirl in their type colour', () => {
  assert.equal(bindFx('wrap').id, 'pokemon/bind-coil');
  assert.equal(bindFx('clamp').id, 'pokemon/bind-coil');
  assert.equal(bindFx('whirlpool').id, 'pokemon/bind-vortex');
  assert.notDeepEqual(bindFx('fire-spin').opts.palette, bindFx('sand-tomb').opts.palette);
  assert.equal(fxForEffect('bind', 'fire-spin').id, 'pokemon/bind-vortex');
});

test('each OHKO move has its own finisher effect', () => {
  for (const [id, fx] of [['sheer-cold', 'pokemon/ohko-freeze'], ['fissure', 'pokemon/ohko-fissure'], ['guillotine', 'pokemon/ohko-guillotine'], ['horn-drill', 'pokemon/ohko-drill']]) {
    assert.equal(fxForMove(MOVES[id], { distance: 1 }).hit.id, fx, id);
    assert.ok(CUSTOM_FX[fx], fx);
  }
});

import { LINK_EFFECTS, linkFx } from '../src/data/moveFx.js';
test('swap-type moves use link orbs; other recent status moves have their own effect', () => {
  for (const e of ['powerSwap', 'guardSwap', 'heartSwap', 'psychUp', 'psychoShift', 'painSplit', 'memento']) assert.ok(LINK_EFFECTS.has(e), e);
  assert.equal(linkFx('psychUp', -48, 0).opts.mode, 'take');
  assert.equal(fxForEffect('stockpile', 'stockpile').id, 'pokemon/stockpile-gulp');
  assert.equal(fxForEffect('bellyDrum', 'belly-drum').id, 'pokemon/drum-beat');
  assert.equal(fxForEffect('wish', 'wish').id, 'pokemon/wish-star');
  assert.equal(fxForEffect('acupressure', 'acupressure').id, 'pokemon/needle-point');
  assert.equal(fxForEffect('nightmare', 'nightmare').id, 'pokemon/nightmare-cloud');
  assert.equal(fxForEffect('splash', 'splash').id, 'pokemon/splash-hop');
});

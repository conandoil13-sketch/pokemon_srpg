import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reelTimeline, reelAt } from '../src/game/roulette.js';
import { extraMenuItem } from '../src/game/extraRoll.js';
import { newMember } from '../src/core/progress.js';

const hasS = (ring) => ring.includes('S');
const kinds = (tl) => tl.steps.map((s) => s.kind);
const stepT = (tl, k) => tl.steps.find((s) => s.kind === k).t;
const sweep = (tl, f) => { for (let t = 0; t <= tl.end; t += 0.02) f(reelAt(tl, t), t); };

test('plain roll never shows S', () => {
  const tl = reelTimeline({ tier: 'B', tease: false });
  assert.equal(tl.upgrade, false);
  assert.ok(!kinds(tl).includes('upgrade'));
  sweep(tl, (at) => assert.ok(!hasS(at.ring)));
});

test('S always upgrades', () => {
  const tl = reelTimeline({ tier: 'S', tease: false }), up = stepT(tl, 'upgrade');
  assert.equal(tl.upgrade, true);
  sweep(tl, (at, t) => assert.equal(hasS(at.ring), t >= up, `t=${t}`));
});

test('reel lands on the result tier', () => {
  for (const r of [{ tier: 'S', tease: false }, { tier: 'A', tease: true }, { tier: 'A', tease: false }, { tier: 'B', tease: false }, { tier: 'C', tease: false }, { tier: 'B', tease: true }]) {
    const tl = reelTimeline(r), stop = stepT(tl, 'stop');
    assert.equal(tl.stopTier, r.tier);
    assert.equal(reelAt(tl, stop + 0.31).symbol, r.tier, JSON.stringify(r));
    assert.equal(reelAt(tl, tl.end).symbol, r.tier);
    assert.ok(tl.end <= 4.5, `end ${tl.end}`);
  }
});

test('tease pauses on S first', () => {
  for (const tier of ['A', 'B']) {
    const tl = reelTimeline({ tier, tease: true }), at = reelAt(tl, stepT(tl, 'tease') + 0.2);
    assert.equal(at.symbol, 'S');
    assert.equal(at.speed, 0);
  }
  assert.ok(!kinds(reelTimeline({ tier: 'A', tease: false })).includes('tease'));
});

test('steps in order', () => {
  for (const r of [{ tier: 'S' }, { tier: 'A', tease: true }, { tier: 'C' }]) {
    const tl = reelTimeline(r), k = kinds(tl);
    assert.equal(k[0], 'spin');
    assert.deepEqual(k.slice(-2), ['stop', 'reveal']);
    for (let i = 1; i < tl.steps.length; i++) assert.ok(tl.steps[i].t > tl.steps[i - 1].t);
    assert.ok(reelAt(tl, 0.06).pos < 0, 'kicks up first');
    assert.ok(reelAt(tl, 0.5).speed > 10, 'spins fast');
  }
});

test('member menu offers 특성 각성', () => {
  const game = { shards: { charmander: 2 } }, m = newMember('charmander', 30);
  const ok = extraMenuItem(game, m);
  assert.equal(ok.label, '특성 각성');
  assert.equal(ok.enabled, true);
  assert.equal(ok.act, 'extra');
  game.shards.charmander = 1;
  const no = extraMenuItem(game, m);
  assert.equal(no.enabled, false);
  assert.ok(no.why.join(' ').includes('결정이 모자라다 (1/2)'));
  const d = newMember('ditto', 30);
  assert.equal(extraMenuItem({ shards: { ditto: 5 } }, d).enabled, true);
});

test('the old slot 2 stays on screen until the spin ends', async () => {
  const { createExtraRoll } = await import('../src/game/extraRoll.js');
  const m = { ...newMember('charmander', 30), extraAbility: 'run-away' };
  const game = { party: [m], shards: { charmander: 4 }, extraSeq: 17 };
  const r = createExtraRoll({ game, member: m, onClose() {} });
  r.handle({ type: 'confirm' }); r.update(1); r.handle({ type: 'confirm' });
  assert.equal(r.mode, 'spin');
  assert.notEqual(m.extraAbility, 'run-away');
  assert.equal(r.shownExtra, 'run-away');
  r.handle({ type: 'confirm' }); r.handle({ type: 'confirm' });
  assert.equal(r.mode, 'view');
  assert.equal(r.shownExtra, m.extraAbility);
});

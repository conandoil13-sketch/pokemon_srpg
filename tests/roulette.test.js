import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rouletteTimeline, rouletteAt } from '../src/game/roulette.js';
import { extraMenuItem } from '../src/game/extraRoll.js';
import { newMember } from '../src/core/progress.js';

const hasS = (ring) => ring.includes('S');
const kinds = (tl) => tl.steps.map((s) => s.kind);

test('S always upgrades', () => {
  const tl = rouletteTimeline({ tier: 'S', tease: false });
  assert.equal(tl.upgrade, true);
  assert.equal(tl.stopTier, 'S');
  const up = tl.steps.findIndex((s) => s.kind === 'upgrade');
  assert.ok(up > 0);
  assert.ok(tl.steps.slice(0, up).every((s) => !hasS(s.ring)));
  assert.ok(tl.steps.slice(up).every((s) => hasS(s.ring)));
});

test('tease upgrades then stops below S', () => {
  const tl = rouletteTimeline({ tier: 'A', tease: true });
  assert.equal(tl.upgrade, true);
  assert.equal(tl.stopTier, 'A');
  assert.ok(kinds(tl).includes('upgrade'));
});

test('plain roll never shows S', () => {
  const tl = rouletteTimeline({ tier: 'B', tease: false });
  assert.equal(tl.upgrade, false);
  assert.equal(tl.stopTier, 'B');
  assert.ok(tl.steps.every((s) => !hasS(s.ring)));
  assert.ok(!kinds(tl).includes('upgrade'));
});

test('steps end with stop then reveal', () => {
  for (const r of [{ tier: 'S', tease: false }, { tier: 'A', tease: true }, { tier: 'C', tease: false }]) {
    const tl = rouletteTimeline(r), k = kinds(tl);
    assert.deepEqual(k.slice(-2), ['stop', 'reveal']);
    assert.equal(k[0], 'spin');
    for (let i = 1; i < tl.steps.length; i++) assert.ok(tl.steps[i].t > tl.steps[i - 1].t);
    assert.ok(tl.steps.at(-1).t <= 3.5);
  }
});

test('the highlighted cell lands on the result tier', () => {
  for (const r of [{ tier: 'S', tease: false }, { tier: 'A', tease: true }, { tier: 'A', tease: false }, { tier: 'B', tease: false }, { tier: 'C', tease: false }]) {
    const tl = rouletteTimeline(r), stop = tl.steps.find((s) => s.kind === 'stop');
    const at = rouletteAt(tl, stop.t + 0.01);
    assert.equal(at.ring[at.index], r.tier);
    assert.equal(at.phase, 'stop');
    const early = rouletteAt(tl, 0.2);
    assert.equal(early.phase, 'spin');
    if (!tl.upgrade) assert.ok(!hasS(early.ring));
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

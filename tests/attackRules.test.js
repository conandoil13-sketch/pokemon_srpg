import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, applyMove, endPhase } from '../src/core/battle.js';
import { hitChance } from '../src/core/damage.js';
import { moveBudget } from '../src/core/status.js';
import { newMember } from '../src/core/progress.js';
import { MOVES } from '../src/data/moves.js';
import { createRng } from '../src/core/rng.js';

const hit = () => 0.01, miss = () => 0.99;
const duel = (allySp, foeSp, { ally = {}, foe = {}, fx = 2, fy = 1 } = {}) => {
  const m = newMember(allySp, 40, createRng(1));
  const map = { tiles: Array.from({ length: 10 }, () => '.'.repeat(10)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: foeSp, x: fx, y: fy, level: 40 }] };
  const s = createBattle(map, [m]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, ally); Object.assign(f, foe);
  return { s, a, f };
};
const round = (s) => { endPhase(s, () => 0.9); endPhase(s, () => 0.9); };

test('sure-hit moves ignore grass, evasion and accuracy drops but not protect', () => {
  const { s, a, f } = duel('pidgey', 'geodude');
  a.stages.acc = -6; f.stages.eva = 6;
  assert.equal(hitChance(a, f, MOVES['aerial-ace'], '"'), 100);
  assert.ok(hitChance(a, f, MOVES.tackle, '"') < 100);
  applyMove(s, f.id, 'protect', f.id, hit);
  const r = applyMove(s, a.id, 'aerial-ace', f.id, miss);
  assert.equal(r.hits[0].protected, true);
});
test('hyper beam seals the user next own phase but still lets it move', () => {
  const { s, a, f } = duel('pidgey', 'geodude');
  applyMove(s, a.id, 'hyper-beam', { dir: 'right' }, miss);
  assert.equal(a.recharge, true);
  round(s);
  assert.equal(a.sealed, true);
  assert.ok(moveBudget(a) > 0);
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'recharge' && e.unitId === a.id));
  assert.equal(applyMove(s, a.id, 'tackle', f.id, hit).blocked, 'sealed');
});
test('jump kick that misses or hits protect costs half max HP; magic guard is spared', () => {
  const { s, a, f } = duel('machop', 'geodude', { ally: { ability: 'guts' }, foe: { stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 6 } } }); // 회피 +6 → 빗나감
  const r = applyMove(s, a.id, 'jump-kick', f.id, miss);
  assert.equal(r.crash, Math.floor(a.maxHp / 2));
  assert.equal(a.hp, a.maxHp - r.crash);
  const g = duel('machop', 'gastly'); // 고스트: 격투 무효
  assert.ok(applyMove(g.s, g.a.id, 'high-jump-kick', g.f.id, hit).crash > 0);
  const m = duel('machop', 'geodude', { ally: { ability: 'magic-guard' }, foe: { stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 6 } } });
  assert.equal(applyMove(m.s, m.a.id, 'jump-kick', m.f.id, miss).crash, 0);
  assert.equal(m.a.hp, m.a.maxHp);
  const ok = duel('machop', 'geodude');
  assert.equal(applyMove(ok.s, ok.a.id, 'jump-kick', ok.f.id, hit).crash, 0);
});
test('false swipe always leaves at least 1 HP', () => {
  const { s, a, f } = duel('pidgey', 'pidgey');
  f.hp = 1;
  applyMove(s, a.id, 'false-swipe', f.id, hit);
  assert.equal(f.hp, 1);
  assert.ok(s.units.includes(f));
});
test('feint and shadow force break protect and remove it', () => {
  for (const id of ['feint', 'shadow-force']) {
    const { s, a, f } = duel('pidgey', 'pidgey');
    round(s);
    applyMove(s, f.id, 'protect', f.id, hit);
    const r = applyMove(s, a.id, id, f.id, hit);
    assert.ok(!r.hits[0].protected, id);
    assert.equal(f.guard, null, id);
  }
});
test('brick break shatters screens covering the target before damage', () => {
  const { s, a, f } = duel('machop', 'geodude');
  s.zones = [{ kind: 'reflect', side: 'enemy', x: f.x, y: f.y, turns: 5 }, { kind: 'lightScreen', side: 'enemy', x: f.x + 1, y: f.y, turns: 5 }, { kind: 'reflect', side: 'ally', x: a.x, y: a.y, turns: 5 }];
  const r = applyMove(s, a.id, 'brick-break', f.id, hit);
  assert.deepEqual(r.screensBroken.sort(), ['lightScreen', 'reflect']);
  assert.deepEqual(s.zones.map((z) => z.side), ['ally']);
});
test('rapid spin frees bind and leech seed and clears nearby foe spikes', () => {
  const { s, a, f } = duel('pidgey', 'geodude');
  a.bound = { by: f.id, moveId: 'wrap', turns: 3, reach: 1 }; a.leechBy = f.id;
  s.spikes = [{ x: 1, y: 2, kind: 'spikes', side: 'enemy' }, { x: 1, y: 3, kind: 'toxicSpikes', side: 'enemy' }, { x: 8, y: 8, kind: 'spikes', side: 'enemy' }, { x: 0, y: 1, kind: 'spikes', side: 'ally' }];
  const r = applyMove(s, a.id, 'rapid-spin', f.id, hit);
  assert.equal(a.bound, null); assert.equal(a.leechBy, null);
  assert.deepEqual(r.spun, { freed: true, cleared: 2 });
  assert.equal(s.spikes.length, 2);
});

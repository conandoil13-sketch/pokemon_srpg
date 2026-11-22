import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, moveUnit } from '../src/core/battle.js';
import { newMember } from '../src/core/progress.js';
import { createRng } from '../src/core/rng.js';
import { pathTo } from '../src/core/pathfind.js';
import { applyTide } from '../src/core/tide.js';
import { planEnemyAction } from '../src/core/ai.js';

function setup(rows, allies, foes = [['bidoof', rows[0].length - 1, rows.length - 1]], extra = {}) {
  const ms = allies.map(([sp]) => newMember(sp, 40, createRng(1)));
  const map = { tiles: rows, allySlots: allies.map(([, x, y]) => ({ x, y })), enemies: foes.map(([species, x, y]) => ({ species, x, y, level: 40 })), ...extra };
  const s = createBattle(map, ms);
  for (const u of s.units) { u.hp = u.maxHp = 160; u.ability = null; }
  const at = (x, y) => s.units.find((u) => u.x === x && u.y === y);
  const go = (u, x, y) => moveUnit(s, u.id, x, y, 1, pathTo(s.grid, s.units, u, x, y, 9));
  return { s, at, go };
}

test('sliding into a pokemon shoves it one cell; the slider takes its cell', () => {
  const { s, at, go } = setup(['.____', '.....'], [['bidoof', 0, 0]], [['machop', 3, 0]]);
  const u = at(0, 0), e = at(3, 0);
  go(u, 3, 0);
  assert.deepEqual([u.x, u.y, e.x, e.y], [3, 0, 4, 0]);
  assert.deepEqual(s.log.iceEvents.map((v) => v.kind), ['bump']);
  assert.deepEqual(s.log.iceEvents[0], { kind: 'bump', unitId: e.id, by: u.id, from: { x: 3, y: 0 }, to: { x: 4, y: 0 } });
  assert.equal(e.moved, false); // 밀린 쪽은 자기 차례 이동을 잃지 않음
});

test('a blocked bump leaves both in place; an icicle behind hurts the one bumped', () => {
  const { s, at, go } = setup(['.___Y', '.....'], [['bidoof', 0, 0]], [['machop', 3, 0]]);
  const u = at(0, 0), e = at(3, 0);
  go(u, 2, 0);
  assert.deepEqual([u.x, e.x], [2, 3]);
  assert.deepEqual(s.log.iceEvents.map((v) => [v.kind, v.unitId]), [['blocked', e.id], ['icicle', e.id]]);
  assert.equal(e.hp, 140); assert.equal(s.log.iceEvents[1].damage, 20);
});

test('sliding into an icicle hurts the slider 1/8; ice types are immune; a wall does nothing', () => {
  let { s, at, go } = setup(['.___Y', '.....'], [['bidoof', 0, 0]]);
  go(at(0, 0), 3, 0);
  assert.equal(at(3, 0).hp, 140); assert.deepEqual(s.log.iceEvents.map((v) => v.kind), ['icicle']);
  ({ s, at, go } = setup(['.___#', '.....'], [['bidoof', 0, 0]]));
  go(at(0, 0), 3, 0); assert.equal(at(3, 0).hp, 160); assert.deepEqual(s.log.iceEvents, []);
  ({ s, at, go } = setup(['.___Y', '.....'], [['snorunt', 0, 0]]));
  go(at(0, 0), 3, 0); assert.equal(at(3, 0).hp, 160); assert.deepEqual(s.log.iceEvents, []);
});

test('an icicle knockout ends the unit and is logged', () => {
  const { s, at, go } = setup(['.___Y', '.....'], [['bidoof', 0, 0], ['bidoof', 0, 1]]);
  const u = at(0, 0); u.hp = 5;
  go(u, 3, 0);
  assert.ok(!s.units.includes(u));
  assert.deepEqual(s.log.iceEvents.map((v) => v.kind), ['icicle', 'fainted']);
});

test('ice types freeze the water they walk over; the tide floods it back', () => {
  const { s, at, go } = setup(['.~~.', '....'], [['snorunt', 0, 0]]);
  go(at(0, 0), 3, 0);
  assert.equal(s.grid[0], '.__.');
  const t = setup(['.,~.', '....'], [['snorunt', 0, 0]], undefined, { tide: { a: [{ x: 1, y: 0 }], b: [{ x: 2, y: 0 }] } });
  t.go(t.at(0, 0), 2, 0);
  assert.equal(t.s.grid[0][2], '_');
  applyTide(t.s, 1);
  assert.equal(t.s.grid[0][2], '~');
});

test('AI: a grounded enemy avoids stopping against an icicle', () => {
  const { s } = setup(['.....', 'Y____', '.....'], [['bidoof', 0, 2]], [['bidoof', 4, 0]]);
  for (const u of s.units) u.moves = ['growl'];
  const foe = s.units.find((u) => u.side === 'enemy');
  const plan = planEnemyAction(s, foe);
  assert.ok(!(plan.moveTo.x === 1 && plan.moveTo.y === 1), JSON.stringify(plan.moveTo));
});

test('scene: an ally slides fast, shoves the foe with a short slide and a notice; the move cannot be undone', async () => {
  const { createGame } = await import('../src/game/states.js');
  const map = { tiles: ['._____.', '.......', '.......'], allySlots: [{ x: 0, y: 0 }], enemies: [{ species: 'machop', x: 4, y: 0, level: 5 }] };
  const game = createGame({ rng: createRng(3), map, party: [newMember('bidoof', 40, createRng(1))], theme: 'ice' });
  const s = game.state, p = s.units[0], e = s.units.find((u) => u.side === 'enemy');
  for (let i = 0; i < 200; i++) { game.update(0.05); if (game.mode === 'idle') break; game.handle({ type: 'confirm' }); }
  game.handle({ type: 'confirm' });
  for (let i = 0; i < 4; i++) game.handle({ type: 'dir', dx: 1, dy: 0 });
  game.handle({ type: 'confirm' });
  let t = 0, slid = false;
  for (; t < 5 && game.mode !== 'notice'; t += 0.01) { game.update(0.01); if (game.mode === 'sliding') slid = true; }
  assert.ok(t < 0.11 * 2 + 0.05 * 3 + 0.3, `walk took ${t}`); // 첫 걸음 2칸만 보통 속도
  assert.ok(slid);
  assert.deepEqual([p.x, e.x], [4, 5]);
  for (let i = 0; i < 50 && game.mode === 'notice'; i++) { game.handle({ type: 'confirm' }); game.update(0.5); }
  assert.equal(game.mode, 'action');
  game.handle({ type: 'cancel' });
  assert.deepEqual([p.x, p.y], [4, 0]);
});

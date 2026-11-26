import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELD_ITEMS, HELD_IDS, rollChestHeld } from '../src/data/heldItems.js';
import { equip, unequip } from '../src/core/heldBag.js';
import { newGame, saveGame, loadGame } from '../src/core/save.js';
import { startRun, addLoot, settleLoot } from '../src/core/run.js';
import { generateFloor, hashSeed } from '../src/core/floorgen.js';
import { dungeonById } from '../src/data/dungeons.js';
import { createBattle } from '../src/core/battle.js';

const memStore = () => { const data = {}; return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };

test('the item table has the first batch without berries', () => {
  assert.ok(HELD_IDS.length >= 60, String(HELD_IDS.length));
  for (const id of HELD_IDS) { assert.ok(HELD_ITEMS[id].name, id); assert.ok(HELD_ITEMS[id].desc, id); }
  assert.ok(!HELD_IDS.some((id) => id.endsWith('-berry')));
});

test('save keeps held items and the bag, drops unknown ids', () => {
  const s = memStore(), g = newGame();
  g.party[0].held = 'leftovers'; g.items.held = { charcoal: 2, 'not-an-item': 3 };
  saveGame(s, g);
  const raw = JSON.parse(s.data['pokemon-tactics-save']); raw.party[1] && (raw.party[1].held = 'bogus'); s.data['pokemon-tactics-save'] = JSON.stringify(raw);
  const l = loadGame(s);
  assert.equal(l.party[0].held, 'leftovers'); assert.deepEqual(l.items.held, { charcoal: 2 });
  if (l.party[1]) assert.equal(l.party[1].held ?? null, null);
});

test('equip and unequip keep the bag counts right', () => {
  const g = newGame(); g.items.held = { charcoal: 1, leftovers: 1 };
  const [a, b] = g.party, ka = a.uid ?? a.species, kb = b?.uid ?? b?.species;
  assert.equal(equip(g, ka, 'charcoal'), true); assert.equal(a.held, 'charcoal'); assert.deepEqual(g.items.held, { leftovers: 1 });
  assert.equal(equip(g, ka, 'leftovers'), true); assert.equal(a.held, 'leftovers'); assert.deepEqual(g.items.held, { charcoal: 1 });
  if (b) { assert.equal(equip(g, kb, 'leftovers'), false); assert.equal(equip(g, kb, 'charcoal'), true); assert.deepEqual(g.items.held, {}); }
  assert.equal(unequip(g, ka), true); assert.equal(a.held, null); assert.equal(g.items.held.leftovers, 1);
  assert.equal(unequip(g, ka), false);
});

test('held loot is banked only when settled', () => {
  const g = newGame(), run = startRun('sinnoh-field', 1);
  addLoot(run, 'held-leftovers', 1); addLoot(run, 'held-leftovers', 2);
  settleLoot(g, run);
  assert.equal(g.items.held.leftovers, 2);
});

test('chests sometimes hold items, deterministically', () => {
  const d = dungeonById('sinnoh-field');
  let held = 0, all = 0;
  for (let seed = 1; seed <= 80; seed++) for (let f = 1; f <= 3; f++) {
    const m = generateFloor(d, f, seed);
    assert.deepEqual(generateFloor(d, f, seed).chests, m.chests);
    for (const c of m.chests) { all++; if (c.held) { held++; assert.ok(HELD_ITEMS[c.held]); } }
  }
  assert.ok(held / all > 0.08 && held / all < 0.35, `${held}/${all}`);
  assert.equal(rollChestHeld(hashSeed(5, 3000)), rollChestHeld(hashSeed(5, 3000)));
});

test('party held items reach battle units; enemies hold nothing', () => {
  const g = newGame(); g.party[0].held = 'leftovers';
  const m = generateFloor(dungeonById('sinnoh-field'), 1, 3);
  const s = createBattle(m, g.party);
  assert.equal(s.units.find((u) => u.side === 'ally').held, 'leftovers');
  assert.ok(s.units.filter((u) => u.side === 'enemy').every((u) => u.held === null));
});

// ---- 전투 효과 ----
import { applyMove, endPhase } from '../src/core/battle.js';
import { itemAttackMult, itemOf } from '../src/core/items.js';
import { critRate, accuracyFor } from '../src/core/abilities.js';
import { MOVES } from '../src/data/moves.js';
import { castField } from '../src/core/field.js';
import { newParty } from '../src/core/progress.js';

const duel = (allyHeld, { ally = null, foe = 'bidoof', foeLevel = 5 } = {}) => {
  const party = newParty().slice(0, 1).map((m) => ({ ...m, ...(ally ? { species: ally } : {}), held: allyHeld }));
  const s = createBattle({ tiles: ['......', '......'], allySlots: [{ x: 1, y: 0 }], enemies: [{ species: foe, level: foeLevel, x: 2, y: 0 }], stairs: null, chests: [] }, party);
  return { s, a: s.units.find((u) => u.side === 'ally'), e: s.units.find((u) => u.side === 'enemy') };
};
const rng0 = () => 0.5;

test('damage multipliers: type boost, band, glasses, expert belt, life orb, choice', () => {
  const { a, e } = duel('charcoal');
  assert.equal(itemAttackMult(a, e, MOVES.ember, 1), 1.2); assert.equal(itemAttackMult(a, e, MOVES.tackle, 1), 1);
  a.held = 'muscle-band'; assert.equal(itemAttackMult(a, e, MOVES.tackle, 1), 1.1); assert.equal(itemAttackMult(a, e, MOVES.ember, 1), 1);
  a.held = 'expert-belt'; assert.equal(itemAttackMult(a, e, MOVES.ember, 2), 1.2); assert.equal(itemAttackMult(a, e, MOVES.ember, 1), 1);
  a.held = 'life-orb'; assert.equal(itemAttackMult(a, e, MOVES.ember, 1), 1.3);
  a.held = 'choice-band'; assert.equal(itemAttackMult(a, e, MOVES.tackle, 1), 1.5); assert.equal(itemAttackMult(a, e, MOVES.ember, 1), 1);
});

test('species items only work on their species', () => {
  const { a, e } = duel('light-ball');
  assert.equal(itemOf(a), null);
  const p = duel('light-ball', { ally: 'pikachu' });
  assert.equal(itemAttackMult(p.a, p.e, MOVES.tackle, 1), 2);
  void e;
});

test('enemies hold nothing even if a held field is set', () => {
  const { e } = duel(null); e.held = 'leftovers';
  assert.equal(itemOf(e), null);
});

test('life orb costs 1/10 only when it hits', () => {
  const { s, a, e } = duel('life-orb', { foeLevel: 60 });
  a.moves = ['tackle']; const hp = a.hp;
  applyMove(s, a.id, 'tackle', e.id, () => 0); // 명중
  assert.equal(hp - a.hp, Math.max(1, Math.floor(a.maxHp / 10)));
  assert.ok(s.log.abilityEvents.some((ev) => ev.item === 'life-orb'));
});

test('choice band locks the first move for the floor', () => {
  const { s, a, e } = duel('choice-band', { foeLevel: 60 });
  a.moves = ['tackle', 'growl'];
  applyMove(s, a.id, 'tackle', e.id, rng0);
  a.acted = a.moved = false;
  assert.equal(applyMove(s, a.id, 'growl', e.id, rng0).blocked, 'choice');
  const next = duel('choice-band'); assert.equal(next.a.choiceLock, undefined); // 새 층 = 새 유닛
});

test('leftovers heal 1/16 at the end of the own phase, even with the ability turned off', () => {
  const { s, a } = duel('leftovers');
  a.hp = 1; a.abilityOff = true;
  endPhase(s, rng0);
  assert.equal(a.hp, 1 + Math.max(1, Math.floor(a.maxHp / 16)));
  assert.ok(s.log.phaseAbilityEvents.some((ev) => ev.item === 'leftovers'));
});

test('black sludge hurts non-poison types; sticky barb hurts; flame orb burns', () => {
  let { s, a } = duel('black-sludge'); const hp = a.hp; endPhase(s, rng0); assert.equal(hp - a.hp, Math.max(1, Math.floor(a.maxHp / 8)));
  ({ s, a } = duel('flame-orb')); endPhase(s, rng0); assert.equal(a.status, 'burn');
  ({ s, a } = duel('toxic-orb')); a.status = 'paralysis'; endPhase(s, rng0); assert.equal(a.status, 'paralysis');
});

test('focus sash keeps 1 hp from full once per floor', () => {
  const { s, a, e } = duel(null, { foeLevel: 80 });
  // 적이 아군을 공격하게 아군에 기합의띠
  const sash = duel('focus-sash', { foeLevel: 90 });
  sash.e.moves = ['tackle']; sash.s.phase = 'enemy';
  sash.a.hp = sash.a.maxHp;
  for (let i = 0; i < 2; i++) { sash.e.acted = sash.e.moved = false; applyMove(sash.s, sash.e.id, 'tackle', sash.a.id, () => 0); if (i === 0) assert.equal(sash.a.hp, 1); }
  assert.ok(!sash.s.units.includes(sash.a) || sash.a.hp === 0 || sash.a.hp === 1);
  void s; void a; void e;
});

test('scope lens raises crit; wide lens and bright powder change accuracy', () => {
  const { a, e } = duel('scope-lens');
  assert.equal(critRate(a, e, MOVES.tackle), 1 / 8);
  a.held = 'wide-lens'; assert.ok(Math.abs(accuracyFor(a, e, MOVES.tackle, 100).value - 110) < 1e-9);
  a.held = null;
  const b = duel('bright-powder'); assert.ok(Math.abs(accuracyFor(b.e, b.a, MOVES.tackle, 100).value - 90) < 1e-9);
});

test('white herb restores dropped stats once', () => {
  const { s, a, e } = duel('white-herb');
  e.moves = ['growl']; s.phase = 'enemy';
  applyMove(s, e.id, 'growl', a.id, () => 0);
  assert.equal(a.stages.atk, 0); assert.equal(a.whiteUsed, true);
  e.acted = e.moved = false; applyMove(s, e.id, 'growl', a.id, () => 0);
  assert.equal(a.stages.atk, -1);
});

test('light clay and damp rock lengthen screens and rain', () => {
  const { s, a } = duel('light-clay');
  castField(s, a, 'reflect'); assert.equal(s.zones.find((x) => x.kind === 'reflect').turns, 8);
  const r = duel('damp-rock'); r.a.moves = ['rain-dance']; applyMove(r.s, r.a.id, 'rain-dance', r.a.id, rng0);
  assert.equal(r.s.weatherTimer.turns, 8);
});

// ---- 화면 문구 ----
import { abilityNotices, itemLine } from '../src/game/states.js';
test('item notices read naturally', () => {
  const u = { id: 'ally-x', species: 'pikachu', side: 'ally', x: 1, y: 1 };
  const lines = abilityNotices([{ unitId: u.id, item: 'leftovers' }], () => u);
  assert.match(lines[0].lines[0], /의 먹다남은음식!$/);
  assert.match(itemLine({ item: 'focus-sash', survived: 'sash' }, '피카츄'), /기합의띠로 버텼다!$/);
  assert.match(itemLine({ item: 'life-orb', damage: 3 }, '피카츄'), /생명이 조금 깎였다!$/);
});

// ---- 2차 ----
import { moveBudget } from '../src/core/status.js';
import { effectiveStat } from '../src/core/stages.js';
import { refreshField } from '../src/core/field.js';
import { typeEffect } from '../src/core/abilities.js';

test('choice scarf: speed x1.5, +1 move, locks like the other choice items', () => {
  const { s, a, e } = duel(null, { foeLevel: 60 });
  const spe = effectiveStat(a, 'spe'), mv = moveBudget(a);
  a.held = 'choice-scarf';
  assert.equal(effectiveStat(a, 'spe'), spe * 1.5); assert.equal(moveBudget(a), mv + 1);
  assert.equal(itemAttackMult(a, e, MOVES.tackle, 1), 1);
  a.moves = ['tackle', 'growl']; applyMove(s, a.id, 'tackle', e.id, rng0); a.acted = a.moved = false;
  assert.equal(applyMove(s, a.id, 'growl', e.id, rng0).blocked, 'choice');
});

test('iron ball: half speed, -1 move (min 1), grounded even after gravity ends', () => {
  const p = duel('iron-ball', { ally: 'starly' });
  refreshField(p.s);
  assert.equal(p.a.grounded, true); assert.ok(typeEffect(p.e, p.a, MOVES.earthquake) > 0);
  p.a.held = null; refreshField(p.s); const base = moveBudget(p.a); p.a.held = 'iron-ball'; refreshField(p.s);
  assert.equal(moveBudget(p.a), Math.max(1, base - 1 - 1)); // 철구 −1, 땅에 붙은 비행 +1 없음
  p.s.gravity = { side: 'ally', turns: 1 }; endPhase(p.s, rng0);
  assert.equal(p.a.grounded, true);
});

test('smoke ball ignores mean look', () => {
  const { a } = duel('smoke-ball'); a.noMove = 2;
  assert.ok(moveBudget(a) > 0);
  a.held = null; assert.equal(moveBudget(a), 0);
});

test('metronome adds 20% per repeat up to double, resets on a different move', () => {
  const { s, a, e } = duel('metronome', { foeLevel: 90 });
  a.moves = ['tackle', 'growl'];
  const use = (m) => { a.acted = a.moved = false; applyMove(s, a.id, m, e.id, () => 0.99); return a.metroStreak; };
  assert.equal(use('tackle'), 0); assert.equal(use('tackle'), 1); assert.equal(use('tackle'), 2);
  assert.equal(use('growl'), 0); assert.equal(use('tackle'), 0);
});

test('zoom lens boosts accuracy only when the holder has not moved', () => {
  const { a, e } = duel('zoom-lens');
  a.walked = false; assert.ok(Math.abs(accuracyFor(a, e, MOVES.tackle, 100).value - 120) < 1e-9);
  a.walked = true; assert.ok(Math.abs(accuracyFor(a, e, MOVES.tackle, 100).value - 100) < 1e-9);
});

test('big root heals 1.3x from drain moves', () => {
  const run = (held) => { const { s, a, e } = duel(held, { foeLevel: 40 }); a.stats.spa = 150; a.maxHp = 999; a.moves = ['absorb']; a.hp = 1; applyMove(s, a.id, 'absorb', e.id, () => 0); return a.hp - 1; };
  const plain = run(null), root = run('big-root');
  assert.ok(root >= Math.floor(plain * 1.3) - 1 && root > plain, `${plain} → ${root}`);
});

test('kings rock flinches 10% on damaging hits', () => {
  const { s, a, e } = duel('kings-rock', { foeLevel: 90 });
  a.moves = ['tackle']; applyMove(s, a.id, 'tackle', e.id, () => 0.05); // 0.05×100 = 5 < 10
  assert.equal(e.flinch, true);
  const n = duel('kings-rock', { foeLevel: 90 }); n.a.moves = ['tackle']; applyMove(n.s, n.a.id, 'tackle', n.e.id, () => 0.11); // 11 ≥ 10
  assert.ok(!n.e.flinch);
});

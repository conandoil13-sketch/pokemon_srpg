import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUnit, createBattle, applyMove } from '../src/core/battle.js';
import { expectedDamage, hitChance, calcDamage } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';

const mk = (species, ability, extra = {}) => Object.assign(makeUnit({ species, side: extra.side ?? 'ally', x: extra.x ?? 0, y: extra.y ?? 0, level: 40, moves: ['tackle'], ability }), extra);
const M = (k) => MOVES[k];
const ratio = (a1, a0, d1, d0, mv, w) => expectedDamage(a1, d1, M(mv), '.', 1, w) / expectedDamage(a0, d0, M(mv), '.', 1, w);
const near = (x, y, eps = 0.03) => Math.abs(x - y) <= eps;
const plain = (sp) => mk(sp, 'run-away');

test('pinch type boosts at 1/3 HP', () => {
  const d = plain('pikachu');
  const full = mk('charmander', 'blaze'), low = mk('charmander', 'blaze', { hp: 10 });
  assert.ok(near(ratio(low, full, d, d, 'ember'), 1.5));
  assert.ok(near(ratio(low, full, d, d, 'scratch'), 1));
});

test('attack-side multipliers', () => {
  const d = plain('pikachu');
  assert.ok(near(ratio(mk('porygon', 'adaptability'), plain('porygon'), d, d, 'tackle'), 2 / 1.5));
  assert.ok(near(ratio(mk('scyther', 'technician'), plain('scyther'), d, d, 'quick-attack'), 1.5));
  assert.ok(near(ratio(mk('venomoth', 'tinted-lens'), plain('venomoth'), plain('charmander'), plain('charmander'), 'bug-bite'), 2));
  assert.ok(near(ratio(mk('marill', 'huge-power'), plain('marill'), d, d, 'tackle'), 2));
  assert.ok(near(ratio(mk('machop', 'guts', { status: 'burn' }), plain('machop'), d, d, 'karate-chop'), 1.5)); // 화상 감소 무시 + 1.5
  assert.ok(near(ratio(mk('togepi', 'hustle'), plain('togepi'), d, d, 'tackle') / (hitChance(mk('togepi', 'hustle'), d, M('tackle'), '.') / hitChance(plain('togepi'), d, M('tackle'), '.')), 1.5));
  assert.ok(near(ratio(mk('machop', 'iron-fist'), plain('machop'), d, d, 'mach-punch'), 1.2));
  assert.equal(expectedDamage(mk('rattata', 'normalize'), plain('gastly'), M('bite'), '.'), 0); // 노말스킨: 악→노말(고스트 무효)
  assert.ok(expectedDamage(mk('kangaskhan', 'scrappy'), plain('gastly'), M('tackle'), '.') > 0);
});

test('defense-side multipliers and mold breaker', () => {
  const a = plain('charmander');
  assert.ok(near(ratio(a, a, mk('snorlax', 'thick-fat'), plain('snorlax'), 'ember'), 0.5));
  assert.ok(near(ratio(a, a, mk('bronzor', 'heatproof'), plain('bronzor'), 'ember'), 0.5));
  assert.ok(near(ratio(a, a, mk('mr-mime', 'filter'), plain('mr-mime'), 'ember'), 1)); // 효과 보통
  const w = plain('squirtle');
  assert.ok(near(ratio(w, w, mk('camerupt', 'solid-rock'), plain('camerupt'), 'water-gun'), 0.75));
  assert.ok(near(ratio(mk('pinsir', 'mold-breaker'), plain('pinsir'), mk('snorlax', 'thick-fat'), plain('snorlax'), 'ember'), 1)); // 두꺼운지방 무시
  const mb = mk('rampardos', 'mold-breaker');
  assert.ok(expectedDamage(mb, mk('bronzor', 'levitate'), M('mud-slap'), '.') > 0);
  assert.equal(expectedDamage(plain('rampardos'), mk('bronzor', 'levitate'), M('mud-slap'), '.'), 0);
});

test('immunities and absorbs in expected damage (AI sees them)', () => {
  const e = plain('pikachu'), wtr = plain('squirtle');
  assert.equal(expectedDamage(e, mk('lanturn', 'volt-absorb'), M('thunder-shock'), '.'), 0);
  assert.equal(expectedDamage(wtr, mk('lapras', 'water-absorb'), M('water-gun'), '.'), 0);
  assert.equal(expectedDamage(e, mk('electivire', 'motor-drive'), M('thunder-shock'), '.'), 0);
  assert.equal(expectedDamage(plain('charmander'), mk('ponyta', 'flash-fire'), M('ember'), '.'), 0);
  assert.equal(expectedDamage(wtr, mk('toxicroak', 'dry-skin'), M('water-gun'), '.'), 0);
  assert.equal(expectedDamage(plain('pikachu'), mk('shedinja', 'wonder-guard'), M('bug-bite'), '.'), 0);
  assert.ok(expectedDamage(plain('charmander'), mk('shedinja', 'wonder-guard'), M('ember'), '.') > 0);
});

test('accuracy and crits', () => {
  const d = plain('pikachu');
  const slow = plain('snorlax'); // 회피 없음
  assert.ok(near(hitChance(mk('butterfree', 'compound-eyes'), slow, M('sleep-powder'), '.'), 75 * 1.3, 0.6));
  assert.equal(hitChance(mk('machamp', 'no-guard'), d, M('dynamic-punch'), '"'), 100);
  assert.equal(hitChance(plain('machamp'), mk('machamp', 'no-guard'), M('dynamic-punch'), '"'), 100);
  const rng = (vals) => { let i = 0; return () => vals[i++] ?? 0.5; };
  const tgt = plain('snorlax');
  assert.equal(calcDamage(mk('absol', 'super-luck'), tgt, M('slash'), { rng: rng([0, 0.1, 0.5]), defTile: '.' }).crit, true);
  assert.equal(calcDamage(plain('absol'), tgt, M('slash'), { rng: rng([0, 0.1, 0.5]), defTile: '.' }).crit, false);
  assert.equal(calcDamage(plain('absol'), mk('shellder', 'shell-armor'), M('slash'), { rng: rng([0, 0, 0.5]), defTile: '.' }).crit, false);
  const s1 = calcDamage(mk('beedrill', 'sniper'), tgt, M('slash'), { rng: rng([0, 0, 0.5]), defTile: '.' }).damage;
  const s0 = calcDamage(plain('beedrill'), tgt, M('slash'), { rng: rng([0, 0, 0.5]), defTile: '.' }).damage;
  assert.ok(near(s1 / s0, 1.5, 0.1));
});

test('battle applies absorbs: heal, speed boost, flash fire power-up', () => {
  const s = createBattle();
  const c = s.units.find((u) => u.id === 'ally-chimchar'), r = s.units.find((u) => u.id === 'enemy-riolu');
  c.x = 5; c.y = 5; r.x = 6; r.y = 5;
  r.ability = 'volt-absorb'; r.hp = 5;
  applyMove(s, 'ally-chimchar', 'thunder-shock', 'enemy-riolu', () => 0.5);
  assert.equal(r.hp, Math.min(r.maxHp, 5 + Math.floor(r.maxHp / 4)));
  r.ability = 'motor-drive'; c.acted = false;
  applyMove(s, 'ally-chimchar', 'thunder-shock', 'enemy-riolu', () => 0.5);
  assert.equal(r.stages.spe, 1);
  r.ability = 'flash-fire'; const hp = r.hp;
  applyMove(s, 'ally-chimchar', 'ember', 'enemy-riolu', () => 0.5);
  assert.equal(r.hp, hp);
  assert.equal(r.flashFire, true);
  assert.ok(s.log.abilityEvents.some((e) => e.ability === 'flash-fire'));
});

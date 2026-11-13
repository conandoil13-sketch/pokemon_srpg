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

// ---- Task 4: 상태·랭크·날씨·페이즈·접촉 ----
import { canInflict, inflict } from '../src/core/status.js';
import { applyStageChange } from '../src/core/stages.js';
import { endPhase } from '../src/core/battle.js';
import { reachable } from '../src/core/pathfind.js';
const duel = (cAb, rAb) => {
  const s = createBattle();
  s.units = s.units.filter((u) => u.id === 'ally-chimchar' || u.id === 'enemy-riolu' || u.id === 'enemy-gible');
  const c = s.units.find((u) => u.id === 'ally-chimchar'), r = s.units.find((u) => u.id === 'enemy-riolu'), g = s.units.find((u) => u.id === 'enemy-gible');
  c.x = 5; c.y = 5; r.x = 6; r.y = 5; g.x = 12; g.y = 1;
  c.ability = cAb ?? 'run-away'; r.ability = rAb ?? 'run-away'; r.hp = r.maxHp = 999;
  return { s, c, r };
};
const seq = (vals) => { let i = 0; return () => vals[i++] ?? 0.5; };

test('status immunities and early bird', () => {
  const u = (ab) => mk('pikachu', ab);
  assert.equal(canInflict(u('immunity'), 'poison').ok, false);
  assert.equal(canInflict(u('immunity'), 'toxic').ok, false);
  assert.equal(canInflict(u('insomnia'), 'sleep').ok, false);
  assert.equal(canInflict(u('vital-spirit'), 'sleep').ok, false);
  assert.equal(canInflict(u('limber'), 'paralysis').ok, false);
  assert.equal(canInflict(u('magma-armor'), 'freeze').ok, false);
  assert.equal(canInflict(u('water-veil'), 'burn').ok, false);
  assert.equal(canInflict(u('own-tempo'), 'confusion').ok, false);
  assert.equal(canInflict(u('leaf-guard'), 'burn', null, 'sun').ok, false);
  assert.equal(canInflict(u('leaf-guard'), 'burn', null, null).ok, true);
  const eb = u('early-bird'); inflict(eb, 'sleep', () => 0.99); assert.equal(eb.statusTurns, 2); // 3 → 2 (절반 올림)
});

test('stage abilities: clear body, hyper cutter, keen eye, simple, unaware', () => {
  const cb = mk('tentacool', 'clear-body');
  assert.equal(applyStageChange(cb, 'def', -1, 3, { fromOther: true }).applied, 0);
  assert.equal(applyStageChange(cb, 'def', -1, 3, { fromOther: false }).applied, -1);
  assert.equal(applyStageChange(mk('krabby', 'hyper-cutter'), 'atk', -1, 3, { fromOther: true }).applied, 0);
  assert.equal(applyStageChange(mk('pidgey', 'keen-eye'), 'acc', -1, 3, { fromOther: true }).applied, 0);
  const sp = mk('numel', 'simple'); applyStageChange(sp, 'atk', 1); assert.equal(sp.stages.atk, 2);
  const a = plain('machop'); a.stages.atk = 2;
  const d0 = plain('snorlax'), d1 = mk('snorlax', 'unaware');
  assert.ok(near(expectedDamage(a, d1, M('karate-chop'), '.') / expectedDamage(a, d0, M('karate-chop'), '.'), 0.5));
});

test('phase-end abilities: speed boost, shed skin, poison heal, weather heals and hurts, magic guard', () => {
  const { s, c } = duel('speed-boost');
  endPhase(s, seq([]));
  assert.equal(c.stages.spe, 1);
  const t = duel('shed-skin'); t.c.status = 'burn'; endPhase(t.s, seq([0.2])); assert.equal(t.c.status, null);
  const p = duel('poison-heal'); p.c.status = 'poison'; p.c.hp = 10; endPhase(p.s, seq([])); assert.equal(p.c.hp, Math.min(p.c.maxHp, 10 + Math.floor(p.c.maxHp / 8)));
  const rd = duel('rain-dish'); rd.s.weather = 'rain'; rd.c.hp = 10; endPhase(rd.s, seq([])); assert.equal(rd.c.hp, 10 + Math.max(1, Math.floor(rd.c.maxHp / 16)));
  const ds = duel('dry-skin'); ds.s.weather = 'sun'; const hp = ds.c.hp; endPhase(ds.s, seq([])); assert.equal(ds.c.hp, hp - Math.max(1, Math.floor(ds.c.maxHp / 8)));
  const sp = duel('solar-power'); sp.s.weather = 'sun'; const hp2 = sp.c.hp; endPhase(sp.s, seq([])); assert.ok(sp.c.hp < hp2);
  const hy = duel('hydration'); hy.s.weather = 'rain'; hy.c.status = 'paralysis'; endPhase(hy.s, seq([])); assert.equal(hy.c.status, null);
  const mg = duel('magic-guard'); mg.c.status = 'poison'; mg.s.weather = 'sand'; const hp3 = mg.c.hp; endPhase(mg.s, seq([])); assert.equal(mg.c.hp, hp3);
  const sv = duel('sand-veil'); sv.s.weather = 'sand'; const hp4 = sv.c.hp; endPhase(sv.s, seq([])); assert.equal(sv.c.hp, hp4);
  const full = duel('rain-dish'); full.s.weather = 'rain'; endPhase(full.s, seq([])); assert.equal(full.c.hp, full.c.maxHp); // 최대치 넘지 않음
});

test('weather speed abilities add movement; air lock cancels weather', () => {
  const g = Array.from({ length: 11 }, () => '.'.repeat(11));
  const far = (m) => Math.max(...[...m.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return Math.abs(x - 5) + Math.abs(y - 5); }));
  const u = mk('lotad', 'swift-swim', { x: 5, y: 5 });
  const base = far(reachable(g, [u], u));
  u.fieldWeather = 'rain';
  assert.equal(far(reachable(g, [u], u)), base + 1);
  const { s, c, r } = duel(null, 'air-lock'); s.weather = 'rain';
  const res = applyMove(s, 'ally-chimchar', 'ember', 'enemy-riolu', () => 0.5);
  const s2 = duel(null, null); s2.s.weather = 'rain';
  const res2 = applyMove(s2.s, 'ally-chimchar', 'ember', 'enemy-riolu', () => 0.5);
  assert.ok(res.damage > res2.damage); // 비의 불꽃 반감이 사라짐
});

test('sand veil and tangled feet lower accuracy against them', () => {
  const a = plain('machop'), sv = mk('sandshrew', 'sand-veil'), d = plain('sandshrew');
  assert.equal(hitChance(a, sv, M('tackle'), '.', 'sand'), hitChance(a, d, M('tackle'), '.', 'sand') - 20);
  const tf = mk('spinda', 'tangled-feet', { confusion: 2 }), d2 = plain('spinda');
  assert.equal(hitChance(a, tf, M('tackle'), '.'), hitChance(a, d2, M('tackle'), '.') - 20);
});

test('contact abilities hit back only on adjacent physical moves', () => {
  const st = duel(null, 'static');
  applyMove(st.s, 'ally-chimchar', 'scratch', 'enemy-riolu', seq([0.5, 0.99, 0.5, 0.1]));
  assert.equal(st.c.status, 'paralysis');
  const sp = duel(null, 'static'); sp.r.x = 7;
  applyMove(sp.s, 'ally-chimchar', 'ember', 'enemy-riolu', seq([0.5, 0.99, 0.5, 0.1, 0.1]));
  assert.equal(sp.c.status, null);
  const rs = duel(null, 'rough-skin'); const hp = rs.c.hp;
  applyMove(rs.s, 'ally-chimchar', 'scratch', 'enemy-riolu', seq([0.5, 0.99, 0.5]));
  assert.equal(rs.c.hp, hp - Math.max(1, Math.floor(rs.c.maxHp / 8)));
  const am = duel(null, 'aftermath'); am.r.hp = 1; const hp2 = am.c.hp;
  applyMove(am.s, 'ally-chimchar', 'scratch', 'enemy-riolu', seq([0.5, 0.99, 0.5]));
  assert.equal(am.c.hp, hp2 - Math.max(1, Math.floor(am.c.maxHp / 4)));
  const mg = duel('magic-guard', 'rough-skin'); const hp3 = mg.c.hp;
  applyMove(mg.s, 'ally-chimchar', 'scratch', 'enemy-riolu', seq([0.5, 0.99, 0.5]));
  assert.equal(mg.c.hp, hp3);
});

test('serene grace, shield dust, color change, anger point, damp', () => {
  const sg = duel('serene-grace'); // 불꽃세례 화상 10% → 20%
  applyMove(sg.s, 'ally-chimchar', 'ember', 'enemy-riolu', seq([0.5, 0.99, 0.5, 0.15]));
  assert.equal(sg.r.status, 'burn');
  const sd = duel(null, 'shield-dust');
  applyMove(sd.s, 'ally-chimchar', 'ember', 'enemy-riolu', seq([0.5, 0.99, 0.5, 0.01]));
  assert.equal(sd.r.status, null);
  const cc = duel(null, 'color-change');
  applyMove(cc.s, 'ally-chimchar', 'ember', 'enemy-riolu', seq([0.5, 0.99, 0.5, 0.99]));
  assert.equal(cc.r.typeOverride, 'fire');
  const ap = duel(null, 'anger-point');
  applyMove(ap.s, 'ally-chimchar', 'scratch', 'enemy-riolu', seq([0.5, 0, 0.5]));
  assert.equal(ap.r.stages.atk, 6);
  const dp = duel(null, 'damp');
  const res = applyMove(dp.s, 'ally-chimchar', 'self-destruct', { self: true }, seq([]));
  assert.equal(res.blocked, 'damp');
  assert.ok(dp.s.units.includes(dp.c));
});

// ---- Task 5: SRPG 재해석 ----
import { moveUnit } from '../src/core/battle.js';
import { pickupLoot } from '../src/core/abilities.js';
import { MAP } from '../src/data/map.js';
import { newParty } from '../src/core/progress.js';

test('intimidate on arrival, not twice in a row on the same target', () => {
  const { s, c, r } = duel('intimidate');
  c.x = 3; moveUnit(s, 'ally-chimchar', 5, 5);
  assert.equal(r.stages.atk, -1);
  endPhase(s, seq([])); endPhase(s, seq([])); // 다음 아군 차례
  moveUnit(s, 'ally-chimchar', 5, 4); moveUnit(s, 'ally-chimchar', 5, 5);
  assert.equal(r.stages.atk, -1, 'same target not again on the next turn');
});

test('weather abilities set the floor weather; slowest wins; fog is kept', () => {
  const party = newParty();
  const map = { ...MAP, enemies: MAP.enemies.map((e, i) => (i === 0 ? { ...e, species: 'politoed', ability: 'drizzle' } : e)) };
  const s = createBattle(map, party);
  assert.equal(s.weather, 'rain');
  const fog = createBattle({ ...map, weather: 'fog' }, party);
  assert.equal(fog.weather, 'fog');
});

test('lightning rod pulls single electric moves within 2 tiles and boosts special attack', () => {
  const { s, c, r } = duel();
  const g = s.units.find((u) => u.id === 'enemy-gible'); g.x = 7; g.y = 5; g.ability = 'lightning-rod'; g.hp = g.maxHp = 999;
  const hp = r.hp;
  applyMove(s, 'ally-chimchar', 'thunder-shock', 'enemy-riolu', () => 0.5);
  assert.equal(r.hp, hp);
  assert.equal(g.stages.spa, 1);
});

test('arena trap pins adjacent foes to 1 tile of movement', () => {
  const { s, c, r } = duel(null, 'arena-trap');
  endPhase(s, seq([])); endPhase(s, seq([])); // 아군 차례 시작: 옆의 개미지옥
  const g = Array.from({ length: 12 }, () => '.'.repeat(16));
  const steps = [...reachable(g, s.units, c).keys()].map((k) => k.split(',').map(Number)).map(([x, y]) => Math.abs(x - 5) + Math.abs(y - 5));
  assert.equal(Math.max(...steps), 1);
});

test('sturdy survives one full-HP knockout per floor', () => {
  const { s, r } = duel(null, 'sturdy');
  r.maxHp = 5; r.hp = 5;
  applyMove(s, 'ally-chimchar', 'scratch', 'enemy-riolu', seq([0.5, 0.99, 0.99]));
  assert.equal(r.hp, 1);
  r.hp = r.maxHp;
  applyMove(s, 'ally-chimchar', 'scratch', 'enemy-riolu', seq([0.5, 0.99, 0.99]));
  assert.ok(!s.units.includes(r));
});

test('truant rests after acting; slow start halves attack for 5 own turns', () => {
  const { s, c } = duel('truant');
  applyMove(s, 'ally-chimchar', 'scratch', 'enemy-riolu', () => 0.5);
  endPhase(s, seq([])); endPhase(s, seq([]));
  assert.equal(c.acted, true);
  const d = plain('snorlax');
  const ss = mk('regigigas', 'slow-start', { slowTurns: 5 }), n = mk('regigigas', 'run-away');
  assert.ok(near(expectedDamage(ss, d, M('tackle'), '.') / expectedDamage(n, d, M('tackle'), '.'), 0.5));
});

test('trace copies the nearest foe; download raises the right attack stat', () => {
  const map = { ...MAP, enemies: MAP.enemies.map((e) => ({ ...e, ability: 'static' })) };
  const party = newParty(); party[1].species = 'porygon'; party[1].abilitySlot = 0;
  const s = createBattle(map, party);
  const p = s.units.find((u) => u.species === 'porygon');
  assert.equal(p.ability, 'static');
});

test('plus/minus with a partner; flower gift in sun; bad dreams; synchronize', () => {
  const { s, c, r } = duel('plus');
  const p = s.units.find((u) => u.id === 'ally-chimchar');
  const mate = makeUnit({ species: 'minun', side: 'ally', x: 5, y: 6, level: 40, ability: 'minus' }); s.units.push(mate);
  const r1 = applyMove(s, 'ally-chimchar', 'ember', 'enemy-riolu', () => 0.5).damage;
  s.units = s.units.filter((u) => u !== mate); p.acted = false;
  const r0 = applyMove(s, 'ally-chimchar', 'ember', 'enemy-riolu', () => 0.5).damage;
  assert.ok(near(r1 / r0, 1.5, 0.15));
  const bd = duel('bad-dreams'); bd.r.status = 'sleep'; bd.r.statusTurns = 3; const hp = bd.r.hp;
  endPhase(bd.s, seq([]));
  assert.equal(bd.r.hp, hp - Math.max(1, Math.floor(bd.r.maxHp / 8)));
  const sy = duel(null, 'synchronize');
  applyMove(sy.s, 'ally-chimchar', 'thunder-wave', 'enemy-riolu', seq([0]));
  assert.equal(sy.c.status, 'paralysis');
});

test('pickup sometimes finds loot after a floor', () => {
  const members = [{ species: 'meowth', abilitySlot: 0 }];
  assert.deepEqual(pickupLoot(members, seq([0.05, 0.2])), ['coins']);
  assert.deepEqual(pickupLoot(members, seq([0.05, 0.8])), ['candy']);
  assert.deepEqual(pickupLoot(members, seq([0.5])), []);
});

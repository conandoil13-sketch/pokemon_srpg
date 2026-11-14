import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IV_KEYS, rollIvs, hashIvs, mergeIvs, rollGender, setGender, genderSymbol, ivGrade } from '../src/core/individual.js';
import { statsAt } from '../src/core/stats.js';
import { SPECIES } from '../src/data/species.js';
import { newMember } from '../src/core/progress.js';
import { levelEvolutionOptions, stoneEvolutionOptions } from '../src/core/evolution.js';
import { claimBalls } from '../src/core/gacha.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/save.js';

test('IVs: 0..31, seeded, merge keeps the higher per stat', () => {
  const a = rollIvs(createRng(3)), b = rollIvs(createRng(3));
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a), IV_KEYS);
  for (const k of IV_KEYS) assert.ok(Number.isInteger(a[k]) && a[k] >= 0 && a[k] <= 31);
  assert.deepEqual(hashIvs('pikachu'), hashIvs('pikachu'));
  const m = mergeIvs({ hp: 10, atk: 31, def: 0, spa: 5, spd: 5, spe: 5 }, { hp: 20, atk: 1, def: 0, spa: 6, spd: 4, spe: 5 });
  assert.deepEqual(m.ivs, { hp: 20, atk: 31, def: 0, spa: 6, spd: 5, spe: 5 });
  assert.deepEqual(m.up, ['hp', 'spa']);
  const base = SPECIES.pikachu.base;
  assert.ok(statsAt(base, 50, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }).atk < statsAt(base, 50).atk);
  assert.deepEqual(statsAt(base, 50), statsAt(base, 50, Object.fromEntries(IV_KEYS.map((k) => [k, 31]))));
  assert.deepEqual([31, 30, 26, 25, 16, 15, 1, 0].map(ivGrade), ['최고', '훌륭함', '훌륭함', '꽤 좋음', '꽤 좋음', '그럭저럭', '그럭저럭', '별로']);
});

test('gender: rates, fixed and genderless species, symbols', () => {
  const rng = createRng(11);
  let f = 0;
  for (let i = 0; i < 10000; i++) if (rollGender('eevee', rng) === 'female') f++;
  assert.ok(Math.abs(f / 100 - 12.5) <= 2, String(f));
  assert.equal(rollGender('jynx', rng), 'female');
  assert.equal(rollGender('tauros', rng), 'male');
  assert.equal(rollGender('magnemite', rng), null);
  assert.equal(genderSymbol('nidoran-f', 'female'), '');
  assert.equal(genderSymbol('pikachu', 'female'), '♀');
  assert.equal(genderSymbol('pikachu', 'male'), '♂');
  assert.equal(genderSymbol('magnemite', null), '');
});

test('members carry IVs and gender; ditto is 31 and genderless', () => {
  const m = newMember('pikachu', 10, createRng(2));
  assert.ok(m.gender === 'male' || m.gender === 'female');
  assert.deepEqual(m.genders, [m.gender]);
  const d = newMember('ditto', 10, createRng(2));
  assert.equal(d.gender, null);
  assert.deepEqual(d.genders, []);
  assert.ok(IV_KEYS.every((k) => d.ivs[k] === 31));
});

test('setGender needs the other gender unlocked; fixed/genderless refuse', () => {
  const g = newGame();
  const m = newMember('kirlia', 20, createRng(1));
  m.gender = 'female'; m.genders = ['female'];
  g.party.push(m);
  assert.equal(setGender(g, 'kirlia', 'male').reason, 'locked');
  m.genders.push('male');
  assert.deepEqual(setGender(g, 'kirlia', 'male'), { ok: true });
  assert.equal(m.gender, 'male');
  g.party.push(newMember('jynx', 20, createRng(1)));
  assert.equal(setGender(g, 'jynx', 'male').reason, 'fixed');
  assert.equal(setGender(g, 'ditto', 'male').reason, 'fixed');
  assert.equal(setGender(g, 'onix', 'male').reason, 'missing');
});

test('gendered evolutions follow the gender at evolution time', () => {
  assert.deepEqual(stoneEvolutionOptions(SPECIES.kirlia, 'female'), []);
  assert.deepEqual(stoneEvolutionOptions(SPECIES.kirlia, 'male'), ['gallade']);
  assert.deepEqual(levelEvolutionOptions(SPECIES.burmy, 25, 'male'), ['mothim']);
  assert.deepEqual(levelEvolutionOptions(SPECIES.burmy, 25, 'female'), ['wormadam']);
  assert.deepEqual(levelEvolutionOptions(SPECIES.combee, 25, 'male'), []);
  assert.deepEqual(stoneEvolutionOptions(SPECIES.snorunt, 'female'), ['froslass']);
  assert.deepEqual(levelEvolutionOptions(SPECIES.kirlia, 30, 'female'), ['gardevoir']);
});

test('ten-pull: a repeat of the same line merges IVs and unlocks a new gender', () => {
  const g = newGame();
  g.coins = 900;
  const balls = [{ species: 'eevee', rarity: 'rare' }, { species: 'eevee', rarity: 'rare' }, ...Array.from({ length: 8 }, () => ({ species: 'chimchar', rarity: 'common' }))];
  // 첫 이브이 ♂ (rng 낮은 값이면 ♀ 이므로 높은 값으로), 두 번째에서 ♀ 가 나오게 순서 조정
  const seq = [...Array(8).fill(0.99), ...Array(7).fill(0.01)]; // 첫 합류: 특성·개체값6·성별 = 8번, 중복: 개체값6·성별 = 7번
  let i = 0;
  const r = claimBalls(g, balls, () => seq[i++] ?? 0.5);
  const eevee = g.party.find((m) => m.species === 'eevee');
  assert.ok(r.ok);
  assert.equal(r.results[1].duplicate, true);
  assert.ok(Array.isArray(r.results[1].ivUp));
  assert.ok(eevee.genders.includes('male') && eevee.genders.includes('female'), JSON.stringify(eevee.genders));
  assert.equal(r.results[1].newGender, 'female');
});

// ---- 전투 ----
import { createBattle, makeUnit, applyMove, endPhase } from '../src/core/battle.js';
import { checkAction } from '../src/core/status.js';
import { expectedDamage } from '../src/core/damage.js';
import { MOVES } from '../src/data/moves.js';

const arena = (allyOpts = {}, foeOpts = {}) => {
  const m = newMember('pikachu', 30, createRng(5));
  Object.assign(m, allyOpts.member ?? {});
  const map = { tiles: Array.from({ length: 8 }, () => '.'.repeat(8)), allySlots: [{ x: 1, y: 1 }], enemies: [{ species: 'eevee', x: 2, y: 1, level: 30 }] };
  const s = createBattle(map, [m]);
  const a = s.units[0], f = s.units[1];
  Object.assign(a, allyOpts.unit ?? {});
  Object.assign(f, foeOpts);
  return { s, a, f, m };
};

test('ally units use member IVs and gender; enemies get seeded IVs/gender', () => {
  const { a, m } = arena({ member: { ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, gender: 'female' } });
  const best = arena({ member: { ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } } });
  assert.ok(a.stats.atk < best.a.stats.atk);
  assert.equal(a.gender, 'female');
  assert.equal(m.gender, 'female');
  const e1 = makeUnit({ species: 'eevee', side: 'enemy', x: 3, y: 4, level: 20 }), e2 = makeUnit({ species: 'eevee', side: 'enemy', x: 3, y: 4, level: 20 });
  assert.deepEqual(e1.ivs, e2.ivs);
  assert.equal(e1.gender, e2.gender);
  assert.equal(e1.weight, SPECIES.eevee.weight);
});

test('attract: only the opposite gender; infatuation blocks half the actions', () => {
  const same = arena({ unit: { gender: 'male' } }, { gender: 'male' });
  const r0 = applyMove(same.s, same.a.id, 'attract', same.f.id, () => 0.1);
  assert.equal(same.f.infatuation, 0);
  assert.equal(r0.statusChanges[0].ok, false);
  const { s, a, f } = arena({ unit: { gender: 'male' } }, { gender: 'female' });
  applyMove(s, a.id, 'attract', f.id, () => 0.1);
  assert.equal(f.infatuation, 3);
  assert.equal(f.infatuatedBy, a.id);
  assert.equal(checkAction(f, () => 0.4), 'infatuation');
  assert.equal(checkAction(f, () => 0.6), null);
  const none = arena({ unit: { gender: 'male' } }, { gender: null });
  applyMove(none.s, none.a.id, 'attract', none.f.id, () => 0.1);
  assert.equal(none.f.infatuation, 0);
});

test('infatuation wears off after 3 of its side phase ends, or when the source faints', () => {
  const { s, a, f } = arena({ unit: { gender: 'male' } }, { gender: 'female' });
  applyMove(s, a.id, 'attract', f.id, () => 0.1);
  const seen = [];
  for (let i = 0; i < 6 && f.infatuation > 0; i++) { endPhase(s, () => 0.9); seen.push(...(s.log.statusEvents ?? []).map((e) => e.kind)); }
  assert.equal(f.infatuation, 0);
  assert.ok(seen.includes('infatuationEnd'));
  const b = arena({ unit: { gender: 'male' } }, { gender: 'female' });
  applyMove(b.s, b.a.id, 'attract', b.f.id, () => 0.1);
  b.a.hp = 1;
  applyMove(b.s, b.f.id, 'tackle', b.a.id, () => 0.9); // 0.9: 헤롱헤롱 판정 통과, 명중
  assert.ok(!b.s.units.includes(b.a));
  assert.equal(b.f.infatuation, 0);
});

test('oblivious is immune; cute charm infatuates contact attackers 30%; rivalry and captivate follow gender', () => {
  const ob = arena({ unit: { gender: 'male' } }, { gender: 'female', ability: 'oblivious' });
  applyMove(ob.s, ob.a.id, 'attract', ob.f.id, () => 0.1);
  assert.equal(ob.f.infatuation, 0);
  const cc = arena({ unit: { gender: 'male' } }, { gender: 'female', ability: 'cute-charm', hp: 999, maxHp: 999 });
  applyMove(cc.s, cc.a.id, 'tackle', cc.f.id, () => 0.1);
  assert.equal(cc.a.infatuation, 3);
  const mk = (gender) => Object.assign(makeUnit({ species: 'nidoking', side: 'ally', x: 0, y: 0, level: 40, ability: 'rivalry' }), { gender });
  const foe = (gender) => Object.assign(makeUnit({ species: 'pikachu', side: 'enemy', x: 1, y: 0, level: 40 }), { gender });
  const dmg = (ag, fg) => expectedDamage(mk(ag), foe(fg), MOVES.tackle, '.');
  assert.ok(Math.abs(dmg('male', 'male') / dmg('male', null) - 1.25) < 0.05);
  assert.ok(Math.abs(dmg('male', 'female') / dmg('male', null) - 0.75) < 0.05);
  const cap = arena({ unit: { gender: 'male' } }, { gender: 'male' });
  applyMove(cap.s, cap.a.id, 'captivate', cap.f.id, () => 0.1);
  assert.equal(cap.f.stages.spa, 0);
  const cap2 = arena({ unit: { gender: 'male' } }, { gender: 'female' });
  applyMove(cap2.s, cap2.a.id, 'captivate', cap2.f.id, () => 0.1);
  assert.equal(cap2.f.stages.spa, -2);
});

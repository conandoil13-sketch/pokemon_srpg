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

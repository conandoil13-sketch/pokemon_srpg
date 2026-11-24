// 9세대 기준 옮기기 (2026-11-24, 세대 추가 1단계): 타입·기술 수치·특성 슬롯·습득표 합집합, 4세대 이후 기술·특성 거르기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';

test('fairy types arrive with gen 9 data', () => {
  assert.deepEqual(SPECIES.clefairy.types, ['fairy']);
  assert.deepEqual(SPECIES.jigglypuff.types, ['normal', 'fairy']);
  assert.deepEqual(SPECIES.azumarill.types, ['water', 'fairy']);
  assert.deepEqual(SPECIES.gardevoir.types, ['psychic', 'fairy']);
  assert.deepEqual(SPECIES.togekiss.types, ['fairy', 'flying']);
  assert.deepEqual(SPECIES.magnemite.types, ['electric', 'steel']);
});

test('move numbers are gen 9 values', () => {
  assert.equal(MOVES.tackle.power, 40);
  assert.equal(MOVES.tackle.accuracy, 100);
  assert.equal(MOVES.thunderbolt.power, 90);
  assert.equal(MOVES.crabhammer.power, 100);
  assert.equal(MOVES.charm.type, 'fairy');
});

test('moves and abilities past GEN_LIMIT (now 5) stay out until their generation is added', () => {
  for (const id of ['moonblast', 'play-rough', 'dazzling-gleam', 'draining-kiss']) assert.equal(MOVES[id], undefined, id);
  for (const s of Object.values(SPECIES)) for (const [, m] of s.learnset) assert.ok(MOVES[m], `${s.key} ${m}`);
  assert.deepEqual(SPECIES.gengar.abilities, ['cursed-body'], 'gen 9 slot ability (gen 5) once gen 5 is in');
});

test('learnsets merge the first and last games, keep the lower level, and never use level 0', () => {
  for (const s of Object.values(SPECIES)) {
    const ids = s.learnset.map(([, m]) => m);
    assert.equal(new Set(ids).size, ids.length, `${s.key} has no duplicate moves`);
    for (const [lv] of s.learnset) assert.ok(lv >= 1, `${s.key} level ${lv}`);
  }
  // 피카츄: 9세대에서 처음부터 배우는 전광석화 (4세대 Lv.13) → 낮은 레벨
  assert.ok(SPECIES.pikachu.learnset.some(([lv, m]) => m === 'quick-attack' && lv === 1));
  assert.ok(SPECIES.pikachu.learnset.some(([, m]) => m === 'thunderbolt'));
});

test('a version 9 (gen 4 era) save loads into version 10, keeping ability slots, unlocks and learned moves', async () => {
  const { newGame, saveGame, loadGame } = await import('../src/core/save.js');
  const g = newGame();
  const m = g.party.find((x) => x.species !== 'ditto'); // 메타몽은 빌드가 기술을 정함
  m.abilitySlot = 0; m.moves = [...m.moves.filter((x) => x !== 'thunderbolt').slice(0, 3), 'thunderbolt']; // 습득표에 없는 기술도 남음
  const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  saveGame(storage, g);
  const raw = JSON.parse(store.get('pokemon-tactics-save'));
  assert.equal(raw.version, 11);
  store.set('pokemon-tactics-save', JSON.stringify({ ...raw, version: 9 }));
  const back = loadGame(storage);
  assert.ok(back, 'v9 save is not thrown away');
  assert.equal(back.version, 11);
  assert.deepEqual(back.party.find((x) => x.uid === m.uid).moves, m.moves);
  assert.equal(back.party.find((x) => x.uid === m.uid).abilitySlot, 0);
});

test('every move a gen 4 learnset taught is still in the move data, so old saves keep them', async () => {
  const { MOVES: M } = await import('../src/data/moves.js');
  // 플라티나 습득표에 있던 기술 몇 개 (9세대 목록에서 빠진 것 포함)
  for (const id of ['thunderbolt', 'ember', 'scratch', 'leer', 'flame-wheel', 'twister', 'rage']) assert.ok(M[id], id);
});

test('review: learnsets are in level order (starting moves depend on it)', () => {
  for (const s of Object.values(SPECIES)) for (let i = 1; i < s.learnset.length; i++) assert.ok(s.learnset[i - 1][0] <= s.learnset[i][0], `${s.key} at ${i}`);
});

test('review: beat-up and punishment keep a base power so old movesets and power rules still work', () => {
  assert.ok(MOVES['beat-up'].learnable && MOVES['beat-up'].power > 0, 'beat-up');
  assert.equal(MOVES.punishment.power, 60);
});

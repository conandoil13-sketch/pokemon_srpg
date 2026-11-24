// 숨겨진 특성 (2026-11-24): docs/superpowers/specs/2026-11-24-hidden-abilities-design.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES } from '../src/data/species.js';
import { ABILITIES } from '../src/data/abilities.js';

test('hidden data: one hidden ability per species, gen 5 at most, never a normal slot', () => {
  assert.equal(SPECIES.bulbasaur.hidden, 'chlorophyll');
  assert.equal(SPECIES.foongus.hidden, 'regenerator');
  let n = 0;
  for (const s of Object.values(SPECIES)) {
    assert.ok(s.hidden === null || ABILITIES[s.hidden], `${s.key} ${s.hidden}`);
    if (s.hidden === null) continue;
    n++;
    assert.ok(!s.abilities.includes(s.hidden), s.key);
    assert.ok(!['competitive', 'protean'].includes(s.hidden), s.key);
  }
  assert.ok(n > 560, `${n}`);
});

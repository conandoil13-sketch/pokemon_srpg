import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_COST, canEnter, reachable } from '../src/core/pathfind.js';
import { makeUnit, terrainStart } from '../src/core/battle.js';
import { moveBudget } from '../src/core/status.js';

const u = (species, x = 0, y = 0, side = 'ally') => makeUnit({ species, side, x, y, level: 30, moves: ['tackle'] });

// ── Task 1: 얕은 물 ──
test('shallow water: anyone walks it at cost 1', () => {
  assert.equal(TILE_COST[','], 1);
  assert.equal(canEnter(',', 'pikachu'), true);
  const p = u('pikachu');
  assert.equal(reachable([',,,,'], [p], p).get('3,0'), 3);
});

test('shallow water counts as water for the water start bonus only', () => {
  const grid = [',,'];
  const w = u('buizel', 0, 0), g = u('turtwig', 1, 0);
  const bw = moveBudget(w), bg = moveBudget(g);
  terrainStart({ grid }, w); terrainStart({ grid }, g);
  assert.equal(moveBudget(w), bw + 1);
  assert.equal(moveBudget(g), bg);
});

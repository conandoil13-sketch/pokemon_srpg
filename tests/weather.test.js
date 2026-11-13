import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_KO, rollWeather, weatherDamageMult, weatherAccuracy, weatherBlocksAilment, phaseEndWeather, isHidden, FOG_SIGHT } from '../src/core/weather.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { generateFloor } from '../src/core/floorgen.js';
import { MOVES } from '../src/data/moves.js';

const field = DUNGEONS.find((d) => d.id === 'sinnoh-field'), cave = DUNGEONS.find((d) => d.id === 'sinnoh-cave');

test('same seed, same weather; rough probabilities', () => {
  assert.equal(rollWeather(field, 42), rollWeather(field, 42));
  const count = (d) => { const n = {}; for (let s = 1; s <= 10000; s++) { const w = rollWeather(d, s * 7919); n[w] = (n[w] ?? 0) + 1; } return n; };
  const f = count(field), c = count(cave);
  assert.ok(Math.abs(f.rain / 100 - 15) <= 2 && Math.abs(f.sun / 100 - 10) <= 2, JSON.stringify(f));
  assert.ok(Math.abs(c.fog / 100 - 15) <= 2 && !c.rain, JSON.stringify(c));
  assert.equal(rollWeather({ ...field, weather: undefined }, 1), null);
  assert.equal(Object.keys(WEATHER_KO).length, 5);
});

test('floors carry the weather without changing the map', () => {
  const m = generateFloor(field, 2, 12345);
  assert.equal(m.weather, rollWeather(field, 12345));
  const { weather, ...rest } = m;
  const again = generateFloor(field, 2, 12345);
  assert.deepEqual({ ...again, weather: undefined }, { ...rest, weather: undefined });
});

test('damage and accuracy tables', () => {
  const d = { species: 'geodude' };
  assert.equal(weatherDamageMult('rain', MOVES['water-gun'], d), 1.5);
  assert.equal(weatherDamageMult('rain', MOVES.ember, d), 0.5);
  assert.equal(weatherDamageMult('sun', MOVES.ember, d), 1.5);
  assert.equal(weatherDamageMult('sun', MOVES['water-gun'], d), 0.5);
  assert.equal(weatherDamageMult(null, MOVES.ember, d), 1);
  assert.deepEqual(weatherAccuracy('rain', MOVES.thunder, 70), { value: 100, sure: true });
  assert.deepEqual(weatherAccuracy('sun', MOVES.thunder, 70), { value: 50, sure: false });
  assert.deepEqual(weatherAccuracy('hail', MOVES.blizzard, 70), { value: 100, sure: true });
  assert.deepEqual(weatherAccuracy('fog', MOVES.tackle, 100), { value: 90, sure: false });
  assert.equal(weatherBlocksAilment('sun', 'freeze'), true);
  assert.equal(weatherBlocksAilment('rain', 'freeze'), false);
});

test('sand and hail chip damage with immunities', () => {
  const u = (species, maxHp = 80) => ({ species, maxHp, hp: maxHp });
  assert.deepEqual(phaseEndWeather(u('pikachu'), 'sand'), { damage: 5, kind: 'sand' });
  assert.equal(phaseEndWeather(u('geodude'), 'sand'), null);
  assert.equal(phaseEndWeather(u('steelix'), 'sand'), null);
  assert.equal(phaseEndWeather(u('snorunt'), 'hail'), null);
  assert.deepEqual(phaseEndWeather(u('pikachu', 10), 'hail'), { damage: 1, kind: 'hail' });
  assert.equal(phaseEndWeather(u('pikachu'), 'rain'), null);
});

test('fog hides enemies 5+ tiles from every ally', () => {
  const e = { x: 10, y: 0 };
  assert.equal(FOG_SIGHT, 5);
  assert.equal(isHidden(e, [{ x: 6, y: 0 }]), false);
  assert.equal(isHidden(e, [{ x: 5, y: 0 }, { x: 0, y: 0 }]), true);
});

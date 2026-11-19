import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAD_EVENTS } from '../src/game/touchPad.js';
import { KEYS } from '../src/game/input.js';
import { createTown } from '../src/game/town.js';

test('C key and the X pad button send the menu event; X key still cancels', () => {
  assert.deepEqual(PAD_EVENTS.x, { type: 'menu' });
  assert.deepEqual(KEYS.c, { type: 'menu' }); assert.deepEqual(KEYS.C, { type: 'menu' });
  assert.equal(KEYS.x.type, 'cancel');
});

test('town menu opens with X, picks the bag at the current spot, closes on cancel', () => {
  let spot = null;
  const town = createTown({ onSortie() {}, onBag: (s) => { spot = s; } });
  town.handle({ type: 'menu' }); assert.equal(town.menuOpen, true);
  town.handle({ type: 'cancel' }); assert.equal(town.menuOpen, false);
  town.handle({ type: 'menu' }); town.handle({ type: 'confirm' });
  assert.equal(town.menuOpen, false); assert.ok(spot && Number.isInteger(spot.x) && Number.isInteger(spot.y) && spot.facing);
});

test('town menu waits for an open message and stops walking', () => {
  let spot = null;
  const town = createTown({ onSortie() {}, onBag: (s) => { spot = s; } });
  town.handle({ type: 'dir', dx: 1, dy: 0 }); // 걷기 시작
  town.handle({ type: 'menu' }); assert.equal(town.menuOpen, true);
  for (let i = 0; i < 30; i++) town.update(0.05); // 메뉴 중엔 더 걷지 않음
  const p = town.playerWorld();
  town.handle({ type: 'confirm' });
  assert.equal(spot.x * 24, p.x); assert.equal(spot.y * 24, p.y);
});

import { createBag, BAG_TABS } from '../src/game/bag.js';
import { newGame } from '../src/core/save.js';
import { deployed } from '../src/core/roster.js';

const bagGame = () => { const g = newGame(); g.items.held = { charcoal: 1 }; g.items.evoStone = 2; g.items.tenVoucher = 1; g.items.powders = { hp: 3, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }; return g; };

test('bag tabs cycle and reset the cursor', () => {
  const g = bagGame(); let back = 0;
  const b = createBag({ game: g, onBack: () => { back++; } });
  assert.equal(BAG_TABS.length, 3); assert.equal(b.tab, 0);
  b.handle({ type: 'dir', dx: 1, dy: 0 }); assert.equal(b.tab, 1);
  assert.deepEqual(b.rows.map((r) => [r.label, r.count]), [['진화의돌', 2], ['10연속 뽑기 바우처', 1]]);
  b.handle({ type: 'dir', dx: 1, dy: 0 }); assert.equal(b.tab, 2); assert.equal(b.rows[0].count, 3);
  b.handle({ type: 'dir', dx: 1, dy: 0 }); assert.equal(b.tab, 0); assert.equal(b.sel, 0);
  b.handle({ type: 'cancel' }); assert.equal(back, 1);
});

test('equip from the bag to a deployed pokemon, swap and unequip', () => {
  const g = bagGame(); let saves = 0;
  const first = deployed(g)[0]; first.held = 'leftovers';
  const b = createBag({ game: g, onSave: () => { saves++; }, onBack() {} });
  assert.deepEqual(b.rows.map((r) => r.act), ['unequip', 'equip']);
  b.handle({ type: 'dir', dx: 0, dy: 1 }); b.handle({ type: 'confirm' }); assert.equal(b.mode, 'pick');
  b.handle({ type: 'confirm' }); // 첫 출전 포켓몬
  assert.equal(first.held, 'charcoal'); assert.deepEqual(g.items.held, { leftovers: 1 }); assert.equal(saves, 1);
  b.handle({ type: 'confirm' }); // 메시지 닫기
  assert.ok(b.sel < b.rows.length);
  b.handle({ type: 'dir', dx: 0, dy: -1 }); while (b.rows[b.sel].act !== 'unequip') b.handle({ type: 'dir', dx: 0, dy: 1 });
  b.handle({ type: 'confirm' }); assert.equal(first.held ?? null, null); assert.deepEqual(g.items.held, { leftovers: 1, charcoal: 1 });
});

test('empty tab confirm does nothing; cancel in pick goes back to the list', () => {
  const g = newGame(); g.items.held = { charcoal: 1 };
  const b = createBag({ game: g, onBack() {} });
  b.handle({ type: 'dir', dx: 1, dy: 0 }); b.handle({ type: 'confirm' }); assert.equal(b.mode, 'list');
  b.handle({ type: 'dir', dx: -1, dy: 0 }); b.handle({ type: 'confirm' }); assert.equal(b.mode, 'pick');
  b.handle({ type: 'cancel' }); assert.equal(b.mode, 'list');
});

test('town settings: toggle music and step volume by 10%', () => {
  let muted = false, volume = 0.5;
  const snd = { get muted() { return muted; }, setMuted(v) { muted = v; }, get volume() { return volume; }, setVolume(v) { volume = Math.min(1, Math.max(0, v)); } };
  const town = createTown({ onSortie() {}, onBag() {}, sound: snd });
  town.handle({ type: 'menu' });
  town.handle({ type: 'dir', dx: 0, dy: 1 }); town.handle({ type: 'confirm' }); // 설정
  assert.equal(town.settingsOpen, true);
  town.handle({ type: 'confirm' }); assert.equal(muted, true); // 음악 끄기
  town.handle({ type: 'dir', dx: 0, dy: 1 });
  town.handle({ type: 'dir', dx: 1, dy: 0 }); assert.equal(Math.round(volume * 10), 6);
  town.handle({ type: 'dir', dx: -1, dy: 0 }); town.handle({ type: 'dir', dx: -1, dy: 0 }); assert.equal(Math.round(volume * 10), 4);
  town.handle({ type: 'cancel' });
  assert.equal(town.settingsOpen, false); assert.equal(town.menuOpen, false);
});

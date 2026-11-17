// 탐험(런) 상태 (순수). Run = { dungeonId, floor, seed, faintedLast, loot: { evoStone, candy: [얻은 층…] } }
import { DUNGEONS, dungeonById } from '../data/dungeons.js';
import { hashSeed } from './floorgen.js';
import { emptyPowders, addCapsules } from './dittoBuild.js';

export const CANDY_EXP_PER_FLOOR = 30;
export const FAINTED_HP_RATIO = 0.5;

export const startRun = (dungeonId, seed) => ({ dungeonId, floor: 1, seed, faintedLast: [], loot: { evoStone: 0, candy: [], coins: 0, capsules: [], powders: emptyPowders() } });
export const FLOOR_COINS = 10, CHEST_COINS = 20, PICKUP_COINS = 10;

export const floorSeed = (run) => hashSeed(run.seed, run.floor);

// 직전 층에서 기절한 포켓몬만 50% (누적되지 않음). faintedLast = 동료 열쇠(uid)
export const floorStartHp = (run) => Object.fromEntries(run.faintedLast.map((k) => [k, FAINTED_HP_RATIO]));

// result: 'stairs' | 'win' | 'lose'. 원본 run 은 바꾸지 않는다
export function afterFloor(run, result, fainted) {
  if (result === 'lose') return { run, outcome: 'wiped' };
  const last = run.floor >= dungeonById(run.dungeonId).floors;
  if (last && result === 'win') return { run, outcome: 'cleared' };
  return { run: { ...run, floor: run.floor + 1, faintedLast: [...new Set(fainted)] }, outcome: 'next' };
}

export function addLoot(run, item, floor) {
  if (item === 'evoStone') run.loot.evoStone += 1;
  else if (item === 'candy') run.loot.candy.push(floor);
  else if (item === 'coins') run.loot.coins = (run.loot.coins ?? 0) + CHEST_COINS * floor;
  else if (item === 'pickupCoins') run.loot.coins = (run.loot.coins ?? 0) + PICKUP_COINS * floor; // 픽업·꿀모으기
  else if (typeof item === 'string' && item.startsWith('powder-')) { run.loot.powders ??= emptyPowders(); run.loot.powders[item.slice(7)] = (run.loot.powders[item.slice(7)] ?? 0) + 1; } // 메타몽 파우더
  else if (item && typeof item === 'object' && item.kind) (run.loot.capsules ??= []).push(item); // 메타몽 캡슐
  else if (typeof item === 'string' && item.startsWith('held-')) { run.loot.held ??= {}; const id = item.slice(5); run.loot.held[id] = (run.loot.held[id] ?? 0) + 1; } // 지니는 도구
}

export const addBattleCoins = (run, n) => { run.loot.coins = (run.loot.coins ?? 0) + n; };
export const addFloorCoins = (run, floor) => { run.loot.coins = (run.loot.coins ?? 0) + FLOOR_COINS * floor; };

// 보물 지급: 진화의돌·코인은 바로, 사탕 경험치는 반환 (결산 장면이 적용)
export function settleLoot(game, run) {
  game.items.evoStone += run.loot.evoStone;
  const coins = run.loot.coins ?? 0;
  game.coins = (game.coins ?? 0) + coins;
  const each = run.loot.candy.reduce((s, f) => s + f * CANDY_EXP_PER_FLOOR, 0);
  const exp = each ? Object.fromEntries(game.party.map((m) => [m.uid ?? m.species, each])) : {}; // 동료 열쇠별
  game.items.powders ??= emptyPowders();
  for (const [k, n] of Object.entries(run.loot.powders ?? {})) game.items.powders[k] = (game.items.powders[k] ?? 0) + n;
  game.items.held ??= {};
  for (const [k, n] of Object.entries(run.loot.held ?? {})) game.items.held[k] = (game.items.held[k] ?? 0) + n;
  const capsules = run.loot.capsules ?? [];
  const dropped = addCapsules(game, capsules); // 가방이 넘치면 오래된 것부터
  return { evoStone: run.loot.evoStone, coins, exp, capsules: capsules.length, dropped, held: { ...(run.loot.held ?? {}) } };
}

// outcome: 'cleared' | 'retreat' | 'wiped'. 보물 지급은 호출 측(settleLoot)
export function finishRun(game, run, outcome) {
  game.best[run.dungeonId] = Math.max(game.best[run.dungeonId] ?? 0, run.floor);
  if (outcome === 'cleared') {
    if (!game.cleared.includes(run.dungeonId)) game.cleared.push(run.dungeonId);
    for (const d of DUNGEONS) if (d.unlock === run.dungeonId && !game.unlocked.includes(d.id)) game.unlocked.push(d.id);
  }
  game.run = null;
}

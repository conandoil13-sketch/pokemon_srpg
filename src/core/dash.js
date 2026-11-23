// 대시 기술 (순수): 곧게 몇 칸 달려가 붙어서 때린다. 기술 밸런스 조정 메모 4차 (codex-reviews/2026-11-20-move-balance-decisions.md)
// n: 달릴 수 있는 칸 · water: 물 칸은 0칸 (폭포오르기) · jump: 첫 칸 하나는 뛰어넘음 (점프킥) · back: 때린 뒤 처음 칸으로 (회전부리·유턴)
import { canEnter } from './pathfind.js';

export const DASH = {
  'take-down': { n: 1 }, 'flare-blitz': { n: 1 }, spark: { n: 1 }, 'brave-bird': { n: 1 },
  'double-edge': { n: 2 }, 'flame-wheel': { n: 2 }, 'head-smash': { n: 2 },
  'extreme-speed': { n: 2 }, 'quick-attack': { n: 1 }, 'aqua-jet': { n: 1 },
  waterfall: { n: 1, water: true },
  'jump-kick': { n: 2, jump: true },
  'drill-peck': { n: 1, back: true }, 'u-turn': { n: 2, back: true },
};
const TALL = '#BHT'; // 뛰어넘지 못하는 칸: 나무·건물·고지·묘비

// 사용자 칸 → 대상 바로 앞 칸까지 (양끝 포함). 붙어 있거나 못 가면 null
export function dashPath(state, user, move, target) {
  const d = DASH[move?.id];
  if (!d || !target) return null;
  const dx = target.x - user.x, dy = target.y - user.y;
  if (dx !== 0 && dy !== 0) return null; // 곧게만
  const n = Math.abs(dx + dy);
  if (n <= 1) return null;
  const sx = Math.sign(dx), sy = Math.sign(dy), path = [{ x: user.x, y: user.y }];
  let cost = 0;
  for (let i = 1; i < n; i++) {
    const x = user.x + sx * i, y = user.y + sy * i, t = state.grid[y]?.[x];
    const from = state.grid[path.at(-1).y][path.at(-1).x];
    const taken = state.units.some((u) => u !== user && u.hp > 0 && u.x === x && u.y === y);
    const jumped = d.jump && i === 1 && n === 3; // 점프킥: 가운데 한 칸은 넘기만
    if (jumped) { if (t === undefined || TALL.includes(t)) return null; }
    else if (taken || !(canEnter(t, user, !!state.grid.trees) || (t === 'H' && from === 'H'))) return null;
    cost += jumped || (d.water && t === '~') ? 0 : 1;
    path.push({ x, y });
  }
  return cost <= d.n || (d.jump && n === 3) ? path : null;
}

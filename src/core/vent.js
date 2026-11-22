// 화산동굴 (순수): 용암 `L` · 현무암 `v` · 분출구 `V` (state.vents = [{ x, y, dir, phase }], 칸은 벽처럼 못 들어감)
// 분출구는 라운드 % 3 === phase 인 라운드의 적 페이즈 끝에 정해진 방향으로 스팀 (그 라운드 내내 경로 예고).
// 스팀: 최대 HP 1/16 × 물 상성, 그 방향으로 막힐 때까지 밀림 (먼 쪽부터, 연쇄 없음). 현무암: 행동 끝 1/12 (불꽃·떠 있음·숨기 면역)
// 적용(피해·기절)은 battle.steamVents / battle.basaltHeat. 스펙 docs/superpowers/specs/2026-11-23-volcano-design.md
import { typesOf, magicGuard, airborne } from './abilities.js';
import { typeMultiplier } from '../data/types.js';
import { canEnter } from './pathfind.js';

export const VENT = 'V', LAVA = 'L', BASALT = 'v';
export const STEAM_RANGE = 6, STEAM_EVERY = 3;
export const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const STOP = '#^VG*B'; // 스팀·밀림을 막는 칸

export const ventFires = (v, turn) => turn % STEAM_EVERY === v.phase;

export function steamPath(state, v) {
  const [dx, dy] = VEC[v.dir], out = [];
  for (let i = 1; i <= STEAM_RANGE; i++) {
    const x = v.x + dx * i, y = v.y + dy * i, t = state.grid[y]?.[x];
    if (t === undefined || STOP.includes(t)) break;
    out.push({ x, y });
  }
  return out;
}

// 이번 라운드(적 페이즈 끝)에 스팀이 지나갈 칸
export function steamPreview(state) {
  const seen = new Map();
  for (const v of state.vents ?? []) if (ventFires(v, state.turn)) for (const p of steamPath(state, v)) seen.set(`${p.x},${p.y}`, p);
  return [...seen.values()];
}

export function steamDamage(u) {
  if (u.burrow || magicGuard(u)) return 0;
  return Math.max(1, Math.floor((u.maxHp / 16) * typeMultiplier('water', typesOf(u))));
}

// dir 쪽으로 막힐 때까지 (그 포켓몬이 못 들어가는 칸·막는 칸·다른 포켓몬·맵 밖 바로 앞)
export function pushEnd(state, u, dir) {
  const [dx, dy] = VEC[dir];
  let x = u.x, y = u.y;
  for (;;) {
    const nx = x + dx, ny = y + dy, t = state.grid[ny]?.[nx];
    if (t === undefined || STOP.includes(t) || !canEnter(t, u, !!state.grid.trees)) break;
    if (state.units.some((o) => o !== u && o.hp > 0 && o.x === nx && o.y === ny)) break;
    x = nx; y = ny;
  }
  return { x, y };
}

export function basaltBurn(state, u) {
  if (state.grid[u.y]?.[u.x] !== BASALT || u.burrow || airborne(u) || magicGuard(u) || typesOf(u).includes('fire')) return 0;
  return Math.max(1, Math.floor(u.maxHp / 12));
}

// AI 위험도: p 에 서면 이번 라운드 스팀 피해 + 밀려나는 손해 (최대 HP 5%)
export function steamRisk(state, u, p) {
  if (u.burrow || !(state.vents ?? []).some((v) => ventFires(v, state.turn) && steamPath(state, v).some((c) => c.x === p.x && c.y === p.y))) return 0;
  return steamDamage(u) + u.maxHp * 0.05;
}

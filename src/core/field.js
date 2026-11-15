// 전장에 놓이는 것 (순수): 오라(쓴 포켓몬을 따라다님) · 장판(칸에 고정) · 압정 · 날씨 부르기 타이머.
// 위치가 바뀔 때마다 refreshField 가 유닛마다 u.field 플래그를 다시 계산하고, 데미지·상태이상·랭크·이동 계산은 그 플래그만 읽는다.
// 스펙 docs/superpowers/specs/2026-11-15-status-moves-batch-design.md (2차)
import { moveTypeOf } from './abilities.js';

export const FIELD_TURNS = 5, FIELD_RADIUS = 2;
export const AURAS = ['tailwind', 'safeguard', 'mist', 'luckyChant'];
export const ZONES = ['reflect', 'lightScreen', 'mudSport', 'waterSport'];
const SIDE_ZONES = ['reflect', 'lightScreen']; // 쓴 편만 혜택. 흙놀이·물놀이는 장판 안 모두
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const newField = () => ({ auras: [], zones: [], spikes: [], weatherTimer: null });
const blankFlags = () => Object.fromEntries([...AURAS, ...ZONES].map((k) => [k, false]));

// 오라·장판 놓기. 같은 포켓몬이 같은 오라를 다시 쓰면 남은 턴만 5로
export function castField(state, user, effect) {
  state.auras ??= []; state.zones ??= [];
  if (AURAS.includes(effect)) {
    const mine = state.auras.find((a) => a.kind === effect && a.ownerId === user.id);
    if (mine) mine.turns = FIELD_TURNS;
    else state.auras.push({ kind: effect, ownerId: user.id, side: user.side, turns: FIELD_TURNS });
  } else if (ZONES.includes(effect)) {
    state.zones.push({ kind: effect, side: user.side, x: user.x, y: user.y, turns: FIELD_TURNS });
  } else return { ok: false, reason: 'blocked' };
  refreshField(state);
  return { ok: true };
}

// 유닛마다 지금 받는 오라·장판 효과
export function refreshField(state) {
  state.auras = (state.auras ?? []).filter((a) => state.units.some((u) => u.id === a.ownerId)); // 주인이 쓰러지면 사라짐
  for (const u of state.units) {
    const f = blankFlags();
    for (const a of state.auras) {
      const owner = state.units.find((o) => o.id === a.ownerId);
      if (u.side === a.side && dist(u, owner) <= FIELD_RADIUS) f[a.kind] = true;
    }
    for (const z of state.zones ?? []) {
      if (dist(u, z) > FIELD_RADIUS) continue;
      if (SIDE_ZONES.includes(z.kind) && u.side !== z.side) continue;
      f[z.kind] = true;
    }
    u.field = f;
  }
}

// 그 편이 놓은 오라·장판 턴 감소 (그 편 페이즈 끝)
export function tickField(state, side, events) {
  for (const key of ['auras', 'zones']) {
    state[key] = (state[key] ?? []).filter((x) => {
      if (x.side !== side) return true;
      if (--x.turns > 0) return true;
      events.push({ kind: 'fieldEnd', what: x.kind, side });
      return false;
    });
  }
  refreshField(state);
}

// 리플렉터·빛의장막 (급소면 무시) · 흙놀이·물놀이 (쓰거나 맞는 쪽 하나라도 장판 안)
export function fieldDamageMult(attacker, defender, move, crit = false) {
  let m = 1;
  const df = defender.field, af = attacker.field, type = moveTypeOf(attacker, move);
  if (!crit && move.category === 'physical' && df?.reflect) m *= 0.5;
  if (!crit && move.category === 'special' && df?.lightScreen) m *= 0.5;
  if (type === 'electric' && (af?.mudSport || df?.mudSport)) m *= 0.5;
  if (type === 'fire' && (af?.waterSport || df?.waterSport)) m *= 0.5;
  return m;
}

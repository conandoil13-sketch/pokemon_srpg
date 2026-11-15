// 전장에 놓이는 것 (순수): 오라(쓴 포켓몬을 따라다님) · 장판(칸에 고정) · 압정 · 날씨 부르기 타이머.
// 위치가 바뀔 때마다 refreshField 가 유닛마다 u.field 플래그를 다시 계산하고, 데미지·상태이상·랭크·이동 계산은 그 플래그만 읽는다.
// 스펙 docs/superpowers/specs/2026-11-15-status-moves-batch-design.md (2차)
import { moveTypeOf, typesOf, has, magicGuard } from './abilities.js';
import { inflict } from './status.js';
import { effectiveWeather } from './weather.js';

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

// ---- 압정뿌리기 · 독압정: 고른 칸 + 4방 칸 (벽 제외), 같은 칸 같은 종류는 겹치지 않음 ----
export const TRAP_RANGE = [1, 3];
export function layTraps(state, user, effect, aim) {
  state.spikes ??= [];
  const tiles = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = aim.x + dx, y = aim.y + dy, tile = state.grid[y]?.[x];
    if (tile === undefined || tile === '#') continue;
    if (state.spikes.some((t) => t.x === x && t.y === y && t.kind === effect)) continue;
    state.spikes.push({ x, y, kind: effect, side: user.side, revealed: false });
    tiles.push({ x, y });
  }
  return { ok: tiles.length > 0, tiles }; // 깔 칸이 없으면 실패
}

// 상대 편이 (x, y) 칸에 들어옴: 압정 1/8 피해, 독압정 독 (독 타입은 치움). 비행·부유 면역. 아군이 밟은 적 함정은 드러남
export function stepOn(state, unit, x, y) {
  const out = [];
  for (const t of (state.spikes ?? []).filter((s) => s.x === x && s.y === y && s.side !== unit.side)) {
    if (unit.side === 'ally') t.revealed = true;
    if (typesOf(unit).includes('flying') || has(unit, 'levitate')) continue;
    if (t.kind === 'spikes') {
      if (magicGuard(unit)) continue;
      const hpBefore = unit.hp, damage = Math.min(unit.hp, Math.max(1, Math.floor(unit.maxHp / 8)));
      unit.hp -= damage;
      out.push({ unitId: unit.id, kind: 'spikes', damage, hpBefore, maxHp: unit.maxHp, x, y });
    } else if (typesOf(unit).includes('poison')) {
      state.spikes = state.spikes.filter((s) => s !== t);
      out.push({ unitId: unit.id, kind: 'cleared', x, y });
    } else if (inflict(unit, 'poison', () => 0.5, null, unit.fieldWeather ?? null).ok) {
      out.push({ unitId: unit.id, kind: 'toxicSpikes', x, y });
    }
  }
  return out;
}

// 걷는 경로에서 압정에 쓰러질 칸까지만 남긴다 (화면의 걷기가 그 칸에서 멈추도록). 판정은 stepOn 과 같은 규칙
export function lethalTrapCut(state, unit, path) {
  let hp = unit.hp;
  for (let i = 1; i < path.length; i++) {
    for (const t of state.spikes ?? []) {
      if (t.x !== path[i].x || t.y !== path[i].y || t.side === unit.side || t.kind !== 'spikes') continue;
      if (typesOf(unit).includes('flying') || has(unit, 'levitate') || magicGuard(unit)) continue;
      hp -= Math.max(1, Math.floor(unit.maxHp / 8));
    }
    if (hp <= 0) return path.slice(0, i + 1);
  }
  return path;
}

// 날씨 부르기: 5턴 동안 그 날씨, 끝나면 층 시작 날씨(state.baseWeather). 같은 날씨·안개 층이면 실패
export const WEATHER_OF = { 'rain-dance': 'rain', 'sunny-day': 'sun', sandstorm: 'sand', hail: 'hail' };
export function castWeather(state, user, moveId) {
  const w = WEATHER_OF[moveId];
  if (state.weather === 'fog') return { ok: false, reason: 'fog' };
  if (state.weather === w) return { ok: false, reason: 'already' };
  const from = state.weather ?? null;
  state.weather = w;
  state.weatherTimer = { side: user.side, turns: FIELD_TURNS };
  const W = effectiveWeather(state);
  for (const u of state.units) u.fieldWeather = W; // 쓱쓱·엽록소 이동력 바로 반영
  return { ok: true, from, to: w }; // 연출: 펑 전엔 from, 뒤엔 to
}

// 그 편이 놓은 오라·장판·날씨 턴 감소 (그 편 페이즈 끝)
export function tickField(state, side, events) {
  if (state.weatherTimer?.side === side && --state.weatherTimer.turns <= 0) {
    state.weatherTimer = null;
    state.weather = state.baseWeather ?? null;
    const W = effectiveWeather(state);
    for (const u of state.units) u.fieldWeather = W; // 쓱쓱·엽록소 이동력도 바로 원래대로
    events.push({ kind: 'weatherEnd' });
  }
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

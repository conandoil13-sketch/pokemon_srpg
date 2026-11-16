// 전투 상태 (순수 로직, 상태 객체를 직접 갱신)
import { hashIvs, hashGender } from './individual.js';
import { effectiveBase } from './dittoBuild.js';
import { MAP } from '../data/map.js';
import { hash } from '../render/pixels.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { AREA_RADIUS } from '../data/moveTargets.js';
import { BALANCE } from '../data/balance.js';
import { calcDamage, hitChance, confusionDamage, rollHits } from './damage.js';
import { unitsHit, canTarget, hideDouble, aimsOf, sniperBonus } from './shapes.js';
import { phaseEndWeather, effectiveWeather } from './weather.js';
import { typeEffect, immunity, has, magicGuard, weatherChipImmune, phaseEndHp, CONTACT_AILMENT, moveTypeOf, WEATHER_SETTER, REDIRECT, SYNC_AILMENTS, traps } from './abilities.js';
import { newStatus, inflict, cure, checkAction, phaseStart, phaseEnd, infatuate, moveBudget } from './status.js';
import { newStages, applyStageChange, tickStages, API_STAT, STAGE_TURNS, AREA_STAGE_TURNS, effectiveStat } from './stages.js';
import { statsAt, expYield } from './stats.js';
import { newField, refreshField, tickField, layTraps, stepOn, TRAP_RANGE, FIELD_RADIUS } from './field.js';
import { pathTo, canEnter, reachable } from './pathfind.js';
import { newVolatile, applyEffect, moveBlock, tickEnd, tickStart, moveFor, canHeal, BIND_MOVES, BIND_TURNS, bindCheck } from './volatile.js';
import { startingMoves } from './learn.js';
import { newParty, abilityOf } from './progress.js';

export const spec = (unit) => SPECIES[unit.species];

// 유닛 = 종족 + 레벨에서 계산한 능력치 + 기술
export function makeUnit({ species, side, x, y, level, moves, id, boss, ability, types, base, ivs, gender, weight, memberKey }) {
  // 개체값·성별: 아군은 멤버 값, 적은 위치·레벨로 정해지는 무작위 (같은 층이면 같음). 메타몽은 31·성별 없음
  ivs ??= species === 'ditto' ? null : hashIvs(species, x, y, level);
  if (gender === undefined) gender = hashGender(species, x, y, level);
  const stats = statsAt(base ?? SPECIES[species].base, level, ivs); // base: 메타몽 빌드 종족값
  return {
    id: id ?? `${side}-${species}`, species, side, x, y, level, stats,
    types: [...(types ?? SPECIES[species].types)], // 타입은 유닛 기준 (메타몽 빌드)
    ivs, gender, weight: weight ?? SPECIES[species].weight,
    hp: stats.hp, maxHp: stats.hp,
    moves: moves?.length ? [...moves] : startingMoves(SPECIES[species].learnset, level, MOVES, species),
    moved: false, acted: false,
    healUses: HEAL_USES, // 회복기 (층마다 2번)
    // 특성: 동료는 멤버 값, 적은 위치·레벨로 정해지는 무작위 (같은 층이면 같은 특성)
    ability: ability ?? SPECIES[species].abilities[Math.floor(hash(species, x, y, level) * SPECIES[species].abilities.length)],
    ...newStages(),
    ...newStatus(),
    ...newVolatile(),
    ...(boss ? { boss: true } : {}),
    ...(memberKey !== undefined ? { memberKey } : {}), // 동료: 파티 멤버 열쇠(uid) — 경험치·기절 기록용
  };
}

const keyOf = (m) => m.uid ?? m.species; // = members.memberKey (순환 import 피함)
const unitKey = (u) => u.memberKey ?? u.species;

function uniqueId(units, side, species) {
  let id = `${side}-${species}`;
  for (let n = 2; units.some((u) => u.id === id); n++) id = `${side}-${species}-${n}`;
  return id;
}

// opts.hpRatio: { [memberKey]: 0.5 } — 직전 층 기절자 등 시작 HP 비율 (열쇠 = uid, 없으면 종 이름)
export function createBattle(mapDef = MAP, party = newParty(), { hpRatio = {} } = {}) {
  const units = [];
  party.slice(0, mapDef.allySlots.length).forEach((m, i) => {
    const { x, y } = mapDef.allySlots[i];
    const build = m.species === 'ditto' && m.build ? { types: m.build.types, base: effectiveBase(m.build), ...(m.build.weight ? { weight: m.build.weight } : {}) } : {}; // 메타몽 빌드
    const u = makeUnit({ species: m.species, side: 'ally', x, y, level: m.level, moves: m.moves, id: uniqueId(units, 'ally', m.species), ability: abilityOf(m), ivs: m.ivs ?? (m.species === 'ditto' ? null : hashIvs(m.species)), gender: m.gender ?? null, memberKey: keyOf(m), ...build });
    if (hpRatio[keyOf(m)]) u.hp = Math.max(1, Math.floor(u.maxHp * hpRatio[keyOf(m)]));
    units.push(u);
  });
  for (const e of mapDef.enemies) units.push(makeUnit({ ...e, side: 'enemy', id: uniqueId(units, 'enemy', e.species) }));
  const state = {
    grid: mapDef.tiles.slice(),
    width: mapDef.tiles[0].length,
    height: mapDef.tiles.length,
    units,
    phase: 'player',
    turn: 1,
    result: null,
    log: { exp: {}, fainted: [], loot: [], coins: 0, expired: [], defeated: [] }, // defeated: 캡슐 굴림용 쓰러뜨린 적 // 획득 경험치(동료 열쇠별), 기절한 아군, 연 보물, 격파 코인, 이번 페이즈에 풀린 랭크
    stairs: mapDef.stairs ?? null,
    chests: (mapDef.chests ?? []).map((c) => ({ ...c })),
    piles: (mapDef.piles ?? []).map((p) => ({ ...p })), // 열리지 않은 낙엽더미 (칸 문자 '*')
    bossFloor: units.some((u) => u.boss),
    weather: mapDef.weather ?? null, // 층 날씨 (없으면 null)
    ...newField(), // 오라 · 장판 · 압정 · 날씨 부르기 (층마다 새로)
  };
  floorStartAbilities(state);
  state.baseWeather = state.weather; // 날씨 부르기가 끝나면 돌아갈 날씨 (날씨 특성 반영 후)
  for (const u of units) u.fieldWeather = effectiveWeather(state); // 날씨 특성(쓱쓱 등)이 처음부터 이동력에 반영
  refreshField(state);
  return state;

}

// 층 시작 특성: 날씨(스피드 높은 순, 나중 것이 덮음, 안개는 그대로) · 트레이스 · 다운로드 · 슬로스타트
function floorStartAbilities(state) {
  const log = (state.floorAbilityEvents = []);
  const nearestFoe = (u) => state.units.filter((o) => o.side !== u.side).sort((p, q) => dist(p, u) - dist(q, u))[0];
  for (const u of state.units) if (has(u, 'trace')) {
    const f = nearestFoe(u);
    if (f && f.ability && !['trace', 'multitype', 'wonder-guard'].includes(f.ability)) { u.ability = f.ability; log.push({ unitId: u.id, ability: 'trace', copied: f.ability }); }
  }
  if (state.weather !== 'fog') {
    const setters = state.units.filter((u) => WEATHER_SETTER[u.ability]).sort((p, q) => effectiveStat(q, 'spe') - effectiveStat(p, 'spe'));
    for (const u of setters) { state.weather = WEATHER_SETTER[u.ability]; log.push({ unitId: u.id, ability: u.ability }); }
  }
  for (const u of state.units) {
    if (has(u, 'download')) {
      const f = nearestFoe(u);
      if (f) { applyStageChange(u, f.stats.def < f.stats.spd ? 'atk' : 'spa', 1, 99); log.push({ unitId: u.id, ability: 'download' }); }
    }
    if (has(u, 'slow-start')) u.slowTurns = 5;
  }
}

export const unitAt = (state, x, y) => state.units.find((u) => u.x === x && u.y === y);
const byId = (state, id) => state.units.find((u) => u.id === id);

// cost: 이번 이동의 경로 비용 (치고 빠지기에서 남은 이동력 계산)
// path: 지나온 칸들 (처음 = 출발 칸). 없으면 경로를 계산한다. 지나는 칸마다 압정 판정, 쓰러지면 그 칸에서 멈춤
export function moveUnit(state, id, x, y, cost = 0, path = null) {
  const u = byId(state, id);
  const stayed = u.x === x && u.y === y;
  state.log.trapEvents = [];
  if (!stayed && state.spikes?.length) {
    let route = path;
    if (!route) { const p = pathTo(state.grid, state.units, u, x, y); route = p.length > 1 && p.at(-1).x === x && p.at(-1).y === y ? p : [{ x: u.x, y: u.y }, { x, y }]; }
    for (const p of route.slice(1)) {
      const evs = stepOn(state, u, p.x, p.y);
      state.log.trapEvents.push(...evs);
      if (u.hp === 0) { // 압정에 쓰러짐: 그 칸에서 멈춘다
        u.x = p.x; u.y = p.y; u.moved = true;
        state.log.trapEvents.at(-1).fainted = true;
        knockOut(state, u, null);
        checkResult(state);
        return;
      }
    }
  }
  u.spent = (u.spent ?? 0) + cost;
  u.x = x; u.y = y; u.moved = true;
  refreshField(state); // 오라는 주인을 따라다니고, 장판 안팎이 바뀐다
  state.log.arriveAbilityEvents = [];
  // 위협: 이동해서 도착했을 때(제자리는 아님) 옆의 상대 공격 −1 (2턴), 직전 자기 차례에 위협한 상대는 제외
  if (has(u, 'intimidate') && !stayed) {
    const log = state.log.arriveAbilityEvents;
    u.intimNow ??= [];
    for (const f of state.units) {
      if (f.side === u.side || dist(f, u) !== 1 || (u.intimPrev ?? []).includes(f.id) || u.intimNow.includes(f.id)) continue;
      const r = applyStageChange(f, 'atk', -1, AREA_STAGE_TURNS, { fromOther: true });
      u.intimNow.push(f.id);
      log.push({ unitId: u.id, ability: 'intimidate', target: f.id, applied: r.applied });
    }
  }
}

// 적이 기절한 순간: 쓰러뜨린 아군 100%, 그 순간 살아 있는 다른 아군 각 shareRatio
function awardExp(state, attacker, defender) {
  const gained = {};
  if (attacker.side !== 'ally' || defender.side !== 'enemy') return gained;
  const full = expYield(SPECIES[defender.species].baseExp, defender.level, BALANCE.expMultiplier);
  gained[unitKey(attacker)] = full;
  for (const u of state.units) {
    if (u.side === 'ally' && !u.bot && u !== attacker && u.hp > 0) gained[unitKey(u)] = (gained[unitKey(u)] ?? 0) + Math.floor(full * BALANCE.shareRatio);
  }
  for (const [sp, n] of Object.entries(gained)) state.log.exp[sp] = (state.log.exp[sp] ?? 0) + n;
  return gained;
}

// 쓰러뜨린 상대 없이 기절(상태 데미지·혼란 자해): 살아 있는 아군 전원 공유 비율
function awardShare(state, defender) {
  if (defender.side !== 'enemy') return;
  const full = expYield(SPECIES[defender.species].baseExp, defender.level, BALANCE.expMultiplier);
  for (const u of state.units) {
    if (u.side === 'ally' && !u.bot && u.hp > 0) state.log.exp[unitKey(u)] = (state.log.exp[unitKey(u)] ?? 0) + Math.floor(full * BALANCE.shareRatio);
  }
}

// 기절 처리 공통. by: 쓰러뜨린 유닛(없으면 상태 데미지·자해). reward false: 보상 없음(자폭)
// 같은 편끼리 쓰러뜨리면 경험치·코인 없음 (awardExp 는 아군→적만 지급)
function knockOut(state, d, by, { reward = true, deferExp = false } = {}) {
  state.units = state.units.filter((u) => u !== d);
  // 길동무: 공격으로 쓰러뜨린 상대도 기절 (보스 제외)
  if (d.bond && by && by.side !== d.side && state.units.includes(by) && !by.boss) {
    (state.log.bonded ??= []).push(by.id);
    knockOut(state, by, null);
  }
  for (const u of state.units) if (u.infatuatedBy === d.id) { u.infatuation = 0; u.infatuatedBy = null; } // 건 상대가 쓰러지면 헤롱헤롱이 풀린다
  for (const u of state.units) if (u.bound?.by === d.id) { (state.log.unbound ??= []).push({ unitId: u.id, moveId: u.bound.moveId }); u.bound = null; } // 묶은 쪽이 쓰러지면 속박이 바로 풀린다
  let expGained = {};
  if (by) { if (!deferExp) expGained = awardExp(state, by, d); } // deferExp: 공격이 끝난 뒤 호출 측이 지급
  else if (reward) awardShare(state, d);
  if (reward && d.side === 'enemy' && (!by || by.side === 'ally')) {
    state.log.coins += 3 + Math.floor(d.level / 3);
    (state.log.defeated ??= []).push({ species: d.species, types: [...d.types], moves: [...d.moves], ability: d.suppressedAbility ?? d.ability, boss: !!d.boss }); // 메타몽 캡슐 (위액으로 꺼졌으면 원래 특성)
  }
  if (d.side === 'ally' && !d.bot && !state.log.fainted.includes(unitKey(d))) state.log.fainted.push(unitKey(d));
  refreshField(state); // 오라 주인이 쓰러지면 오라도 사라진다
  return expGained;
}

const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// 기술이 실제로 닿는 유닛들 (move: id 또는 기술 객체, focus: 고른 대상)
export function targetsOf(state, user, move, focus) {
  const m = typeof move === 'string' ? moveFor(user, move) : move;
  return targetsOfRaw(state, user, m, focus).filter((u) => u === user || canTarget(m, u)); // 숨은 포켓몬 제외
}
function targetsOfRaw(state, user, m, focus) {
  const [lo, hi0] = m.range ?? [1, 1], hi = hi0 + sniperBonus(user, hi0); // 스나이퍼
  switch (m.kind) {
    case 'self': return [user];
    case 'enemies': return state.units.filter((u) => u.side !== user.side && dist(u, user) <= AREA_RADIUS);
    case 'allies': return state.units.filter((u) => u.side === user.side && dist(u, user) <= AREA_RADIUS);
    case 'ally':
      return focus && focus !== user && focus.side === user.side && dist(focus, user) >= lo && dist(focus, user) <= hi ? [focus] : [];
    default: // enemy
      return focus && focus.side !== user.side && dist(focus, user) >= lo && dist(focus, user) <= hi ? [focus] : [];
  }
}

function changeStats(unit, list, out, turns = STAGE_TURNS, fromOther = false, breaker = false) {
  for (const { stat, change } of list) {
    const key = API_STAT[stat];
    if (!key) continue;
    const r = applyStageChange(unit, key, change, turns, { fromOther, breaker });
    out.push({ unitId: unit.id, key, change, applied: r.applied, after: r.after });
  }
}

// 피뢰침·마중물: 주변 2칸 안의 대상을 노린 단일 전기/물 기술을 끌어온다 (아군·적 모두, 사거리·편 무시).
// 끌어온 유닛(대상이 원래 그 유닛이면 null)을 돌려준다. 화면도 연출 대상을 정할 때 쓴다
export function redirectTarget(state, userId, moveId, aim) {
  if (!(typeof aim === 'string' || aim?.unitId)) return null;
  const mv = MOVES[moveId], user = byId(state, userId), tgt = byId(state, typeof aim === 'string' ? aim : aim.unitId);
  if (!user || !tgt || (mv.shape?.type ?? 'single') !== 'single' || has(user, 'mold-breaker')) return null;
  if (mv.category === 'status' && mv.kind === 'self') return null;
  const type = moveTypeOf(user, mv);
  const rod = state.units.filter((o) => o.id !== userId && REDIRECT[o.ability] === type && dist(o, tgt) <= 2).sort((p, q) => dist(p, tgt) - dist(q, tgt))[0];
  return rod && rod !== tgt ? rod : null;
}

export const HEAL_USES = 2;

// 치고 빠지기: 남은 이동력 (없으면 0)
export function canRetreat(state, unit) {
  if (!unit.retreatReady || unit.retreated || !state.units.includes(unit)) return 0;
  return Math.max(0, moveBudget(unit) - (unit.spent ?? 0));
}
export function retreatMove(state, id, x, y, cost = 0) {
  const u = byId(state, id);
  moveUnit(state, id, x, y, cost);
  u.retreated = true; u.retreatReady = false;
}

// 울부짖기·날려버리기: 쓴 포켓몬 반대쪽으로 3칸 (차이가 큰 축, 같으면 x). 못 서는 칸·다른 포켓몬·맵 끝 앞에서 멈춤.
// 보스·뿌리박기는 안 밀림. 밀려난 포켓몬은 랭크 변화가 지워지고, 지난 압정은 밟은 것
export const PUSH_TILES = 3;
// ---- 회복·상태 조작 (SRPG식) ----
const SUPPORT = new Set(['refresh', 'teamCure', 'wish', 'stockpile', 'swallow', 'sacrificeHeal', 'memento', 'painSplit', 'bellyDrum', 'acupressure', 'psychUp', 'powerSwap', 'guardSwap', 'heartSwap', 'psychoShift', 'nightmare', 'teeterDance', 'splash']);
const FLOOR_TURNS = 9999; // 그 층 동안 유지되는 랭크 (비축하기·추억의선물·배북)
const SWAP_RESET = 3; // 스왑: 바꾼 랭크 변화는 남은 턴이 3으로
export const SPLASH_GYARADOS = 0.02; // 튀어오르기 이스터에그: 아군 갸라도스 등장 확률
const SWAP_KEYS = { powerSwap: ['atk', 'spa'], guardSwap: ['def', 'spd'], heartSwap: ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'], psychUp: ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'] };
function moveLayers(to, from, keys, swap) { // 랭크 층을 바꾸거나(swap) 복사
  const take = (u, k) => (u.layers ?? []).filter((l) => l.key === k).map((l) => ({ ...l }));
  for (const k of keys) {
    const lt = take(to, k), lf = take(from, k);
    to.layers = (to.layers ?? []).filter((l) => l.key !== k).concat(lf);
    if (swap) from.layers = (from.layers ?? []).filter((l) => l.key !== k).concat(lt);
    for (const u of swap ? [to, from] : [to]) for (const l of u.layers) if (l.key === k && swap && l.turns < FLOOR_TURNS) l.turns = SWAP_RESET; // 스왑: 3턴으로 리셋
    for (const u of swap ? [to, from] : [to]) { const ls = u.layers.filter((l) => l.key === k); u.stages[k] = Math.max(-6, Math.min(6, ls.reduce((s, l) => s + l.amount, 0))); u.turns[k] = ls.reduce((m, l) => Math.max(m, l.turns), 0); }
  }
}
const healPart = (u, frac) => { if (!canHeal(u)) return 0; const b = u.hp; u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * frac))); return u.hp - b; };
// 비축 해제 (토해내기·꿀꺽): 비축으로 오른 방어·특방 층을 없앰
function releaseStock(u) {
  for (const k of ['def', 'spd']) {
    let n = u.stockpile ?? 0;
    u.layers = (u.layers ?? []).filter((l) => { if (n > 0 && l.key === k && l.amount > 0 && l.turns > FLOOR_TURNS - 200) { n--; return false; } return true; });
    const ls = u.layers.filter((l) => l.key === k);
    u.stages[k] = Math.max(-6, Math.min(6, ls.reduce((sum, l) => sum + l.amount, 0))); u.turns[k] = ls.reduce((m, l) => Math.max(m, l.turns), 0);
  }
  u.stockpile = 0;
}
function supportEffect(state, a, t, move, rng, stageChanges, statusChanges, out) {
  const res = (ok, extra = {}) => ({ unitId: t.id, effect: move.effect, ok, ...extra });
  switch (move.effect) {
    case 'refresh': if (!['burn', 'poison', 'toxic', 'paralysis'].includes(t.status)) return res(false); cure(t); return res(true); // 리프레시: 독·화상·마비
    case 'teamCure': if (!t.status) return res(false); cure(t); return res(true); // 아로마테라피·치료방울: 주변 2칸 아군
    case 'wish': if (t.wish) return res(false); t.wish = true; return res(true); // 희망사항: 다음 자기 차례 시작에 1/2 회복
    case 'stockpile': // 비축하기: 최대 3, 방어·특방 +1
      if ((t.stockpile ?? 0) >= 3) return res(false);
      t.stockpile = (t.stockpile ?? 0) + 1; changeStats(t, [{ stat: 'defense', change: 1 }, { stat: 'special-defense', change: 1 }], stageChanges, FLOOR_TURNS); return res(true); // 그 층 동안 유지
    case 'swallow': { // 꿀꺽: 비축 1/2/3 → 1/4·1/2·전부 회복
      const n = t.stockpile ?? 0;
      if (!n || t.hp >= t.maxHp) return res(false);
      releaseStock(t); return res(true, { healed: healPart(t, [0, 0.25, 0.5, 1][n]) });
    }
    case 'sacrificeHeal': // 치유소원·초승달춤: 내가 쓰러지고 아군 하나를 완전히 회복
      t.hp = t.maxHp; cure(t); a.hp = 0; knockOut(state, a, null); out.selfFainted = a.id; return res(true);
    case 'memento': // 추억의선물: 내가 쓰러지고 상대 공격·특공 −2
      changeStats(t, [{ stat: 'attack', change: -2 }, { stat: 'special-attack', change: -2 }], stageChanges, FLOOR_TURNS, true); a.hp = 0; knockOut(state, a, null); out.selfFainted = a.id; return res(true); // 그 층 동안
    case 'painSplit': { // 아픔나누기: 둘의 HP 를 평균으로 (보스는 1/4 만큼만)
      const avg = Math.floor((a.hp + t.hp) / 2);
      const tNew = t.boss ? Math.max(1, t.hp - Math.max(0, t.hp - avg) / 4 | 0) : avg;
      a.hp = Math.min(a.maxHp, avg); t.hp = Math.min(t.maxHp, Math.max(1, tNew)); return res(true);
    }
    case 'bellyDrum': // 배북: HP 1/2 를 써서 공격 최대
      if (a.hp <= a.maxHp / 2) return res(false);
      a.hp -= Math.floor(a.maxHp / 2); changeStats(a, [{ stat: 'attack', change: 12 }], stageChanges, FLOOR_TURNS); return res(true); // 그 층 동안
    case 'acupressure': { // 경혈찌르기: 무작위 능력 +2
      const keys = ['attack', 'defense', 'special-attack', 'special-defense', 'speed', 'accuracy', 'evasion'];
      changeStats(t, [{ stat: keys[Math.floor(rng() * keys.length) % keys.length], change: 2 }], stageChanges); return res(true);
    }
    case 'psychUp': moveLayers(a, t, SWAP_KEYS.psychUp, false); return res(true); // 자기암시: 상대 랭크 복사
    case 'powerSwap': case 'guardSwap': case 'heartSwap': moveLayers(a, t, SWAP_KEYS[move.effect], true); return res(true); // 스왑
    case 'psychoShift': { // 사이코시프트: 내 상태이상을 상대에게 옮김
      if (!a.status || t.status) return res(false);
      const r = inflict(t, a.status, rng, null, state.weather);
      if (!r.ok) return res(false);
      statusChanges.push({ unitId: t.id, ailment: t.status, ...r }); cure(a); return res(true);
    }
    case 'nightmare': if (t.status !== 'sleep' || t.nightmare) return res(false); t.nightmare = true; return res(true); // 악몽: 자는 동안 페이즈 끝 1/4
    case 'teeterDance': { // 흔들흔들댄스: 옆의 모든 포켓몬(아군 포함) 혼란
      for (const u of state.units.filter((u) => u !== a && dist(u, a) === 1)) { const r = inflict(u, 'confusion', rng, null, state.weather); statusChanges.push({ unitId: u.id, ailment: 'confusion', ...r }); }
      return res(true);
    }
    case 'splash': { // 튀어오르기: 아무 일도… 가끔 아군 갸라도스가 도우러 온다 (이스터에그)
      if (rng() >= SPLASH_GYARADOS || a.side !== 'ally') return res(false, { reason: 'splash' });
      const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => ({ x: a.x + dx, y: a.y + dy }))
        .find((p) => canEnter(state.grid[p.y]?.[p.x], 'gyarados') && !state.units.some((u) => u.x === p.x && u.y === p.y));
      if (!spot) return res(false, { reason: 'splash' });
      const g = makeUnit({ species: 'gyarados', side: 'ally', x: spot.x, y: spot.y, level: a.level, moves: startingMoves(SPECIES.gyarados.learnset, a.level, MOVES, 'gyarados'), id: uniqueId(state.units, 'ally', 'gyarados') });
      Object.assign(g, newVolatile(), { bot: true, acted: true, moved: true });
      state.units.push(g);
      out.summoned = g.id;
      return res(true, { summoned: g.id });
    }
    default: return res(false);
  }
}

function pushAway(state, a, t, out) {
  const res = (ok, reason) => ({ unitId: t.id, effect: 'push', ok, ...(reason ? { reason } : {}) });
  if (t.boss || t.rooted || has(t, 'suction-cups')) return res(false, 'immune'); // 흡반: 밀리지 않음
  const dx = t.x - a.x, dy = t.y - a.y;
  const [sx, sy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy)];
  const path = [{ x: t.x, y: t.y }];
  for (let i = 0; i < PUSH_TILES; i++) {
    const p = path.at(-1), nx = p.x + sx, ny = p.y + sy;
    if (!canEnter(state.grid[ny]?.[nx], t) || state.units.some((u) => u !== t && u.x === nx && u.y === ny)) break;
    path.push({ x: nx, y: ny });
  }
  if (path.length === 1) return res(false, 'stuck');
  const from = path[0], to = path.at(-1);
  Object.assign(t, newStages());
  moveUnit(state, t.id, to.x, to.y, 0, path);
  const end = { x: t.x, y: t.y }, fainted = !state.units.includes(t); // 압정에 쓰러지면 그 칸에서 멈춤
  out.pushed = { unitId: t.id, from, to: end, path: path.slice(0, path.findIndex((p) => p.x === end.x && p.y === end.y) + 1), ...(fainted ? { fainted: true } : {}) };
  out.trapEvents = [...(state.log.trapEvents ?? [])];
  // 속박: 밀려난 쪽이 묶은 쪽이거나 묶인 쪽이면 거리를 다시 본다 (사거리 밖이면 바로 풀림)
  const evs = [];
  for (const u of state.units) if (u.bound && (u.bound.by === t.id || u === t)) bindCheck(state, u, evs);
  if (evs.length) out.unbound = [...(out.unbound ?? []), ...evs.map((e) => ({ unitId: e.unitId, moveId: e.moveId }))];
  return res(true);
}

// 공격기·변화기 공통. 공격기는 데미지 + 능력치 부가효과, 변화기는 대상별 랭크 변화
const SELF_KO = ['self-destruct', 'explosion']; // 쓴 쪽이 기절
export const RECHARGE_MOVES = new Set(['hyper-beam', 'giga-impact', 'rock-wrecker']); // 다음 자기 차례 기술 봉인
export const CRASH_MOVES = new Set(['jump-kick', 'high-jump-kick']); // 빗나가면 자기 HP 1/2
export const BREAKS_PROTECT = new Set(['feint', 'shadow-force']); // 방어를 뚫고 없앰
const SCREENS = ['reflect', 'lightScreen'];
export const CHARGE_MOVES = new Set(['solar-beam', 'razor-wind', 'skull-bash', 'sky-attack']); // 모으고 다음 차례 발사
const RANGED_CHARGE = new Set(['solar-beam', 'razor-wind']); // 원거리: 그 자리에서 쏨 (사거리 밖 1칸마다 위력 −5%), 근접은 돌진
const RANGE_FALLOFF = 0.05;
const PRESSURE_SHIELD = 2, STENCH_FLINCH = 10;
export const HIDE_MOVES = { fly: 'sky', bounce: 'sky', dig: 'ground', dive: 'water', 'shadow-force': 'shadow' }; // 숨기: 상대 다음 페이즈 끝까지

// 준비 기술 발사 경로: 이동력 무시, 대상을 맞힐 수 있는 가장 가까운 칸 (불발이면 null)
export function chargeRoute(state, unit) {
  const c = unit.charging;
  if (!c || !state.units.includes(unit)) return null;
  if (unit.status === 'sleep' || unit.status === 'freeze' || unit.noMove > 0 || unit.bound || unit.rooted || unit.trapped) return null; // 못 움직이면 불발
  if (unit.sealed || moveBlock(unit, c.moveId)) return null; // 기술을 못 쓰면 불발 (풀죽음·트집·사슬묶기 …)
  const target = c.targetId && byId(state, c.targetId);
  if (!target) return null;
  const move = MOVES[c.moveId];
  if (RANGED_CHARGE.has(c.moveId)) return canTarget(move, target) ? { path: [{ x: unit.x, y: unit.y }], aim: { unitId: target.id } } : null; // 숨으면 불발
  const spots = [...reachable(state.grid, state.units, unit, Infinity)].sort((p, q) => p[1] - q[1]);
  for (const [k] of spots) {
    const [x, y] = k.split(',').map(Number);
    const ghost = { ...unit, x, y };
    const sim = { ...state, units: state.units.map((u) => (u === unit ? ghost : u)) };
    const aim = aimsOf(sim, ghost, move).find((a) => unitsHit(sim, ghost, move, a).includes(target));
    if (aim) return { path: pathTo(state.grid, state.units, unit, x, y, Infinity), aim };
  }
  return null;
}

// aim: 대상 id 문자열(단일, 호환) 또는 shapes.js 의 조준 객체
export function applyMove(state, userId, moveId, aim, rng) {
  const W = effectiveWeather(state); // 에어록·날씨부정 반영
  for (const u of state.units) u.fieldWeather = W; // 쓱쓱·엽록소 등 스피드·이동력 특성용
  refreshField(state);
  // 플러스·마이너스 / 플라워기프트: 옆 동료를 보고 켠다 (데미지 계산이 읽음)
  const nextTo = (u, pred) => state.units.some((o) => o !== u && o.side === u.side && dist(o, u) === 1 && pred(o));
  for (const u of state.units) {
    u.plusActive = (has(u, 'plus') || has(u, 'minus')) && nextTo(u, (o) => has(o, 'plus') || has(o, 'minus'));
    u.flowerActive = W === 'sun' && (has(u, 'flower-gift') || nextTo(u, (o) => has(o, 'flower-gift')));
  }
  const rod = redirectTarget(state, userId, moveId, aim);
  const focusId = typeof aim === 'string' ? aim : aim?.unitId ?? null;
  const a = byId(state, userId), move = moveFor(a, moveId); // 저주: 쓰는 유닛 타입에 따라
  if (a.sealed && a.charging?.moveId === moveId) a.charging = null; // 막힌 발사는 모은 힘을 잃음
  if (a.sealed) return { kind: move.category === 'status' ? 'status' : 'attack', blocked: 'sealed', stageChanges: [], statusChanges: [], thawed: [], missed: [], abilityEvents: [] }; // 풀죽음: 이번 차례 기술 불가
  a.acted = true;
  const restrict = moveBlock(a, moveId);
  if (restrict && a.charging?.moveId === moveId) a.charging = null;
  if (restrict) { a.moved = true; return { kind: move.category === 'status' ? 'status' : 'attack', blocked: restrict, stageChanges: [], statusChanges: [], thawed: [], missed: [], abilityEvents: [] }; } // 도발·앙코르 …
  if (has(a, 'truant')) a.loafNext = true; // 게으름: 다음 자기 차례는 쉰다
  a.moved = true;
  const stageChanges = [], statusChanges = [], thawed = [];
  const kind = move.category === 'status' ? 'status' : 'attack';
  const abilityEvents = (state.log.abilityEvents = []); // 이번 기술에서 발동한 특성 (연출용)
  state.log.unbound = []; // 이번 기술로 쓰러진 묶은 쪽 → 풀린 속박
  state.log.bonded = []; // 이번 기술에서 길동무로 같이 쓰러진 유닛
  const moldBreaker = has(a, 'mold-breaker'); // 틀깨기: 상대의 방어 특성(클리어바디·유연·습기 …) 무시
  // 특성 흡수 결과 적용: 회복·랭크·타오르는불꽃
  const absorb = (u, ab) => {
    if (ab.heal && canHeal(u)) u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * ab.heal)));
    if (ab.boost) for (const [k, v] of Object.entries(ab.boost)) changeStats(u, [{ stat: Object.keys(API_STAT).find((s) => API_STAT[s] === k), change: v }], stageChanges);
    if (ab.flashFire) u.flashFire = true;
    abilityEvents.push({ unitId: u.id, ability: ab.ability });
  };
  const ail = (t) => {
    if (!move.ailment) return;
    if (move.ailment === 'infatuation') { statusChanges.push({ unitId: t.id, ailment: 'infatuation', ...infatuate(t, a, { breaker: moldBreaker }) }); return; } // 메로메로
    const r = inflict(t, move.ailment, rng, move, W, { breaker: t !== a && moldBreaker });
    statusChanges.push({ unitId: t.id, ailment: move.ailment, ...r });
    // 싱크로: 독·마비·화상을 건 상대에게도
    if (r.ok && has(t, 'synchronize') && t !== a && SYNC_AILMENTS.includes(move.ailment)) {
      const back = inflict(a, move.ailment, rng, null, W);
      statusChanges.push({ unitId: a.id, ailment: move.ailment, ...back });
      if (back.ok) abilityEvents.push({ unitId: t.id, ability: 'synchronize' });
    }
  };

  // 마비 25% 실패 → 혼란 50% 자해 (기술은 나가지 않고 행동 종료)
  const blocked = checkAction(a, rng);
  if (blocked) {
    const out = { kind, blocked, stageChanges, statusChanges, thawed, missed: [] };
    if (blocked === 'confusion') {
      const damage = magicGuard(a) ? 0 : confusionDamage(a); // 매직가드: 자해 피해 없음
      a.hp = Math.max(0, a.hp - damage);
      out.selfHit = { damage, fainted: a.hp === 0 };
      if (a.hp === 0) knockOut(state, a, null);
      checkResult(state);
    }
    return out;
  }
  a.lastMove = moveId; // 앙코르·사슬묶기·트집용 (기술이 실제로 나갔을 때)
  (a.usedMoves ??= new Set()).add(moveId); // 마지막수단

  // 습기: 주변 2칸에 습기가 있으면 자폭·대폭발 불발
  if (SELF_KO.includes(move.id) && !moldBreaker && state.units.some((u) => u !== a && has(u, 'damp') && dist(u, a) <= 2)) {
    abilityEvents.push({ unitId: state.units.find((u) => u !== a && has(u, 'damp') && dist(u, a) <= 2).id, ability: 'damp' });
    return { kind, blocked: 'damp', stageChanges, statusChanges, thawed, missed: [], abilityEvents };
  }

  // 끌어왔으면 그 유닛이 무효로 흡수하고 특공 +1 (명중 판정 없음)
  if (rod) {
    const hpBefore = rod.hp;
    absorb(rod, { ability: rod.ability, boost: { spa: 1 } });
    if (kind === 'status') return { kind, stageChanges, statusChanges, thawed, missed: [], abilityEvents, redirected: rod.id };
    const hit = { unitId: rod.id, hit: true, crit: false, typeMult: 0, damage: 0, absorbed: { ability: rod.ability }, fainted: false, hpBefore };
    return { kind, hits: [hit], expGained: {}, stageChanges, statusChanges, thawed, selfKO: false, abilityEvents, redirected: rod.id, hit: true, crit: false, typeMult: 0, damage: 0, fainted: false };
  }

  if (kind === 'status' && move.heal) { // 회복기: 자신만, 층마다 2번, HP 가득이면 실패
    if (a.hp >= a.maxHp) return { kind, stageChanges, statusChanges, thawed, missed: [], abilityEvents, healFailed: 'full' };
    if ((a.healUses ?? 0) <= 0) return { kind, stageChanges, statusChanges, thawed, missed: [], abilityEvents, healFailed: 'uses' };
    const rate = move.heal.weather ? (W === 'sun' ? 2 / 3 : ['rain', 'sand', 'hail'].includes(W) ? 1 / 4 : 1 / 2) : (move.healing || 50) / 100;
    const before = a.hp;
    a.hp = Math.min(a.maxHp, a.hp + Math.max(1, Math.floor(a.maxHp * rate)));
    a.healUses -= 1;
    return { kind, stageChanges, statusChanges, thawed, missed: [], abilityEvents, healed: { unitId: a.id, amount: a.hp - before } };
  }

  if (kind === 'status' && move.aimTile) { // 압정: 칸 조준 (사거리 1~3)
    const ok = aim && aim.x !== undefined && state.grid[aim.y]?.[aim.x] !== undefined && dist(a, aim) >= TRAP_RANGE[0] && dist(a, aim) <= TRAP_RANGE[1];
    const r = ok ? layTraps(state, a, move.effect, aim) : { ok: false, tiles: [] };
    return { kind, stageChanges, statusChanges, thawed, missed: [], abilityEvents, effects: [{ unitId: a.id, effect: move.effect, ok: r.ok, ...(ok ? {} : { reason: 'range' }) }], protectedIds: [], trapsLaid: r.tiles };
  }
  if (kind === 'status') {
    const missed = [], effects = [], protectedIds = [], out2 = {}; // out2: 밀어내기 pushed · 흑안개 hazed
    const acc = { ...move, accuracy: move.accuracy ?? 100 };
    for (const t of targetsOf(state, a, move, focusId ? byId(state, focusId) : null)) {
      if (t !== a && t.guard === 'protect') { protectedIds.push(t.id); continue; } // 방어: 다른 유닛의 기술을 막음
      const ab = t.side !== a.side ? immunity(a, t, move) : null; // 축전에 전기자석파 등
      if (ab) { absorb(t, ab); continue; }
      if (t.side !== a.side && !(rng() * 100 < hitChance(a, t, acc, state.grid[t.y][t.x], W))) { missed.push(t.id); continue; }
      if (move.id === 'captivate' && !(t.gender && a.gender && t.gender !== a.gender)) { statusChanges.push({ unitId: t.id, ailment: null, ok: false, reason: 'immune' }); continue; } // 유혹: 반대 성별만
      if (move.effect === 'push') { effects.push(pushAway(state, a, t, out2)); continue; } // 울부짖기·날려버리기
      if (SUPPORT.has(move.effect)) { effects.push(supportEffect(state, a, t, move, rng, stageChanges, statusChanges, out2)); continue; } // 회복·상태 조작
    if (move.effect === 'haze') { // 흑안개: 주변 2칸 모두 (자신 포함) 랭크 초기화
      out2.hazed = state.units.filter((u) => dist(u, a) <= 2).map((u) => { Object.assign(u, newStages()); return u.id; });
      effects.push({ unitId: a.id, effect: 'haze', ok: true });
      continue;
    }
    if (move.effect) { effects.push(applyEffect(state, a, t, move, rng, W)); continue; } // 포켓몬에 붙는 효과
      changeStats(t, move.statChanges ?? [], stageChanges, move.area ? AREA_STAGE_TURNS : STAGE_TURNS, t !== a, t !== a && moldBreaker);
      ail(t);
    }
    let selfFainted = null;
    if (a.hp === 0 && state.units.includes(a)) { knockOut(state, a, null, { reward: false }); checkResult(state); selfFainted = a.id; } // 고스트 저주로 쓰러짐
    return { kind, stageChanges, statusChanges, thawed, missed, abilityEvents, effects, protectedIds, ...out2, ...(selfFainted ? { selfFainted } : {}) };
  }
  const ranged = RANGED_CHARGE.has(move.id) && a.charging?.moveId === move.id ? byId(state, a.charging.targetId) : null; // 원거리 준비 기술 발사: 기억한 대상만
  const targets = ranged ? (canTarget(move, ranged) ? [ranged] : []) : unitsHit(state, a, move, typeof aim === 'string' ? { unitId: aim } : aim ?? { self: true });
  // 준비 기술: 처음 쓰면 모으기만 (솔라빔은 쾌청이면 바로). 같은 기술을 모아 둔 상태면 발사
  if (move.id === 'spit-up' && !(a.stockpile > 0)) return { kind, blocked: 'nostock', stageChanges: [], statusChanges: [], thawed: [], missed: [], abilityEvents: [] }; // 토해내기: 비축 없음
  if (CHARGE_MOVES.has(move.id) && a.charging?.moveId !== move.id && !(move.id === 'solar-beam' && W === 'sun')) {
    const foe = targets.filter((d) => d.side !== a.side).sort((p, q) => dist(p, a) - dist(q, a))[0] ?? (focusId ? byId(state, focusId) : null); // 가장 가까운 상대
    a.charging = { moveId: move.id, targetId: foe?.id ?? null };
    if (move.id === 'skull-bash') changeStats(a, [{ stat: 'defense', change: 1 }], stageChanges); // 로켓박치기: 모을 때 방어 +1
    return { kind: 'attack', charged: { ...a.charging }, hits: [], expGained: {}, stageChanges, statusChanges, thawed, selfKO: false, abilityEvents, drained: 0, recoil: 0, crash: 0, screensBroken: [], spun: null, flinched: [], bound: [], retreat: false, bond: [] };
  }
  if (a.charging?.moveId === move.id) a.charging = null;
  let dmgMove = a.helped && move.power ? { ...move, power: move.power * 1.5 } : move; // 도우미: 다음 공격 한 번
  a.allMovesUsed = state.units.filter((u) => u.side === a.side).every((u) => (u.moves ?? []).every((m) => u.usedMoves?.has(m))); // 마지막수단
  if (move.varPower === 'magnitude') { const r = rng() * 100; dmgMove = { ...dmgMove, varPower: null, power: r < 5 ? 10 : r < 15 ? 30 : r < 35 ? 50 : r < 65 ? 70 : r < 85 ? 90 : r < 95 ? 110 : 150 }; } // 매그니튜드 4~10
  let presentHeal = false;
  if (move.varPower === 'present') { const r = rng() * 100; if (r < 20) presentHeal = true; else dmgMove = { ...dmgMove, varPower: null, power: r < 60 ? 40 : r < 90 ? 80 : 120 }; } // 프레젠트: 20% 회복, 40% 40, 30% 80, 10% 120
  if (has(a, 'reckless') && dmgMove.power && (move.drain < 0 || CRASH_MOVES.has(move.id))) dmgMove = { ...dmgMove, power: dmgMove.power * 1.2 }; // 이판사판: 반동기 1.2배
  if (ranged && dmgMove.power) dmgMove = { ...dmgMove, power: dmgMove.power * Math.max(0, 1 - RANGE_FALLOFF * Math.max(0, dist(a, ranged) - move.range[1])) }; // 사거리 밖
  a.helped = false;
  if (RECHARGE_MOVES.has(move.id)) a.recharge = true; // 파괴광선류: 기술이 나갔으면 다음 차례 반동
  const spread = targets.length >= 2 ? 0.75 : 1;
  const roll = (chance) => !chance || rng() * 100 < chance * (has(a, 'serene-grace') ? 2 : 1); // 확률 0 = 100%, 하늘의은총 2배
  const hits = [], expGained = {}, knocked = [];
  let anyLanded = false;
  const contactBase = move.category === 'physical';
  const breaksDef = has(a, 'mold-breaker');
  let dealt = 0; // 실제로 깎인 HP 합 (흡수·반동 기준)
  const flinched = [], bound = [], screensBroken = [];
  let countered = null;
  if (targets.length && move.power) a.ncTouched = true; // 자연회복: 공격함
  const flinchChance = move.flinchChance || (has(a, 'stench') && move.power ? STENCH_FLINCH : 0); // 악취: 풀죽음 10%
  if (move.id === 'brick-break') { // 깨뜨리다: 피해 전에 대상을 덮는 상대 편 장벽을 부숨
    state.zones = (state.zones ?? []).filter((z) => {
      const hitIt = SCREENS.includes(z.kind) && targets.some((d) => d.side === z.side && d.side !== a.side && dist(d, z) <= FIELD_RADIUS && d.guard !== 'protect' && typeEffect(a, d, move, W) > 0); // 방어·무효면 안 깨짐
      if (hitIt) screensBroken.push(z.kind);
      return !hitIt;
    });
    if (screensBroken.length) refreshField(state);
  }
  for (const d of targets) {
    if (d !== a && d.guard === 'protect' && BREAKS_PROTECT.has(move.id)) d.guard = null; // 페인트·섀도다이브: 방어를 뚫음
    if (d !== a && d.guard === 'protect') { hits.push({ unitId: d.id, hit: false, protected: true, crit: false, typeMult: 1, damage: 0, fainted: false, hpBefore: d.hp, strike: 0 }); continue; } // 방어
    const contact = contactBase && dist(a, d) === 1;
    const n = rollHits(a, move, rng); // 연속 공격 타수 (보통 1)
    let fainted = false, landed = false, last = null;
    const contacts = []; // 접촉 반격은 부가효과 판정 뒤에 (예전과 같은 난수 순서)
    for (let k = 0; k < n; k++) {
      if (!state.units.includes(d) || !state.units.includes(a)) break; // 쓰러지면 멈춤
      const hpBefore = d.hp;
      const r = presentHeal ? { hit: true, crit: false, typeMult: 1, damage: 0, presentHeal: true } // 프레젠트 회복
        : move.dreamOnly && d.status !== 'sleep' ? { hit: true, crit: false, typeMult: 0, damage: 0, failed: true } // 꿈먹기: 잠든 상대만
        : calcDamage(a, d, hideDouble(move, d) ? { ...dmgMove, power: dmgMove.power * 2 } : dmgMove, { rng, defTile: state.grid[d.y][d.x], spread, weather: W, forceHit: k > 0 });
      if (r.absorbed) absorb(d, r.absorbed);
      if (r.damage > 0 && d !== a && has(d, 'pressure') && (d.pressureUsed ?? 0) < PRESSURE_SHIELD) { d.pressureUsed = (d.pressureUsed ?? 0) + 1; r.damage = 0; r.shielded = true; } // 프레셔: 층마다 타격 2회 막음
      if (r.damage > 0) d.ncTouched = true; // 자연회복: 맞음
      if (r.damage > 0 && d.bide && d !== a) d.bide.stored += Math.min(r.damage, d.hp); // 참기: 받은 피해 모음
      d.hp = Math.max(0, d.hp - r.damage);
      const endured = d.hp === 0 && d.guard === 'endure' && r.damage > 0; // 버티기: 공격으로는 1 남김
      if (endured) d.hp = 1;
      if (d.hp === 0 && move.id === 'false-swipe' && r.damage > 0) d.hp = 1; // 칼등치기: 최소 1 남김
      // 옹골참: HP 가득에서 한 방이면 1 남김 (한 층 한 번, 연속 공격은 첫 타만)
      if (k === 0 && d.hp === 0 && hpBefore === d.maxHp && has(d, 'sturdy') && !d.sturdyUsed && !breaksDef) { d.hp = 1; d.sturdyUsed = true; abilityEvents.push({ unitId: d.id, ability: 'sturdy' }); }
      dealt += hpBefore - d.hp;
      fainted = d.hp === 0;
      // 반격 자세: 맞고 버텼으면 때린 상대에게 바로 돌려줌 (한 번)
      if (!fainted && d.counter && d !== a && hpBefore - d.hp > 0 && (d.counter.cat === 'both' || d.counter.cat === move.category) && state.units.includes(a)) {
        const back = Math.min(a.hp, Math.max(1, Math.floor((hpBefore - d.hp) * d.counter.mult)));
        countered = { unitId: d.id, damage: back, moveId: d.counter.id, mult: d.counter.mult };
        a.hp -= back; d.counter = null;
        if (a.hp === 0) knockOut(state, a, null);
      }
      if (fainted) { knockOut(state, d, a, { deferExp: true }); knocked.push(d); }
      else if (move.type === 'fire' && r.damage > 0 && d.status === 'freeze') { cure(d); thawed.push(d.id); } // 불꽃 공격에 맞으면 녹는다
      landed ||= r.hit && r.typeMult > 0;
      // 접촉 반격 (거리 1 물리기, 타마다): 정전기·독가시·불꽃몸·포자 30%, 까칠한피부 1/8, 유폭(기절 시) 1/4
      const strikeFainted = fainted;
      if (r.hit && r.typeMult > 0 && r.damage > 0 && contact) contacts.push(() => {
        if (!state.units.includes(a)) return;
        const fainted = strikeFainted;
        if (!fainted && has(d, 'cute-charm') && rng() * 100 < 30) { // 헤롱헤롱바디 (쓰러진 상대는 못 건다)
          const res = infatuate(a, d);
          if (res.ok) { statusChanges.push({ unitId: a.id, ailment: 'infatuation', ...res }); abilityEvents.push({ unitId: d.id, ability: 'cute-charm' }); }
        }
        const spell = CONTACT_AILMENT[d.ability];
        if (spell && rng() * 100 < 30) {
          const ail2 = spell[spell.length > 1 ? Math.floor(rng() * spell.length) : 0];
          const res = inflict(a, ail2, rng, null, W);
          statusChanges.push({ unitId: a.id, ailment: ail2, ...res });
          if (res.ok) abilityEvents.push({ unitId: d.id, ability: d.ability });
        }
        const recoil = has(d, 'rough-skin') ? 1 / 8 : fainted && has(d, 'aftermath') && !state.units.some((u) => has(u, 'damp')) ? 1 / 4 : 0;
        if (recoil && !magicGuard(a)) {
          a.hp = Math.max(0, a.hp - Math.max(1, Math.floor(a.maxHp * recoil)));
          abilityEvents.push({ unitId: d.id, ability: d.ability, damage: true });
          if (a.hp === 0) knockOut(state, a, null);
        }
      });
      last = r;
      hits.push({ unitId: d.id, ...r, fainted, hpBefore, strike: k, ...(endured ? { endured: true } : {}) });
      if (k === 0 && !r.hit) break; // 명중은 첫 타만
      if (r.typeMult === 0) break;
    }
    anyLanded ||= landed;
    // 대상 부가효과 (연속 공격도 마지막 타 뒤 한 번): 맞았고 면역이 아니고 버텼을 때
    const dust = !breaksDef && has(d, 'shield-dust'); // 인분: 받는 부가효과 무효
    if (landed && !fainted && !dust && move.effectKind === 'damage-lower' && move.statChanges?.length && roll(move.statChance)) changeStats(d, move.statChanges, stageChanges, move.area ? AREA_STAGE_TURNS : STAGE_TURNS, true, breaksDef);
    if (landed && !fainted && !dust && move.ailment && roll(move.ailmentChance)) ail(d);
    // 풀죽음: 다음 자기 차례 기술 봉인 (정신력·보스 면역, 봉인 중 재풀죽음 없음, 속이다는 대상마다 한 층 한 번)
    if (landed && !fainted && !dust && flinchChance && !d.flinch && !d.sealed && !d.boss && !(has(d, 'inner-focus') && !breaksDef)
      && !(move.id === 'fake-out' && d.fakedOut) && roll(flinchChance)) {
      d.flinch = true;
      if (has(d, 'steadfast')) changeStats(d, [{ stat: 'speed', change: 1 }], stageChanges); // 불굴의마음: 풀죽으면 스피드 +1
      if (move.id === 'fake-out') d.fakedOut = true;
      flinched.push(d.id);
    }
    if (landed && !fainted && last?.damage > 0 && BIND_MOVES.has(move.id) && !d.bound && state.units.includes(a)) { // 속박기
      d.bound = { by: a.id, moveId: move.id, turns: BIND_TURNS, reach: move.range?.[1] ?? 1 };
      bound.push({ unitId: d.id, moveId: move.id });
    }
    if (landed && !fainted && last?.damage > 0) {
      if (has(d, 'color-change') && d.typeOverride !== moveTypeOf(a, move)) { d.typeOverride = moveTypeOf(a, move); abilityEvents.push({ unitId: d.id, ability: 'color-change' }); }
      if (hits.some((h) => h.unitId === d.id && h.crit) && has(d, 'anger-point')) { changeStats(d, [{ stat: 'attack', change: 12 }], stageChanges); abilityEvents.push({ unitId: d.id, ability: 'anger-point' }); }
    }
    for (const c of contacts) c();
  }
  // 선제기: 기술이 나갔으면 이번 차례에 한 번 남은 이동력으로 다시 이동 (치고 빠지기)
  if (move.priority > 0 && state.units.includes(a)) a.retreatReady = true;
  // 흡수(+)·반동(−): 실제로 깎인 HP 합 기준
  let drained = 0, recoilDamage = 0;
  if (dealt > 0 && move.drain > 0 && state.units.includes(a)) {
    const amt = Math.max(1, Math.floor(dealt * move.drain / 100));
    if (targets.some((t) => t.ability === 'liquid-ooze')) { // 해감액: 흡수가 피해로 (틀깨기로도 못 막음, 매직가드는 막음)
      if (!magicGuard(a)) { a.hp = Math.max(0, a.hp - amt); drained = -amt; }
      abilityEvents.push({ unitId: targets.find((t) => t.ability === 'liquid-ooze').id, ability: 'liquid-ooze', damage: true });
      if (a.hp === 0) knockOut(state, a, null);
    } else if (canHeal(a)) { const before = a.hp; a.hp = Math.min(a.maxHp, a.hp + amt); drained = a.hp - before; }
  }
  if (dealt > 0 && move.drain < 0 && state.units.includes(a) && !has(a, 'rock-head') && !magicGuard(a)) {
    recoilDamage = Math.max(1, Math.floor(dealt * -move.drain / 100));
    a.hp = Math.max(0, a.hp - recoilDamage);
    if (a.hp === 0) knockOut(state, a, null, { reward: false }); // 반동 기절: 보상 없음
  }
  // 경험치는 공격이 끝난 뒤 살아 있는 아군 기준 (목록 순서에 따라 달라지지 않게)
  for (const d of knocked) for (const [sp, n] of Object.entries(awardExp(state, a, d))) expGained[sp] = (expGained[sp] ?? 0) + n;
  // 사용자 부가효과(인파이트류): 한 명이라도 맞으면 한 번
  // 숨기: 맞든 안 맞든 숨는다 (다음 자기 차례는 봉인)
  if (HIDE_MOVES[move.id] && state.units.includes(a)) { a.burrow = { kind: HIDE_MOVES[move.id], moveId: move.id }; a.recharge = 'hide'; }
  if (move.id === 'spit-up') releaseStock(a); // 토해내기: 비축을 다 씀
  // 프레젠트 회복: 맞은 대상 HP 1/4
  const presentHealed = [];
  if (presentHeal) for (const d of targets) if (state.units.includes(d) && d.guard !== 'protect' && canHeal(d) && d.hp < d.maxHp) { const b = d.hp; d.hp = Math.min(d.maxHp, d.hp + Math.max(1, Math.floor(d.maxHp / 4))); presentHealed.push({ unitId: d.id, amount: d.hp - b }); }
  // 화풀이: 때리고 그쪽으로 한 칸 (상대를 한 칸 밀고 그 자리로) · 은혜갚기: 때리고 한 칸 물러남
  let stepped = null, shoved = null;
  if ((move.id === 'frustration' || move.id === 'return') && anyLanded && state.units.includes(a)) {
    const d = targets.find((t) => t.side !== a.side);
    if (d) {
      const sx = Math.sign(d.x - a.x), sy = Math.sign(d.y - a.y);
      const free = (x, y) => canEnter(state.grid[y]?.[x], a) && !state.units.some((u) => u.x === x && u.y === y);
      if (move.id === 'return' && free(a.x - sx, a.y - sy)) { const from = { x: a.x, y: a.y }; moveUnit(state, a.id, a.x - sx, a.y - sy, 0); stepped = { unitId: a.id, from, to: { x: a.x, y: a.y } }; }
      if (move.id === 'frustration') {
        const from = { x: a.x, y: a.y };
        if (!state.units.includes(d) && free(d.x, d.y)) moveUnit(state, a.id, d.x, d.y, 0); // 쓰러졌으면 그 칸으로
        else if (state.units.includes(d) && !d.boss && free(d.x + sx, d.y + sy) && canEnter(state.grid[d.y + sy]?.[d.x + sx], d)) { const ox = d.x, oy = d.y; moveUnit(state, d.id, d.x + sx, d.y + sy, 0); shoved = { unitId: d.id, from: { x: ox, y: oy }, to: { x: d.x, y: d.y } }; if (state.units.includes(a)) moveUnit(state, a.id, ox, oy, 0); }
        if (a.x !== from.x || a.y !== from.y) stepped = { unitId: a.id, from, to: { x: a.x, y: a.y } };
      }
    }
  }
  // 점프킥·무릎차기: 하나도 안 맞았으면(빗나감·방어·무효) 자기 최대 HP 1/2
  let crash = 0;
  if (CRASH_MOVES.has(move.id) && !anyLanded && state.units.includes(a) && !magicGuard(a)) {
    crash = Math.min(a.hp, Math.max(1, Math.floor(a.maxHp / 2)));
    a.hp -= crash;
    if (a.hp === 0) knockOut(state, a, null);
  }
  // 고속스핀: 속박·씨뿌리기 해제 + 주변 2칸 상대 압정 치움
  let spun = null;
  if (move.id === 'rapid-spin' && anyLanded && state.units.includes(a)) {
    const freed = !!(a.bound || a.leechBy);
    a.bound = null; a.leechBy = null;
    const before = (state.spikes ?? []).length;
    state.spikes = (state.spikes ?? []).filter((t) => !(t.side !== a.side && dist(t, a) <= 2));
    spun = { freed, cleared: before - state.spikes.length };
  }
  if (anyLanded && move.effectKind === 'damage-raise' && move.statChanges?.length && roll(move.statChance)) changeStats(a, move.statChanges, stageChanges);
  // 자폭: 빗나가도 쓴 쪽은 기절, 보상 없음
  const selfKO = SELF_KO.includes(move.id) && state.units.includes(a);
  if (selfKO) { a.hp = 0; knockOut(state, a, null, { reward: false }); }
  checkResult(state);
  const out = { kind, hits, expGained, stageChanges, statusChanges, thawed, selfKO, abilityEvents, drained, recoil: recoilDamage, crash, screensBroken, spun, presentHealed, stepped, shoved, countered, unbound: [...(state.log.unbound ?? [])], flinched, bound: bound.filter((b) => state.units.includes(a) && byId(state, b.unitId)?.bound), retreat: !!a.retreatReady && state.units.includes(a), bond: [...state.log.bonded] };
  const ids = [...new Set(hits.map((h) => h.unitId))];
  if (ids.length === 1) { // 대상 하나 (연속 공격이면 타를 합쳐서)
    const { hit, typeMult } = hits[0];
    Object.assign(out, { hit, typeMult, crit: hits.some((h) => h.crit), damage: hits.reduce((t, h) => t + h.damage, 0), fainted: hits.at(-1).fainted, strikes: hits.length });
  }
  return out;
}

// 기존 호출 호환
export const applyAttack = (state, attackerId, targetId, moveId, rng) => applyMove(state, attackerId, moveId, targetId, rng);

// 낙엽더미 열기: 아군 칸 상하좌우 옆 더미 전부 (위→아래, 왼→오른). 포켓몬 = 그 칸에 적 + 레벨만큼 기습(기절 없음), 상자 = 바로 전리품
function openPiles(state, u) {
  const near = (state.piles ?? []).filter((p) => Math.abs(p.x - u.x) + Math.abs(p.y - u.y) === 1).sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const p of near) {
    state.piles.splice(state.piles.indexOf(p), 1);
    const row = state.grid[p.y]; state.grid[p.y] = row.slice(0, p.x) + '.' + row.slice(p.x + 1);
    if (p.kind === 'mon') {
      const e = makeUnit({ species: p.species, side: 'enemy', x: p.x, y: p.y, level: p.level, id: uniqueId(state.units, 'enemy', p.species) });
      state.units.push(e);
      const damage = Math.max(0, Math.min(p.level, u.hp - 1));
      u.hp -= damage;
      out.push({ x: p.x, y: p.y, kind: 'mon', unitId: e.id, damage });
    } else {
      state.log.loot.push(p.item);
      out.push({ x: p.x, y: p.y, kind: 'chest', item: p.item });
    }
  }
  return out;
}

// 아군이 이동을 마친 칸 처리: 낙엽더미 열기, 상자 열기, 계단 도착
export function arrive(state, unitId) {
  const u = byId(state, unitId);
  const out = { stairs: false, item: null, piles: [] };
  if (!u || u.side !== 'ally') return out;
  out.piles = openPiles(state, u);
  const i = state.chests.findIndex((c) => c.x === u.x && c.y === u.y);
  if (i >= 0) {
    out.item = state.chests[i].item;
    state.chests.splice(i, 1);
    state.log.loot.push(out.item);
  }
  if (state.stairs && state.stairs.x === u.x && state.stairs.y === u.y) {
    out.stairs = true;
    state.result = 'stairs';
  }
  return out;
}

// 페이즈 전환: 끝나는 편 상태 데미지·혼란 → 랭크 만료 → 시작하는 편 잠듦·얼음
export function endPhase(state, rng = Math.random) {
  const ending = state.phase === 'player' ? 'ally' : 'enemy';
  const events = (state.log.statusEvents = []);
  const abilityLog = (state.log.phaseAbilityEvents = []); // 차례 끝·시작 특성 발동 (화면 알림용)
  let W = effectiveWeather(state);
  for (const u of state.units) u.fieldWeather = W;
  for (const u of state.units.filter((o) => o.side === ending)) {
    const r = phaseEnd(u);
    // 포이즌힐: 독이면 피해 대신 1/8 회복, 매직가드: 상태 피해 없음
    if (r.damage && (r.kind === 'poison' || r.kind === 'toxic') && has(u, 'poison-heal')) {
      if (canHeal(u)) u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp / 8))); abilityLog.push({ unitId: u.id, ability: 'poison-heal' }); r.damage = 0;
    }
    if (r.damage && magicGuard(u)) r.damage = 0;
    if (r.damage) {
      const hpBefore = u.hp;
      u.hp = Math.max(0, u.hp - r.damage);
      events.push({ unitId: u.id, kind: r.kind, damage: r.damage, hpBefore, maxHp: u.maxHp, x: u.x, y: u.y });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    if (r.confusionEnded) events.push({ unitId: u.id, kind: 'confusionEnd' });
    if (r.infatuationEnded) events.push({ unitId: u.id, kind: 'infatuationEnd' });
    // 모래바람·싸라기눈 피해 (상태 피해 다음, 보상도 같은 규칙)
    const w = weatherChipImmune(u, W) ? null : phaseEndWeather(u, W);
    if (w) {
      const hpBefore = u.hp;
      u.hp = Math.max(0, u.hp - w.damage);
      events.push({ unitId: u.id, kind: w.kind, damage: w.damage, hpBefore, maxHp: u.maxHp, x: u.x, y: u.y });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    // 특성: 날씨 회복·피해, 가속, 탈피, 촉촉바디
    const hpRate = phaseEndHp(u, W);
    if (hpRate > 0 && u.hp < u.maxHp && canHeal(u)) { u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * hpRate))); abilityLog.push({ unitId: u.id, ability: u.ability }); }
    if (hpRate < 0 && !magicGuard(u)) {
      u.hp = Math.max(0, u.hp - Math.max(1, Math.floor(u.maxHp * -hpRate)));
      abilityLog.push({ unitId: u.id, ability: u.ability, damage: true });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    if (has(u, 'speed-boost')) { applyStageChange(u, 'spe', 1); abilityLog.push({ unitId: u.id, ability: 'speed-boost' }); }
    if (u.slowTurns > 0) u.slowTurns -= 1;
    tickEnd(state, u, events, rng); // 도발·이동 불가 … 턴 감소, 지속 회복·저주
    if (u.hp > 0 && has(u, 'natural-cure') && u.status && !u.ncTouched) { cure(u); events.push({ unitId: u.id, kind: 'naturalCure' }); } // 자연회복: 조용한 한 바퀴
    u.ncTouched = false;
    if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    if (u.status && ((has(u, 'shed-skin') && rng() < 1 / 3) || (has(u, 'hydration') && W === 'rain'))) { cure(u); abilityLog.push({ unitId: u.id, ability: u.ability }); }
  }
  // 나이트메어: 끝나는 편에 있으면 주변 2칸 안 잠든 상대 1/8
  for (const n of state.units.filter((o) => o.side === ending && has(o, 'bad-dreams'))) {
    for (const f of [...state.units]) {
      if (f.side === n.side || f.status !== 'sleep' || dist(f, n) > 2 || magicGuard(f)) continue;
      const hpBefore = f.hp;
      f.hp = Math.max(0, f.hp - Math.max(1, Math.floor(f.maxHp / 8)));
      abilityLog.push({ unitId: n.id, ability: 'bad-dreams', target: f.id, damage: hpBefore - f.hp });
      if (f.hp === 0) { knockOut(state, f, null); events.push({ unitId: f.id, kind: 'fainted' }); }
    }
  }
  for (const u of state.units) if (u.side === ending && u.sealed) u.sealed = false; // 봉인은 그 편 차례 끝에 풀림
  for (const u of state.units) if (u.burrow && u.side !== ending) u.burrow = null; // 숨기: 상대 페이즈가 끝나면 나옴
  tickField(state, ending, events); // 그 편이 놓은 오라·장판·날씨
  W = effectiveWeather(state); // 날씨 부르기가 방금 끝났을 수 있음 (쾌청 녹이기 등)
  checkResult(state);
  state.log.expired = [];
  for (const u of state.units) {
    if (u.side !== ending || !u.turns) continue;
    const keys = tickStages(u);
    if (keys.length) state.log.expired.push({ unitId: u.id, keys });
  }
  state.phase = state.phase === 'player' ? 'enemy' : 'player';
  if (state.phase === 'player') state.turn++;
  const side = state.phase === 'player' ? 'ally' : 'enemy';
  for (const u of state.units) {
    if (u.side !== side) continue;
    u.moved = false; u.acted = false;
    tickStart(u);
    bindCheck(state, u, events); // 속박: 묶은 쪽이 멀어졌으면 풀림
    u.spent = 0; u.retreatReady = false; u.retreated = false; // 치고 빠지기
    if (u.flinch) { u.flinch = false; u.sealed = true; events.push({ unitId: u.id, kind: 'sealed' }); } // 풀죽음 → 이번 차례 기술 봉인
    u.counter = null; // 반격 자세는 다음 자기 차례까지
    if (u.bide && --u.bide.turns <= 0) { // 참기 방출: 모은 피해 2배를 주변 1칸 상대에게
      const dmg = u.bide.stored * 2;
      u.bide = null; u.acted = true; u.moved = true;
      if (dmg > 0) {
        events.push({ unitId: u.id, kind: 'bideRelease' });
        for (const o of state.units.filter((o) => o.side !== u.side && dist(o, u) === 1)) {
          const hpBefore = o.hp, damage = Math.min(o.hp, dmg);
          o.hp -= damage;
          events.push({ unitId: o.id, kind: 'bideHit', damage, hpBefore, maxHp: o.maxHp, x: o.x, y: o.y });
          if (o.hp === 0) { knockOut(state, o, u); events.push({ unitId: o.id, kind: 'fainted' }); }
        }
      } else events.push({ unitId: u.id, kind: 'bideFail' });
    } else if (u.bide) u.sealed = true; // 참는 중: 기술 없이 이동만
    if (u.wish) { u.wish = false; const healed = healPart(u, 0.5); if (healed) events.push({ unitId: u.id, kind: 'wish', healed }); } // 희망사항
    if (u.recharge) { events.push({ unitId: u.id, kind: 'recharge', ...(u.recharge === 'hide' ? { hide: true } : {}) }); u.recharge = false; u.sealed = true; } // 파괴광선류 반동 · 숨기 뒤
    u.intimPrev = u.intimNow ?? []; u.intimNow = []; // 위협: 직전 차례 대상 기억
    u.trapped = state.units.some((o) => o.side !== u.side && dist(o, u) === 1 && traps(o, u)); // 묶기
    if (state.result) continue;
    if (W === 'sun' && u.status === 'freeze') { cure(u); events.push({ unitId: u.id, kind: 'thawed' }); } // 쾌청: 녹는다
    const st = phaseStart(u, rng);
    if (st.event) events.push({ unitId: u.id, kind: st.event });
    if (st.skip) { u.moved = true; u.acted = true; }
    if (u.loafNext) { // 게으름: 잠·얼음 턴은 그대로 흐르고, 이번 차례는 쉰다
      u.loafNext = false; u.moved = true; u.acted = true;
      if (!st.skip) abilityLog.push({ unitId: u.id, ability: 'truant' });
    }
  }
}

export function checkResult(state) {
  if (state.result === 'stairs') return state.result; // 계단 클리어는 덮어쓰지 않음
  if (state.bossFloor && !state.units.some((u) => u.boss)) { state.result = 'win'; return state.result; }
  const enemies = state.units.some((u) => u.side === 'enemy');
  const allies = state.units.some((u) => u.side === 'ally' && !u.bot); // 갸라도스 봇만 남으면 패배
  state.result = !enemies ? 'win' : !allies ? 'lose' : null;
  return state.result;
}

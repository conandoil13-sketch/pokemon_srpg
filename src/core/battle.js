// 전투 상태 (순수 로직, 상태 객체를 직접 갱신)
import { itemOf, itemPhaseEnd, survives } from './items.js';
import { hashIvs, hashGender } from './individual.js';
import { effectiveBase } from './dittoBuild.js';
import { MAP } from '../data/map.js';
import { hash } from '../render/pixels.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { AREA_RADIUS } from '../data/moveTargets.js';
import { BALANCE } from '../data/balance.js';
import { DASH, dashPath } from './dash.js';
import { chainPower, noteChain } from './chainMoves.js';
import { calcDamage, hitChance, confusionDamage, rollHits, terrainCtx } from './damage.js';
import { unitsHit, canTarget, hideDouble, aimsOf, sniperBonus } from './shapes.js';
import { phaseEndWeather, effectiveWeather } from './weather.js';
import { poolDamage } from './pool.js';
import { firesAt, genRange, shockDamage } from './generator.js';
import { ventFires, steamPath, steamDamage, pushEnd, basaltBurn } from './vent.js';
import { wakeAmbush, AMBUSH_MOVE } from './ambush.js';
import { typeEffect, immunity, has, moldBreaker, sheerForce, magicGuard, weatherChipImmune, phaseEndHp, CONTACT_AILMENT, moveTypeOf, WEATHER_SETTER, REDIRECT, SYNC_AILMENTS, traps, airborne } from './abilities.js';
import { newStatus, inflict, cure, checkAction, phaseStart, phaseEnd, infatuate, moveBudget } from './status.js';
import { newStages, applyStageChange, tickStages, API_STAT, STAGE_TURNS, AREA_STAGE_TURNS, effectiveStat } from './stages.js';
import { statsAt, expYield } from './stats.js';
import { tideFor, applyTide } from './tide.js';
import { wispPhase } from './wisp.js';
import { chainKind, chainSpread } from './chain.js';
import { newField, refreshField, tickField, layTraps, stepOn, TRAP_RANGE, FIELD_RADIUS } from './field.js';
import { pathTo, canEnter, reachable, slides } from './pathfind.js';
import { iceBump, icicleDamage, freezeWater } from './ice.js';
import { useWarp } from './warp.js';
import { markExplored } from './vision.js';
import { alertHunt } from './hunt.js';
import { newVolatile, applyEffect, moveBlock, tickEnd, tickStart, moveFor, canHeal, BIND_MOVES, BIND_TURNS, bindCheck, LOCK_TURNS } from './volatile.js';
import { startingMoves } from './learn.js';
import { newParty, abilityOf } from './progress.js';

export const spec = (unit) => SPECIES[unit.species];

// 유닛 = 종족 + 레벨에서 계산한 능력치 + 기술
export function makeUnit({ species, side, x, y, level, moves, id, boss, ambush, ability, types, base, ivs, gender, weight, memberKey, held = null }) {
  // 개체값·성별: 아군은 멤버 값, 적은 위치·레벨로 정해지는 무작위 (같은 층이면 같음). 메타몽은 31·성별 없음
  ivs ??= species === 'ditto' ? null : hashIvs(species, x, y, level);
  if (gender === undefined) gender = hashGender(species, x, y, level);
  const stats = statsAt(base ?? SPECIES[species].base, level, ivs); // base: 메타몽 빌드 종족값
  return {
    id: id ?? `${side}-${species}`, species, side, x, y, level, stats,
    types: [...(types ?? SPECIES[species].types)], // 타입은 유닛 기준 (메타몽 빌드)
    baseSpe: (base ?? SPECIES[species].base).spe, // 이동력용 종족값 스피드 (메타몽 빌드 반영)
    ivs, gender, weight: weight ?? SPECIES[species].weight,
    hp: stats.hp, maxHp: stats.hp,
    moves: moves?.length ? [...moves] : startingMoves(SPECIES[species].learnset, level, MOVES, species),
    moved: false, acted: false,
    healUses: HEAL_USES, // 회복기 (층마다 2번)
    held: side === 'ally' ? held : null, // 지닌 도구 (적은 없음)
    // 특성: 동료는 멤버 값, 적은 위치·레벨로 정해지는 무작위 (같은 층이면 같은 특성)
    ability: ability ?? SPECIES[species].abilities[Math.floor(hash(species, x, y, level) * SPECIES[species].abilities.length)],
    ...newStages(),
    ...newStatus(),
    ...newVolatile(),
    ...(boss ? { boss: true } : {}),
    ...(ambush ? { ambush: 'hidden' } : {}), // 발전소 찌리리공 기습 (core/ambush.js)
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
// 물·풀: 물 칸·수풀 칸에서 차례를 시작하면 그 차례 이동력 +1 (타입별 지형 이득)
export function terrainStart(state, u) {
  const tile = state.grid[u.y]?.[u.x], t = u.types ?? SPECIES[u.species].types;
  u.terrainMove = ((tile === '~' || tile === ',') && t.includes('water')) || (tile === '"' && t.includes('grass')) ? 1 : 0;
}

export function createBattle(mapDef = MAP, party = newParty(), { hpRatio = {} } = {}) {
  const units = [];
  party.slice(0, mapDef.allySlots.length).forEach((m, i) => {
    const { x, y } = mapDef.allySlots[i];
    const build = m.species === 'ditto' && m.build ? { types: m.build.types, base: effectiveBase(m.build), ...(m.build.weight ? { weight: m.build.weight } : {}) } : {}; // 메타몽 빌드
    const u = makeUnit({ species: m.species, side: 'ally', x, y, level: m.level, moves: m.moves, id: uniqueId(units, 'ally', m.species), ability: abilityOf(m), ivs: m.ivs ?? (m.species === 'ditto' ? null : hashIvs(m.species)), gender: m.gender ?? null, memberKey: keyOf(m), held: m.held ?? null, ...build });
    if (hpRatio[keyOf(m)]) u.hp = Math.max(1, Math.floor(u.maxHp * hpRatio[keyOf(m)]));
    units.push(u);
  });
  for (const e of mapDef.enemies) units.push(makeUnit({ ...e, side: 'enemy', id: uniqueId(units, 'enemy', e.species) }));
  for (const u of units) if (u.ambush && !u.moves.includes(AMBUSH_MOVE)) u.moves = [...u.moves.slice(0, 3), AMBUSH_MOVE]; // 기습 찌리리공은 자폭을 꼭 앎
  const state = {
    grid: mapDef.tiles.slice(),
    width: mapDef.tiles[0].length,
    height: mapDef.tiles.length,
    units,
    phase: 'player',
    turn: 1,
    tide: 0, tideCells: mapDef.tide ?? null, // 해변 물때 (core/tide.js)
    result: null,
    log: { exp: {}, fainted: [], loot: [], coins: 0, expired: [], defeated: [] }, // defeated: 캡슐 굴림용 쓰러뜨린 적 // 획득 경험치(동료 열쇠별), 기절한 아군, 연 보물, 격파 코인, 이번 페이즈에 풀린 랭크
    stairs: mapDef.stairs ?? null,
    chests: (mapDef.chests ?? []).map((c) => ({ ...c })),
    generators: (mapDef.generators ?? []).map((g) => ({ ...g })), // 발전소 발전기 (칸 문자 'G')
    vents: (mapDef.vents ?? []).map((v) => ({ ...v })), // 화산동굴 분출구 (칸 문자 'V')
    wisps: (mapDef.wisps ?? []).map((w) => ({ ...w, lit: false, done: false })), // 묘지 혼불 예정표 (core/wisp.js)
    flows: mapDef.flows ? { ...mapDef.flows } : null, // 사막 흐르는 모래 방향 ("x,y" → up/down/left/right)
    piles: (mapDef.piles ?? []).map((p) => ({ ...p })), // 열리지 않은 낙엽더미 (칸 문자 '*')
    warps: (mapDef.warps ?? []).map((w) => ({ ...w, to: { ...w.to } })), // 시티 워프 타일 (core/warp.js)
    bossFloor: units.some((u) => u.boss),
    weather: mapDef.weather ?? null, // 층 날씨 (없으면 null)
    ...(mapDef.dark ? { dark: true, explored: new Set() } : {}), // 깊은 동굴: 어둠 + 탐험 기억 (core/vision.js)
    ...newField(), // 오라 · 장판 · 압정 · 날씨 부르기 (층마다 새로)
  };
  floorStartAbilities(state);
  markExplored(state);
  state.baseWeather = state.weather; // 날씨 부르기가 끝나면 돌아갈 날씨 (날씨 특성 반영 후)
  for (const u of units) u.fieldWeather = effectiveWeather(state); // 날씨 특성(쓱쓱 등)이 처음부터 이동력에 반영
  refreshField(state);
  for (const u of units) terrainStart(state, u);
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
export function moveUnit(state, id, x, y, cost = 0, path = null, opts = {}) {
  const u = byId(state, id);
  const stayed = u.x === x && u.y === y;
  if (!stayed) u.revealed = false; // 악 수풀 숨기: 움직이면 다시 숨을 수 있음
  state.log.trapEvents = [];
  state.log.warp = null; // 압정에 쓰러져 일찍 끝나도 지난 워프가 남지 않게
  if (!stayed && state.spikes?.length) {
    let route = path;
    if (!route) { const p = pathTo(state.grid, state.units, u, x, y); route = p.length > 1 && p.at(-1).x === x && p.at(-1).y === y ? p : [{ x: u.x, y: u.y }, { x, y }]; }
    const hitBy = new Set(); // 한 이동에서 시전자당 압정 1회
    for (const p of route.slice(1)) {
      const evs = stepOn(state, u, p.x, p.y, hitBy);
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
  state.log.iceEvents = [];
  const ice = opts.slide && !stayed && path?.length > 1 && slides(u) ? iceBump(state, u, path, state.log.iceEvents) : null; // 얼음동굴: 걸어서 미끄러진 이동만 부딪힘 (날려버리기 등 강제 이동은 아님)
  const icicle = ice?.icicle ?? null;
  if (ice?.stopAt) ({ x, y } = ice.stopAt);
  if (!stayed && state.grid[u.y][u.x] === '@' && !airborne(u) && !u.burrow) { cost = moveBudget(u); u.pitEscaped = true; } // 사막: 모래지옥 가운데 탈출 = 이동력 전부, 이번 턴엔 다시 안 끌림
  u.spent = (u.spent ?? 0) + cost;
  if (!stayed) u.walked = true; // 줌렌즈
  u.x = x; u.y = y; u.moved = true;
  freezeWater(state, u, path ?? [{ x, y }]); // 얼음 타입: 지나간 물이 빙판으로
  state.log.warp = opts.warp && !stayed ? useWarp(state, u) : null; // 시티: 걸어서 워프 위에서 멈추면 짝 타일로 (아군만)
  markExplored(state); // 깊은 동굴: 새로 본 칸 기억
  wakeAmbush(state); // 발전소: 3칸 안에 들어온 기습 찌리리공은 깨어남
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
  if (icicle && state.units.includes(icicle)) { // 고드름 충돌: 최대 HP 1/8
    const damage = icicleDamage(icicle), hpBefore = icicle.hp;
    icicle.hp = Math.max(0, icicle.hp - damage);
    state.log.iceEvents.push({ kind: 'icicle', unitId: icicle.id, damage, hpBefore, maxHp: icicle.maxHp, x: icicle.x, y: icicle.y });
    if (icicle.hp === 0) { knockOut(state, icicle, null); state.log.iceEvents.push({ kind: 'fainted', unitId: icicle.id }); checkResult(state); }
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
  for (const u of state.units) if (u.side === 'ally' && gained[unitKey(u)] && itemOf(u)?.expMult) gained[unitKey(u)] = Math.floor(gained[unitKey(u)] * itemOf(u).expMult); // 행복의알
  for (const [sp, n] of Object.entries(gained)) state.log.exp[sp] = (state.log.exp[sp] ?? 0) + n;
  return gained;
}

// 쓰러뜨린 상대 없이 기절(상태 데미지·혼란 자해): 살아 있는 아군 전원 공유 비율
function awardShare(state, defender) {
  if (defender.side !== 'enemy') return;
  const full = expYield(SPECIES[defender.species].baseExp, defender.level, BALANCE.expMultiplier);
  for (const u of state.units) {
    if (u.side === 'ally' && !u.bot && u.hp > 0) state.log.exp[unitKey(u)] = (state.log.exp[unitKey(u)] ?? 0) + Math.floor(full * BALANCE.shareRatio * (itemOf(u)?.expMult ?? 1)); // 행복의알
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
  if (by && by.side !== d.side) by.felled = { ...by.felled, [d.side]: true }; // 원수갚기: 우리 편을 쓰러뜨린 상대
  if (by && by.side !== d.side && state.units.includes(by) && has(by, 'moxie')) { if (moxieQueue) moxieQueue.push(by); else applyStageChange(by, 'atk', 1); (state.log.abilityEvents ??= []).push({ unitId: by.id, ability: 'moxie' }); } // 자기과신
  let expGained = {};
  if (by) { if (!deferExp) expGained = awardExp(state, by, d); } // deferExp: 공격이 끝난 뒤 호출 측이 지급
  else if (reward) awardShare(state, d);
  if (reward && d.side === 'enemy' && (!by || by.side === 'ally')) {
    state.log.coins += 3 + Math.floor(d.level / 3);
    (state.log.defeated ??= []).push({ species: d.species, types: [...d.types], moves: [...d.moves], ability: d.mummyFrom ?? d.suppressedAbility ?? d.ability, boss: !!d.boss }); // 메타몽 캡슐 (위액으로 꺼졌거나 미라가 됐으면 원래 특성)
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
    out.push({ unitId: unit.id, key, change: r.change || change, applied: r.applied, after: r.after }); // 심술꾸러기면 뒤집힌 방향 (막혀 0이면 원래 방향)
    if (fromOther && r.applied < 0 && has(unit, 'defiant')) { const d = applyStageChange(unit, 'atk', 2, turns); out.push({ unitId: unit.id, key: 'atk', change: 2, applied: d.applied, after: d.after }); } // 오기
  }
  if (itemOf(unit)?.whiteHerb && !unit.whiteUsed && Object.values(unit.stages ?? {}).some((n) => n < 0)) { // 하얀허브: 떨어진 랭크 되돌림 (층마다 1번)
    for (const k of Object.keys(unit.stages)) if (unit.stages[k] < 0) {
      unit.layers = (unit.layers ?? []).filter((l) => !(l.key === k && l.amount < 0));
      const ls = unit.layers.filter((l) => l.key === k); unit.stages[k] = Math.max(-6, Math.min(6, ls.reduce((s, l) => s + l.amount, 0))); unit.turns[k] = ls.reduce((m, l) => Math.max(m, l.turns), 0);
    }
    unit.whiteUsed = true; itemLog?.push({ unitId: unit.id, item: unit.held });
  }
}
let itemLog = null; // 지금 기술의 특성·도구 알림 (applyMove 가 맞춤)
let moxieQueue = null; // 자기과신: 범위기 도중 쓰러뜨려도 기술이 끝난 뒤 +1 (다음 대상부터 세지지 않게)

// 피뢰침·마중물: 주변 2칸 안의 대상을 노린 단일 전기/물 기술을 끌어온다 (아군·적 모두, 사거리·편 무시).
// 끌어온 유닛(대상이 원래 그 유닛이면 null)을 돌려준다. 화면도 연출 대상을 정할 때 쓴다
export const FOLLOW_RANGE = 3, TELEPORT_RANGE = [1, 4];
// 순간이동으로 갈 수 있는 칸: 반경 1~4, 들어갈 수 있고 빈 칸 (계단·상자·상대 압정 칸 제외)
export function teleportSpots(state, u) {
  const out = [];
  for (let y = u.y - 4; y <= u.y + 4; y++) for (let x = u.x - 4; x <= u.x + 4; x++) {
    const d = Math.abs(x - u.x) + Math.abs(y - u.y), tile = state.grid[y]?.[x];
    if (d < TELEPORT_RANGE[0] || d > TELEPORT_RANGE[1] || tile === undefined || tile === '#' || tile === '>' || !canEnter(tile, u)) continue;
    if (state.units.some((o) => o.x === x && o.y === y) || (state.chests ?? []).some((c) => c.x === x && c.y === y) || (state.spikes ?? []).some((t) => t.x === x && t.y === y && t.side !== u.side)) continue; // 상대 압정 칸도 제외
    out.push({ x, y });
  }
  return out;
}

export function redirectTarget(state, userId, moveId, aim) {
  if (!(typeof aim === 'string' || aim?.unitId)) return null;
  const mv = MOVES[moveId], user = byId(state, userId), tgt = byId(state, typeof aim === 'string' ? aim : aim.unitId);
  if (!user || !tgt || (mv.shape?.type ?? 'single') !== 'single' || moldBreaker(user)) return null;
  if (mv.category === 'status' && mv.kind === 'self') return null;
  const follow = state.units.filter((o) => o.followMe && o.hp > 0 && o.side !== user.side && dist(o, user) <= FOLLOW_RANGE).sort((p, q) => dist(p, user) - dist(q, user))[0]; // 날따름이 먼저
  if (follow) return follow !== tgt ? follow : null;
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
const SUPPORT = new Set(['batonPass', 'refresh', 'teamCure', 'wish', 'stockpile', 'swallow', 'sacrificeHeal', 'memento', 'painSplit', 'bellyDrum', 'acupressure', 'psychUp', 'powerSwap', 'guardSwap', 'heartSwap', 'psychoShift', 'nightmare', 'teeterDance', 'splash']);
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
    case 'batonPass': { // 배턴터치: 자리를 바꾸고 내 랭크 변화를 그 아군에게 (나는 원래대로). 뿌리박기·속박이면 실패
      if (t === a || t.side !== a.side || a.rooted || t.rooted || a.bound || t.bound || !canEnter(state.grid[a.y][a.x], t) || !canEnter(state.grid[t.y][t.x], a)) return res(false);
      const keys = [...new Set((a.layers ?? []).map((l) => l.key))];
      for (const k of keys) {
        t.layers = (t.layers ?? []).concat(a.layers.filter((l) => l.key === k).map((l) => ({ ...l })));
        a.layers = a.layers.filter((l) => l.key !== k);
        for (const u of [a, t]) { const ls = u.layers.filter((l) => l.key === k); u.stages[k] = Math.max(-6, Math.min(6, ls.reduce((s, l) => s + l.amount, 0))); u.turns[k] = ls.reduce((m, l) => Math.max(m, l.turns), 0); }
      }
      const from = { x: a.x, y: a.y };
      a.x = t.x; a.y = t.y; t.x = from.x; t.y = from.y; refreshField(state);
      return res(true, { swapped: { a: a.id, t: t.id, from, to: { x: a.x, y: a.y } }, passed: keys });
    }
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

// 밀려날 길: 막힌 칸·포켓몬 앞에서 멈춤. 협곡: 고지끼리·고지 → 저지는 밀림, 저지 → 고지는 막힘, 못 뜨는 포켓몬은 낭떠러지 칸으로 떨어짐(fall)
// 협곡: 낭떠러지 칸 위에 있을 수 없게 된 포켓몬은 떨어져 기절 (보스는 버팀). 반환 = [{unitId, x, y}]
function chasmFalls(state) {
  const out = [];
  for (const u of [...state.units]) if (state.grid[u.y]?.[u.x] === 'X' && !u.boss && !canEnter('X', u)) { out.push({ unitId: u.id, x: u.x, y: u.y }); knockOut(state, u, null); }
  return out;
}
function pushPath(state, a, t) {
  const dx = t.x - a.x, dy = t.y - a.y;
  const [sx, sy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy)];
  const path = [{ x: t.x, y: t.y }];
  for (let i = 0; i < PUSH_TILES; i++) {
    const p = path.at(-1), nx = p.x + sx, ny = p.y + sy, tile = state.grid[ny]?.[nx];
    if (state.units.some((u) => u !== t && u.x === nx && u.y === ny)) break;
    if (tile === 'X' && !canEnter('X', t)) { path.push({ x: nx, y: ny }); return { path, fall: true }; }
    if (!(tile === 'H' && state.grid[p.y][p.x] === 'H') && !canEnter(tile, t)) break;
    path.push({ x: nx, y: ny });
  }
  return { path, fall: false };
}
// 드래곤테일: 맞힌 뒤 울부짖기처럼 밀어냄 · 배대뒤치기: 시전자를 넘어 반대편 한 칸 (막혔으면 피해만, 낭떠러지면 떨어짐)
function dragonTail(state, a, d) {
  const tmp = {};
  if (!pushAway(state, a, d, tmp, { deferExp: true }).ok || !tmp.pushed) return null;
  const p = tmp.pushed;
  return { unitId: d.id, from: p.from, to: p.to, ...(p.fainted ? { fainted: true } : {}), ...(p.fell ? { fell: true } : {}), trapEvents: tmp.trapEvents ?? [] };
}
function circleThrow(state, a, d) {
  if (pushImmune(d)) return null;
  const x = 2 * a.x - d.x, y = 2 * a.y - d.y, tile = state.grid[y]?.[x];
  if (tile === undefined || state.units.some((u) => u !== d && u.x === x && u.y === y)) return null;
  const fall = tile === 'X' && !canEnter('X', d);
  if (!fall && !canEnter(tile, d)) return null;
  const from = { x: d.x, y: d.y };
  moveUnit(state, d.id, x, y, 0);
  const fell = fall && state.units.includes(d);
  if (fell) { knockOut(state, d, a, { deferExp: true }); checkResult(state); }
  return { unitId: d.id, from, to: { x, y }, ...(fell || !state.units.includes(d) ? { fainted: true } : {}), ...(fell ? { fell: true } : {}) };
}
const pushImmune = (t) => t.boss || t.rooted || has(t, 'suction-cups');
// 예상 창용: 밀리면 어디로 가나 · 떨어지나
export function pushPreview(state, a, t) {
  if (pushImmune(t)) return { to: null, fall: false };
  const { path, fall } = pushPath(state, a, t);
  return { to: path.length > 1 ? path.at(-1) : null, fall };
}

function pushAway(state, a, t, out, { deferExp = false } = {}) {
  const res = (ok, reason) => ({ unitId: t.id, effect: 'push', ok, ...(reason ? { reason } : {}) });
  if (pushImmune(t)) return res(false, 'immune'); // 흡반: 밀리지 않음
  const { path, fall } = pushPath(state, a, t);
  if (path.length === 1) return res(false, 'stuck');
  const from = path[0], to = path.at(-1);
  Object.assign(t, newStages());
  moveUnit(state, t.id, to.x, to.y, 0, path);
  const end = { x: t.x, y: t.y }, spiked = !state.units.includes(t); // 압정에 쓰러지면 그 칸에서 멈춤
  const fell = fall && !spiked && end.x === to.x && end.y === to.y; // 협곡: 낭떠러지로 떨어짐 = 기절 (밀어낸 쪽이 쓰러뜨림)
  if (fell) { knockOut(state, t, a, { deferExp }); checkResult(state); }
  out.pushed = { unitId: t.id, from, to: end, path: path.slice(0, path.findIndex((p) => p.x === end.x && p.y === end.y) + 1), ...(spiked || fell ? { fainted: true } : {}), ...(fell ? { fell: true } : {}) };
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
export const CHARGE_MOVES = new Set(['solar-beam', 'razor-wind', 'skull-bash', 'sky-attack', 'focus-punch']); // 힘껏펀치: 한 턴 집중 (그 사이 맞으면 풀림) // 모으고 다음 차례 발사
export const STREAK_MAX = { 'fury-cutter': [2, false], // 연속자르기: 9세대 40 → 80 → 160 (상한 160)
  rollout: [4, true], 'ice-ball': [4, true] }; // [최대 단계, 다섯 번째 뒤 처음으로]
export const RAMPAGE_MOVES = new Set(['outrage', 'petal-dance', 'thrash']); // 처음 대상을 2~3번 쫓아가 때리고 혼란
export const UPROAR_TURNS = 3;
// 소란피기 2칸 안: 못 잠듦 (status.canInflict · 잠자기가 이 표시를 읽음)
export function markUproar(state) {
  for (const u of state.units) u.uproarZone = state.units.some((o) => o.uproar > 0 && Math.abs(o.x - u.x) + Math.abs(o.y - u.y) <= 2);
}
// 따라가때리기: 맞은 포켓몬이 자기 차례에 쫓는 쪽에서 멀어지는 칸으로 걸으려 하면, 걷기 전에 같은 위력으로 한 번 (한 번만)
export function pursuitStrike(state, unit, to, rng) {
  const by = unit.pursuedBy && byId(state, unit.pursuedBy);
  const mine = (state.phase === 'player' ? 'ally' : 'enemy') === unit.side;
  if (!by || !mine || !state.units.includes(unit)) return null;
  if (dist(to, by) <= dist(unit, by)) return null;
  unit.pursuedBy = null;
  const keep = { acted: by.acted, moved: by.moved, spent: by.spent, raging: by.raging, streak: by.streak, retreatReady: by.retreatReady };
  const r = applyMove(state, by.id, 'pursuit', unit.id, rng);
  Object.assign(by, keep); // 쫓는 쪽 차례 상태는 그대로
  unit.pursuedBy = null;
  return r;
}
export const DELAYED_MOVES = new Set(['future-sight', 'doom-desire']); // 두 턴 뒤에 떨어짐
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
  const spots = [...reachable(state.grid, state.units, unit, unit.rampage ? null : Infinity)].sort((p, q) => p[1] - q[1]); // 난동은 평소 이동력으로 쫓아감
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
const NO_BOUNCE = new Set(['memento']); // 되돌리지 않는 변화기 (추억의선물: 쓰는 쪽이 쓰러지는 기술)
// 매직미러: 그 칸(또는 유닛) 자신이나 상하좌우에 있는 같은 편 보유자
function magicBouncer(state, t) {
  return state.units.find((h) => h.side === t.side && h.hp > 0 && Math.abs(h.x - t.x) + Math.abs(h.y - t.y) <= 1 && has(h, 'magic-bounce')) ?? null;
}

// 주변·전장을 보는 특성 플래그 (데미지 계산이 읽음): 애널라이즈 = 전장에서 가장 느림(공동 포함), 프렌드가드 = 상하좌우 다른 아군 보유자 수
export function refreshAbilityFlags(state) {
  for (const u of state.units) {
    u.analyticActive = has(u, 'analytic') && state.units.every((o) => o === u || speedOf(o) >= speedOf(u));
    u.friendGuards = state.units.filter((o) => o !== u && o.side === u.side && dist(o, u) === 1 && has(o, 'friend-guard')).length;
  }
}

export function applyMove(state, userId, moveId, aim, rng) {
  const outer = moxieQueue;
  moxieQueue = [];
  try { return runMove(state, userId, moveId, aim, rng); } finally {
    const q = moxieQueue;
    moxieQueue = outer;
    for (const by of q) if (state.units.includes(by)) applyStageChange(by, 'atk', 1);
  }
}

function runMove(state, userId, moveId, aim, rng) {
  const W = effectiveWeather(state); // 에어록·날씨부정 반영
  for (const u of state.units) u.fieldWeather = W; // 쓱쓱·엽록소 등 스피드·이동력 특성용
  refreshField(state);
  // 플러스·마이너스 / 플라워기프트: 옆 동료를 보고 켠다 (데미지 계산이 읽음)
  const nextTo = (u, pred) => state.units.some((o) => o !== u && o.side === u.side && dist(o, u) === 1 && pred(o));
  for (const u of state.units) {
    u.plusActive = (has(u, 'plus') || has(u, 'minus')) && nextTo(u, (o) => has(o, 'plus') || has(o, 'minus'));
    u.flowerActive = W === 'sun' && (has(u, 'flower-gift') || nextTo(u, (o) => has(o, 'flower-gift')));
  }
  refreshAbilityFlags(state);
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
  if (itemOf(a)?.choice && !a.choiceLock) a.choiceLock = moveId; // 구애: 그 층 첫 기술로 고정
  if (itemOf(a)?.metronome) { a.metroStreak = a.metroMove === moveId ? (a.metroStreak ?? 0) + 1 : 0; a.metroMove = moveId; } // 메트로놈: 연속 사용 (막힌 기술은 위에서 돌아가 안 셈)
  a.moved = true;
  if (a.streak && a.streak.moveId !== moveId) a.streak = null; // 다른 기술을 쓰면 연속이 끊김
  a.raging = moveId === 'rage'; // 분노: 분노를 쓰는 동안만
  if (moveId === 'uproar' && !(a.uproar > 0)) a.uproar = UPROAR_TURNS; // 소란피기: 자기 차례 3번
  markUproar(state);
  if (move.id === 'charge') a.charged = 2; // 충전: 다음 자기 차례까지 전기 공격 한 번 2배
  if (move.kind === 'enemy' || move.kind === 'enemies') a.revealed = true; // 악 수풀 숨기: 상대를 노린 기술(변화기 포함)을 쓰면 드러남
  const stageChanges = [], statusChanges = [], thawed = [];
  const kind = move.category === 'status' ? 'status' : 'attack';
  const abilityEvents = (state.log.abilityEvents = []); // 이번 기술에서 발동한 특성 (연출용)
  itemLog = abilityEvents;
  state.log.unbound = []; // 이번 기술로 쓰러진 묶은 쪽 → 풀린 속박
  state.log.bonded = []; // 이번 기술에서 길동무로 같이 쓰러진 유닛
  const breaker = moldBreaker(a); // 틀깨기·테라볼티지·터보블레이즈: 상대의 방어 특성(클리어바디·유연·습기 …) 무시
  // 특성 흡수 결과 적용: 회복·랭크·타오르는불꽃
  const absorb = (u, ab) => {
    if (ab.heal && canHeal(u)) u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * ab.heal)));
    if (ab.boost) for (const [k, v] of Object.entries(ab.boost)) changeStats(u, [{ stat: Object.keys(API_STAT).find((s) => API_STAT[s] === k), change: v }], stageChanges);
    if (ab.flashFire) u.flashFire = true;
    abilityEvents.push({ unitId: u.id, ability: ab.ability });
  };
  const ail = (t, src = a) => { // src: 매직미러로 되돌렸으면 보유자
    if (!move.ailment) return;
    if (move.ailment === 'infatuation') { statusChanges.push({ unitId: t.id, ailment: 'infatuation', ...infatuate(t, src, { breaker: src === a && breaker }) }); return; } // 메로메로
    const r = inflict(t, move.ailment, rng, move, W, { breaker: t !== src && src === a && breaker });
    statusChanges.push({ unitId: t.id, ailment: move.ailment, ...r });
    // 싱크로: 독·마비·화상을 건 상대에게도
    if (r.ok && has(t, 'synchronize') && t !== src && SYNC_AILMENTS.includes(move.ailment)) {
      const back = inflict(src, move.ailment, rng, null, W);
      statusChanges.push({ unitId: src.id, ailment: move.ailment, ...back });
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
  if (SELF_KO.includes(move.id) && !breaker && state.units.some((u) => u !== a && has(u, 'damp') && dist(u, a) <= 2)) {
    abilityEvents.push({ unitId: state.units.find((u) => u !== a && has(u, 'damp') && dist(u, a) <= 2).id, ability: 'damp' });
    noteChain(state, a, move, false); // 막힌 기술도 크로스 연계는 끊김
    return { kind, blocked: 'damp', stageChanges, statusChanges, thawed, missed: [], abilityEvents };
  }

  // 끌어왔으면 그 유닛이 무효로 흡수하고 특공 +1 (명중 판정 없음)
  if (rod) {
    noteChain(state, a, move, false);
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

  if (move.effect === 'teleport') { // 순간이동: 고른 빈 칸으로 바로 (지나가는 칸은 밟지 않음)
    const ok = aim && teleportSpots(state, a).some((p) => p.x === aim.x && p.y === aim.y);
    const from = { x: a.x, y: a.y };
    if (ok) { a.x = aim.x; a.y = aim.y; refreshField(state); }
    return { kind, stageChanges, statusChanges, thawed, missed: [], abilityEvents, effects: [{ unitId: a.id, effect: 'teleport', ok: !!ok, from, to: ok ? { x: aim.x, y: aim.y } : from, ...(ok ? {} : { reason: 'range' }) }], protectedIds: [] };
  }
  if (kind === 'status' && move.aimTile) { // 압정: 칸 조준 (사거리 1~3)
    const ok = aim && aim.x !== undefined && state.grid[aim.y]?.[aim.x] !== undefined && dist(a, aim) >= TRAP_RANGE[0] && dist(a, aim) <= TRAP_RANGE[1];
    const mirror = ok && !breaker ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => magicBouncer(state, { x: aim.x + dx, y: aim.y + dy, side: a.side === 'ally' ? 'enemy' : 'ally' })).find(Boolean) : null;
    if (mirror) abilityEvents.push({ unitId: mirror.id, ability: 'magic-bounce', target: a.id }); // 매직미러: 시전자 주변으로 (보유자 편 압정)
    const r = !ok ? { ok: false, tiles: [] } : mirror ? layTraps(state, mirror, move.effect, { x: a.x, y: a.y }) : layTraps(state, a, move.effect, aim);
    return { kind, stageChanges, statusChanges, thawed, missed: [], abilityEvents, effects: [{ unitId: a.id, effect: move.effect, ok: r.ok, ...(ok ? {} : { reason: 'range' }) }], protectedIds: [], trapsLaid: r.tiles };
  }
  if (kind === 'status') {
    const missed = [], effects = [], protectedIds = [], out2 = {}; // out2: 밀어내기 pushed · 흑안개 hazed
    const acc = { ...move, accuracy: move.accuracy ?? 100 };
    let bounced = false;
    for (let t of targetsOf(state, a, move, focusId ? byId(state, focusId) : null)) {
      let src = a; // 매직미러로 되돌리면 시전자 = 보유자, 대상 = 원래 시전자
      const mirror = !breaker && t.side !== a.side && !NO_BOUNCE.has(move.id) ? magicBouncer(state, t) : null;
      if (mirror) {
        if (bounced) continue; // 한 기술은 한 번만 되돌림 (나머지 보호받는 대상은 조용히 아무 일 없음)
        bounced = true;
        abilityEvents.push({ unitId: mirror.id, ability: 'magic-bounce', target: a.id });
        src = mirror; t = a;
      }
      if (t !== src && t.guard === 'protect') { protectedIds.push(t.id); continue; } // 방어: 다른 유닛의 기술을 막음
      const ab = t.side !== src.side ? immunity(src, t, move) : null; // 축전에 전기자석파 등
      if (ab) { absorb(t, ab); continue; }
      if (t.side !== src.side && !(rng() * 100 < hitChance(src, t, acc, state.grid[t.y][t.x], W, terrainCtx(state, src, t)))) { missed.push(t.id); continue; }
      if (move.id === 'captivate' && !(t.gender && src.gender && t.gender !== src.gender)) { statusChanges.push({ unitId: t.id, ailment: null, ok: false, reason: 'immune' }); continue; } // 유혹: 반대 성별만
      if (move.effect === 'push') { effects.push(pushAway(state, src, t, out2)); continue; } // 울부짖기·날려버리기
      if (SUPPORT.has(move.effect)) { effects.push(supportEffect(state, src, t, move, rng, stageChanges, statusChanges, out2)); continue; } // 회복·상태 조작
    if (move.effect === 'haze') { // 흑안개: 주변 2칸 모두 (자신 포함) 랭크 초기화
      out2.hazed = state.units.filter((u) => dist(u, a) <= 2).map((u) => { Object.assign(u, newStages()); return u.id; });
      effects.push({ unitId: a.id, effect: 'haze', ok: true });
      continue;
    }
    if (move.effect) { effects.push(applyEffect(state, src, t, move, rng, W)); continue; } // 포켓몬에 붙는 효과
      changeStats(t, move.statChanges ?? [], stageChanges, move.area ? AREA_STAGE_TURNS : STAGE_TURNS, t !== src, t !== src && breaker);
      ail(t, src);
    }
    noteChain(state, a, move, false); // 크로스 연계는 끊김
    let selfFainted = null;
    if (a.hp === 0 && state.units.includes(a)) { knockOut(state, a, null, { reward: false }); checkResult(state); selfFainted = a.id; } // 고스트 저주로 쓰러짐
    return { kind, stageChanges, statusChanges, thawed, missed, abilityEvents, effects, protectedIds, ...out2, ...(selfFainted ? { selfFainted } : {}) };
  }
  a.revealed = true; // 악 수풀 숨기: 공격기를 쓰면 드러남 (다음 이동까지)
  const ranged = RANGED_CHARGE.has(move.id) && a.charging?.moveId === move.id ? byId(state, a.charging.targetId) : null; // 원거리 준비 기술 발사: 기억한 대상만
  const targets = ranged ? (canTarget(move, ranged) ? [ranged] : []) : unitsHit(state, a, move, typeof aim === 'string' ? { unitId: aim } : aim ?? { self: true });
  // 미래예지·파멸의소원: 지정한 포켓몬에게 두 턴 뒤 (그 사이 옮겨 가도) — 쓴 순간의 능력으로
  if (DELAYED_MOVES.has(move.id)) {
    const t = targets.find((d) => d.side !== a.side) ?? null;
    if (t) (state.delayed ??= []).push({ moveId: move.id, byId: a.id, side: a.side, targetId: t.id, turns: 2, snap: { ...a, stats: { ...a.stats }, stages: { ...a.stages } } });
    return { kind: 'attack', foreseen: t ? { unitId: t.id, moveId: move.id } : null, hits: [], expGained: {}, stageChanges, statusChanges, thawed, selfKO: false, abilityEvents, drained: 0, recoil: 0, crash: 0, screensBroken: [], spun: null, flinched: [], bound: [], retreat: false, bond: [], ...(t ? {} : { empty: true }) };
  }
  // 준비 기술: 처음 쓰면 모으기만 (솔라빔은 쾌청이면 바로). 같은 기술을 모아 둔 상태면 발사
  if (move.id === 'spit-up' && !(a.stockpile > 0)) return { kind, blocked: 'nostock', stageChanges: [], statusChanges: [], thawed: [], missed: [], abilityEvents: [] }; // 토해내기: 비축 없음
  if (CHARGE_MOVES.has(move.id) && a.charging?.moveId !== move.id && !(move.id === 'solar-beam' && W === 'sun')) {
    const foe = targets.filter((d) => d.side !== a.side).sort((p, q) => dist(p, a) - dist(q, a))[0] ?? (focusId ? byId(state, focusId) : null); // 가장 가까운 상대
    a.charging = { moveId: move.id, targetId: foe?.id ?? null };
    if (move.id === 'skull-bash') changeStats(a, [{ stat: 'defense', change: 1 }], stageChanges); // 로켓박치기: 모을 때 방어 +1
    return { kind: 'attack', charged: { ...a.charging }, hits: [], expGained: {}, stageChanges, statusChanges, thawed, selfKO: false, abilityEvents, drained: 0, recoil: 0, crash: 0, screensBroken: [], spun: null, flinched: [], bound: [], retreat: false, bond: [] };
  }
  if (a.charging?.moveId === move.id) a.charging = null;
  // 대시: 곧게 달려가 대상 앞 칸에서 때림 (이동력은 안 씀, 지나는 압정은 밟음)
  let dashed = null;
  const dashTo = DASH[move.id] ? targets.find((d) => d.side !== a.side) : null;
  const dp = dashTo && dist(a, dashTo) > (DASH[move.id].reach ?? 1) ? dashPath(state, a, move, dashTo) : null;
  if (dp) {
    const from = { x: a.x, y: a.y }, end = dp.at(-1);
    moveUnit(state, a.id, end.x, end.y, 0, dp);
    dashed = { unitId: a.id, from, to: { x: a.x, y: a.y } };
    if (!state.units.includes(a)) return { kind: 'attack', dashed, hits: [], expGained: {}, stageChanges, statusChanges, thawed, selfKO: false, abilityEvents, drained: 0, recoil: 0, crash: 0, screensBroken: [], spun: null, flinched: [], bound: [], retreat: false, bond: [], trapEvents: [...(state.log.trapEvents ?? [])] }; // 압정에 쓰러짐
  }
  const cp = chainPower(state, a, move), base = cp === move.power ? move : { ...move, power: cp }; // 돌림노래·에코보이스·크로스플레임/썬더
  let dmgMove = a.helped && base.power ? { ...base, power: base.power * 1.5 } : base; // 도우미: 다음 공격 한 번
  if (a.charged && move.power) { if (moveTypeOf(a, move) === 'electric') dmgMove = { ...dmgMove, power: dmgMove.power * 2 }; a.charged = 0; } // 충전: 다음 공격 하나 (전기면 2배)
  a.allMovesUsed = state.units.filter((u) => u.side === a.side).every((u) => (u.moves ?? []).every((m) => u.usedMoves?.has(m))); // 마지막수단
  if (move.varPower === 'magnitude') { const r = rng() * 100; dmgMove = { ...dmgMove, varPower: null, power: r < 5 ? 10 : r < 15 ? 30 : r < 35 ? 50 : r < 65 ? 70 : r < 85 ? 90 : r < 95 ? 110 : 150 }; } // 매그니튜드 4~10
  let presentHeal = false;
  if (move.varPower === 'present') { const r = rng() * 100; if (r < 20) presentHeal = true; else dmgMove = { ...dmgMove, varPower: null, power: r < 60 ? 40 : r < 90 ? 80 : 120 }; } // 프레젠트: 20% 회복, 40% 40, 30% 80, 10% 120
  if (has(a, 'reckless') && dmgMove.power && (move.drain < 0 || CRASH_MOVES.has(move.id))) dmgMove = { ...dmgMove, power: dmgMove.power * 1.2 }; // 이판사판: 반동기 1.2배
  if (ranged && dmgMove.power) dmgMove = { ...dmgMove, power: dmgMove.power * Math.max(0, 1 - RANGE_FALLOFF * Math.max(0, dist(a, ranged) - move.range[1])) }; // 사거리 밖
  if (itemOf(a)?.metronome && dmgMove.power) dmgMove = { ...dmgMove, power: dmgMove.power * Math.min(2, 1 + itemOf(a).metronome * (a.metroStreak ?? 0)) }; // 메트로놈
  a.helped = false;
  if (RECHARGE_MOVES.has(move.id)) a.recharge = true; // 파괴광선류: 기술이 나갔으면 다음 차례 반동
  const spread = targets.length >= 2 ? 0.75 : 1;
  const roll = (chance) => !chance || rng() * 100 < chance * (has(a, 'serene-grace') ? 2 : 1); // 확률 0 = 100%, 하늘의은총 2배
  const hits = [], expGained = {}, knocked = [];
  let anyLanded = false;
  const contactBase = move.category === 'physical';
  const breaksDef = moldBreaker(a), sheer = sheerForce(a, move); // 우격다짐: 부가효과 없음
  let dealt = 0; // 실제로 깎인 HP 합 (흡수·반동 기준)
  const flinched = [], bound = [], screensBroken = [], woken = [], lostFocus = [];
  let countered = null, tossed = null; // 드래곤테일·배대뒤치기
  if (targets.length && move.power) a.ncTouched = true; // 자연회복: 공격함
  const flinchChance = move.flinchChance || (has(a, 'stench') && move.power ? STENCH_FLINCH : 0) || (itemOf(a)?.flinch && move.power ? itemOf(a).flinch : 0); // 악취·왕의징표석: 풀죽음 10%
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
        : calcDamage(a, d, hideDouble(move, d) ? { ...dmgMove, power: dmgMove.power * 2 } : move.id === 'triple-kick' ? { ...dmgMove, power: dmgMove.power * (k + 1) } : dmgMove, { rng, defTile: state.grid[d.y][d.x], spread, weather: W, forceHit: k > 0 && move.id !== 'triple-kick', ...terrainCtx(state, a, d) }); // 트리플킥: 10·20·30, 타마다 명중
      if (move.id === 'triple-kick' && k > 0 && !r.hit) break;
      if (r.absorbed) absorb(d, r.absorbed);
      if (r.damage > 0 && d !== a && has(d, 'pressure') && (d.pressureUsed ?? 0) < PRESSURE_SHIELD) { d.pressureUsed = (d.pressureUsed ?? 0) + 1; r.damage = 0; r.shielded = true; } // 프레셔: 층마다 타격 2회 막음
      if (r.damage > 0) { d.ncTouched = true; d.revealed = true; alertHunt(state, d, a); d.hurtThisPhase = true; if (d !== a) d.lastHitBy = a.id; } // 승부굳히기·리벤지 판정용
      if (r.damage > 0 && d !== a && d.raging && d.hp > 0) changeStats(d, [{ stat: 'attack', change: 1 }], stageChanges); // 분노: 맞을 때마다 공격 +1
      if (r.damage > 0 && d !== a && d.charging?.moveId === 'focus-punch') { d.charging = null; lostFocus.push(d.id); } // 힘껏펀치: 집중 중 맞으면 풀림 // 자연회복: 맞음 · 악 숨기: 맞으면 드러남 · 깊은 동굴: 어둠 속에서 맞으면 쫓아옴
      if (r.damage > 0 && d.bide && d !== a) d.bide.stored += Math.min(r.damage, d.hp); // 참기: 받은 피해 모음
      d.hp = Math.max(0, d.hp - r.damage);
      const endured = d.hp === 0 && d.guard === 'endure' && r.damage > 0; // 버티기: 공격으로는 1 남김
      if (endured) d.hp = 1;
      if (d.hp === 0 && move.id === 'false-swipe' && r.damage > 0) d.hp = 1; // 칼등치기: 최소 1 남김
      // 옹골참: HP 가득에서 한 방이면 1 남김 (한 층 한 번, 연속 공격은 첫 타만)
      if (k === 0 && d.hp === 0 && hpBefore === d.maxHp && has(d, 'sturdy') && !d.sturdyUsed && !breaksDef) { d.hp = 1; d.sturdyUsed = true; abilityEvents.push({ unitId: d.id, ability: 'sturdy' }); }
      if (d.hp === 0 && r.damage > 0 && d !== a) { const sv = survives(d, hpBefore, rng); if (sv) { d.hp = 1; abilityEvents.push({ unitId: d.id, item: d.held, survived: sv }); } } // 기합의띠·기합의머리띠
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
      else if (move.wakes && r.damage > 0 && d.status === move.wakes) { cure(d); woken.push({ unitId: d.id, ailment: move.wakes }); } // 잠깨움뺨치기·정신차리기: 때리고 풀어 줌
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
        if (has(a, 'poison-touch') && !fainted && !d.status && rng() * 100 < 30) { const res = inflict(d, 'poison', rng, null, W); statusChanges.push({ unitId: d.id, ailment: 'poison', ...res }); if (res.ok) abilityEvents.push({ unitId: a.id, ability: 'poison-touch' }); } // 독수
        if (has(d, 'mummy') && a.ability !== 'mummy' && !a.boss) { a.mummyFrom ??= a.ability; a.ability = 'mummy'; abilityEvents.push({ unitId: d.id, ability: 'mummy' }); } // 미라: 메인 특성만
        const recoil = has(d, 'rough-skin') || has(d, 'iron-barbs') ? 1 / 8 : fainted && has(d, 'aftermath') && !state.units.some((u) => has(u, 'damp')) ? 1 / 4 : 0;
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
    if (landed && !fainted && !dust && !sheer && move.effectKind === 'damage-lower' && move.statChanges?.length && roll(move.statChance)) changeStats(d, move.statChanges, stageChanges, move.area ? AREA_STAGE_TURNS : STAGE_TURNS, true, breaksDef);
    if (landed && !fainted && !dust && !sheer && move.ailment && roll(move.ailmentChance)) ail(d);
    // 풀죽음: 다음 자기 차례 기술 봉인 (정신력·보스 면역, 봉인 중 재풀죽음 없음, 속이다는 대상마다 한 층 한 번)
    if (landed && !fainted && !dust && !sheer && flinchChance && !d.flinch && !d.sealed && !d.boss && !(has(d, 'inner-focus') && !breaksDef)
      && !(move.id === 'fake-out' && d.fakedOut) && roll(flinchChance)) {
      d.flinch = true;
      if (has(d, 'steadfast')) changeStats(d, [{ stat: 'speed', change: 1 }], stageChanges); // 불굴의마음: 풀죽으면 스피드 +1
      if (move.id === 'fake-out') d.fakedOut = true;
      flinched.push(d.id);
    }
    if (landed && !fainted && last?.damage > 0 && BIND_MOVES.has(move.id) && !d.bound && state.units.includes(a)) { // 속박기
      d.bound = { by: a.id, moveId: move.id, turns: BIND_TURNS + (itemOf(a)?.bindTurns ?? 0), reach: move.range?.[1] ?? 1 };
      bound.push({ unitId: d.id, moveId: move.id });
    }
    if (landed && !fainted && last?.damage > 0) {
      if (has(d, 'rattled') && ['dark', 'bug', 'ghost'].includes(moveTypeOf(a, move))) { changeStats(d, [{ stat: 'speed', change: 1 }], stageChanges); abilityEvents.push({ unitId: d.id, ability: 'rattled' }); } // 주눅
      if (has(d, 'justified') && moveTypeOf(a, move) === 'dark') { changeStats(d, [{ stat: 'attack', change: 1 }], stageChanges); abilityEvents.push({ unitId: d.id, ability: 'justified' }); } // 정의의마음
      if (has(d, 'weak-armor') && move.category === 'physical') { changeStats(d, [{ stat: 'defense', change: -1 }, { stat: 'speed', change: 2 }], stageChanges); abilityEvents.push({ unitId: d.id, ability: 'weak-armor' }); } // 깨어진갑옷
      if (has(d, 'color-change') && d.typeOverride !== moveTypeOf(a, move)) { d.typeOverride = moveTypeOf(a, move); abilityEvents.push({ unitId: d.id, ability: 'color-change' }); }
      if (hits.some((h) => h.unitId === d.id && h.crit) && has(d, 'anger-point')) { changeStats(d, [{ stat: 'attack', change: 12 }], stageChanges); abilityEvents.push({ unitId: d.id, ability: 'anger-point' }); }
    }
    // 5세대: 원수갚기는 한 번만 · 떨어뜨리기는 땅으로 · 클리어스모그는 랭크 초기화 · 드래곤테일은 밀어냄 · 배대뒤치기는 뒤로 메침
    if (landed && move.id === 'retaliate' && d.felled?.[a.side]) d.felled = { ...d.felled, [a.side]: false };
    if (landed && !fainted && state.units.includes(d)) {
      if (move.id === 'smack-down') { d.smackedDown = true; d.grounded = true; d.magnetRise = 0; }
      if (move.id === 'clear-smog') Object.assign(d, newStages());
      if ((move.id === 'dragon-tail' || move.id === 'circle-throw') && state.units.includes(a) && !tossed) {
        tossed = move.id === 'dragon-tail' ? dragonTail(state, a, d) : circleThrow(state, a, d);
        if (tossed?.fainted) { // 낭떠러지·압정: 이 공격으로 쓰러진 것 (낙사만 경험치)
          fainted = true;
          const h = hits.findLast((x) => x.unitId === d.id);
          if (h) h.fainted = true;
          if (tossed.fell) knocked.push(d);
        }
      }
    }
    for (const c of contacts) c();
  }
  // 저주받은바디: 한 번에 맞힌 서로 다른 보유자 수로 한 번만 (1마리 30%, 한 마리당 +10%p) → 그 기술 사슬묶기
  const cursed = targets.filter((d) => d !== a && d.side !== a.side && has(d, 'cursed-body') && !breaksDef && hits.some((h) => h.unitId === d.id && h.hit && h.damage > 0));
  if (cursed.length && state.units.includes(a) && !a.disable && rng() * 100 < 20 + 10 * cursed.length) { a.disable = { move: move.id, turns: LOCK_TURNS + 1 }; abilityEvents.push({ unitId: cursed[0].id, ability: 'cursed-body', target: a.id }); } // 자기 페이즈 끝에 바로 1 줄어드니 +1 (3턴)
  // 불꽃튀기기: 맞은 상대의 상하좌우 같은 편은 각자 최대 HP 1/16
  const splash = [];
  if (move.id === 'flame-burst') for (const d of targets) {
    if (!hits.some((h) => h.unitId === d.id && h.hit && h.damage > 0)) continue;
    for (const v of state.units.filter((u) => u !== a && u !== d && u.side === d.side && dist(u, d) === 1 && u.guard !== 'protect')) {
      const damage = Math.min(v.hp, Math.max(1, Math.floor(v.maxHp / 16)));
      v.hp -= damage; v.ncTouched = true; v.revealed = true; alertHunt(state, v, a);
      if (v.hp === 0) { knockOut(state, v, a, { deferExp: true }); knocked.push(v); }
      splash.push({ unitId: v.id, damage, fainted: v.hp === 0, from: d.id, kind: 'fire' });
    }
  }
  // 전기·불꽃 연쇄: 맞은 상대가 물(전기)·수풀·단풍길(불꽃) 칸이면 옆 칸 상대에게 10% (흡수·반동 합계엔 안 셈)
  const chain = [...splash];
  const ck = move.power ? chainKind(moveTypeOf(a, move)) : null;
  if (ck) {
    const starts = targets.filter((d) => d.side !== a.side).map((d) => ({ unit: d, damage: hits.filter((h) => h.unitId === d.id && h.typeMult > 0).reduce((t, h) => t + h.damage, 0) }));
    const blocked = (v) => v.guard === 'protect' || typeEffect(a, v, move, W) === 0 || !!immunity(a, v, move);
    for (const c of chainSpread(state, a, ck, starts, targets.map((d) => d.id), blocked)) {
      const v = c.unit;
      if (!state.units.includes(v)) continue;
      const damage = Math.min(v.hp, c.damage);
      v.hp -= damage; v.ncTouched = true; v.revealed = true; alertHunt(state, v, a);
      if (v.hp === 0) { knockOut(state, v, a, { deferExp: true }); knocked.push(v); }
      chain.push({ unitId: v.id, damage, fainted: v.hp === 0, from: c.from, kind: ck });
    }
  }
  // 선제기: 기술이 나갔으면 이번 차례에 한 번 남은 이동력으로 다시 이동 (치고 빠지기)
  if (move.priority > 0 && state.units.includes(a)) a.retreatReady = true;
  // 흡수(+)·반동(−): 실제로 깎인 HP 합 기준
  let drained = 0, recoilDamage = 0;
  if (dealt > 0 && move.drain > 0 && state.units.includes(a)) {
    const amt = Math.max(1, Math.floor(dealt * move.drain / 100 * (itemOf(a)?.healMult ?? 1))); // 큰뿌리
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
  const aItem = state.units.includes(a) ? itemOf(a) : null; // 생명의구슬 반동 · 조개껍질방울 회복
  if (aItem?.shellBell && dealt > 0 && canHeal(a) && a.hp < a.maxHp) { a.hp = Math.min(a.maxHp, a.hp + Math.max(1, Math.floor(dealt * aItem.shellBell))); abilityEvents.push({ unitId: a.id, item: a.held }); }
  if (aItem?.lifeOrb && dealt > 0 && !magicGuard(a)) {
    const loss = Math.min(a.hp, Math.max(1, Math.floor(a.maxHp / 10)));
    a.hp -= loss; abilityEvents.push({ unitId: a.id, item: a.held, damage: loss });
    if (a.hp === 0) knockOut(state, a, null, { reward: false });
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
  // 회전부리·유턴: 때린 뒤 처음 칸으로 돌아옴
  let returned = null;
  if (DASH[move.id]?.back && dashed && state.units.includes(a) && !state.units.some((u) => u !== a && u.x === dashed.from.x && u.y === dashed.from.y)) {
    const from = { x: a.x, y: a.y };
    moveUnit(state, a.id, dashed.from.x, dashed.from.y, 0, [...dp].reverse());
    returned = { unitId: a.id, from, to: { x: a.x, y: a.y } };
  }
  // 따라가때리기: 맞은 상대가 다음 자기 차례에 멀어지려 하면 한 번 더
  if (move.id === 'pursuit') for (const d of targets) if (state.units.includes(d) && hits.some((h) => h.unitId === d.id && h.hit && h.damage > 0)) d.pursuedBy = a.id;
  // 연속자르기·구르기·아이스볼: 맞으면 다음 단계, 빗나가면 처음부터
  if (STREAK_MAX[move.id]) { const [max, wrap] = STREAK_MAX[move.id], n = a.streak?.moveId === move.id ? a.streak.n : 0; a.streak = anyLanded ? { moveId: move.id, n: n >= max ? (wrap ? 0 : max) : n + 1 } : null; }
  // 역린·꽃잎댄스·난동부리기: 처음 대상을 2~3번 (다음 차례들은 저절로 쫓아가 발사), 끝나면 혼란
  if (RAMPAGE_MOVES.has(move.id) && state.units.includes(a)) {
    if (!a.rampage) { const t0 = targets.find((d) => d.side !== a.side); a.rampage = t0 ? { moveId: move.id, targetId: t0.id, left: 1 + (rng() < 0.5 ? 1 : 0) } : null; }
    else a.rampage.left--;
    if (a.rampage && a.rampage.left > 0 && byId(state, a.rampage.targetId)) a.charging = { moveId: move.id, targetId: a.rampage.targetId };
    else if (a.rampage) { a.rampage = null; a.charging = null; statusChanges.push({ unitId: a.id, ailment: 'confusion', ...inflict(a, 'confusion', rng, null, W) }); }
  }
  if (move.id === 'uproar') for (const u of state.units) if (u.uproarZone && u.status === 'sleep') { cure(u); woken.push({ unitId: u.id, ailment: 'sleep' }); } // 소란: 2칸 안 잠든 포켓몬을 깨움
  // 화풀이: 때리고 그쪽으로 한 칸 (상대를 한 칸 밀고 그 자리로) · 은혜갚기: 때리고 한 칸 물러남
  let stepped = null, shoved = tossed;
  if ((move.id === 'frustration' || move.id === 'return') && anyLanded && state.units.includes(a)) {
    const d = targets.find((t) => t.side !== a.side);
    if (d) {
      const sx = Math.sign(d.x - a.x), sy = Math.sign(d.y - a.y);
      const free = (x, y) => canEnter(state.grid[y]?.[x], a) && !state.units.some((u) => u.x === x && u.y === y);
      if (move.id === 'return' && free(a.x - sx, a.y - sy)) { const from = { x: a.x, y: a.y }; moveUnit(state, a.id, a.x - sx, a.y - sy, 0); stepped = { unitId: a.id, from, to: { x: a.x, y: a.y } }; }
      if (move.id === 'frustration') {
        const from = { x: a.x, y: a.y };
        if (!state.units.includes(d) && free(d.x, d.y)) moveUnit(state, a.id, d.x, d.y, 0); // 쓰러졌으면 그 칸으로
        else if (state.units.includes(d) && !d.boss && (canEnter(state.grid[d.y][d.x], a) || state.grid[d.y][d.x] === 'H' && state.grid[a.y][a.x] === 'H') && free(d.x + sx, d.y + sy) && canEnter(state.grid[d.y + sy]?.[d.x + sx], d)) { const ox = d.x, oy = d.y; moveUnit(state, d.id, d.x + sx, d.y + sy, 0); shoved = { unitId: d.id, from: { x: ox, y: oy }, to: { x: d.x, y: d.y } }; if (state.units.includes(a)) moveUnit(state, a.id, ox, oy, 0); }
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
  if (anyLanded && !sheer && move.effectKind === 'damage-raise' && move.statChanges?.length && roll(move.statChance)) changeStats(a, move.statChanges, stageChanges);
  // 자폭: 빗나가도 쓴 쪽은 기절, 보상 없음
  const selfKO = (SELF_KO.includes(move.id) || (move.id === 'final-gambit' && anyLanded)) && state.units.includes(a); // 목숨걸기: 맞혔을 때만
  if (selfKO) { a.hp = 0; knockOut(state, a, null, { reward: false }); }
  checkResult(state);
  noteChain(state, a, move, anyLanded);
  const out = { ...(tossed?.trapEvents?.length ? { trapEvents: tossed.trapEvents } : {}), kind, dashed, returned, hits, expGained, stageChanges, statusChanges, thawed, woken, lostFocus, selfKO, abilityEvents, drained, recoil: recoilDamage, crash, screensBroken, spun, presentHealed, stepped, shoved, countered, unbound: [...(state.log.unbound ?? [])], flinched, bound: bound.filter((b) => state.units.includes(a) && byId(state, b.unitId)?.bound), retreat: !!a.retreatReady && state.units.includes(a), bond: [...state.log.bonded], chain, ...(targets.length || ranged ? {} : { empty: true }) };
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
    out.item = state.chests[i].held ? `held-${state.chests[i].held}` : state.chests[i].item; // 도구가 든 상자
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
// 스피드 보너스: 그 편 가장 느린 유닛이 상대 편 가장 느린 유닛보다 2배 이상 빠르면, 그 편 가장 빠른 유닛이 한 번 더 (페이즈마다 1번)
export const SPEED_BONUS_RATIO = 2;
export const speedOf = (u) => effectiveStat(u.status === 'paralysis' ? { ...u, status: null } : u, 'spe'); // 랭크·순풍 반영, 마비는 뺌 (마비가 이득을 두 번 보지 않게)
export function speedBonusUnit(state, side) {
  if (state.bonusGiven) return null;
  const live = (s) => state.units.filter((u) => u.side === s && u.hp > 0 && !u.bot && u.ambush !== 'hidden'); // 숨은 기습 찌리리공은 빼고
  const mine = live(side), foes = live(side === 'ally' ? 'enemy' : 'ally');
  if (!mine.length || !foes.length) return null;
  const slow = (list) => Math.min(...list.map(speedOf));
  if (slow(mine) < SPEED_BONUS_RATIO * slow(foes)) return null;
  const best = mine.reduce((b, u) => (speedOf(u) > speedOf(b) ? u : b), mine[0]);
  if ((best.status === 'sleep' || best.status === 'freeze') && (best.statusTurns ?? 1) > 0) return null; // 잠듦·얼음이면 없음
  return best;
}

// 선제공격손톱: 그 편 페이즈 끝(스피드 보너스 다음)에 지닌 유닛마다 20% — 처음 맞은 하나가 한 번 더 (페이즈마다 1번)
export function quickClawUnit(state, side, rng) {
  if (state.quickGiven) return null;
  for (const u of state.units) {
    if (u.side !== side || u.hp <= 0 || u.bot || !itemOf(u)?.quickClaw) continue;
    if ((u.status === 'sleep' || u.status === 'freeze') && (u.statusTurns ?? 1) > 0) continue;
    if (rng() < itemOf(u).quickClaw) return u;
  }
  return null;
}

// 화산동굴 분출: 이번 라운드 차례인 분출구마다 경로 위 유닛을 먼 쪽부터 — 물 피해 후 그 방향으로 막힐 때까지 밀림
function steamVents(state, events) {
  state.log.steamed = []; state.log.steamPushes = [];
  for (const v of state.vents ?? []) {
    if (!ventFires(v, state.turn)) continue;
    state.log.steamed.push({ x: v.x, y: v.y, dir: v.dir });
    const path = steamPath(state, v), dist = (p) => Math.abs(p.x - v.x) + Math.abs(p.y - v.y);
    const hit = state.units.filter((u) => u.hp > 0 && !u.burrow && path.some((p) => p.x === u.x && p.y === u.y)).sort((a, b) => dist(b) - dist(a));
    for (const u of hit) {
      const dmg = steamDamage(u);
      if (dmg) {
        const hpBefore = u.hp;
        u.hp = Math.max(0, u.hp - dmg);
        events.push({ unitId: u.id, kind: 'steam', damage: dmg, hpBefore, maxHp: u.maxHp, x: u.x, y: u.y });
        if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
      }
      const to = pushEnd(state, u, v.dir);
      if (to.x === u.x && to.y === u.y) continue;
      state.log.steamPushes.push({ unitId: u.id, from: { x: u.x, y: u.y }, to });
      u.x = to.x; u.y = to.y;
    }
  }
  if (state.log.steamPushes.length) { markExplored(state); refreshField(state); }
}

// 화산동굴 현무암: 행동을 마친 칸이 현무암이면 열 피해 (화면은 행동 끝에 부름). 반환 이벤트 목록
export function basaltHeat(state, u) {
  const dmg = state.units.includes(u) && u.hp > 0 ? basaltBurn(state, u) : 0;
  if (!dmg) return [];
  const hpBefore = u.hp, out = [];
  u.hp = Math.max(0, u.hp - dmg);
  out.push({ unitId: u.id, kind: 'basalt', damage: dmg, hpBefore, maxHp: u.maxHp, x: u.x, y: u.y });
  if (u.hp === 0) { knockOut(state, u, null); out.push({ unitId: u.id, kind: 'fainted' }); checkResult(state); }
  return out;
}

// 발전기 방출: 범위 안 유닛 모두 (양쪽). 축전 회복 · 전기엔진/피뢰침 능력치 +1
function pulseGenerators(state, events, abilityLog) {
  state.log.pulsed = [];
  const hit = new Set();
  for (const g of state.generators ?? []) if (firesAt(g, state.turn)) for (const p of genRange(state, g)) hit.add(`${p.x},${p.y}`);
  if (!hit.size) return;
  state.log.pulsed = (state.generators ?? []).filter((g) => firesAt(g, state.turn)).map((g) => ({ x: g.x, y: g.y }));
  for (const u of [...state.units]) {
    if (u.hp <= 0 || !hit.has(`${u.x},${u.y}`)) continue;
    const r = shockDamage(u);
    if (!r) continue;
    if (r.heal) { if (canHeal(u) && u.hp < u.maxHp) { u.hp = Math.min(u.maxHp, u.hp + r.heal); abilityLog.push({ unitId: u.id, ability: r.ability }); } continue; }
    if (r.boost) { applyStageChange(u, r.boost, 1); abilityLog.push({ unitId: u.id, ability: r.ability }); continue; }
    const hpBefore = u.hp;
    u.hp = Math.max(0, u.hp - r.damage);
    events.push({ unitId: u.id, kind: r.kind, damage: r.damage, hpBefore, maxHp: u.maxHp, x: u.x, y: u.y });
    if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); }
  }
}

export function endPhase(state, rng = Math.random) {
  state.bonusGiven = false; // 다음 페이즈는 다시 보너스 가능
  state.quickGiven = false;
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
    // 하수도 독 웅덩이 (날씨 피해 다음)
    const pool = poolDamage(u, state.grid[u.y]?.[u.x]);
    if (pool) {
      const hpBefore = u.hp;
      u.hp = Math.max(0, u.hp - pool.damage);
      events.push({ unitId: u.id, kind: pool.kind, damage: pool.damage, hpBefore, maxHp: u.maxHp, x: u.x, y: u.y });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    // 지니는 도구: 먹다남은음식·검은진흙·끈적끈적바늘·화염구슬·독독구슬
    const ip = itemPhaseEnd(u);
    if (ip?.heal && canHeal(u)) { u.hp = Math.min(u.maxHp, u.hp + ip.heal); abilityLog.push({ unitId: u.id, item: u.held }); }
    if (ip?.damage && !magicGuard(u)) {
      u.hp = Math.max(0, u.hp - ip.damage); abilityLog.push({ unitId: u.id, item: u.held, damage: ip.damage });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    if (ip?.ailment && inflict(u, ip.ailment, () => 0, null, W).ok) abilityLog.push({ unitId: u.id, item: u.held });
    // 특성: 날씨 회복·피해, 가속, 탈피, 촉촉바디
    const hpRate = phaseEndHp(u, W);
    if (hpRate > 0 && u.hp < u.maxHp && canHeal(u)) { u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * hpRate))); abilityLog.push({ unitId: u.id, ability: u.ability }); }
    if (hpRate < 0 && !magicGuard(u)) {
      u.hp = Math.max(0, u.hp - Math.max(1, Math.floor(u.maxHp * -hpRate)));
      abilityLog.push({ unitId: u.id, ability: u.ability, damage: true });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    if (has(u, 'speed-boost')) { applyStageChange(u, 'spe', 1); abilityLog.push({ unitId: u.id, ability: 'speed-boost' }); }
    if (has(u, 'moody')) { // 변덕쟁이: 명중·회피 뺀 능력 하나 +2, 다른 하나 −1
      const KEYS = ['atk', 'def', 'spa', 'spd', 'spe'], at = (k) => u.stages?.[k] ?? 0;
      const ups = KEYS.filter((k) => at(k) < 6), up = ups.length ? ups[Math.floor(rng() * ups.length)] : null;
      const downs = KEYS.filter((k) => k !== up && at(k) > -6), down = downs.length ? downs[Math.floor(rng() * downs.length)] : null;
      if (up) applyStageChange(u, up, 2);
      if (down) applyStageChange(u, down, -1);
      abilityLog.push({ unitId: u.id, ability: 'moody' });
    }
    if (u.slowTurns > 0) u.slowTurns -= 1;
    tickEnd(state, u, events, rng); // 도발·이동 불가 … 턴 감소, 지속 회복·저주
    if (u.hp > 0 && has(u, 'natural-cure') && u.status && !u.ncTouched) { cure(u); events.push({ unitId: u.id, kind: 'naturalCure' }); } // 자연회복: 조용한 한 바퀴
    if (u.hp > 0 && has(u, 'regenerator') && !u.ncTouched && u.hp < u.maxHp && canHeal(u)) { u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp / 4))); abilityLog.push({ unitId: u.id, ability: 'regenerator' }); } // 재생력
    if (u.hp > 0 && has(u, 'healer')) for (const o of state.units) if (o !== u && o.side === u.side && o.status && dist(o, u) === 1 && rng() < 0.3) { cure(o); abilityLog.push({ unitId: u.id, ability: 'healer', target: o.id }); } // 치유의마음
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
  if (ending === 'enemy') pulseGenerators(state, events, abilityLog); // 발전소: 이번 라운드 차례인 발전기 방출
  if (ending === 'enemy') steamVents(state, events); // 화산동굴: 이번 라운드 차례인 분출구 스팀
  for (const u of state.units) if (u.side === ending && u.sealed) u.sealed = false; // 봉인은 그 편 차례 끝에 풀림
  for (const u of state.units) if (u.burrow && u.side !== ending) u.burrow = null; // 숨기: 상대 페이즈가 끝나면 나옴
  for (const u of state.units) if (u.side === ending && u.uproar > 0) u.uproar--; // 소란피기 남은 차례
  for (const u of state.units) if (u.side === ending && u.pursuedBy) u.pursuedBy = null; // 따라가때리기: 맞은 쪽 다음 차례까지만
  markUproar(state);
  tickField(state, ending, events); // 그 편이 놓은 오라·장판·날씨
  W = effectiveWeather(state); // 날씨 부르기가 방금 끝났을 수 있음 (쾌청 녹이기 등)
  state.log.falls = chasmFalls(state); // 협곡: 낭떠러지 위인데 더는 못 뜨는 포켓몬 (중력·특성 잃음)
  checkResult(state);
  state.log.wisps = ending === 'enemy' ? wispPhase(state, (w, x, y, i) => makeUnit({ species: w.species, side: 'enemy', x, y, level: w.level, id: `enemy-${w.species}-wisp${i + 1}` })) : []; // 묘지: 혼불·고스트 (층이 끝났으면 없음)
  state.log.expired = [];
  for (const u of state.units) {
    if (u.side !== ending || !u.turns) continue;
    const keys = tickStages(u);
    if (keys.length) state.log.expired.push({ unitId: u.id, keys });
  }
  state.phase = state.phase === 'player' ? 'enemy' : 'player';
  if (state.phase === 'player') { state.turn++; if (state.tideCells && tideFor(state.turn) !== state.tide) applyTide(state, tideFor(state.turn)); } // 해변: 3라운드마다 물때
  const side = state.phase === 'player' ? 'ally' : 'enemy';
  for (const u of state.units) u.hurtThisPhase = false; // 승부굳히기: 페이즈마다 새로
  for (const u of state.units) if (u.uproarZone && u.status === 'sleep') { cure(u); events.push({ unitId: u.id, kind: 'woke' }); } // 소란 근처는 깨어남
  for (const fs of [...(state.delayed ?? [])]) { // 미래예지·파멸의소원: 쓴 편 차례가 두 번 돌아오면 떨어짐
    if (fs.side !== side || --fs.turns > 0) continue;
    state.delayed = state.delayed.filter((x) => x !== fs);
    const t = byId(state, fs.targetId), by = byId(state, fs.byId);
    if (!t || state.result) continue;
    const r = calcDamage(fs.snap, t, MOVES[fs.moveId], { rng, defTile: state.grid[t.y][t.x], weather: W });
    const hpBefore = t.hp, damage = Math.min(t.hp, r.damage ?? 0);
    t.hp -= damage;
    events.push({ unitId: t.id, kind: 'foresight', moveId: fs.moveId, damage, hpBefore, maxHp: t.maxHp, x: t.x, y: t.y, missed: !r.hit || r.typeMult === 0 });
    if (t.hp === 0) { knockOut(state, t, by ?? null); events.push({ unitId: t.id, kind: 'fainted' }); checkResult(state); }
  }
  for (const u of state.units) {
    if (u.side !== side) continue;
    u.moved = false; u.acted = false; u.pitEscaped = false;
    tickStart(u);
    terrainStart(state, u);
    bindCheck(state, u, events); // 속박: 묶은 쪽이 멀어졌으면 풀림
    u.spent = 0; u.retreatReady = false; u.retreated = false; // 치고 빠지기
    if (u.flinch) { u.flinch = false; u.sealed = true; events.push({ unitId: u.id, kind: 'sealed' }); } // 풀죽음 → 이번 차례 기술 봉인
    u.counter = null; // 반격 자세는 다음 자기 차례까지
    if (u.charged) u.charged--; // 충전: 다음 자기 차례가 끝나면 사라짐
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
    if (st.skip) { u.moved = true; u.acted = !(st.event === 'asleep' && u.moves?.includes('snore')); } // 코골기: 자는 채로 제자리에서
    if (u.loafNext) { // 게으름: 잠·얼음 턴은 그대로 흐르고, 이번 차례는 쉰다
      u.loafNext = false; u.moved = true; u.acted = true;
      if (!st.skip) abilityLog.push({ unitId: u.id, ability: 'truant' });
    }
  }
}

export function checkResult(state) {
  if (state.result === 'stairs') return state.result; // 계단 클리어는 덮어쓰지 않음
  if (state.bossFloor && !state.units.some((u) => u.boss)) { state.result = 'win'; return state.result; }
  const enemies = state.units.some((u) => u.side === 'enemy' && u.ambush !== 'hidden'); // 발전소: 숨은 기습 찌리리공은 승리 조건 밖
  const allies = state.units.some((u) => u.side === 'ally' && !u.bot); // 갸라도스 봇만 남으면 패배
  state.result = !enemies ? 'win' : !allies ? 'lose' : null;
  return state.result;
}

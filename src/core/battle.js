// 전투 상태 (순수 로직, 상태 객체를 직접 갱신)
import { hashIvs, hashGender } from './individual.js';
import { effectiveBase } from './dittoBuild.js';
import { MAP } from '../data/map.js';
import { hash } from '../render/pixels.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { AREA_RADIUS } from '../data/moveTargets.js';
import { BALANCE } from '../data/balance.js';
import { calcDamage, hitChance, confusionDamage } from './damage.js';
import { unitsHit } from './shapes.js';
import { phaseEndWeather, effectiveWeather } from './weather.js';
import { immunity, has, magicGuard, weatherChipImmune, phaseEndHp, CONTACT_AILMENT, moveTypeOf, WEATHER_SETTER, REDIRECT, SYNC_AILMENTS, traps } from './abilities.js';
import { newStatus, inflict, cure, checkAction, phaseStart, phaseEnd, infatuate } from './status.js';
import { newStages, applyStageChange, tickStages, API_STAT, STAGE_TURNS, AREA_STAGE_TURNS, effectiveStat } from './stages.js';
import { statsAt, expYield } from './stats.js';
import { startingMoves } from './learn.js';
import { newParty, abilityOf } from './progress.js';

export const spec = (unit) => SPECIES[unit.species];

// 유닛 = 종족 + 레벨에서 계산한 능력치 + 기술
export function makeUnit({ species, side, x, y, level, moves, id, boss, ability, types, base, ivs, gender, weight }) {
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
    // 특성: 동료는 멤버 값, 적은 위치·레벨로 정해지는 무작위 (같은 층이면 같은 특성)
    ability: ability ?? SPECIES[species].abilities[Math.floor(hash(species, x, y, level) * SPECIES[species].abilities.length)],
    ...newStages(),
    ...newStatus(),
    ...(boss ? { boss: true } : {}),
  };
}

function uniqueId(units, side, species) {
  let id = `${side}-${species}`;
  for (let n = 2; units.some((u) => u.id === id); n++) id = `${side}-${species}-${n}`;
  return id;
}

// opts.hpRatio: { [species]: 0.5 } — 직전 층 기절자 등 시작 HP 비율
export function createBattle(mapDef = MAP, party = newParty(), { hpRatio = {} } = {}) {
  const units = [];
  party.slice(0, mapDef.allySlots.length).forEach((m, i) => {
    const { x, y } = mapDef.allySlots[i];
    const build = m.species === 'ditto' && m.build ? { types: m.build.types, base: effectiveBase(m.build) } : {}; // 메타몽 빌드
    const u = makeUnit({ species: m.species, side: 'ally', x, y, level: m.level, moves: m.moves, id: uniqueId(units, 'ally', m.species), ability: abilityOf(m), ivs: m.ivs ?? null, gender: m.gender ?? null, ...build });
    if (hpRatio[m.species]) u.hp = Math.max(1, Math.floor(u.maxHp * hpRatio[m.species]));
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
    log: { exp: {}, fainted: [], loot: [], coins: 0, expired: [], defeated: [] }, // defeated: 캡슐 굴림용 쓰러뜨린 적 // 획득 경험치(종족별), 기절한 아군, 연 보물, 격파 코인, 이번 페이즈에 풀린 랭크
    stairs: mapDef.stairs ?? null,
    chests: (mapDef.chests ?? []).map((c) => ({ ...c })),
    bossFloor: units.some((u) => u.boss),
    weather: mapDef.weather ?? null, // 층 날씨 (없으면 null)
  };
  floorStartAbilities(state);
  for (const u of units) u.fieldWeather = effectiveWeather(state); // 날씨 특성(쓱쓱 등)이 처음부터 이동력에 반영
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

export function moveUnit(state, id, x, y) {
  const u = byId(state, id);
  const stayed = u.x === x && u.y === y;
  u.x = x; u.y = y; u.moved = true;
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
  gained[attacker.species] = full;
  for (const u of state.units) {
    if (u.side === 'ally' && u !== attacker && u.hp > 0) gained[u.species] = (gained[u.species] ?? 0) + Math.floor(full * BALANCE.shareRatio);
  }
  for (const [sp, n] of Object.entries(gained)) state.log.exp[sp] = (state.log.exp[sp] ?? 0) + n;
  return gained;
}

// 쓰러뜨린 상대 없이 기절(상태 데미지·혼란 자해): 살아 있는 아군 전원 공유 비율
function awardShare(state, defender) {
  if (defender.side !== 'enemy') return;
  const full = expYield(SPECIES[defender.species].baseExp, defender.level, BALANCE.expMultiplier);
  for (const u of state.units) {
    if (u.side === 'ally' && u.hp > 0) state.log.exp[u.species] = (state.log.exp[u.species] ?? 0) + Math.floor(full * BALANCE.shareRatio);
  }
}

// 기절 처리 공통. by: 쓰러뜨린 유닛(없으면 상태 데미지·자해). reward false: 보상 없음(자폭)
// 같은 편끼리 쓰러뜨리면 경험치·코인 없음 (awardExp 는 아군→적만 지급)
function knockOut(state, d, by, { reward = true, deferExp = false } = {}) {
  state.units = state.units.filter((u) => u !== d);
  for (const u of state.units) if (u.infatuatedBy === d.id) { u.infatuation = 0; u.infatuatedBy = null; } // 건 상대가 쓰러지면 헤롱헤롱이 풀린다
  let expGained = {};
  if (by) { if (!deferExp) expGained = awardExp(state, by, d); } // deferExp: 공격이 끝난 뒤 호출 측이 지급
  else if (reward) awardShare(state, d);
  if (reward && d.side === 'enemy' && (!by || by.side === 'ally')) {
    state.log.coins += 3 + Math.floor(d.level / 3);
    (state.log.defeated ??= []).push({ species: d.species, types: [...d.types], moves: [...d.moves], ability: d.ability, boss: !!d.boss }); // 메타몽 캡슐
  }
  if (d.side === 'ally' && !state.log.fainted.includes(d.species)) state.log.fainted.push(d.species);
  return expGained;
}

const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// 기술이 실제로 닿는 유닛들 (move: id 또는 기술 객체, focus: 고른 대상)
export function targetsOf(state, user, move, focus) {
  const m = typeof move === 'string' ? MOVES[move] : move;
  const [lo, hi] = m.range ?? [1, 1];
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

// 공격기·변화기 공통. 공격기는 데미지 + 능력치 부가효과, 변화기는 대상별 랭크 변화
const SELF_KO = ['self-destruct', 'explosion']; // 쓴 쪽이 기절

// aim: 대상 id 문자열(단일, 호환) 또는 shapes.js 의 조준 객체
export function applyMove(state, userId, moveId, aim, rng) {
  const W = effectiveWeather(state); // 에어록·날씨부정 반영
  for (const u of state.units) u.fieldWeather = W; // 쓱쓱·엽록소 등 스피드·이동력 특성용
  // 플러스·마이너스 / 플라워기프트: 옆 동료를 보고 켠다 (데미지 계산이 읽음)
  const nextTo = (u, pred) => state.units.some((o) => o !== u && o.side === u.side && dist(o, u) === 1 && pred(o));
  for (const u of state.units) {
    u.plusActive = (has(u, 'plus') || has(u, 'minus')) && nextTo(u, (o) => has(o, 'plus') || has(o, 'minus'));
    u.flowerActive = W === 'sun' && (has(u, 'flower-gift') || nextTo(u, (o) => has(o, 'flower-gift')));
  }
  const rod = redirectTarget(state, userId, moveId, aim);
  const focusId = typeof aim === 'string' ? aim : aim?.unitId ?? null;
  const a = byId(state, userId), move = MOVES[moveId];
  a.acted = true;
  if (has(a, 'truant')) a.loafNext = true; // 게으름: 다음 자기 차례는 쉰다
  a.moved = true;
  const stageChanges = [], statusChanges = [], thawed = [];
  const kind = move.category === 'status' ? 'status' : 'attack';
  const abilityEvents = (state.log.abilityEvents = []); // 이번 기술에서 발동한 특성 (연출용)
  const moldBreaker = has(a, 'mold-breaker'); // 틀깨기: 상대의 방어 특성(클리어바디·유연·습기 …) 무시
  // 특성 흡수 결과 적용: 회복·랭크·타오르는불꽃
  const absorb = (u, ab) => {
    if (ab.heal) u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * ab.heal)));
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

  if (kind === 'status') {
    const missed = [];
    const acc = { ...move, accuracy: move.accuracy ?? 100 };
    for (const t of targetsOf(state, a, move, focusId ? byId(state, focusId) : null)) {
      const ab = t.side !== a.side ? immunity(a, t, move) : null; // 축전에 전기자석파 등
      if (ab) { absorb(t, ab); continue; }
      if (t.side !== a.side && !(rng() * 100 < hitChance(a, t, acc, state.grid[t.y][t.x], W))) { missed.push(t.id); continue; }
      if (move.id === 'captivate' && !(t.gender && a.gender && t.gender !== a.gender)) { statusChanges.push({ unitId: t.id, ailment: null, ok: false, reason: 'immune' }); continue; } // 유혹: 반대 성별만
      changeStats(t, move.statChanges ?? [], stageChanges, move.area ? AREA_STAGE_TURNS : STAGE_TURNS, t !== a, t !== a && moldBreaker);
      ail(t);
    }
    return { kind, stageChanges, statusChanges, thawed, missed, abilityEvents };
  }
  const targets = unitsHit(state, a, move, typeof aim === 'string' ? { unitId: aim } : aim ?? { self: true });
  const spread = targets.length >= 2 ? 0.75 : 1;
  const roll = (chance) => !chance || rng() * 100 < chance * (has(a, 'serene-grace') ? 2 : 1); // 확률 0 = 100%, 하늘의은총 2배
  const hits = [], expGained = {}, knocked = [];
  let anyLanded = false;
  const contactBase = move.category === 'physical';
  const breaksDef = has(a, 'mold-breaker');
  for (const d of targets) {
    const contact = contactBase && dist(a, d) === 1;
    const hpBefore = d.hp;
    const r = calcDamage(a, d, move, { rng, defTile: state.grid[d.y][d.x], spread, weather: W });
    if (r.absorbed) absorb(d, r.absorbed);
    d.hp = Math.max(0, d.hp - r.damage);
    // 옹골참: HP 가득에서 한 방이면 1 남김 (한 층 한 번)
    if (d.hp === 0 && hpBefore === d.maxHp && has(d, 'sturdy') && !d.sturdyUsed && !breaksDef) { d.hp = 1; d.sturdyUsed = true; abilityEvents.push({ unitId: d.id, ability: 'sturdy' }); }
    const fainted = d.hp === 0;
    if (fainted) { knockOut(state, d, a, { deferExp: true }); knocked.push(d); }
    else if (move.type === 'fire' && r.damage > 0 && d.status === 'freeze') { cure(d); thawed.push(d.id); } // 불꽃 공격에 맞으면 녹는다
    // 대상 부가효과: 맞았고 면역이 아니고 버텼을 때
    const landed = r.hit && r.typeMult > 0;
    anyLanded ||= landed;
    const dust = !breaksDef && has(d, 'shield-dust'); // 인분: 받는 부가효과 무효
    if (landed && !fainted && !dust && move.effectKind === 'damage-lower' && move.statChanges?.length && roll(move.statChance)) changeStats(d, move.statChanges, stageChanges, move.area ? AREA_STAGE_TURNS : STAGE_TURNS, true, breaksDef);
    if (landed && !fainted && !dust && move.ailment && roll(move.ailmentChance)) ail(d);
    if (landed && !fainted && r.damage > 0) {
      if (has(d, 'color-change') && d.typeOverride !== moveTypeOf(a, move)) { d.typeOverride = moveTypeOf(a, move); abilityEvents.push({ unitId: d.id, ability: 'color-change' }); }
      if (r.crit && has(d, 'anger-point')) { changeStats(d, [{ stat: 'attack', change: 12 }], stageChanges); abilityEvents.push({ unitId: d.id, ability: 'anger-point' }); }
    }
    // 접촉 반격 (거리 1 물리기): 정전기·독가시·불꽃몸·포자 30%, 까칠한피부 1/8, 유폭(기절 시) 1/4
    if (landed && r.damage > 0 && contact && state.units.includes(a)) {
      if (has(d, 'cute-charm') && rng() * 100 < 30) { // 헤롱헤롱바디
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
    }
    hits.push({ unitId: d.id, ...r, fainted, hpBefore });
  }
  // 경험치는 공격이 끝난 뒤 살아 있는 아군 기준 (목록 순서에 따라 달라지지 않게)
  for (const d of knocked) for (const [sp, n] of Object.entries(awardExp(state, a, d))) expGained[sp] = (expGained[sp] ?? 0) + n;
  // 사용자 부가효과(인파이트류): 한 명이라도 맞으면 한 번
  if (anyLanded && move.effectKind === 'damage-raise' && move.statChanges?.length && roll(move.statChance)) changeStats(a, move.statChanges, stageChanges);
  // 자폭: 빗나가도 쓴 쪽은 기절, 보상 없음
  const selfKO = SELF_KO.includes(move.id) && state.units.includes(a);
  if (selfKO) { a.hp = 0; knockOut(state, a, null, { reward: false }); }
  checkResult(state);
  const out = { kind, hits, expGained, stageChanges, statusChanges, thawed, selfKO, abilityEvents };
  if (hits.length === 1) { const { hit, crit, typeMult, damage, fainted } = hits[0]; Object.assign(out, { hit, crit, typeMult, damage, fainted }); }
  return out;
}

// 기존 호출 호환
export const applyAttack = (state, attackerId, targetId, moveId, rng) => applyMove(state, attackerId, moveId, targetId, rng);

// 아군이 이동을 마친 칸 처리: 상자 열기, 계단 도착
export function arrive(state, unitId) {
  const u = byId(state, unitId);
  const out = { stairs: false, item: null };
  if (!u || u.side !== 'ally') return out;
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
  const W = effectiveWeather(state);
  for (const u of state.units) u.fieldWeather = W;
  for (const u of state.units.filter((o) => o.side === ending)) {
    const r = phaseEnd(u);
    // 포이즌힐: 독이면 피해 대신 1/8 회복, 매직가드: 상태 피해 없음
    if (r.damage && (r.kind === 'poison' || r.kind === 'toxic') && has(u, 'poison-heal')) {
      u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp / 8))); abilityLog.push({ unitId: u.id, ability: 'poison-heal' }); r.damage = 0;
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
    if (hpRate > 0 && u.hp < u.maxHp) { u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * hpRate))); abilityLog.push({ unitId: u.id, ability: u.ability }); }
    if (hpRate < 0 && !magicGuard(u)) {
      u.hp = Math.max(0, u.hp - Math.max(1, Math.floor(u.maxHp * -hpRate)));
      abilityLog.push({ unitId: u.id, ability: u.ability, damage: true });
      if (u.hp === 0) { knockOut(state, u, null); events.push({ unitId: u.id, kind: 'fainted' }); continue; }
    }
    if (has(u, 'speed-boost')) { applyStageChange(u, 'spe', 1); abilityLog.push({ unitId: u.id, ability: 'speed-boost' }); }
    if (u.slowTurns > 0) u.slowTurns -= 1;
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
  const allies = state.units.some((u) => u.side === 'ally');
  state.result = !enemies ? 'win' : !allies ? 'lose' : null;
  return state.result;
}

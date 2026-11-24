// 게임 상태 머신: core(규칙) 와 render(그리기) 를 잇는다
import { HELD_ITEMS } from '../data/heldItems.js';
import { createBattle, unitAt, moveUnit, applyMove, targetsOf, endPhase, spec, arrive, redirectTarget, canRetreat, chargeRoute, teleportSpots, speedBonusUnit, quickClawUnit, basaltHeat, pushPreview, pursuitStrike } from '../core/battle.js';
import { STAT_KO, API_STAT } from '../core/stages.js';
import { STATUS_KO, canInflict, canInfatuate } from '../core/status.js';
import { wrapMessage, blockedText, TRAP_LINE } from '../render/mapAttack.js';
import { moveBlock, moveFor, BIND_MOVES, BIND_TURNS } from '../core/volatile.js';
import { refreshField, lethalTrapCut } from '../core/field.js';
import { sound } from '../audio/sound.js';
import { reachable, tilesInRange, manhattan, pathTo, pathCost, slides } from '../core/pathfind.js';
import { beatUpAllies, singleInReach, aimsOf, unitsHit, tilesOf, bestAim, canTarget, sniperBonus, guessAims } from '../core/shapes.js';
import { hiddenFrom, seenOnly } from '../core/stealth.js';
import { enemyTurnOrder, planEnemyAction, retreatSpot } from '../core/ai.js';
import { huntPlan } from '../core/hunt.js';
import { ambushPlan } from '../core/ambush.js';
import { canSee, seenCells } from '../core/vision.js';
import { isHidden, WEATHER_KO, effectiveWeather } from '../core/weather.js';
import { calcDamage, hitChance, terrainCtx } from '../core/damage.js';
import { MOVES } from '../data/moves.js';
import { drawMap, drawChest, TILE } from '../render/tiles.js';
import { bakeAutumnGround, drawAutumnMap } from '../render/autumnTiles.js';
import { bakeBeachGround, drawBeachMap } from '../render/beachTiles.js';
import { bakeCityGround, drawCityMap } from '../render/cityTiles.js';
import { bakeSewerGround, drawSewerMap } from '../render/sewerTiles.js';
import { bakePowerGround, drawPowerMap, drawPulseWarn } from '../render/powerTiles.js';
import { bakeDesertGround, drawDesertMap } from '../render/desertTiles.js';
import { bakeVolcanoGround, drawVolcanoMap, drawSteamWarn } from '../render/volcanoTiles.js';
import { bakeIceGround, drawIceMap, drawFrozen } from '../render/iceTiles.js';
import { bakeGraveyardGround, drawGraveyardMap, drawWisps } from '../render/graveyardTiles.js';
import { bakeCanyonGround, drawCanyonMap } from '../render/canyonTiles.js';
import { pulsePreview, firesAt } from '../core/generator.js';
import { sandShift, markSettled, unsettled } from '../core/sand.js';
import { steamPreview, ventFires, steamPath } from '../core/vent.js';
import { drawDarkness } from '../render/darkness.js';
import { tideFor, tidePreview } from '../core/tide.js';
const SAND_BURST = ['#7a5a2a', '#c8a868', '#dcc084', '#f6e4b4', '#ffffff']; // 모래더미가 터질 때
import { leafRoute } from '../core/leafRoute.js';
import { drawUnitSprite, drawUnknownSprite, drawShadow, hasAnim, idleFrameSource, DIR, requestSprites } from '../render/sprites.js';
import { actorFor, bodyAt } from '../render/fxActor.js';
import { fxForAilment, HEAL_FX, MOVE_MARKER, markerAt } from '../data/moveFx.js';
import { dirFromDelta } from '../render/pmdData.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { createAttackAnim } from './attackAnim.js';
import { createFxManager } from '../render/fx.js';
import { drawWeather } from '../render/weatherFx.js';

const STEP = 0.11; // 타일당 이동 시간(초)
const SLIDE_STEP = 0.05; // 빙판 미끄럼 한 칸
// 경로의 i 번째 걸음이 빙판 위 미끄럼인지 (pathfind.pathCost 와 같은 기준 + 빙판에 들어서는 첫 걸음)
const sliding = (grid, unit, path, i) => { if (i < 2 || !slides(unit)) return false; const a = path[i - 1], p = path[i - 2], b = path[i]; return grid[a.y][a.x] === '_' && b.x - a.x === a.x - p.x && b.y - a.y === a.y - p.y; };
// 걷기 진행: 지금 몇 번째 칸 사이(i)·그 안의 비율(k)
const walkAt = (walk) => { const { ts, t } = walk; let i = 0; while (i < ts.length - 2 && t >= ts[i + 1]) i++; return { i, k: Math.min(1, (t - ts[i]) / (ts[i + 1] - ts[i] || 1)) }; };
const SLIDE = 0.3; // 사막: 모래에 밀려 미끄러지는 시간(초)
const BANNER = 1.4;
const RESULT_LOCK = 0.8; // 결과 화면 입력 잠금(초)
const BLUE = 'rgba(64,128,248,0.45)', RED = 'rgba(248,64,64,0.38)';
const MARGIN = 2; // 카메라: 커서를 화면 가장자리에서 최소 이 칸만큼 안쪽에

const seqRng = (vals) => { let i = 0; return () => vals[i++] ?? 0; };

// 예상 창 숫자: 명중·최소·최대 데미지 (날씨·다수 명중 반영)
export function forecastFor(a, d, mv, tile, weather = null, spread = 1, ctx = {}) {
  if (mv.dreamOnly && d.status !== 'sleep') return { hit: hitChance(a, d, mv, tile, weather, ctx), min: 0, max: 0, typeMult: 0 }; // 꿈먹기: 깨어 있으면 실패
  const min = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0]), defTile: tile, spread, weather, ...ctx });
  const max = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0.99999]), defTile: tile, spread, weather, ...ctx });
  // 연속 공격: 최소 타수 × 최소, 최대 타수 × 최대 (스킬링크면 최대 타수)
  const lo = !mv.minHits || mv.maxHits <= 1 ? 1 : hasAbility(a, 'skill-link') ? mv.maxHits : mv.minHits, hi = !mv.maxHits || mv.maxHits <= 1 ? 1 : mv.maxHits;
  return { hit: hitChance(a, d, mv, tile, weather, ctx), min: min.damage * lo, max: max.damage * hi, typeMult: min.typeMult };
}

import { josa } from '../data/text.js';
import { ABILITIES } from '../data/abilities.js';
import { POWDER_KO } from '../core/dittoBuild.js';
import { has as hasAbility, typeEffect } from '../core/abilities.js';

const ITEM_NAME = { ...Object.fromEntries(Object.entries(HELD_ITEMS).map(([k, v]) => [`held-${k}`, v.name])), evoStone: '진화의돌', candy: '경험 사탕', coins: '코인 주머니', ...Object.fromEntries(Object.entries(POWDER_KO).map(([k, v]) => [`powder-${k}`, v])) };
export const itemName = (id) => ITEM_NAME[id] ?? '아이템';
const TARGET_LABEL = { self: '자신', enemy: '적 하나', enemies: '주변 적 전체', ally: '아군 하나', allies: '주변 아군' };
const isAttack = (mv) => mv.category !== 'status';
const DIR_OF = (dx, dy) => (dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
const pickOne = (mv) => !mv.kind || mv.kind === 'enemy' || mv.kind === 'ally'; // 대상을 직접 고르는 기술
const helpful = (mv) => mv.kind === 'self' || mv.kind === 'ally' || mv.kind === 'allies';
// 기술 특수 효과 글자 (기술 정보·자세히 보기)
const FIXED_TAG = { level: '고정 레벨', psywave: '레벨 0.5~1.5배', half: '상대 HP 절반', endeavor: '내 HP까지 깎음', ohko: '일격필살', gambit: '내 HP만큼' };
// 5세대 기술 규칙 한마디 (세대 추가 3단계)
const GEN5_TAG = {
  hex: '상태이상 2배', venoshock: '독 2배', 'stored-power': '오른 랭크마다 +20', acrobatics: '도구 없으면 2배', 'electro-ball': '스피드 비', retaliate: '원수에게 140',
  round: '이어 부르면 120', 'echoed-voice': '라운드마다 +40', 'fusion-flare': '크로스썬더 다음 200', 'fusion-bolt': '크로스플레임 다음 200',
  'smack-down': '땅으로 떨어뜨림', 'dragon-tail': '밀어냄', 'circle-throw': '뒤로 메침', 'volt-switch': '대시 후 복귀', 'flame-burst': '옆에 불똥 1/16', 'clear-smog': '랭크 초기화',
  psyshock: '방어로 받음', psystrike: '방어로 받음', 'secret-sword': '방어로 받음', 'foul-play': '상대 공격으로', 'chip-away': '방어 랭크 무시', 'sacred-sword': '방어 랭크 무시', synchronoise: '같은 타입만',
};
export function moveEffectTags(mv) {
  const tags = [];
  if (mv.drain > 0) tags.push(`흡수 ${mv.drain}%`);
  if (mv.drain < 0) tags.push(`반동 ${-mv.drain === 33 ? '1/3' : -mv.drain === 25 ? '1/4' : -mv.drain === 50 ? '1/2' : `${-mv.drain}%`}`);
  if (mv.minHits && mv.maxHits > 1) tags.push(mv.minHits === mv.maxHits ? `${mv.maxHits}회` : `${mv.minHits}~${mv.maxHits}회`);
  if (mv.critRate > 0) tags.push(mv.critRate >= 3 ? '반드시 급소' : '급소↑');
  if (mv.fixedDamage) tags.push(FIXED_TAG[mv.fixedDamage] ?? `고정 ${mv.fixedDamage}`);
  if (GEN5_TAG[mv.id]) tags.push(GEN5_TAG[mv.id]);
  if (mv.priority > 0) tags.push('선제');
  if (mv.flinchChance > 0) tags.push(`풀죽음 ${mv.flinchChance}%`);
  if (mv.heal) tags.push('회복 (층 2번)');
  return tags;
}
export const effectSummary = (mv) => [...(mv.statChanges ?? []).map((c) => `${STAT_KO[API_STAT[c.stat]]} ${c.change > 0 ? '+' : ''}${c.change}`), ...(mv.ailment ? [STATUS_KO[mv.ailment]] : [])].join(' ');
// 상태이상 변화기 예상 창 경고: 면역 / 이미 상태이상 (없으면 null)
export function ailmentNote(target, mv, attacker = null) {
  const opposite = attacker && target.gender && attacker.gender && target.gender !== attacker.gender;
  if (mv.id === 'captivate') return opposite ? null : '효과 없음'; // 유혹: 반대 성별만
  if (!mv.ailment) return null;
  if (mv.ailment === 'infatuation') { // 메로메로: 반대 성별·둔감·이미 헤롱헤롱
    if (!attacker) return null;
    const r = canInfatuate(target, attacker);
    return r.ok ? null : r.reason === 'already' ? '이미 헤롱헤롱' : '효과 없음';
  }
  const r = canInflict(target, mv.ailment, mv);
  return r.ok ? null : r.reason === 'immune' ? '효과 없음' : '이미 상태이상';
}
const STATUS_LINE = {
  poison: '독의 데미지를 입었다!', toxic: '독의 데미지를 입었다!', burn: '화상 데미지를 입었다!', fainted: '쓰러졌다!',
  asleep: '쿨쿨 잠들어 있다', woke: '눈을 떴다!', frozen: '얼어 버려서 움직일 수 없다!',
  sand: '모래바람에 휘말렸다!', hail: '싸라기눈을 맞았다!', poisonPool: '독 웅덩이에 몸이 상했다!', shock: '발전기 방출에 감전됐다!', steam: '분출구 스팀에 휩쓸렸다!', basalt: '뜨거운 현무암에 데었다!', icicle: '고드름에 부딪혔다!',
};
const START_EVENTS = ['asleep', 'woke', 'frozen', 'thawed'];
// 차례 끝 회복: 회복 표시를 띄울 유닛 (씨뿌리기는 빼앗아 회복한 쪽)
const HEAL_EVENTS = { wish: (e) => e.unitId, aquaRing: (e) => (e.healed > 0 ? e.unitId : null), ingrain: (e) => (e.healed > 0 ? e.unitId : null), leech: (e) => (e.healed > 0 ? e.by : null) };
// 묘지 혼불 알림 (적 페이즈 끝): 혼불이 핀 묘비, 나타난 고스트
// hidden: 안개에 가려 안 보이는 적 id — 이름 대신 "무언가"
export function wispNotices(events = [], get, hidden = new Set()) {
  return events.map((e) => e.kind === 'lit'
    ? { lines: ['묘비에 혼불이 피어올랐다…'], at: { x: e.x, y: e.y }, hp: null }
    : { lines: [`${hidden.has(e.unitId) ? '무언가가' : josa(unitLabel(get(e.unitId)), '이/가')} 묘비에서 나타났다!`], at: hidden.has(e.unitId) ? { ...e.from } : { x: e.x, y: e.y }, hp: null }); // 가린 고스트: 카메라는 묘비로
}
// 협곡: 페이즈 끝에 낭떠러지로 떨어진 포켓몬 (중력 등으로 더는 못 뜸)
export function fallNotices(events = [], get) {
  return events.map((e) => ({ lines: [`${josa(unitLabel(get(e.unitId)), '은/는')} 낭떠러지로 떨어졌다!`], at: { x: e.x, y: e.y }, hp: null }));
}
// 압정 밟기 알림 (이동·밀려나기 뒤). fainted 면 쓰러짐 줄을 하나 더
export function trapNotices(events = [], get) {
  const out = [];
  for (const e of events) {
    const who = unitLabel(get(e.unitId)), at = { x: e.x, y: e.y };
    const w = wrapMessage(`${josa(who, '은/는')} ${TRAP_LINE[e.kind]}`);
    out.push({ lines: Array.isArray(w) ? w : [w], at, hp: e.damage ? { from: e.hpBefore, to: Math.max(0, e.hpBefore - e.damage), max: e.maxHp } : null });
    if (e.fainted) out.push({ lines: [`${josa(who, '은/는')} 쓰러졌다!`], at, hp: null });
  }
  return out;
}
const FIELD_NAME = { tailwind: '순풍', safeguard: '신비의부적', mist: '흰안개', luckyChant: '주술', reflect: '리플렉터', lightScreen: '빛의장막', mudSport: '흙놀이', waterSport: '물놀이' };
// 공격 예상 창: 속박기 한 줄
export const bindNote = (moveId) => (BIND_MOVES.has(moveId) ? `맞으면 ${BIND_TURNS}턴 속박` : null);
const EFFECT_END = { taunt: '도발이 풀렸다!', noMove: '발이 풀려 다시 움직일 수 있다!', encore: '앙코르가 풀렸다!', disable: '사슬묶기가 풀렸다!', torment: '트집이 풀렸다!', healBlock: '회복봉인이 풀렸다!' };

// 페이즈 전환 알림 목록 (순수). events: log.statusEvents, expired: log.expired, get: id → 유닛
export function phaseNotices(events, expired, get) {
  const who = (id) => unitLabel(get(id));
  const one = (e) => {
    const u = get(e.unitId);
    const text = e.kind === 'confusionEnd' ? `${who(e.unitId)}의 혼란이 풀렸다!`
      : e.kind === 'infatuationEnd' ? `${who(e.unitId)}의 헤롱헤롱이 풀렸다!`
      : e.kind === 'sealed' ? `${josa(who(e.unitId), '은/는')} 풀이 죽어 기술을 쓸 수 없다!`
      : e.kind === 'thawed' ? `${who(e.unitId)}의 얼음이 녹았다!`
      : e.kind === 'yawnSleep' ? `${josa(who(e.unitId), '은/는')} 졸음을 못 이기고 잠들었다!`
      : e.kind === 'yawnFizzle' ? `${who(e.unitId)}의 졸음이 달아났다!`
      : e.kind === 'leech' ? `씨뿌리기가 ${who(e.unitId)}의 체력을 빼앗는다!`
      : e.kind === 'curse' ? `${josa(who(e.unitId), '은/는')} 저주를 받고 있다!`
      : e.kind === 'wish' ? `${who(e.unitId)}의 소원이 이루어졌다!`
      : e.kind === 'nightmare' ? `${josa(who(e.unitId), '은/는')} 악몽에 시달리고 있다!`
      : e.kind === 'bideRelease' ? `${josa(who(e.unitId), '은/는')} 참았던 힘을 터뜨렸다!`
      : e.kind === 'foresight' ? (e.missed ? `${MOVES[e.moveId].name} 공격이 ${who(e.unitId)}에게서 빗나갔다!` : `${MOVES[e.moveId].name} 공격이 ${josa(who(e.unitId), '을/를')} 덮쳤다!`) // 두 턴 뒤 떨어짐
      : e.kind === 'bideHit' ? `${josa(who(e.unitId), '은/는')} 큰 피해를 입었다!`
      : e.kind === 'bideFail' ? `${who(e.unitId)}의 참기는 아무것도 모으지 못했다...`
      : e.kind === 'naturalCure' ? `${josa(who(e.unitId), '은/는')} 자연회복으로 상태이상이 나았다!`
      : e.kind === 'recharge' ? `${josa(who(e.unitId), '은/는')} ${e.hide ? '자세를 가다듬느라 기술을 쓸 수 없다!' : '반동으로 기술을 쓸 수 없다!'}`
      : e.kind === 'bind' ? `${josa(who(e.unitId), '은/는')} ${MOVES[e.moveId].name}의 데미지를 입고 있다!`
      : e.kind === 'bindEnd' ? `${josa(who(e.unitId), '은/는')} ${MOVES[e.moveId].name}에서 풀려났다!`
      : e.kind === 'aquaRing' ? `${josa(who(e.unitId), '은/는')} 아쿠아링으로 체력을 회복했다!`
      : e.kind === 'ingrain' ? `${josa(who(e.unitId), '은/는')} 뿌리로 양분을 흡수했다!`
      : e.kind === 'effectEnd' ? `${who(e.unitId)}의 ${EFFECT_END[e.effect] ?? '효과'}`
      : e.kind === 'fieldEnd' ? `${FIELD_NAME[e.what] ?? '전장'}의 효과가 사라졌다!`
      : e.kind === 'weatherEnd' ? '날씨가 원래대로 돌아왔다!'
      : `${josa(who(e.unitId), '은/는')} ${STATUS_LINE[e.kind]}`;
    const w = wrapMessage(text);
    return {
      lines: Array.isArray(w) ? w : [w],
      at: e.x !== undefined ? { x: e.x, y: e.y } : u ? { x: u.x, y: u.y } : null,
      hp: e.damage ? { from: e.hpBefore, to: Math.max(0, e.hpBefore - e.damage), max: e.maxHp } : null,
      ...(HEAL_EVENTS[e.kind] ? (() => { const id = HEAL_EVENTS[e.kind](e); return id ? { heal: [id] } : {}; })() : {}), // 회복 표시를 띄울 유닛
    };
  };
  const exp = expired.flatMap((e) => {
    const u = get(e.unitId);
    return u ? e.keys.map((k) => {
      const w = wrapMessage(u.stages?.[k] ? `${unitLabel(u)}의 ${STAT_KO[k]} 변화 일부가 풀렸다!` : `${unitLabel(u)}의 ${josa(STAT_KO[k], '이/가')} 원래대로 돌아왔다!`); // 다른 층이 남아 있으면 '일부'
      return { lines: Array.isArray(w) ? w : [w], at: { x: u.x, y: u.y }, hp: null };
    }) : [];
  });
  return [...events.filter((e) => !START_EVENTS.includes(e.kind)).map(one), ...exp, ...events.filter((e) => START_EVENTS.includes(e.kind)).map(one)];
}

const TRASH_BURST = ['#20382a', '#3e7050', '#7a8a70', '#b8b8a0', '#e8e8d8']; // 쓰레기통 열림
const BAG_BURST = ['#141418', '#2a2a34', '#4a4a56', '#8a8a96', '#d0d0d8']; // 쓰레기봉투 열림
const SCRAP_BURST = ['#16181c', '#7a3e20', '#a8582c', '#8a919a', '#c0c6cc']; // 고철더미 열림
const WARP_BLUE = ['#102040', '#2050c0', '#50a0ff', '#b0e0ff', '#ffffff'], WARP_ORANGE = ['#402010', '#c05010', '#ff9030', '#ffd090', '#ffffff']; // 워프 반짝임
const CHAIN_SPARK = ['#1a2050', '#2c58c8', '#4a9cff', '#8ad8ff', '#e8f870', '#fffbc0', '#ffffff'], CHAIN_FIRE = ['#4a1712', '#c9281f', '#f2561d', '#ff8a2a', '#ffe26b', '#fff3a6', '#ffffff']; // 연쇄 번쩍임
const unitLabel = (u) => (u.side === 'enemy' ? '상대 ' : '') + spec(u).name;

// 낙엽더미 대사 (arrive 의 piles 순서대로). 포켓몬: 튀어나옴 + 기습(피해 표시), 상자: 아이템
export function pileNotices(piles = [], ally, get, word = '낙엽') { // word: 해변은 '모래'
  let hp = ally.hp + piles.reduce((n, p) => n + (p.damage ?? 0), 0); // 첫 기습 전 HP
  return piles.map((p) => {
    if (p.kind === 'chest') return { lines: [`${word} 속에 ${josa(ITEM_NAME[p.item] ?? '아이템', '이/가')} 있었다!`], at: { x: p.x, y: p.y }, hp: null, item: true };
    const e = get(p.unitId), before = hp; hp -= p.damage;
    return { lines: [`${word} 속에서 ${josa(e ? unitLabel(e) : '포켓몬', '이/가')} 튀어나왔다!`, `${josa(unitLabel(ally), '은/는')} 기습을 받았다!`], at: { x: ally.x, y: ally.y }, hp: p.damage ? { from: before, to: hp, max: ally.maxHp } : null };
  });
}

// 특성 발동 → 대사 (순수). 자주 나오는 가속은 대사 없이 (정보창 랭크로 보임), 습기는 공격 연출이 이미 말함
const abilityName = (id) => ABILITIES[id]?.name ?? id;
const HEAL_ABILITIES = ['volt-absorb', 'water-absorb', 'dry-skin', 'rain-dish', 'ice-body', 'poison-heal', 'regenerator'];
const WEATHER_START = { drizzle: '비가 내리기 시작했다!', drought: '햇살이 강해졌다!', 'sand-stream': '모래바람이 불기 시작했다!', 'snow-warning': '싸라기눈이 내리기 시작했다!' };
const QUIET_ABILITIES = ['speed-boost', 'damp'];
// 지니는 도구 발동 문구
export function itemLine(e, who) {
  const name = HELD_ITEMS[e.item]?.name ?? '도구';
  if (e.survived) return `${josa(who, '은/는')} ${josa(name, '으로/로')} 버텼다!`;
  if (e.item === 'life-orb') return `${josa(who, '은/는')} 생명이 조금 깎였다!`;
  if (e.item === 'white-herb') return `${who}의 하얀허브! 떨어진 능력이 돌아왔다!`;
  if (e.damage) return `${josa(who, '은/는')} ${name} 때문에 피해를 입었다!`;
  return `${who}의 ${name}!`;
}
export function abilityNotices(events = [], get) {
  return events.filter((e) => e.item || !QUIET_ABILITIES.includes(e.ability)).flatMap((e) => {
    const u = get(e.unitId);
    if (!u) return [];
    if (e.item) return [{ lines: [itemLine(e, unitLabel(u))], at: { x: u.x, y: u.y }, hp: null }]; // 지니는 도구
    const who = unitLabel(u), name = abilityName(e.ability), t = e.target ? get(e.target) : null;
    let text, at = { x: u.x, y: u.y };
    if (e.ability === 'intimidate' && t) text = e.applied ? `${who}의 위협! ${unitLabel(t)}의 공격이 떨어졌다!` : `${who}의 위협! 그러나 ${unitLabel(t)}의 공격은 떨어지지 않았다!`;
    else if (e.ability === 'bad-dreams' && t) { text = `${josa(unitLabel(t), '은/는')} 나이트메어에 시달리고 있다!`; at = { x: t.x, y: t.y }; }
    else if (e.ability === 'sturdy') text = `${josa(who, '은/는')} 옹골참으로 버텼다!`;
    else if (e.ability === 'truant') text = `${josa(who, '은/는')} 게으름을 피우고 있다!`;
    else if (e.ability === 'trace') text = `${josa(who, '은/는')} 트레이스로 ${josa(abilityName(e.copied), '을/를')} 복사했다!`;
    else if (WEATHER_START[e.ability]) text = `${who}의 ${name}! ${WEATHER_START[e.ability]}`;
    else if (e.ability === 'cursed-body' && t) text = `${who}의 저주받은바디! ${unitLabel(t)}의 기술이 사슬묶기됐다!`;
    else if (e.ability === 'mummy') text = `${who}의 미라! 상대의 특성이 미라가 됐다!`;
    else if (e.ability === 'healer' && t) { text = `${who}의 치유의마음! ${josa(unitLabel(t), '이/가')} 나았다!`; at = { x: t.x, y: t.y }; }
    else if (e.ability === 'magic-bounce' && t) text = `${who}의 매직미러! ${unitLabel(t)}에게 기술을 되돌렸다!`;
    else if (e.ability === 'synchronize') text = `${who}의 싱크로! 상태이상이 상대에게도 옮았다!`;
    else if (HEAL_ABILITIES.includes(e.ability) && !e.damage) text = `${josa(who, '은/는')} ${josa(name, '으로/로')} HP를 회복했다!`;
    else text = `${who}의 ${name}!`;
    // "○○의 위협! …" 은 느낌표에서 줄을 나눈다 (두 줄 다 들어가면)
    const cut = text.indexOf('! ');
    const two = cut > 0 ? [text.slice(0, cut + 1), text.slice(cut + 2)] : null;
    const w = two && two.every((l) => !Array.isArray(wrapMessage(l))) ? two : wrapMessage(text);
    return [{ lines: Array.isArray(w) ? w : [w], at, hp: null }];
  });
}

// 위험예지·예지몽: 이 적이 그 특성을 가진 아군에게 효과가 굉장한 기술을 가졌으면 경고 문구
export function dangerWarning(enemy, units, weather = null) {
  if (enemy.side !== 'enemy') return null;
  for (const a of units) {
    if (a.side !== 'ally' || !(hasAbility(a, 'anticipation') || hasAbility(a, 'forewarn'))) continue;
    if (enemy.moves.some((m) => MOVES[m].category !== 'status' && typeEffect(enemy, a, MOVES[m], weather) > 1)) return `! ${spec(a).name}에게 효과 굉장`;
  }
  return null;
}

export function createGame({ rng, map, party, hpRatio, theme = 'field', floorLabel = null, onExit }) {
  let st, mode, cursor, sel, origin, reach, atkTiles, menu, menuSel, menuBox;
  let aims = null, aIdx = 0, enemyUnseen = new Set(); // 공격기 조준 후보와 현재 선택
  let slide = null; // 사막 밀림·끌림 · 화산동굴 스팀 밀림 연출 { moves: [{ unit, from, to }], t, dur, lines, then, prevMode }
  let steamFx = null; // 화산동굴: 분출 연출 { vents, at }
  let move, targets, tIdx, walk, anim, animThen, animAbility = null, animResult = null, banner, enemyQueue, pause, focus;
  let resultT = 0, clock = 0, everyone;
  let notice = null; // { lines, then } 대사 후 다음 단계
  let moveLocked = false; // 보물상자를 연 이동은 취소할 수 없다
  const cam = { x: 0, y: 0 };
  // pixelfx 이펙트 (브라우저면 오프스크린 캔버스로 그림, 테스트에선 계산만)
  const fxm = createFxManager({ makeCanvas: typeof document !== 'undefined' ? (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) : null });
  const facing = {};

  let autumnGround = null, beachGround = null, cityGround = null, sewerGround = null, powerGround = null, desertGround = null, volcanoGround = null, iceGround = null, graveGround = null, canyonGround = null, pulseFx = null; // pulseFx: 발전기 방출 연출 { gens, at }
  function reset() {
    st = createBattle(map, party, { hpRatio });
    st.grid.trees = !['cave', 'deep-cave', 'sewer', 'power-plant', 'desert', 'volcano', 'ice', 'graveyard'].includes(theme ?? 'field'); // 벽이 나무인 맵: 유연이 지나갈 수 있음 (동굴·하수도 벽은 아님)
    fxm.clear();
    everyone = new Map(st.units.map((u) => [u.id, u])); // 기절해 사라진 유닛 이름도 대사에 쓰도록
    if (theme === 'autumn') { // 단풍 숲: 단풍길(출발 → 계단, 보스 층이면 보스 자리) = 불꽃 연쇄 칸 + 바닥 층을 미리 굽는다
      const goal = st.stairs ?? st.units.find((u) => u.boss) ?? null;
      const route = leafRoute(map.tiles, map.allySlots[0], goal);
      st.leafTiles = route;
      if (typeof document !== 'undefined') try { autumnGround = bakeAutumnGround(map.tiles, route); } catch { autumnGround = null; }
    }
    if (theme === 'city' && typeof document !== 'undefined') { try { cityGround = bakeCityGround(map.tiles); } catch { cityGround = null; } } // 시티: 도로·건물 (워프·가로수는 매 프레임)
    if (theme === 'sewer' && typeof document !== 'undefined') { try { sewerGround = bakeSewerGround(map.tiles); } catch { sewerGround = null; } } // 하수도: 벽·바닥·물길 (물결·거품·타이어·봉투는 매 프레임)
    if (theme === 'canyon' && typeof document !== 'undefined') { try { canyonGround = bakeCanyonGround(map.tiles); } catch { canyonGround = null; } } // 협곡: 풀밭·능선·절벽면·덩굴·낭떠러지·개울 (나무·바위·안개·반짝임은 매 프레임)
    if (theme === 'graveyard' && typeof document !== 'undefined') { try { graveGround = bakeGraveyardGround(map.tiles); } catch { graveGround = null; } } // 묘지: 풀밭 묘역·묘역 띠·돌담·연못·납골당 계단 (묘비·나무·혼불은 매 프레임)
    if (theme === 'ice' && typeof document !== 'undefined') { try { iceGround = bakeIceGround(map.tiles); } catch { iceGround = null; } } // 얼음동굴: 돌판·눈·호수·벽·계단 (빙판·고드름·눈더미는 매 프레임)
    if (theme === 'volcano' && typeof document !== 'undefined') { try { volcanoGround = bakeVolcanoGround(map.tiles); } catch { volcanoGround = null; } } // 화산동굴: 화산암·현무암·벽·물 (용암·분출구·스팀은 매 프레임)
    if (theme === 'desert' && typeof document !== 'undefined') { try { desertGround = bakeDesertGround(map.tiles); } catch { desertGround = null; } } // 사막: 모래·사구·모래지옥·절벽·계단 (모래결·소용돌이·바위는 매 프레임)
    if (theme === 'power-plant' && typeof document !== 'undefined') { try { powerGround = bakePowerGround(map.tiles); } catch { powerGround = null; } } // 발전소: 철판·기계 벽 (발전기·가벽·고철더미·예고는 매 프레임)
    if (theme === 'beach' && typeof document !== 'undefined') { try { beachGround = bakeBeachGround(map.tiles); } catch { beachGround = null; } } // 해변: 모래 바닥 (물은 매 프레임)
    mode = 'banner';
    const first = st.units.find((u) => u.side === 'ally');
    cursor = first ? { x: first.x, y: first.y } : { x: 2, y: 5 };
    sel = walk = anim = banner = pause = focus = notice = slide = null;
    for (const u of st.units) facing[u.id] = u.side === 'ally' ? DIR.Right : DIR.Left;
    const t = camTarget(cursor);
    cam.x = t.x; cam.y = t.y;
  }

  const mapW = () => st.width * TILE, mapH = () => st.height * TILE;
  const clampCam = (x, y) => ({ x: Math.max(0, Math.min(mapW() - W, x)), y: Math.max(0, Math.min(mapH() - H, y)) });

  // 대상 타일이 화면 가장자리 MARGIN 칸 안쪽에 오도록 하는 카메라 목표
  function camTarget(t) {
    let { x, y } = cam;
    const px = t.x * TILE, py = t.y * TILE, m = MARGIN * TILE;
    if (px - x < m) x = px - m;
    if (px + TILE - x > W - m) x = px + TILE - W + m;
    if (py - y < m) y = py - m;
    if (py + TILE - y > H - m) y = py + TILE - H + m;
    return clampCam(x, y);
  }

  reset();

  const allyUnits = () => st.units.filter((u) => u.side === 'ally');
  const inMap = (x, y) => x >= 0 && y >= 0 && x < st.width && y < st.height;
  const toTile = (ev) => ({ x: Math.floor((ev.px + Math.round(cam.x)) / TILE), y: Math.floor((ev.py + Math.round(cam.y)) / TILE) });

  // 고를 수 있는 대상(적 하나·아군 하나) 또는 기술이 닿는 유닛들(자신·범위형)
  const MV = (id) => moveFor(sel, id); // 고르는 중인 유닛 기준 기술 (저주)
  function targetsFor(unit, moveId) {
    const mv = moveFor(unit, moveId); // 저주: 고스트면 적 하나
    if (!pickOne(mv)) return targetsOf(st, unit, mv);
    const [min, max0] = mv.range, max = max0 + sniperBonus(unit, max0); // 스나이퍼
    const want = mv.kind === 'ally' ? (o) => o.side === unit.side && o !== unit : (o) => o.side !== unit.side;
    const dark = darkIds();
    return st.units.filter((o) => want(o) && manhattan(unit, o) >= min && manhattan(unit, o) <= max && canTarget(mv, o) && !dark.has(o.id)); // 숨은 포켓몬 제외
  }

  // 안개: 지금 아군 누구에게서도 FOG_SIGHT 이상 떨어진 적 (실시간)
  const litWisps = () => new Set(st.result ? [] : (st.wisps ?? []).filter((w) => w.lit).map((w) => `${w.x},${w.y}`)); // 묘지: 글자가 빛나는 묘비
  const hiddenIds = () => new Set(st.weather === 'fog' ? st.units.filter((u) => u.side === 'enemy' && isHidden(u, allyUnits())).map((u) => u.id) : []);

  // 악 수풀 숨기: 아군 누구에게서도 3칸 밖 수풀의 악 타입 적 — 맵에서 아예 안 보임 (안개의 회색 도트와 달리)
  const darkIds = () => hiddenFrom(st, 'ally');
  const sameAim = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const seenUnits = () => { const d = darkIds(); return st.units.filter((u) => !d.has(u.id)); };
  // 아군 이동 경로: 보이는 유닛 기준. 숨은 적 칸에 닿으면 그 앞에서 멈추고 적이 드러남 (걷기 끝에 알림)
  let bumped = null;
  function allyPath(u, x, y) {
    const d = darkIds(), path = pathTo(st.grid, seenUnits(), u, x, y);
    const i = path.findIndex((p, k) => k > 0 && st.units.some((o) => d.has(o.id) && o.x === p.x && o.y === p.y));
    if (i < 0) return path;
    bumped = st.units.find((o) => d.has(o.id) && o.x === path[i].x && o.y === path[i].y);
    bumped.revealed = true;
    return path.slice(0, i);
  }
  const seenAt = (x, y) => { const u = unitAt(st, x, y); return u && !darkIds().has(u.id) ? u : null; };

  // 공격기: 보이는 적이 하나 이상 맞는 조준 + 숨은 적이 있으면 비어 보이는 수풀 칸을 덮는 조준 (기억으로 겨냥)
  const attackAims = (unit, mv) => {
    const dark = darkIds();
    const seen = aimsOf(st, unit, mv).filter((a) => unitsHit(st, unit, mv, a).some((u) => u.side !== unit.side && !dark.has(u.id)));
    const extra = unit.side === 'ally' ? guessAims(st, unit, mv).filter((g) => !seen.some((a) => sameAim(a, g) || (a.unitId && st.units.find((o) => o.id === a.unitId && o.x === g.x && o.y === g.y)))) : [];
    return [...seen, ...extra];
  };
  const curAim = () => (aims ? aims[aIdx] : null);
  // 조준의 대표 칸 (커서 위치)
  // 압정(칸 조준): 사거리 1~3 의 벽 아닌 칸 / 덮는 칸 = 그 칸 + 4방
  const trapAims = (unit) => tilesInRange(unit.x, unit.y, [1, 3], st.width, st.height).filter((t) => !'#T'.includes(st.grid[t.y][t.x])).map((t) => ({ x: t.x, y: t.y }));
  const aimsFor = (unit, mv) => (mv.effect === 'teleport' ? teleportSpots(st, unit) : mv.aimTile ? trapAims(unit) : attackAims(unit, mv)); // 순간이동: 갈 수 있는 빈 칸
  const coverOf = (unit, mv, aim) => (mv.effect === 'teleport' ? [{ x: aim.x, y: aim.y }] : mv.aimTile ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: aim.x + dx, y: aim.y + dy })).filter((t) => st.grid[t.y]?.[t.x] !== undefined && !'#T'.includes(st.grid[t.y][t.x])) : tilesOf(st, unit, mv, aim));
  function aimPoint(aim) {
    if (aim.unitId) { const u = st.units.find((o) => o.id === aim.unitId); return { x: u.x, y: u.y }; }
    if (aim.dir) return tilesOf(st, sel, MV(move), aim)[0] ?? { x: sel.x, y: sel.y };
    if (aim.self) return { x: sel.x, y: sel.y };
    return { x: aim.x, y: aim.y };
  }
  function fireAim() {
    const aim = curAim();
    const one = aim.unitId ? st.units.find((o) => o.id === aim.unitId) : null;
    doAttack(sel, one, move, finishAllyAction, aim);
  }

  // 페이즈 종료 때 풀린 랭크 → 대사 (한 건씩)
  // 페이즈 전환 알림: { lines, at?, hp? } — 스펙 순서(끝 데미지 → 랭크 만료 → 시작)
  // 층 시작 특성 대사 — 안개 속 적의 것은 정체가 드러나므로 뺀다
  const floorNotices = () => abilityNotices((st.floorAbilityEvents ?? []).filter((e) => !hiddenIds().has(e.unitId) && !darkIds().has(e.unitId)), (id) => everyone.get(id));
  const phaseLines = () => { const get = (id) => everyone.get(id), d = darkIds(), seen = (e) => !d.has(e.unitId); return [...fallNotices(st.log.falls, get), ...abilityNotices((st.log.phaseAbilityEvents ?? []).filter(seen), get), ...phaseNotices((st.log.statusEvents ?? []).filter(seen), (st.log.expired ?? []).filter(seen), get)]; }; // 숨은 악 타입 일은 알리지 않음

  // list: 대사 줄 또는 { lines, at, hp } 알림
  function noticeChain(list, then) {
    if (!list.length) { then(); return; }
    const [first, ...rest] = list;
    const n = first.lines ? first : { lines: Array.isArray(first) ? first : [first] };
    showNotice(n.lines, () => noticeChain(rest, then), n);
  }

  function attackTilesFrom(unit, tiles) {
    const attacks = unit.moves.map((id) => MOVES[id]).filter((mv) => mv.category !== 'status');
    const set = new Map();
    const add = (t) => {
      const key = `${t.x},${t.y}`;
      if (!tiles.has(key)) set.set(key, t);
    };
    if (attacks.some((mv) => mv.shape?.aim === 'allies')) {
      for (const ally of st.units.filter((o) => o !== unit && o.hp > 0 && o.side === unit.side)) {
        tilesInRange(ally.x, ally.y, [1, 1], st.width, st.height).forEach(add);
      }
    }
    const shaped = attacks.filter((mv) => ['straight', 'neighbors'].includes(mv.shape?.aim) || mv.id === 'fusion-bolt');
    const other = attacks.filter((mv) => !shaped.includes(mv));
    const maxR = Math.max(attacks.length ? 0 : 1, ...other.map((mv) => mv.range[1] + sniperBonus(unit, mv.range[1])));
    for (const k of tiles.keys()) {
      const [x, y] = k.split(',').map(Number);
      tilesInRange(x, y, [1, maxR], st.width, st.height).forEach(add);
      const ghost = { ...unit, x, y };
      for (const mv of shaped) {
        const [lo, base] = mv.aimRange;
        const hi = base + sniperBonus(unit, base);
        const reach = mv.id === 'fusion-bolt' || mv.shape.aim === 'neighbors' ? 2 : hi;
        for (const t of tilesInRange(x, y, [1, reach], st.width, st.height)) {
          if (singleInReach(st, ghost, mv, t, lo, hi)) add(t);
        }
      }
    }
    return [...set.values()];
  }

  // ---------- 흐름 ----------
  function showBanner(text, sub, color, next) {
    banner = { text, sub, color, t: 0, next };
    mode = 'banner';
  }

  // 대사 뒤: 결과가 났으면 결과 화면, 아군이 전원 쉬면(잠듦·얼음) 바로 상대 턴
  const weatherTag = () => (st.weather ? ` · ${WEATHER_KO[st.weather]}${st.weatherTimer ? ` (${st.weatherTimer.turns})` : ''}` : ''); // 날씨 부르기 남은 턴
  // 해변 물때: 바뀐 라운드에 알림, 한 라운드 전에 예고
  const TIDE_NOW = { 1: '밀물이 들어왔다!', 0: '물때가 돌아왔다.', '-1': '물이 빠졌다!' };
  const TIDE_NEXT = { 1: '파도가 높아진다… 다음 턴에 밀물이 들어온다!', 0: '다음 턴에 물때가 돌아온다.', '-1': '파도가 잦아든다… 다음 턴에 물이 빠진다!' };
  const tideLines = () => {
    if (!st.tideCells) return [];
    const out = [];
    if (st.turn > 1 && tideFor(st.turn) !== tideFor(st.turn - 1)) out.push(TIDE_NOW[st.tide]);
    const pv = tidePreview(st);
    if (pv) out.push(TIDE_NEXT[pv.next]);
    return out;
  };
  const playerPhase = (lines0 = []) => { const lines = [...tideLines(), ...lines0]; return showBanner('아군 턴', (floorLabel ? `${floorLabel} · ${st.turn}턴째` : `${st.turn}턴째`) + weatherTag(), '#4080f8',
    () => noticeChain(lines, () => runCharges('ally', () => runBots(() => {
      focus = null;
      if (st.result) { mode = 'result'; return; }
      if (allyUnits().every((u) => u.acted)) { enemyPhase(); return; }
      mode = 'idle';
    })))); };

  // 스피드 보너스: 그 편 페이즈가 끝나기 직전 가장 빠른 유닛이 한 번 더 (페이즈마다 1번)
  const bonusLine = (u) => `${josa(unitLabel(u), '이/가')} 한 번 더 움직인다`;
  function enemyPhase() {
    sel = null;
    const idle = terrainEnds() ? unsettled(st, 'ally')[0] : null; // 사막: 행동 안 한·잠든 아군도 차례가 끝나면 모래 판정 (손톱 굴림보다 먼저 — 한 번만 굴리게)
    if (idle) { settleSand(idle, enemyPhase); return; }
    if (st.result) { mode = 'result'; return; }
    const bonus = speedBonusUnit(st, 'ally');
    const claw = bonus ? null : quickClawUnit(st, 'ally', rng); // 스피드 보너스 다음에 손톱
    const extra = bonus ?? claw;
    if (extra) {
      if (bonus) st.bonusGiven = true; else st.quickGiven = true;
      extra.moved = extra.acted = false; extra.spent = 0; extra.retreatReady = false; extra.retreated = false;
      showBanner(bonus ? '스피드 보너스!' : `${unitLabel(extra)}의 선제공격손톱!`, bonusLine(extra), '#40c8a0', () => { cursor = { x: extra.x, y: extra.y }; mode = 'idle'; });
      return;
    }
    endPhase(st, rng);
    const lines = phaseLines();
    if (st.result) { noticeChain(lines, () => { mode = 'result'; }); return; } // 결과가 났으면 다음 턴 배너 없이
    showBanner('상대 턴', null, '#f84040', () => noticeChain(lines, () => {
      if (st.result) { mode = 'result'; return; }
      enemyQueue = enemyTurnOrder(st).map((u) => u.id);
      // 안개: 적 차례 시작 때 적 누구에게서도 먼 아군은 이번 차례 안 보인다
      enemyUnseen = st.weather === 'fog' ? new Set(allyUnits().filter((a) => isHidden(a, st.units.filter((u) => u.side === 'enemy'))).map((a) => a.id)) : new Set();
      mode = 'enemy';
      runCharges('enemy', () => { mode = 'enemy'; nextEnemy(); }); // 준비 기술 발사 먼저
    }));
  }

  function nextEnemy() {
    if (st.result) { mode = 'result'; return; }
    const id = enemyQueue.shift();
    if (!id) {
      const bonus = speedBonusUnit(st, 'enemy');
      const claw = bonus ? null : quickClawUnit(st, 'enemy', rng); // 적은 도구가 없지만 같은 규칙
      const extra = bonus ?? claw;
      if (extra) { // 적 스피드 보너스
        if (bonus) st.bonusGiven = true; else st.quickGiven = true;
        extra.moved = extra.acted = false; enemyQueue.push(extra.id);
        const lurk = darkIds().has(extra.id); // 숨은 악 타입이면 누군지 밝히지 않음
        showBanner(bonus ? '스피드 보너스!' : lurk ? '선제공격손톱!' : `${unitLabel(extra)}의 선제공격손톱!`, lurk ? null : bonusLine(extra), '#f08040', () => { mode = 'enemy'; nextEnemy(); });
        return;
      }
      endPhase(st, rng);
      if (st.log.pulsed?.length) { pulseFx = { gens: st.log.pulsed, at: clock }; } // 발전소: 방출 번개
      if (st.log.steamed?.length) steamFx = { vents: st.log.steamed, at: clock }; // 화산동굴: 스팀 기둥
      for (const e of st.log.wisps ?? []) if (e.unitId) { const u = st.units.find((o) => o.id === e.unitId); everyone.set(u.id, u); facing[u.id] = DIR.Left; requestSprites([u.species]); } // 묘지: 혼불에서 나온 고스트
      const go = () => {
        cursor = { ...(allyUnits()[0] ?? cursor) };
        if (st.result) { noticeChain(phaseLines(), () => { mode = 'result'; }); return; }
        playerPhase([...wispNotices(st.log.wisps, (id) => everyone.get(id), hiddenIds()), ...phaseLines()]);
      };
      const pushes = (st.log.steamPushes ?? []).map((p) => ({ unit: everyone.get(p.unitId), from: p.from, to: p.to })).filter((m) => m.unit && st.units.includes(m.unit));
      if (pushes.length) startSlide(pushes, 0.25 + 0.07 * Math.max(...pushes.map((m) => Math.abs(m.to.x - m.from.x) + Math.abs(m.to.y - m.from.y))), [], go); // 스팀에 밀려나는 포켓몬들 (동시에)
      else go();
      return;
    }
    const u = st.units.find((o) => o.id === id);
    if (!u) { nextEnemy(); return; } // 기절
    if (u.acted) { if (u.sandTurn === st.turn) nextEnemy(); else settleSand(u, nextEnemy); return; } // 모으기 발사로 이미 정산했으면 두 번 안 함 // 잠듦·얼음으로 쉬는 중 (사막: 모래는 그래도 민다)
    // 깊은 동굴: 아무도 못 보면 순찰·추적·수색 (core/hunt.js), 보이면 그 적이 보는 아군만 노림
    const blind = st.dark ? new Set(allyUnits().filter((a) => !canSee(u, a)).map((a) => a.id)) : new Set();
    const plan = (u.ambush && ambushPlan(st, u)) || (st.dark && huntPlan(st, u, rng)) || planEnemyAction(st, u, { unseen: new Set([...enemyUnseen, ...hiddenFrom(st, 'enemy', { dark: false }), ...blind]) }); // 안개 + 수풀에 숨은 악 타입 아군
    if (u.sealed) plan.attack = null; // 풀죽음: 이번 차례 기술 봉인 (이동만)
    // 안개: 이동한 뒤에도 안개 속이면 기술을 쓰지 않는다 (대사로 정체가 드러나지 않게)
    if (st.weather === 'fog' && plan.attack && isHidden(plan.moveTo, allyUnits())) plan.attack = null;
    const sneaky = darkIds().has(u.id) && !plan.attack; // 숨은 악 타입이 숨은 채 움직임: 카메라·커서가 따라가지 않음
    if (!sneaky) { focus = u; cursor = { x: u.x, y: u.y }; }
    pause = { t: sneaky ? 0.05 : 0.35, fn: () => {
      startWalk(u, pathTo(st.grid, st.units, u, plan.moveTo.x, plan.moveTo.y), () => {
        if (!sneaky) cursor = { ...plan.moveTo };
        if (plan.attack) {
          const target = st.units.find((o) => o.id === plan.attack.targetId);
          pause = { t: 0.2, fn: () => doAttack(u, target, plan.attack.moveId, () => enemyRetreat(u), plan.attack.aim) };
        } else {
          u.acted = true;
          pause = { t: 0.2, fn: () => settleSand(u, nextEnemy) };
        }
      });
    } };
  }

  // 적 치고 빠지기: 아군에게서 가장 먼 칸으로
  function enemyRetreat(u) {
    const done = () => settleSand(u, nextEnemy); // 사막: 행동이 끝난 자리에서 모래 판정
    const left = canRetreat(st, u);
    if (!left) { done(); return; }
    const t = retreatSpot(st, u, left);
    u.retreatReady = false; u.retreated = true;
    if (!t || (t.x === u.x && t.y === u.y)) { done(); return; }
    pause = { t: 0.15, fn: () => startWalk(u, pathTo(st.grid, st.units, u, t.x, t.y), done) };
  }

  // 사막: 행동을 마친 유닛을 흐르는 모래·모래지옥이 밀거나 끌어당김 (core/sand.js). 짧게 미끄러진 뒤 알림
  // 화산동굴: 행동을 마친 칸이 현무암이면 열 피해 (core battle.basaltHeat)
  const terrainEnds = () => !!(st.flows || st.vents?.length); // 행동 끝 지형 정산이 있는 맵 (사막·화산동굴)
  function settleSand(u, then) {
    if (!terrainEnds() || !u || !st.units.includes(u)) { then(); return; }
    markSettled(st, u); // 결과가 났어도 표시 — 안 그러면 enemyPhase 가 같은 아군을 다시 골라 무한 반복
    if (st.result) { then(); return; }
    const quiet = u.side !== 'ally' && darkIds().has(u.id);
    if (st.vents?.length) {
      const evs = basaltHeat(st, u);
      noticeChain(evs.length && !quiet ? phaseNotices(evs, [], (id) => everyone.get(id)) : [], then);
      return;
    }
    const ev = sandShift(st, u);
    if (!ev) { then(); return; }
    if (!quiet) { focus = u; cursor = { ...ev.to }; }
    const line = ev.kind === 'pit' ? `${josa(unitLabel(u), '이/가')} 모래지옥에 빨려 들어갔다!` : `${josa(unitLabel(u), '이/가')} 모래에 밀려났다!`;
    startSlide([{ unit: u, from: ev.from, to: ev.to }], SLIDE, quiet ? [] : [{ lines: [wrapMessage(line)].flat(), at: { ...ev.to }, hp: null }], then);
  }
  function startSlide(moves, dur, lines, then) {
    slide = { moves, t: 0, dur, lines, then, prevMode: mode };
    mode = 'sliding';
  }

  // 압정에 쓰러져 행동이 끝남: 아군은 다음 선택, 적은 다음 적
  // 준비 기술: 그 편 페이즈 시작에 모아 둔 포켓몬이 차례로 대상에게 돌진해 발사 (이동력 무시). 불발이면 알림 후 평소대로
  function runCharges(side, then) {
    const queue = st.units.filter((u) => u.side === side && u.charging);
    const next = () => {
      if (st.result) { mode = 'result'; return; }
      const u = queue.shift();
      if (!u) { then(); return; }
      if (!st.units.includes(u)) { next(); return; }
      if (u.acted && u.status !== 'sleep' && u.status !== 'freeze') { next(); return; } // 게으름 등으로 쉬면 발사도 다음으로 (잠듦·얼음은 불발)
      const route = chargeRoute(st, u);
      if (!route) {
        const raging = !!u.rampage; u.charging = null; u.rampage = null; // 난동: 쫓아가지 못하면 그냥 멈춤 (혼란 없음)
        noticeChain([{ lines: [wrapMessage(raging ? `${unitLabel(u)}의 난동이 멈췄다!` : `${unitLabel(u)}의 모은 힘이 흩어졌다!`)], at: { x: u.x, y: u.y } }], next);
        return;
      }
      const mv = MOVES[u.charging.moveId];
      focus = u; cursor = { x: u.x, y: u.y };
      startWalk(u, route.path, () => {
        const target = unitsHit(st, u, mv, route.aim).find((d) => d.side !== u.side) ?? null;
        attackWith(u, target, mv, () => { u.moved = true; u.acted = true; u.charging = null; settleSand(u, next); }, route.aim); // 막혀도 모은 힘은 씀
      }, () => next());
    };
    next();
  }

  // 아군 봇(튀어오르기 갸라도스): 아군 차례 시작에 적 AI 와 같은 판단으로 혼자 움직인다
  function runBots(then) {
    const queue = st.units.filter((u) => u.side === 'ally' && u.bot && !u.acted);
    const next = () => {
      if (st.result) { mode = 'result'; return; }
      const u = queue.shift();
      if (!u) { then(); return; }
      if (!st.units.includes(u) || u.acted) { next(); return; }
      const plan = planEnemyAction(st, u, { unseen: darkIds() }); // 숨은 악 타입 적은 봇도 모름
      if (u.sealed) plan.attack = null;
      focus = u; cursor = { x: u.x, y: u.y };
      startWalk(u, pathTo(st.grid, st.units, u, plan.moveTo.x, plan.moveTo.y), () => {
        const done = () => { u.moved = true; u.acted = true; settleSand(u, next); };
        if (!plan.attack) { done(); return; }
        const target = st.units.find((o) => o.id === plan.attack.targetId);
        doAttack(u, target, plan.attack.moveId, done, plan.attack.aim);
      }, () => next());
    };
    next();
  }

  function afterTrapFaint(unit) {
    if (st.result) { mode = 'result'; return; }
    if (unit.side === 'ally') {
      sel = null;
      if (allyUnits().every((u) => u.acted)) enemyPhase(); else mode = 'idle';
    } else nextEnemy();
  }

  function startWalk(unit, path, onDone, onDead = null, warp = false) { // warp: 플레이어가 고른 아군 이동만 워프를 탄다 (모으기 돌진·봇은 안 탐)
    if (path.length > 1 && unit.pursuedBy && !walk) { // 따라가때리기: 멀어지려 하면 걷기 전에 한 번 맞음
      const by = st.units.find((o) => o.id === unit.pursuedBy);
      const r = by && pursuitStrike(st, unit, path.at(-1), rng);
      if (r) {
        facing[by.id] = dirFromDelta(unit.x - by.x, unit.y - by.y);
        anim = createAttackAnim({ attacker: by, defenders: r.blocked ? [] : [unit], move: MOVES.pursuit, result: r, lookup: (id) => st.units.find((u) => u.id === id) ?? [by, unit].find((u) => u.id === id), aim: { unitId: unit.id }, endPt: null, fx: fxm });
        animThen = () => (st.units.includes(unit) ? startWalk(unit, path, onDone, onDead, warp) : (onDead ?? afterTrapFaint)(unit));
        animAbility = r.abilityEvents; animResult = r; focus = unit; mode = 'anim';
        return;
      }
    }
    path = lethalTrapCut(st, unit, path); // 압정에 쓰러질 칸에서 걷기를 멈춘다
    const ts = [0]; // 칸마다 도착 시각: 빙판 미끄럼 칸은 빠르게
    for (let i = 1; i < path.length; i++) ts.push(ts[i - 1] + (sliding(st.grid, unit, path, i) ? SLIDE_STEP : STEP));
    walk = { unit, path, t: 0, ts, onDone, onDead, prevMode: mode, warp };
    if (unit.side === 'ally' && path.length > 1) { // 도착할 칸 표시 (도착하면 사라짐)
      const end = path.at(-1);
      fxm.unfollow('moveMarker');
      fxm.follow('moveMarker', MOVE_MARKER, () => markerAt(end.x, end.y, TILE));
    }
    mode = 'walking';
  }

  // 공격기·변화기 공통. 자신·범위형 변화기는 target 을 무시한다
  function doAttack(attacker, target, moveId, then, aim) {
    const mv = moveFor(attacker, moveId); // 저주: 고스트면 적 하나
    if (isAttack(mv)) { attackWith(attacker, target, mv, then, aim); return; }
    const pulled = pickOne(mv) && target && target !== attacker ? redirectTarget(st, attacker.id, moveId, target.id) : null; // 피뢰침·마중물
    const one = pulled ?? (pickOne(mv) && target && target !== attacker ? target : null);
    const hpBefore = one?.hp;
    const lookup = (id) => st.units.find((u) => u.id === id) ?? [attacker, one].find((u) => u?.id === id);
    const result = applyMove(st, attacker.id, moveId, aim ?? (pulled ? target.id : one?.id) ?? null, rng); // 끌어오기는 원래 대상으로 넘겨야 다시 판정됨
    if (result.summoned) requestSprites(['gyarados']); // 튀어오르기 이스터에그
    // 마비 실패·혼란 자해: 기술이 나가지 않으므로 대상은 돌아보지 않고 카메라는 사용자에게
    if (one && !result.blocked) {
      facing[attacker.id] = dirFromDelta(one.x - attacker.x, one.y - attacker.y);
      if (mv.category !== 'status') facing[one.id] = dirFromDelta(attacker.x - one.x, attacker.y - one.y);
    }
    anim = createAttackAnim({ attacker, defender: one, move: mv, result, hpBefore, lookup, fx: fxm });
    target = result.blocked ? attacker : one ?? attacker;
    animThen = then; animAbility = result.abilityEvents; animResult = result;
    focus = target;
    mode = 'anim';
  }

  // 공격기: 맞기 전 대상 목록을 잡아 두고(기절해도 연출), 결과를 다중 대상 연출로
  function attackWith(attacker, target, mv, then, aim) {
    const a = aim ?? (target ? { unitId: target.id } : { self: true });
    const pulled = redirectTarget(st, attacker.id, mv.id, a); // 피뢰침·마중물이 끌어오면 그 유닛만 연출
    const defenders = pulled ? [pulled] : unitsHit(st, attacker, mv, a);
    const lookup = (id) => st.units.find((u) => u.id === id) ?? [attacker, ...defenders].find((u) => u.id === id);
    const result = applyMove(st, attacker.id, mv.id, a, rng);
    if (!result.blocked) {
      const pt = a.dir ? tilesOf(st, attacker, mv, a)[0] : defenders[0] ?? (a.x !== undefined ? a : null);
      if (pt) facing[attacker.id] = dirFromDelta(pt.x - attacker.x, pt.y - attacker.y);
      for (const d of defenders) facing[d.id] = dirFromDelta(attacker.x - d.x, attacker.y - d.y);
    }
    const lineEnd = mv.shape?.type === 'line' ? tilesOf(st, attacker, mv, a).at(-1) ?? { x: attacker.x, y: attacker.y } : null; // 벽·가장자리에서 멈춘 끝 칸
    anim = createAttackAnim({ attacker, defenders: result.blocked ? [] : defenders, move: mv, result, lookup, aim: a, endPt: lineEnd, fx: fxm });
    aims = null;
    animThen = then; animAbility = result.abilityEvents; animResult = result;
    focus = result.blocked || defenders.length !== 1 ? attacker : defenders[0];
    mode = 'anim';
  }

  function select(u) {
    sel = u;
    moveLocked = false;
    origin = { x: u.x, y: u.y, facing: facing[u.id] };
    reach = reachable(st.grid, seenUnits(), u); // 숨은 적은 모르는 셈 (부딪히면 멈춤)
    atkTiles = attackTilesFrom(u, reach);
    mode = 'selected';
  }

  // 메뉴는 유닛의 화면 위치 반대편 모서리 (FE식)
  function cornerFor(unit, w) {
    const sx = unit.x * TILE - Math.round(cam.x);
    return { x: sx < W / 2 ? W - w - 2 : 2, y: 2 };
  }

  // 낙엽더미가 열렸으면: 잎 터짐 연출 + 대사 (더미 → 그다음 then)
  function withPiles(a, unit, then) {
    if (!a.piles?.length) { then(); return; }
    for (const p of a.piles) {
      if (p.unitId) { const e = st.units.find((u) => u.id === p.unitId); if (e) { everyone.set(e.id, e); facing[e.id] = DIR.Left; requestSprites([e.species]); } } // 미리 못 받았어도 여기서
      try { fxm.spawn({ id: 'autumn/leaf-burst', opts: { seed: p.x * 7 + p.y, ...(theme === 'beach' ? { palette: SAND_BURST } : theme === 'city' ? { palette: TRASH_BURST } : theme === 'sewer' ? { palette: BAG_BURST } : theme === 'power-plant' ? { palette: SCRAP_BURST } : {}) }, timeScale: 1, layer: 'front' }, { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE - 2 }); } catch { /* 연출 실패는 무시 */ }
    }
    if (a.piles.some((p) => p.kind === 'chest')) sound.jingle('item');
    noticeChain(pileNotices(a.piles, unit, (id) => everyone.get(id), theme === 'beach' ? '모래' : theme === 'city' ? '쓰레기통' : theme === 'sewer' ? '쓰레기봉투' : theme === 'power-plant' ? '고철더미' : '낙엽'), then);
  }

  // 아군 이동 완료: 낙엽더미 → 상자 열기 → 행동 메뉴, 계단 → 즉시 층 클리어 (취소 불가)
  function afterAllyMove() {
    const a = arrive(st, sel.id);
    if (a.piles.length) { moveLocked = true; withPiles(a, sel, () => afterArrive(a)); return; }
    afterArrive(a);
  }
  function afterArrive(a) {
    if (a.stairs) {
      sel.acted = true;
      if (a.item) sound.jingle('item'); // 보물상자
      showNotice(a.item ? ['보물상자를 열었다!', '계단을 찾았다!'] : ['계단을 찾았다!'], () => { sel = null; mode = 'result'; });
    } else if (a.item) {
      moveLocked = true;
      sound.jingle('item');
      showNotice(['보물상자를 열었다!', `${josa(ITEM_NAME[a.item] ?? '아이템', '을/를')} 얻었다!`], openAction); // 모르는 아이템이어도 멈추지 않게
    } else openAction();
  }

  function showNotice(lines, then, extra = {}) {
    notice = { lines, then, at: extra.at ?? null, hp: extra.hp ?? null, t: 0 };
    for (const id of extra.heal ?? []) { // 아쿠아링·뿌리박기·씨뿌리기 회복
      const u = st.units.find((o) => o.id === id);
      if (!u) continue;
      const actor = actorFor(u.species, idleFrameSource(u.species));
      try { fxm.spawn(HEAL_FX, bodyAt(actor, u.x * TILE + TILE / 2, u.y * TILE + TILE / 2), { actor }); } catch { /* 연출 실패는 무시 */ }
    }
    mode = 'notice';
  }

  function openAction() {
    menu = sel.moves.map((m) => {
      const block = moveBlock(sel, m); // 도발·앙코르·사슬묶기·트집·회복봉인
      return {
        label: MOVES[m].name, moveId: m,
        enabled: !sel.sealed && !block && (MOVES[m].heal ? sel.hp < sel.maxHp && (sel.healUses ?? 0) > 0 : true) && (isAttack(MOVES[m]) || MOVES[m].aimTile ? aimsFor(sel, MOVES[m]).length > 0 : MV(m).kind === 'self' || targetsFor(sel, m).length > 0), // 풀죽음 봉인
        ...(block ? { why: blockedText(block) } : {}),
        ...(MOVES[m].category === 'status' ? { tag: '변화' } : {}),
      };
    });
    menu.push({ label: '대기', enabled: true });
    const firstAttack = menu.findIndex((i) => i.enabled && i.moveId && !i.tag);
    menuSel = firstAttack >= 0 ? firstAttack : Math.max(0, menu.findIndex((i) => i.enabled));
    menuBox = cornerFor(sel, ui.menuRect(menu, 0, 0).w);
    mode = 'action';
  }

  function finishAllyAction() {
    if (sel && !st.result && canRetreat(st, sel) > 0) { openRetreat(); return; } // 선제기: 치고 빠지기
    const done = sel;
    sel = null;
    settleSand(done, () => { // 사막: 행동을 마친 자리에서 밀림·끌림
      if (st.result) { mode = 'result'; return; }
      if (allyUnits().every((u) => u.acted)) enemyPhase();
      else mode = 'idle';
    });
  }

  // 치고 빠지기: 남은 이동력으로 다시 이동 (취소하면 제자리에서 끝)
  function openRetreat() {
    reach = reachable(st.grid, seenUnits(), sel, canRetreat(st, sel));
    cursor = { x: sel.x, y: sel.y };
    mode = 'retreat';
  }
  function endRetreat() { sel.retreatReady = false; sel.retreated = true; finishAllyAction(); }

  function openEndMenu() {
    menu = [{ label: '턴 종료', enabled: true }, { label: '취소', enabled: true }];
    menuSel = 0;
    menuBox = cornerFor(cursor, ui.menuRect(menu, 0, 0).w);
    mode = 'endMenu';
  }

  function chooseMenu() {
    const it = menu[menuSel];
    if (it && !it.enabled && it.why) { const w = wrapMessage(it.why); showNotice(Array.isArray(w) ? w : [w], () => { mode = 'action'; }); return; } // 못 쓰는 이유
    if (!it?.enabled) return;
    if (mode === 'endMenu') {
      if (menuSel === 0) enemyPhase(); else mode = 'idle';
      return;
    }
    if (!it.moveId) { // 대기
      sel.acted = true; sel.moved = true;
      finishAllyAction();
      return;
    }
    move = it.moveId;
    if (isAttack(MV(move)) || MV(move).aimTile) { // 공격기: 가장 많이 맞는 조준부터 · 압정: 가장 가까운 적 쪽 칸부터
      aims = aimsFor(sel, MV(move));
      const foe = st.units.filter((u) => u.side !== sel.side).sort((p, q) => manhattan(p, sel) - manhattan(q, sel))[0];
      const b = MV(move).aimTile ? aims.slice().sort((p, q) => (foe ? manhattan(p, foe) - manhattan(q, foe) : 0))[0] : bestAim(st, sel, MV(move));
      aIdx = Math.max(0, aims.findIndex((a) => sameAim(a, b)));
      cursor = aimPoint(curAim());
      mode = 'target';
      return;
    }
    aims = null;
    targets = targetsFor(sel, move);
    tIdx = 0;
    const t0 = pickOne(MV(move)) ? targets[0] : sel; // 자신·범위형: 커서는 사용자, 확인 한 번
    cursor = { x: t0.x, y: t0.y };
    mode = 'target';
  }

  // ---------- 입력 ----------
  function handle(ev) {
    const tile = ev.px !== undefined ? toTile(ev) : null;
    switch (mode) {
      case 'result':
        if ((ev.type === 'confirm' || ev.type === 'click') && resultT >= RESULT_LOCK) {
          if (onExit) onExit(st.result, st.log);
          else { reset(); playerPhase(floorNotices()); }
        }
        return;
      case 'notice':
        if ((ev.type === 'confirm' || ev.type === 'click') && notice) { const then = notice.then; notice = null; then(); }
        return;
      case 'anim':
        if ((ev.type === 'confirm' || ev.type === 'click') && anim) anim.advance();
        return;
      case 'retreat': {
        if (tile && (ev.type === 'cursor' || ev.type === 'click') && inMap(tile.x, tile.y)) cursor = tile;
        if (ev.type === 'dir' && inMap(cursor.x + ev.dx, cursor.y + ev.dy)) cursor = { x: cursor.x + ev.dx, y: cursor.y + ev.dy };
        if (ev.type === 'cancel') { endRetreat(); return; }
        const pick = ev.type === 'confirm' || ev.type === 'click';
        if (pick && reach.has(`${cursor.x},${cursor.y}`)) {
          const unit = sel;
          startWalk(unit, allyPath(unit, cursor.x, cursor.y), () => {
            unit.retreatReady = false; unit.retreated = true;
            const a = arrive(st, unit.id); // 낙엽더미·상자·계단은 보통 이동과 같게
            withPiles(a, unit, () => {
            if (a.stairs) { if (a.item) sound.jingle('item'); showNotice(a.item ? ['보물상자를 열었다!', '계단을 찾았다!'] : ['계단을 찾았다!'], () => { sel = null; mode = 'result'; }); return; }
            if (a.item) { showNotice(['보물상자를 열었다!', `${josa(ITEM_NAME[a.item] ?? '아이템', '을/를')} 얻었다!`], finishAllyAction); return; }
            finishAllyAction();
            });
          }, null, true);
        }
        return;
      }
      case 'idle': case 'selected': {
        if (tile && (ev.type === 'cursor' || ev.type === 'click') && inMap(tile.x, tile.y)) cursor = tile;
        if (ev.type === 'dir' && inMap(cursor.x + ev.dx, cursor.y + ev.dy)) cursor = { x: cursor.x + ev.dx, y: cursor.y + ev.dy };
        const pick = ev.type === 'confirm' || ev.type === 'click';
        if (mode === 'idle') {
          if (ev.type === 'endTurn') { enemyPhase(); return; }
          if (!pick) return;
          const u = seenAt(cursor.x, cursor.y);
          if (u && u.side === 'ally' && !u.acted && !u.bot) select(u); // 갸라도스 봇은 스스로 움직임
          else if (!u) openEndMenu();
          return;
        }
        if (ev.type === 'cancel') { sel = null; mode = 'idle'; return; }
        if (pick && reach.has(`${cursor.x},${cursor.y}`)) {
          startWalk(sel, allyPath(sel, cursor.x, cursor.y), afterAllyMove, null, true);
        }
        return;
      }
      case 'action': case 'endMenu': {
        if (ev.type === 'dir' && ev.dy) menuSel = (menuSel + ev.dy + menu.length) % menu.length;
        if (ev.type === 'cursor' || ev.type === 'click') {
          const r = ui.menuRect(menu, menuBox.x, menuBox.y);
          const inside = ev.px >= r.x && ev.px < r.x + r.w && ev.py >= r.y && ev.py < r.y + r.h;
          const i = ui.menuIndexAt(menu, menuBox.x, menuBox.y, ev.py);
          if (inside && i >= 0 && i < menu.length) {
            menuSel = i;
            if (ev.type === 'click') chooseMenu();
          }
          return;
        }
        if (ev.type === 'confirm') chooseMenu();
        if (ev.type === 'cancel') {
          if (mode === 'endMenu') { mode = 'idle'; return; }
          if (moveLocked) return;
          sel.x = origin.x; sel.y = origin.y; sel.moved = false; sel.spent = 0;
          refreshField(st); // 오라·장판 안팎이 원래대로
          facing[sel.id] = origin.facing;
          cursor = { x: origin.x, y: origin.y };
          mode = 'selected';
        }
        return;
      }
      case 'target': {
        if (aims) { // 공격기 조준
          if (ev.type === 'cancel') { aims = null; cursor = { x: sel.x, y: sel.y }; mode = 'action'; return; }
          if (ev.type === 'confirm') { fireAim(); return; }
          if (ev.type === 'dir') {
            const byDir = aims.findIndex((a) => a.dir === DIR_OF(ev.dx, ev.dy));
            if (aims[0]?.dir) { if (byDir >= 0) aIdx = byDir; }
            else aIdx = (aIdx + (ev.dx + ev.dy > 0 ? 1 : -1) + aims.length) % aims.length;
            cursor = aimPoint(curAim());
            return;
          }
          if (tile && (ev.type === 'cursor' || ev.type === 'click')) {
            if (ev.touch && ev.type === 'cursor') return; // 터치엔 올려 두기가 없다: 첫 톡은 고르기, 같은 곳 두 번째 톡이 쏘기
            // 그 칸이 중심인 조준 → 지금 조준이 그 칸을 덮으면 유지 → 그 칸을 덮는 첫 조준
            const covers = (a) => coverOf(sel, MV(move), a).some((t) => t.x === tile.x && t.y === tile.y) || (a.self && tile.x === sel.x && tile.y === sel.y);
            const centred = aims.findIndex((a) => { const p = aimPoint(a); return p.x === tile.x && p.y === tile.y; });
            const i = centred >= 0 ? centred : covers(curAim()) ? aIdx : aims.findIndex(covers);
            if (i < 0) return;
            const same = i === aIdx;
            aIdx = i; cursor = aimPoint(curAim());
            if (ev.type === 'click' && same) fireAim(); // 다른 조준을 누르면 먼저 고르기만
          }
          return;
        }
        if (!pickOne(MV(move))) {
          const inArea = tile && manhattan(tile, sel) <= MV(move).range[1];
          if (ev.type === 'confirm' || (ev.type === 'click' && inArea)) doAttack(sel, sel, move, finishAllyAction);
          if (ev.type === 'cancel') { cursor = { x: sel.x, y: sel.y }; mode = 'action'; }
          return;
        }
        if (ev.type === 'dir') {
          tIdx = (tIdx + (ev.dx + ev.dy > 0 ? 1 : -1) + targets.length) % targets.length;
          cursor = { x: targets[tIdx].x, y: targets[tIdx].y };
        }
        if (tile && (ev.type === 'cursor' || ev.type === 'click')) {
          const i = targets.findIndex((t) => t.x === tile.x && t.y === tile.y);
          if (i >= 0) {
            if (ev.touch && ev.type === 'cursor') return; // 터치: 첫 톡은 고르기(예상 창), 같은 대상 두 번째 톡이 쓰기
            const was = i === tIdx;
            tIdx = i; cursor = { ...tile };
            if (ev.type === 'click' && (!ev.touch || was)) doAttack(sel, targets[tIdx], move, finishAllyAction);
          }
          return;
        }
        if (ev.type === 'confirm') doAttack(sel, targets[tIdx], move, finishAllyAction);
        if (ev.type === 'cancel') { cursor = { x: sel.x, y: sel.y }; mode = 'action'; }
        return;
      }
      default: // banner, walking, enemy: 입력 무시
    }
  }

  // ---------- 갱신 ----------
  let victoryMusic = false;
  function update(dt) {
    if (st.result && st.result !== 'lose' && !victoryMusic) { victoryMusic = true; sound.bgm('victory'); } // 승리·층 돌파: 결산까지 승리 음악
    clock += dt;
    syncStatusFx();
    fxm.update(dt);
    if (notice) notice.t += dt;
    resultT = mode === 'result' ? resultT + dt : 0;
    updateCamera(dt);
    if (pause) {
      pause.t -= dt;
      if (pause.t <= 0) { const fn = pause.fn; pause = null; fn(); }
      return;
    }
    if (mode === 'banner') {
      banner.t += dt / BANNER;
      if (banner.t >= 1) { const next = banner.next; banner = null; next(); }
    } else if (mode === 'sliding') {
      slide.t += dt;
      if (slide.t >= slide.dur) {
        const { lines, then, prevMode } = slide;
        slide = null; mode = prevMode;
        noticeChain(lines, then);
      }
    } else if (mode === 'walking') {
      walk.t += dt;
      const { i } = walkAt(walk);
      if (walk.path.length > 1) {
        const a = walk.path[i], b = walk.path[i + 1];
        facing[walk.unit.id] = dirFromDelta(b.x - a.x, b.y - a.y);
      }
      if (walk.t >= walk.ts.at(-1)) {
        fxm.unfollow('moveMarker');
        const { onDone, onDead, prevMode, unit, path, warp: canWarp } = walk;
        walk = null;
        mode = prevMode;
        const end = path.at(-1);
        const cost = pathCost(st.grid, unit, path); // 치고 빠지기용 이동 비용 (옥상 오르기 2 · 빙판 미끄럼 공짜)
        const before = st.grid.join('');
        moveUnit(st, unit.id, end.x, end.y, cost, path, { warp: canWarp && unit.side === 'ally', slide: true });
        const warp = st.log.warp; // 시티 워프: 짝 타일로 날아감 (취소 불가)
        if (warp) {
          moveLocked = true; cursor = { ...warp.to };
          for (const p of [warp.from, warp.to]) try { fxm.spawn({ id: 'impacts/hit-spark', opts: { palette: warp.color === 'blue' ? WARP_BLUE : WARP_ORANGE, light: 1.2, seed: p.x * 5 + p.y }, timeScale: 1, layer: 'front' }, { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE - 6 }); } catch { /* 연출 실패는 무시 */ }
        }
        const get = (id) => everyone.get(id);
        const quiet = unit.side !== 'ally' && darkIds().has(unit.id); // 숨은 채 도착한 악 타입: 알림 없음
        const arriveLines = st.units.includes(unit) && !quiet ? abilityNotices(st.log.arriveAbilityEvents, get) : [];
        const trapLines = quiet ? [] : trapNotices(st.log.trapEvents, get);
        if ((arriveLines.length || trapLines.length) && unit.side === 'ally') moveLocked = true; // 위협·압정이 걸린 이동은 취소할 수 없다
        const bumpLines = bumped ? [{ lines: [`수풀에 ${josa(unitLabel(bumped), '이/가')} 숨어 있었다!`], at: { x: bumped.x, y: bumped.y }, hp: null }] : [];
        if (bumped && unit.side === 'ally') moveLocked = true;
        bumped = null;
        const warpLines = warp ? [{ lines: ['워프 타일이 빛났다!', `${josa(unitLabel(unit), '은/는')} 다른 곳으로 날아갔다!`], at: { ...warp.to }, hp: null }] : [];
        // 얼음동굴: 부딪힘·고드름 알림, 밀린 포켓몬은 짧게 미끄러짐. 얼린 물·부딪힘이 있으면 취소 불가
        const ice = st.log.iceEvents ?? [];
        const iceLines = ice.flatMap((e) => (e.kind === 'bump' || e.kind === 'blocked'
          ? [{ lines: [`${josa(unitLabel(get(e.by)), '은/는')} ${josa(unitLabel(get(e.unitId)), '와/과')} 부딪혔다!`], at: { x: get(e.unitId).x, y: get(e.unitId).y }, hp: null }]
          : phaseNotices([e], [], get)));
        if ((ice.length || st.grid.join('') !== before) && unit.side === 'ally') moveLocked = true;
        const finish = () => noticeChain([...warpLines, ...bumpLines, ...trapLines, ...iceLines, ...arriveLines], () => { mode = prevMode; if (!st.units.includes(unit)) (onDead ?? afterTrapFaint)(unit); else onDone(); });
        const shoved = ice.filter((e) => e.kind === 'bump').map((e) => ({ unit: get(e.unitId), from: e.from, to: e.to }));
        if (shoved.length) startSlide(shoved, 0.22, [], finish); else finish();
      }
    } else if (mode === 'anim') {
      anim.update(dt);
      if (anim.done) {
        anim = null;
        fxm.expire(1); // 남은 연기·잔해는 1초 뒤 정리
        // 다음 행동 전 대기(pause) 동안 'anim' 에 머물지 않도록 먼저 모드를 되돌린다
        mode = st.result ? 'result' : st.phase === 'enemy' ? 'enemy' : 'idle';
        const shown = animResult?.kind === 'status' ? (animAbility ?? []).filter((e) => e.ability !== 'magic-bounce') : animAbility; // 변화기 연출이 매직미러를 먼저 말함
        const lines = [...strikeLines(animResult), ...abilityNotices(shown, (id) => everyone.get(id))], back = mode;
        animAbility = null; animResult = null;
        if (!st.result) noticeChain(lines, () => { mode = back; animThen(); });
        else noticeChain(lines, () => { mode = 'result'; });
      }
    }
  }

  // 공격 뒤 대사: 빈 수풀 칸 조준 → 아무도 없었다 · 전기·불꽃 연쇄 (번쩍임 + 한 줄씩)
  function strikeLines(r) {
    if (!r) return [];
    const out = [];
    if (r.empty) out.push({ lines: ['아무도 없었다…'], at: null, hp: null });
    if (!r.chain?.length) return out;
    for (const c of r.chain) {
      const u = everyone.get(c.unitId);
      if (!u) continue;
      try { fxm.spawn({ id: 'impacts/hit-spark', opts: { palette: c.kind === 'fire' ? CHAIN_FIRE : CHAIN_SPARK, light: 1.4, seed: u.x * 13 + u.y }, timeScale: 1, layer: 'front' }, { x: u.x * TILE + TILE / 2, y: u.y * TILE + TILE - 4 }); } catch { /* 연출 실패는 무시 */ }
      const fogged = hiddenIds().has(u.id), name = fogged ? '상대 포켓몬' : unitLabel(u), fire = c.kind === 'fire'; // 안개 속이면 정체·위치 숨김
      out.push({ lines: [fire ? `불꽃이 번져 ${name}에게 옮겨 붙었다!` : `물을 타고 ${name}에게 전기가 흘렀다!`, ...(c.fainted ? [`${josa(name, '은/는')} 쓰러졌다!`] : [])], at: fogged ? null : { x: u.x, y: u.y }, hp: null });
    }
    return out;
  }

  // 상태이상 지속 표시: 살아 있는 유닛의 상태와 맞춘다 (없어진 건 멈추고, 새로 생긴 건 붙인다)
  function syncStatusFx() {
    const wanted = new Map(), hidden = hiddenIds(), dark = darkIds();
    for (const u of st.units) {
      if (hidden.has(u.id) || dark.has(u.id)) continue; // 안개 속 유닛에는 상태 표시를 그리지 않는다
      const kinds = [u.status, u.confusion > 0 ? 'confusion' : u.infatuation > 0 ? 'infatuation' : null].filter(Boolean); // 헤롱헤롱은 혼란과 같은 연출 → 하나만
      for (const k of kinds) {
        const loop = fxForAilment(k).loop;
        if (!loop) continue;
        const actor = actorFor(u.species, idleFrameSource(u.species));
        wanted.set(`${u.id}:${k}`, {
          spec: loop, actor,
          getPos: () => { if (!st.units.includes(u)) return null; const p = unitWorld(u); return bodyAt(actor, p.x + TILE / 2, p.y + TILE / 2); },
        });
      }
    }
    fxm.sync(wanted);
  }

  function updateCamera(dt) {
    let t;
    if (walk && !(walk.unit.side !== 'ally' && darkIds().has(walk.unit.id))) { const p = unitWorld(walk.unit); t = camTarget({ x: p.x / TILE, y: p.y / TILE }); } // 숨은 악 타입의 걸음은 따라가지 않음
    else if (focus && (mode === 'anim' || mode === 'enemy' || mode === 'sliding')) t = camTarget(focus);
    else if (mode === 'notice' && notice?.at) t = camTarget(notice.at); // 상태 데미지 등: 그 유닛 쪽으로
    else t = camTarget(cursor);
    const k = Math.min(1, dt * 10);
    cam.x += (t.x - cam.x) * k;
    cam.y += (t.y - cam.y) * k;
    if (Math.abs(t.x - cam.x) < 0.5) cam.x = t.x;
    if (Math.abs(t.y - cam.y) < 0.5) cam.y = t.y;
  }

  // ---------- 그리기 ----------
  // 유닛의 월드 좌표 (타일 왼쪽 위)
  function unitWorld(u) {
    const sm = slide?.moves.find((m) => m.unit === u);
    if (sm) { // 모래·스팀에 미끄러짐: 빠르게 출발해 천천히 멈춤
      const k = 1 - (1 - Math.min(1, slide.t / slide.dur)) ** 3;
      return { x: Math.round((sm.from.x + (sm.to.x - sm.from.x) * k) * TILE), y: Math.round((sm.from.y + (sm.to.y - sm.from.y) * k) * TILE) };
    }
    if (walk && walk.unit === u) {
      const { i, k } = walkAt(walk);
      const a = walk.path[i], b = walk.path[Math.min(i + 1, walk.path.length - 1)];
      return { x: Math.round((a.x + (b.x - a.x) * k) * TILE), y: Math.round((a.y + (b.y - a.y) * k) * TILE) };
    }
    return { x: u.x * TILE, y: u.y * TILE };
  }

  const fogSeen = new Map(); // 안개: 숨어 있던 유닛 id → 드러난 시각 (null = 아직 숨음)
  const REVEAL = 0.35;
  function drawUnits(ctx) {
    const hidden = hiddenIds(), dark = darkIds(), lurking = hiddenFrom(st, 'enemy', { dark: false }); // 아군 반투명은 수풀 숨기만
    const list = [...st.units];
    for (const u of anim?.extraUnits ?? (anim?.defender ? [anim.defender] : [])) if (u && !list.includes(u)) list.push(u); // 기절 연출 중
    list.sort((a, b) => unitWorld(a).y - unitWorld(b).y);
    for (const u of list) {
      const p = unitWorld(u);
      const cx = p.x + TILE / 2, cy = p.y + TILE / 2;
      const pose = anim?.unitPose(u);
      if (pose?.hidden) continue;
      if (dark.has(u.id) && !pose) continue; // 수풀에 숨은 악 타입: 아예 그리지 않음
      drawShadow(ctx, cx, cy, u.side === 'ally' ? 'rgba(40,80,200,0.45)' : 'rgba(200,40,40,0.45)');
      if (st.grid[u.y]?.[u.x] === 'B') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(cx) - 10, Math.round(cy) + 9, 20, 2); } // 옥상: 그림자를 넓게 (높이 티)
      const grey = u.acted && !pose && st.phase === (u.side === 'ally' ? 'player' : 'enemy');
      const walking = walk && walk.unit === u;
      // 쉬는 중: 잠듦은 Sleep 동작(없으면 회색 정지), 얼음은 푸르스름한 정지
      const resting = !pose && !walking && (u.status === 'sleep' || u.status === 'freeze');
      const sleepAnim = u.status === 'sleep' && hasAnim(u.species, 'Sleep');
      const a = pose?.anim ?? (walking ? 'Walk' : resting && sleepAnim ? 'Sleep' : 'Idle');
      const t = pose ? pose.t : walking ? walk.t : resting && !sleepAnim ? 0 : clock;
      const restFilter = resting && !grey && !sleepAnim ? (u.status === 'freeze' ? 'grayscale(0.6) brightness(1.25)' : 'grayscale(1) brightness(0.85)') : null;
      if (hidden.has(u.id)) { // 안개 속 적: 정체 모를 회색 도트 (종 구분 불가)
        fogSeen.set(u.id, null);
        ctx.save(); ctx.globalAlpha = 0.75;
        drawUnknownSprite(ctx, facing[u.id], clock, cx, cy);
        ctx.restore();
        continue;
      }
      // 방금 시야에 들어옴: 회색 도트 → 진짜 모습으로 서서히
      if (fogSeen.has(u.id) && fogSeen.get(u.id) === null) fogSeen.set(u.id, clock);
      const revealK = fogSeen.has(u.id) ? Math.min(1, (clock - fogSeen.get(u.id)) / REVEAL) : 1;
      if (revealK >= 1) fogSeen.delete(u.id);
      if (revealK < 1) { ctx.save(); ctx.globalAlpha = 0.75 * (1 - revealK); drawUnknownSprite(ctx, facing[u.id], clock, cx, cy); ctx.restore(); }
      if (revealK < 1) { ctx.save(); ctx.globalAlpha = revealK; }
      const burrowUnder = u.burrow && (u.burrow.kind === 'ground' || u.burrow.kind === 'water');
      if (burrowUnder) ui.drawBurrowMark(ctx, u, p.x, p.y); // 숨기: 흙더미·물웅덩이는 발밑에
      const lurk = u.side === 'ally' && lurking.has(u.id); // 수풀에 숨은 악 타입 아군: 적에게 안 보임을 반투명으로
      if (u.burrow || lurk) { ctx.save(); ctx.globalAlpha = u.burrow ? 0.45 : 0.6; } // 숨은 포켓몬은 반투명
      if (grey) { ctx.save(); ctx.filter = 'grayscale(1) brightness(0.85)'; }
      if (restFilter) { ctx.save(); ctx.filter = restFilter; }
      if (pose?.flash) { ctx.save(); ctx.filter = 'brightness(3)'; }
      drawUnitSprite(ctx, u.species, a, pose?.dir ?? facing[u.id], grey ? 0 : t, cx + (pose?.dx ?? 0), cy + (pose?.dy ?? 0), pose ? pose.loop : true);
      if (pose?.flash) ctx.restore();
      if (restFilter) ctx.restore();
      if (grey) ctx.restore();
      if (u.burrow || lurk) ctx.restore();
      if (revealK < 1) ctx.restore();
      if (u.burrow && !burrowUnder) ui.drawBurrowMark(ctx, u, p.x, p.y); // 구름·그림자는 위에
      if (!pose?.hidden) ui.drawStatusDot(ctx, u, cx, cy);
    }
  }

  // 공격 예상 창: 맞는 대상 최대 3줄 (명중·데미지·기절), 넘으면 "외 N마리", 아군은 (아군)
  function drawAttackForecast(ctx, a, mv, aim) {
    const list = seenOnly(st, a.side, unitsHit(st, a, mv, aim)); // 어둠·수풀에 숨은 적은 예상 창에 안 나옴
    if (list.length === 1 && list[0].side !== a.side && !mv.id.match(/self-destruct|explosion/)) { drawForecast(ctx, a, list[0], mv.id); return; }
    const spread = list.length >= 2 ? 0.75 : 1;
    const rows = Math.min(3, list.length);
    const h = 24 + rows * 13 + (list.length > 3 ? 12 : 0);
    const y = H - h - 2;
    ui.drawWindow(ctx, 2, y, W - 4, h);
    drawText(ctx, `${mv.name}  ${ui.shapeLabel(mv)}`, 10, y + 5);
    ui.drawTypeBadge(ctx, mv.type, W - 42, y + 5);
    list.slice(0, 3).forEach((d, i) => {
      const tile = st.grid[d.y][d.x], ry = y + 20 + i * 13;
      const fc = forecastFor(a, d, mv, tile, effectiveWeather(st), spread, terrainCtx(st, a, d));
      const min = { damage: fc.min, typeMult: fc.typeMult }, max = { damage: fc.max };
      const mine = d.side === a.side;
      drawText(ctx, `${spec(d).name}${mine ? ' (아군)' : ''}`, 10, ry, mine ? '#d03020' : '#383838', null, 'small');
      drawText(ctx, min.typeMult === 0 ? '효과 없음' : `${fc.hit}%  ${min.damage}~${max.damage}`, 110, ry, '#383838', null, 'small');
      if (min.typeMult && max.damage >= d.hp) drawText(ctx, '기절?', 206, ry, '#e03030', null, 'small');
    });
    if (list.length > 3) drawText(ctx, `외 ${list.length - 3}마리`, 10, y + 20 + 3 * 13, '#707070', null, 'small');
    if (/self-destruct|explosion/.test(mv.id)) drawText(ctx, '사용자 기절', W - 12 - textWidth('사용자 기절', 'small'), y + 20 + rows * 13 - 13, '#e03030', null, 'small');
  }

  function drawForecast(ctx, a, d, moveId) {
    const mv = MOVES[moveId];
    const tile = st.grid[d.y][d.x];
    const attackers = moveId === 'beat-up' ? beatUpAllies(st, a, d) : [a];
    const parts = attackers.map((by) => forecastFor(by, d, mv, tile, effectiveWeather(st), 1, terrainCtx(st, by, d)));
    const fc = { ...parts[0], min: parts.reduce((sum, f) => sum + f.min, 0), max: parts.reduce((sum, f) => sum + f.max, 0) };
    const hit = fc.hit, min = { damage: fc.min, typeMult: fc.typeMult }, max = { damage: fc.max };
    const y = (d.y * TILE - cam.y) > H / 2 ? 2 : H - 54;
    ui.drawWindow(ctx, 2, y, W - 4, 52);
    drawText(ctx, `${spec(a).name} → ${spec(d).name}`, 10, y + 5);
    ui.drawTypeBadge(ctx, mv.type, W - 42, y + 5);
    drawText(ctx, mv.name, 10, y + 20);
    const bn = (fc.typeMult === 0 || d.bound ? null : bindNote(moveId)) ?? (mv.sure ? '필중' : null); // 속박기(걸릴 수 있을 때만) · 필중
    if (bn) drawText(ctx, bn, 16 + textWidth(mv.name), y + 22, '#5848a0', null, 'small'); // 속박기
    const tm = min.typeMult;
    const eff = tm === 0 ? ['효과 없음', '#808080'] : tm > 1 ? ['효과 굉장', '#20a020'] : tm < 1 ? ['효과 별로', '#c07020'] : null;
    if (eff) drawText(ctx, eff[0], W - 12 - textWidth(eff[0]), y + 20, eff[1]);
    drawText(ctx, `명중 ${tm === 0 ? '-' : `${hit}%`}`, 10, y + 35);
    const dmg = `데미지 ${tm === 0 ? 0 : `${min.damage}~${max.damage}`}`, dmgSmall = textWidth(dmg) > 96; // 네 자리 데미지는 작은 글씨 (기절 표시와 안 겹치게)
    drawText(ctx, dmg, 72, y + 35 + (dmgSmall ? 2 : 0), '#383838', '#d8d8d0', dmgSmall ? 'small' : 'main');
    const ko = tm === 0 || moveId === 'false-swipe' ? '' : min.damage >= d.hp && hit === 100 ? '기절!' : max.damage >= d.hp ? '기절?' : '';
    if (ko) drawText(ctx, ko, 172, y + 35, '#e03030');
    ui.drawHpBar(ctx, 206, y + 39, 40, Math.max(0, d.hp - max.damage), d.maxHp);
  }

  // 변화기 예상 창: 대상·효과·명중 (적 대상만)
  function drawStatusForecast(ctx, a, mv, list) {
    const y = H - 54;
    ui.drawWindow(ctx, 2, y, W - 4, 52);
    const one = pickOne(mv) ? list[tIdx] : null;
    drawText(ctx, `${spec(a).name} → ${one ? spec(one).name : TARGET_LABEL[mv.kind]}`, 10, y + 5);
    ui.drawTypeBadge(ctx, mv.type, W - 42, y + 5);
    drawText(ctx, mv.name, 10, y + 20);
    drawText(ctx, effectSummary(mv), 92, y + 20, '#5848a0');
    const foes = (one ? [one] : list).filter((u) => u.side !== a.side);
    if (one && foes.length) drawText(ctx, `명중 ${hitChance(a, one, { ...mv, accuracy: mv.accuracy ?? 100 }, st.grid[one.y][one.x], effectiveWeather(st), terrainCtx(st, a, one))}%`, 10, y + 35);
    const note = one ? ailmentNote(one, mv, a) : null;
    if (one && mv.effect === 'push' && one.side !== a.side && pushPreview(st, a, one).fall) drawText(ctx, '낙사!', W - 12 - textWidth('낙사!'), y + 35, '#e03030'); // 협곡: 밀면 낭떠러지로
    else if (note) drawText(ctx, note, W - 12 - textWidth(note), y + 35, '#808080');
    else if (!one) drawText(ctx, list.length ? `대상 ${list.length}마리` : '범위 안에 대상이 없다', 10, y + 35, list.length ? '#383838' : '#a0a0a0');
  }

  function drawMoveInfo(ctx, moveId) {
    const mv = MOVES[moveId];
    const r = ui.menuRect(menu, menuBox.x, menuBox.y);
    const healNote = !sel ? '' : (sel.healUses ?? 0) <= 0 ? '이번 층에서는 더 못 쓴다' : sel.hp >= sel.maxHp ? 'HP 가 가득 차 있다' : `회복 · 남은 ${sel.healUses}번`;
    const statusLine = mv.heal ? healNote : `효과 ${effectSummary(mv)}`;
    const extra = [...(mv.ailment ? [`${STATUS_KO[mv.ailment]} ${mv.ailmentChance || 100}%`] : []), ...moveEffectTags(mv)].slice(0, 2).join(' · '); // "화상 10% · 흡수 50%"
    const need = mv.category === 'status' ? textWidth(statusLine) + 14 : textWidth(ui.shapeLabel(mv)) + (extra ? textWidth(extra, 'small') + 10 : 0) + 16;
    const w = Math.min(W - 4, Math.max(r.w, need)), h = 50; // 글이 길면 메뉴보다 넓게 (화면 안으로)
    const x = Math.max(2, Math.min(r.x, W - 2 - w)), y = r.y + r.h + 2;
    ui.drawWindow(ctx, x, y, w, h);
    ui.drawTypeBadge(ctx, mv.type, x + 6, y + 5);
    if (mv.category === 'status') {
      drawText(ctx, '변화', x + 44, y + 4);
      drawText(ctx, `대상 ${TARGET_LABEL[mv.kind]}`, x + 6, y + 19);
      drawText(ctx, statusLine, x + 6, y + 33, '#5848a0');
      return;
    }
    drawText(ctx, mv.category === 'physical' ? '물리' : '특수', x + 44, y + 4);
    drawText(ctx, mv.weightPower ? '위력 몸무게' : mv.fixedDamage ? '위력 고정' : `위력 ${mv.power ?? '-'}`, x + 6, y + 19);
    drawText(ctx, `명중 ${mv.accuracy}`, x + 60, y + 19);
    drawText(ctx, ui.shapeLabel(mv), x + 6, y + 33);
    if (extra) drawText(ctx, extra, x + w - 8 - textWidth(extra, 'small'), y + 35, '#5848a0', null, 'small');
  }

  // 상태 데미지 알림: 유닛 위 데미지 숫자 + 줄어드는 HP 바 (월드 좌표)
  function drawNoticeHp(ctx, n) {
    const k = Math.min(1, n.t / 0.45);
    const px = n.at.x * TILE + TILE / 2, py = n.at.y * TILE + TILE / 2, bw = 22;
    const dmg = `${n.hp.from - n.hp.to}`;
    drawText(ctx, dmg, Math.round(px - textWidth(dmg) / 2), Math.round(py - 30 - Math.min(8, n.t * 20)), '#d8a0f0', '#202020');
    ctx.fillStyle = '#202020';
    ctx.fillRect(Math.round(px - bw / 2) - 1, Math.round(py + 10), bw + 2, 7);
    ui.drawHpBar(ctx, Math.round(px - bw / 2), Math.round(py + 11), bw, n.hp.from + (n.hp.to - n.hp.from) * k, n.hp.max);
  }

  const toPts = (m) => [...m.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });

  function draw(ctx, time) {
    const shake = anim?.shake ?? 0;
    const cx = Math.round(cam.x) + shake, cy = Math.round(cam.y);
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-cx, -cy);
    if (autumnGround) drawAutumnMap(ctx, st.grid, autumnGround, cx, cy, W, H);
    else if (beachGround) drawBeachMap(ctx, st.grid, beachGround, cx, cy, W, H);
    else if (cityGround) drawCityMap(ctx, st.grid, cityGround, cx, cy, W, H, st.warps, time);
    else if (sewerGround) drawSewerMap(ctx, st.grid, sewerGround, cx, cy, W, H, time);
    else if (desertGround) drawDesertMap(ctx, st.grid, desertGround, cx, cy, W, H, time, st.flows);
    else if (volcanoGround) drawVolcanoMap(ctx, st.grid, volcanoGround, cx, cy, W, H, time, st.vents, (v) => ventFires(v, st.turn) && st.result == null, steamFx && { vents: steamFx.vents, age: clock - steamFx.at }, (v) => steamPath(st, v));
    else if (iceGround) drawIceMap(ctx, st.grid, iceGround, cx, cy, W, H, time);
    else if (canyonGround) drawCanyonMap(ctx, st.grid, canyonGround, cx, cy, W, H, time);
    else if (graveGround) drawGraveyardMap(ctx, st.grid, graveGround, cx, cy, W, H, time, litWisps());
    else if (powerGround) drawPowerMap(ctx, st.grid, powerGround, cx, cy, W, H, time, st.generators, (g) => firesAt(g, st.turn) && st.result == null, pulseFx && { gens: pulseFx.gens, age: clock - pulseFx.at });
    else drawMap(ctx, st.grid, time, cx, cy, W, H, theme);
    if (!iceGround && st.grid.some((r) => r.includes('_'))) drawFrozen(ctx, st.grid, cx, cy, W, H, time); // 얼음 타입이 얼린 물
    const tideWarn = tidePreview(st); // 물때 예고: 바뀔 칸에 물결 깜빡임
    if (tideWarn && Math.floor(time * 2) % 2 === 0) { ctx.fillStyle = tideWarn.next > (st.tide ?? 0) ? 'rgba(40,110,220,0.35)' : 'rgba(250,240,200,0.35)'; for (const p of tideWarn.cells) ctx.fillRect(p.x * TILE + 2, p.y * TILE + 9, TILE - 4, 2), ctx.fillRect(p.x * TILE + 4, p.y * TILE + 15, TILE - 8, 2); }
    if (st.generators?.length && !st.result) drawPulseWarn(ctx, pulsePreview(st), time); // 발전소: 이번 라운드 방출 칸
    if (st.vents?.length && !st.result) drawSteamWarn(ctx, steamPreview(st), time); // 화산동굴: 이번 라운드 스팀 칸
    ui.drawZones(ctx, st); // 장판 테두리
    ui.drawAuras(ctx, st); // 오라 (쓴 포켓몬을 따라다님)
    ui.drawTraps(ctx, st, anim?.trapsShown ?? [], anim?.trapsHidden ?? []); // 압정 (적 것은 깔 때·밟힌 칸만)
    for (const c of st.chests) drawChest(ctx, c.x, c.y);
    drawDarkness(ctx, st, time, cx, cy, W, H); // 깊은 동굴: 어둠 (이동 범위·유닛은 그 위)
    if (mode === 'selected') {
      ui.drawHighlights(ctx, toPts(reach), BLUE);
      ui.drawHighlights(ctx, atkTiles, RED);
    }
    if (mode === 'retreat') ui.drawHighlights(ctx, toPts(reach), BLUE); // 치고 빠지기
    const area = (mv) => {
      if (isAttack(mv)) { // 공격기: 가능한 조준들의 맞는 칸 합집합
        const seen = new Map();
        for (const a of attackAims(sel, mv)) for (const t of tilesOf(st, sel, mv, a)) seen.set(`${t.x},${t.y}`, t);
        ui.drawHighlights(ctx, [...seen.values()], RED);
        return;
      }
      ui.drawHighlights(ctx, tilesInRange(sel.x, sel.y, mv.range, st.width, st.height), helpful(mv) ? BLUE : RED);
    };
    if (mode === 'action' && menu[menuSel]?.moveId) area(MOVES[menu[menuSel].moveId]);
    if (mode === 'target' && aims) {
      const mv = MV(move), tiles = coverOf(sel, mv, curAim());
      ui.drawHighlights(ctx, tiles, RED);
      for (const u of unitsHit(st, sel, mv, curAim())) if (u.side === sel.side) ui.drawOutline(ctx, u.x, u.y, '#f89020');
    } else if (mode === 'target') area(MV(move));
    fxm.draw(ctx, 'back', { x: cx, y: cy });
    drawUnits(ctx);
    fxm.draw(ctx, 'front', { x: cx, y: cy });
    ctx.save(); ctx.translate(cx, cy); drawWeather(ctx, anim?.weatherShown !== undefined ? anim.weatherShown : st.weather, time); ctx.restore(); // 날씨: 유닛·이펙트 위, 커서·HP 바·숫자·UI 아래
    if (st.wisps?.length && !st.result) drawWisps(ctx, st.wisps.filter((w) => w.lit), time); // 묘지 혼불: 안개 위에도 보임
    if (['idle', 'selected', 'target', 'retreat'].includes(mode)) ui.drawCursor(ctx, cursor.x, cursor.y, time);
    if (anim) anim.drawWorld(ctx);
    if (notice?.hp && notice.at) drawNoticeHp(ctx, notice);
    ctx.restore();

    const onLeft = cursor.x * TILE - cx < W / 2;
    if (mode === 'idle' || mode === 'selected' || mode === 'enemy') {
      const u = seenAt(cursor.x, cursor.y);
      if (u) { const hidden = hiddenIds().has(u.id); ui.drawUnitInfo(ctx, u, onLeft, { hidden, warn: hidden ? null : dangerWarning(u, st.units, effectiveWeather(st)) }); }
    }
    if (mode === 'action' || mode === 'endMenu') {
      ui.drawMenu(ctx, menu, menuSel, menuBox.x, menuBox.y);
      if (mode === 'action' && menu[menuSel]?.moveId) drawMoveInfo(ctx, menu[menuSel].moveId);
    }
    if (mode === 'target') {
      if (MV(move).category === 'status') drawStatusForecast(ctx, sel, MV(move), targets);
      else drawAttackForecast(ctx, sel, MV(move), curAim());
    }
    if (banner) ui.drawBanner(ctx, banner.text, banner.sub, banner.color, Math.min(1, banner.t));
    if (anim) anim.drawScreen(ctx);
    if (notice) ui.drawMessage(ctx, notice.lines, null, Math.floor(time * 3) % 2 === 0);
    if (mode === 'result') drawResult(ctx, time);
  }

  const centered = (ctx, text, y, color, shadow) => drawText(ctx, text, Math.floor((W - textWidth(text)) / 2), y, color, shadow);

  function drawResult(ctx, time) {
    ctx.fillStyle = 'rgba(16,16,24,0.6)';
    ctx.fillRect(0, 0, W, H);
    const good = st.result !== 'lose';
    const title = st.result === 'stairs' ? '층 돌파!' : good ? '승리!' : '패배...';
    ui.drawWindow(ctx, 40, 52, 176, 88);
    ui.bigText(ctx, title, W / 2, 62, good ? '#d8a000' : '#c03030', '#d8d8d0');
    if (st.result === 'stairs') centered(ctx, '계단을 내려간다', 94);
    else if (good) centered(ctx, st.bossFloor ? '보스를 쓰러뜨렸다!' : `${st.turn}턴 만에 클리어`, 94);
    if (resultT >= RESULT_LOCK && Math.floor(time * 2) % 2 === 0) centered(ctx, onExit ? 'Z 키로 계속' : 'Z 키로 다시 하기', 116, '#606878');
  }

  playerPhase(floorNotices()); // 잔비·트레이스 등 층 시작 특성

  return { handle, update, draw, get state() { return st; }, get mode() { return mode; }, get menu() { return menu; }, get menuSel() { return menuSel; }, get aim() { return mode === 'target' ? curAim() : null; }, get fx() { return fxm; }, get bannerSub() { return banner?.sub ?? null; }, get hiddenIds() { return hiddenIds(); }, get shake() { return anim?.shake ?? 0; }, get camera() { return { ...cam }; } };
}

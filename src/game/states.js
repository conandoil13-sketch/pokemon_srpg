// 게임 상태 머신: core(규칙) 와 render(그리기) 를 잇는다
import { createBattle, unitAt, moveUnit, applyMove, targetsOf, endPhase, spec, arrive, redirectTarget, canRetreat, chargeRoute } from '../core/battle.js';
import { STAT_KO, API_STAT } from '../core/stages.js';
import { STATUS_KO, canInflict, canInfatuate } from '../core/status.js';
import { wrapMessage, blockedText, TRAP_LINE } from '../render/mapAttack.js';
import { moveBlock, moveFor, BIND_MOVES, BIND_TURNS } from '../core/volatile.js';
import { refreshField, lethalTrapCut } from '../core/field.js';
import { sound } from '../audio/sound.js';
import { reachable, tilesInRange, manhattan, pathTo, TILE_COST } from '../core/pathfind.js';
import { aimsOf, unitsHit, tilesOf, bestAim, canTarget } from '../core/shapes.js';
import { enemyTurnOrder, planEnemyAction, retreatSpot } from '../core/ai.js';
import { isHidden, WEATHER_KO, effectiveWeather } from '../core/weather.js';
import { calcDamage, hitChance } from '../core/damage.js';
import { MOVES } from '../data/moves.js';
import { drawMap, drawChest, TILE } from '../render/tiles.js';
import { drawUnitSprite, drawShadow, hasAnim, idleFrameSource, DIR } from '../render/sprites.js';
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
const BANNER = 1.4;
const RESULT_LOCK = 0.8; // 결과 화면 입력 잠금(초)
const BLUE = 'rgba(64,128,248,0.45)', RED = 'rgba(248,64,64,0.38)';
const MARGIN = 2; // 카메라: 커서를 화면 가장자리에서 최소 이 칸만큼 안쪽에

const seqRng = (vals) => { let i = 0; return () => vals[i++] ?? 0; };

// 예상 창 숫자: 명중·최소·최대 데미지 (날씨·다수 명중 반영)
export function forecastFor(a, d, mv, tile, weather = null, spread = 1) {
  if (mv.dreamOnly && d.status !== 'sleep') return { hit: hitChance(a, d, mv, tile, weather), min: 0, max: 0, typeMult: 0 }; // 꿈먹기: 깨어 있으면 실패
  const min = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0]), defTile: tile, spread, weather });
  const max = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0.99999]), defTile: tile, spread, weather });
  // 연속 공격: 최소 타수 × 최소, 최대 타수 × 최대 (스킬링크면 최대 타수)
  const lo = !mv.minHits || mv.maxHits <= 1 ? 1 : a.ability === 'skill-link' ? mv.maxHits : mv.minHits, hi = !mv.maxHits || mv.maxHits <= 1 ? 1 : mv.maxHits;
  return { hit: hitChance(a, d, mv, tile, weather), min: min.damage * lo, max: max.damage * hi, typeMult: min.typeMult };
}

import { josa } from '../data/text.js';
import { ABILITIES } from '../data/abilities.js';
import { POWDER_KO } from '../core/dittoBuild.js';
import { has as hasAbility, typeEffect } from '../core/abilities.js';

const ITEM_NAME = { evoStone: '진화의돌', candy: '경험 사탕', coins: '코인 주머니', ...Object.fromEntries(Object.entries(POWDER_KO).map(([k, v]) => [`powder-${k}`, v])) };
export const itemName = (id) => ITEM_NAME[id] ?? '아이템';
const TARGET_LABEL = { self: '자신', enemy: '적 하나', enemies: '주변 적 전체', ally: '아군 하나', allies: '주변 아군' };
const isAttack = (mv) => mv.category !== 'status';
const DIR_OF = (dx, dy) => (dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
const pickOne = (mv) => !mv.kind || mv.kind === 'enemy' || mv.kind === 'ally'; // 대상을 직접 고르는 기술
const helpful = (mv) => mv.kind === 'self' || mv.kind === 'ally' || mv.kind === 'allies';
// 기술 특수 효과 글자 (기술 정보·자세히 보기)
export function moveEffectTags(mv) {
  const tags = [];
  if (mv.drain > 0) tags.push(`흡수 ${mv.drain}%`);
  if (mv.drain < 0) tags.push(`반동 ${-mv.drain === 33 ? '1/3' : -mv.drain === 25 ? '1/4' : -mv.drain === 50 ? '1/2' : `${-mv.drain}%`}`);
  if (mv.minHits && mv.maxHits > 1) tags.push(mv.minHits === mv.maxHits ? `${mv.maxHits}회` : `${mv.minHits}~${mv.maxHits}회`);
  if (mv.critRate > 0) tags.push('급소↑');
  if (mv.fixedDamage) tags.push(mv.fixedDamage === 'level' ? '고정 레벨' : `고정 ${mv.fixedDamage}`);
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
  sand: '모래바람에 휘말렸다!', hail: '싸라기눈을 맞았다!',
};
const START_EVENTS = ['asleep', 'woke', 'frozen', 'thawed'];
// 차례 끝 회복: 회복 표시를 띄울 유닛 (씨뿌리기는 빼앗아 회복한 쪽)
const HEAL_EVENTS = { aquaRing: (e) => (e.healed > 0 ? e.unitId : null), ingrain: (e) => (e.healed > 0 ? e.unitId : null), leech: (e) => (e.healed > 0 ? e.by : null) };
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

const unitLabel = (u) => (u.side === 'enemy' ? '상대 ' : '') + spec(u).name;

// 특성 발동 → 대사 (순수). 자주 나오는 가속은 대사 없이 (정보창 랭크로 보임), 습기는 공격 연출이 이미 말함
const abilityName = (id) => ABILITIES[id]?.name ?? id;
const HEAL_ABILITIES = ['volt-absorb', 'water-absorb', 'dry-skin', 'rain-dish', 'ice-body', 'poison-heal'];
const WEATHER_START = { drizzle: '비가 내리기 시작했다!', drought: '햇살이 강해졌다!', 'sand-stream': '모래바람이 불기 시작했다!', 'snow-warning': '싸라기눈이 내리기 시작했다!' };
const QUIET_ABILITIES = ['speed-boost', 'damp'];
export function abilityNotices(events = [], get) {
  return events.filter((e) => !QUIET_ABILITIES.includes(e.ability)).flatMap((e) => {
    const u = get(e.unitId);
    if (!u) return [];
    const who = unitLabel(u), name = abilityName(e.ability), t = e.target ? get(e.target) : null;
    let text, at = { x: u.x, y: u.y };
    if (e.ability === 'intimidate' && t) text = e.applied ? `${who}의 위협! ${unitLabel(t)}의 공격이 떨어졌다!` : `${who}의 위협! 그러나 ${unitLabel(t)}의 공격은 떨어지지 않았다!`;
    else if (e.ability === 'bad-dreams' && t) { text = `${josa(unitLabel(t), '은/는')} 나이트메어에 시달리고 있다!`; at = { x: t.x, y: t.y }; }
    else if (e.ability === 'sturdy') text = `${josa(who, '은/는')} 옹골참으로 버텼다!`;
    else if (e.ability === 'truant') text = `${josa(who, '은/는')} 게으름을 피우고 있다!`;
    else if (e.ability === 'trace') text = `${josa(who, '은/는')} 트레이스로 ${josa(abilityName(e.copied), '을/를')} 복사했다!`;
    else if (WEATHER_START[e.ability]) text = `${who}의 ${name}! ${WEATHER_START[e.ability]}`;
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
  let move, targets, tIdx, walk, anim, animThen, animAbility = null, banner, enemyQueue, pause, focus;
  let resultT = 0, clock = 0, everyone;
  let notice = null; // { lines, then } 대사 후 다음 단계
  let moveLocked = false; // 보물상자를 연 이동은 취소할 수 없다
  const cam = { x: 0, y: 0 };
  // pixelfx 이펙트 (브라우저면 오프스크린 캔버스로 그림, 테스트에선 계산만)
  const fxm = createFxManager({ makeCanvas: typeof document !== 'undefined' ? (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) : null });
  const facing = {};

  function reset() {
    st = createBattle(map, party, { hpRatio });
    fxm.clear();
    everyone = new Map(st.units.map((u) => [u.id, u])); // 기절해 사라진 유닛 이름도 대사에 쓰도록
    mode = 'banner';
    const first = st.units.find((u) => u.side === 'ally');
    cursor = first ? { x: first.x, y: first.y } : { x: 2, y: 5 };
    sel = walk = anim = banner = pause = focus = notice = null;
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
    const [min, max] = mv.range;
    const want = mv.kind === 'ally' ? (o) => o.side === unit.side && o !== unit : (o) => o.side !== unit.side;
    return st.units.filter((o) => want(o) && manhattan(unit, o) >= min && manhattan(unit, o) <= max && canTarget(mv, o)); // 숨은 포켓몬 제외
  }

  // 안개: 지금 아군 누구에게서도 FOG_SIGHT 이상 떨어진 적 (실시간)
  const hiddenIds = () => new Set(st.weather === 'fog' ? st.units.filter((u) => u.side === 'enemy' && isHidden(u, allyUnits())).map((u) => u.id) : []);

  // 공격기: 적이 하나 이상 맞는 조준만
  const attackAims = (unit, mv) => aimsOf(st, unit, mv).filter((a) => unitsHit(st, unit, mv, a).some((u) => u.side !== unit.side));
  const curAim = () => (aims ? aims[aIdx] : null);
  // 조준의 대표 칸 (커서 위치)
  // 압정(칸 조준): 사거리 1~3 의 벽 아닌 칸 / 덮는 칸 = 그 칸 + 4방
  const trapAims = (unit) => tilesInRange(unit.x, unit.y, [1, 3], st.width, st.height).filter((t) => st.grid[t.y][t.x] !== '#').map((t) => ({ x: t.x, y: t.y }));
  const aimsFor = (unit, mv) => (mv.aimTile ? trapAims(unit) : attackAims(unit, mv));
  const coverOf = (unit, mv, aim) => (mv.aimTile ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: aim.x + dx, y: aim.y + dy })).filter((t) => st.grid[t.y]?.[t.x] !== undefined && st.grid[t.y][t.x] !== '#') : tilesOf(st, unit, mv, aim));
  function aimPoint(aim) {
    if (aim.unitId) { const u = st.units.find((o) => o.id === aim.unitId); return { x: u.x, y: u.y }; }
    if (aim.dir) return tilesOf(st, sel, MV(move), aim)[0] ?? { x: sel.x, y: sel.y };
    if (aim.self) return { x: sel.x, y: sel.y };
    return { x: aim.x, y: aim.y };
  }
  const sameAim = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function fireAim() {
    const aim = curAim();
    const one = aim.unitId ? st.units.find((o) => o.id === aim.unitId) : null;
    doAttack(sel, one, move, finishAllyAction, aim);
  }

  // 페이즈 종료 때 풀린 랭크 → 대사 (한 건씩)
  // 페이즈 전환 알림: { lines, at?, hp? } — 스펙 순서(끝 데미지 → 랭크 만료 → 시작)
  // 층 시작 특성 대사 — 안개 속 적의 것은 정체가 드러나므로 뺀다
  const floorNotices = () => abilityNotices((st.floorAbilityEvents ?? []).filter((e) => !hiddenIds().has(e.unitId)), (id) => everyone.get(id));
  const phaseLines = () => { const get = (id) => everyone.get(id); return [...abilityNotices(st.log.phaseAbilityEvents, get), ...phaseNotices(st.log.statusEvents ?? [], st.log.expired ?? [], get)]; };

  // list: 대사 줄 또는 { lines, at, hp } 알림
  function noticeChain(list, then) {
    if (!list.length) { then(); return; }
    const [first, ...rest] = list;
    const n = first.lines ? first : { lines: Array.isArray(first) ? first : [first] };
    showNotice(n.lines, () => noticeChain(rest, then), n);
  }

  function attackTilesFrom(unit, tiles) {
    const maxR = Math.max(1, ...unit.moves.filter((m) => MOVES[m].category !== 'status').map((m) => MOVES[m].range[1])); // 공격 범위만
    const set = new Map();
    for (const k of tiles.keys()) {
      const [x, y] = k.split(',').map(Number);
      for (const t of tilesInRange(x, y, [1, maxR], st.width, st.height)) {
        const tk = `${t.x},${t.y}`;
        if (!tiles.has(tk)) set.set(tk, t);
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
  const playerPhase = (lines = []) => showBanner('아군 턴', (floorLabel ? `${floorLabel} · ${st.turn}턴째` : `${st.turn}턴째`) + weatherTag(), '#4080f8',
    () => noticeChain(lines, () => runCharges('ally', () => {
      focus = null;
      if (st.result) { mode = 'result'; return; }
      if (allyUnits().every((u) => u.acted)) { enemyPhase(); return; }
      mode = 'idle';
    })));

  function enemyPhase() {
    sel = null;
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
      endPhase(st, rng);
      cursor = { ...(allyUnits()[0] ?? cursor) };
      if (st.result) { noticeChain(phaseLines(), () => { mode = 'result'; }); return; }
      playerPhase(phaseLines());
      return;
    }
    const u = st.units.find((o) => o.id === id);
    if (!u || u.acted) { nextEnemy(); return; } // 기절했거나 잠듦·얼음으로 쉬는 중
    const plan = planEnemyAction(st, u, { unseen: enemyUnseen });
    if (u.sealed) plan.attack = null; // 풀죽음: 이번 차례 기술 봉인 (이동만)
    // 안개: 이동한 뒤에도 안개 속이면 기술을 쓰지 않는다 (대사로 정체가 드러나지 않게)
    if (st.weather === 'fog' && plan.attack && isHidden(plan.moveTo, allyUnits())) plan.attack = null;
    focus = u;
    cursor = { x: u.x, y: u.y };
    pause = { t: 0.35, fn: () => {
      startWalk(u, pathTo(st.grid, st.units, u, plan.moveTo.x, plan.moveTo.y), () => {
        cursor = { ...plan.moveTo };
        if (plan.attack) {
          const target = st.units.find((o) => o.id === plan.attack.targetId);
          pause = { t: 0.2, fn: () => doAttack(u, target, plan.attack.moveId, () => enemyRetreat(u), plan.attack.aim) };
        } else {
          u.acted = true;
          pause = { t: 0.2, fn: nextEnemy };
        }
      });
    } };
  }

  // 적 치고 빠지기: 아군에게서 가장 먼 칸으로
  function enemyRetreat(u) {
    const left = canRetreat(st, u);
    if (!left) { nextEnemy(); return; }
    const t = retreatSpot(st, u, left);
    u.retreatReady = false; u.retreated = true;
    if (!t || (t.x === u.x && t.y === u.y)) { nextEnemy(); return; }
    pause = { t: 0.15, fn: () => startWalk(u, pathTo(st.grid, st.units, u, t.x, t.y), nextEnemy) };
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
      const route = chargeRoute(st, u);
      if (!route) {
        u.charging = null;
        noticeChain([{ lines: [wrapMessage(`${unitLabel(u)}의 모은 힘이 흩어졌다!`)], at: { x: u.x, y: u.y } }], next);
        return;
      }
      const mv = MOVES[u.charging.moveId];
      focus = u; cursor = { x: u.x, y: u.y };
      startWalk(u, route.path, () => {
        const target = unitsHit(st, u, mv, route.aim).find((d) => d.side !== u.side) ?? null;
        attackWith(u, target, mv, () => { u.moved = true; u.acted = true; u.charging = null; next(); }, route.aim); // 막혀도 모은 힘은 씀
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

  function startWalk(unit, path, onDone, onDead = null) {
    path = lethalTrapCut(st, unit, path); // 압정에 쓰러질 칸에서 걷기를 멈춘다
    walk = { unit, path, t: 0, onDone, onDead, prevMode: mode };
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
    // 마비 실패·혼란 자해: 기술이 나가지 않으므로 대상은 돌아보지 않고 카메라는 사용자에게
    if (one && !result.blocked) {
      facing[attacker.id] = dirFromDelta(one.x - attacker.x, one.y - attacker.y);
      if (mv.category !== 'status') facing[one.id] = dirFromDelta(attacker.x - one.x, attacker.y - one.y);
    }
    anim = createAttackAnim({ attacker, defender: one, move: mv, result, hpBefore, lookup, fx: fxm });
    target = result.blocked ? attacker : one ?? attacker;
    animThen = then; animAbility = result.abilityEvents;
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
    animThen = then; animAbility = result.abilityEvents;
    focus = result.blocked || defenders.length !== 1 ? attacker : defenders[0];
    mode = 'anim';
  }

  function select(u) {
    sel = u;
    moveLocked = false;
    origin = { x: u.x, y: u.y, facing: facing[u.id] };
    reach = reachable(st.grid, st.units, u);
    atkTiles = attackTilesFrom(u, reach);
    mode = 'selected';
  }

  // 메뉴는 유닛의 화면 위치 반대편 모서리 (FE식)
  function cornerFor(unit, w) {
    const sx = unit.x * TILE - Math.round(cam.x);
    return { x: sx < W / 2 ? W - w - 2 : 2, y: 2 };
  }

  // 아군 이동 완료: 상자 열기 → 행동 메뉴, 계단 → 즉시 층 클리어 (취소 불가)
  function afterAllyMove() {
    const a = arrive(st, sel.id);
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
    sel = null;
    if (st.result) { mode = 'result'; return; }
    if (allyUnits().every((u) => u.acted)) enemyPhase();
    else mode = 'idle';
  }

  // 치고 빠지기: 남은 이동력으로 다시 이동 (취소하면 제자리에서 끝)
  function openRetreat() {
    reach = reachable(st.grid, st.units, sel, canRetreat(st, sel));
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
          startWalk(unit, pathTo(st.grid, st.units, unit, cursor.x, cursor.y), () => {
            unit.retreatReady = false; unit.retreated = true;
            const a = arrive(st, unit.id); // 상자·계단은 보통 이동과 같게
            if (a.stairs) { if (a.item) sound.jingle('item'); showNotice(a.item ? ['보물상자를 열었다!', '계단을 찾았다!'] : ['계단을 찾았다!'], () => { sel = null; mode = 'result'; }); return; }
            if (a.item) { showNotice(['보물상자를 열었다!', `${josa(ITEM_NAME[a.item] ?? '아이템', '을/를')} 얻었다!`], finishAllyAction); return; }
            finishAllyAction();
          });
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
          const u = unitAt(st, cursor.x, cursor.y);
          if (u && u.side === 'ally' && !u.acted) select(u);
          else if (!u) openEndMenu();
          return;
        }
        if (ev.type === 'cancel') { sel = null; mode = 'idle'; return; }
        if (pick && reach.has(`${cursor.x},${cursor.y}`)) {
          startWalk(sel, pathTo(st.grid, st.units, sel, cursor.x, cursor.y), afterAllyMove);
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
    } else if (mode === 'walking') {
      walk.t += dt;
      const i = Math.min(Math.floor(walk.t / STEP), walk.path.length - 2);
      if (i >= 0) {
        const a = walk.path[i], b = walk.path[i + 1];
        facing[walk.unit.id] = dirFromDelta(b.x - a.x, b.y - a.y);
      }
      if (walk.t >= STEP * (walk.path.length - 1)) {
        fxm.unfollow('moveMarker');
        const { onDone, onDead, prevMode, unit, path } = walk;
        walk = null;
        mode = prevMode;
        const end = path.at(-1);
        const cost = path.slice(1).reduce((c, p) => c + (TILE_COST[st.grid[p.y][p.x]] ?? 1), 0); // 치고 빠지기용 이동 비용
        moveUnit(st, unit.id, end.x, end.y, cost, path);
        const get = (id) => everyone.get(id);
        const arriveLines = st.units.includes(unit) ? abilityNotices(st.log.arriveAbilityEvents, get) : [];
        const trapLines = trapNotices(st.log.trapEvents, get);
        if ((arriveLines.length || trapLines.length) && unit.side === 'ally') moveLocked = true; // 위협·압정이 걸린 이동은 취소할 수 없다
        const dead = !st.units.includes(unit);
        noticeChain([...trapLines, ...arriveLines], () => { mode = prevMode; if (dead) (onDead ?? afterTrapFaint)(unit); else onDone(); });
      }
    } else if (mode === 'anim') {
      anim.update(dt);
      if (anim.done) {
        anim = null;
        fxm.expire(1); // 남은 연기·잔해는 1초 뒤 정리
        // 다음 행동 전 대기(pause) 동안 'anim' 에 머물지 않도록 먼저 모드를 되돌린다
        mode = st.result ? 'result' : st.phase === 'enemy' ? 'enemy' : 'idle';
        const lines = abilityNotices(animAbility, (id) => everyone.get(id)), back = mode;
        animAbility = null;
        if (!st.result) noticeChain(lines, () => { mode = back; animThen(); });
        else noticeChain(lines, () => { mode = 'result'; });
      }
    }
  }

  // 상태이상 지속 표시: 살아 있는 유닛의 상태와 맞춘다 (없어진 건 멈추고, 새로 생긴 건 붙인다)
  function syncStatusFx() {
    const wanted = new Map(), hidden = hiddenIds();
    for (const u of st.units) {
      if (hidden.has(u.id)) continue; // 안개 속 유닛에는 상태 표시를 그리지 않는다
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
    if (walk) { const p = unitWorld(walk.unit); t = camTarget({ x: p.x / TILE, y: p.y / TILE }); }
    else if (focus && (mode === 'anim' || mode === 'enemy')) t = camTarget(focus);
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
    if (walk && walk.unit === u) {
      const f = walk.t / STEP;
      const i = Math.min(Math.floor(f), walk.path.length - 1);
      const a = walk.path[i], b = walk.path[Math.min(i + 1, walk.path.length - 1)];
      const k = f - i;
      return { x: Math.round((a.x + (b.x - a.x) * k) * TILE), y: Math.round((a.y + (b.y - a.y) * k) * TILE) };
    }
    return { x: u.x * TILE, y: u.y * TILE };
  }

  function drawUnits(ctx) {
    const hidden = hiddenIds();
    const list = [...st.units];
    for (const u of anim?.extraUnits ?? (anim?.defender ? [anim.defender] : [])) if (u && !list.includes(u)) list.push(u); // 기절 연출 중
    list.sort((a, b) => unitWorld(a).y - unitWorld(b).y);
    for (const u of list) {
      const p = unitWorld(u);
      const cx = p.x + TILE / 2, cy = p.y + TILE / 2;
      const pose = anim?.unitPose(u);
      if (pose?.hidden) continue;
      drawShadow(ctx, cx, cy, u.side === 'ally' ? 'rgba(40,80,200,0.45)' : 'rgba(200,40,40,0.45)');
      const grey = u.acted && !pose && st.phase === (u.side === 'ally' ? 'player' : 'enemy');
      const walking = walk && walk.unit === u;
      // 쉬는 중: 잠듦은 Sleep 동작(없으면 회색 정지), 얼음은 푸르스름한 정지
      const resting = !pose && !walking && (u.status === 'sleep' || u.status === 'freeze');
      const sleepAnim = u.status === 'sleep' && hasAnim(u.species, 'Sleep');
      const a = pose?.anim ?? (walking ? 'Walk' : resting && sleepAnim ? 'Sleep' : 'Idle');
      const t = pose ? pose.t : walking ? walk.t : resting && !sleepAnim ? 0 : clock;
      const restFilter = resting && !grey && !sleepAnim ? (u.status === 'freeze' ? 'grayscale(0.6) brightness(1.25)' : 'grayscale(1) brightness(0.85)') : null;
      if (hidden.has(u.id)) { // 안개 속 적: 어두운 실루엣만
        ctx.save(); ctx.globalAlpha = 0.55; ctx.filter = 'brightness(0)';
        drawUnitSprite(ctx, u.species, 'Idle', facing[u.id], clock, cx, cy, true);
        ctx.restore();
        continue;
      }
      const burrowUnder = u.burrow && (u.burrow.kind === 'ground' || u.burrow.kind === 'water');
      if (burrowUnder) ui.drawBurrowMark(ctx, u, p.x, p.y); // 숨기: 흙더미·물웅덩이는 발밑에
      if (u.burrow) { ctx.save(); ctx.globalAlpha = 0.45; } // 숨은 포켓몬은 반투명
      if (grey) { ctx.save(); ctx.filter = 'grayscale(1) brightness(0.85)'; }
      if (restFilter) { ctx.save(); ctx.filter = restFilter; }
      if (pose?.flash) { ctx.save(); ctx.filter = 'brightness(3)'; }
      drawUnitSprite(ctx, u.species, a, pose?.dir ?? facing[u.id], grey ? 0 : t, cx + (pose?.dx ?? 0), cy + (pose?.dy ?? 0), pose ? pose.loop : true);
      if (pose?.flash) ctx.restore();
      if (restFilter) ctx.restore();
      if (grey) ctx.restore();
      if (u.burrow) ctx.restore();
      if (u.burrow && !burrowUnder) ui.drawBurrowMark(ctx, u, p.x, p.y); // 구름·그림자는 위에
      if (!pose?.hidden) ui.drawStatusDot(ctx, u, cx, cy);
    }
  }

  // 공격 예상 창: 맞는 대상 최대 3줄 (명중·데미지·기절), 넘으면 "외 N마리", 아군은 (아군)
  function drawAttackForecast(ctx, a, mv, aim) {
    const list = unitsHit(st, a, mv, aim);
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
      const fc = forecastFor(a, d, mv, tile, effectiveWeather(st), spread);
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
    const fc = forecastFor(a, d, mv, tile, effectiveWeather(st));
    const hit = fc.hit, min = { damage: fc.min, typeMult: fc.typeMult }, max = { damage: fc.max };
    const y = (d.y * TILE - cam.y) > H / 2 ? 2 : H - 54;
    ui.drawWindow(ctx, 2, y, W - 4, 52);
    drawText(ctx, `${spec(a).name} → ${spec(d).name}`, 10, y + 5);
    ui.drawTypeBadge(ctx, mv.type, W - 42, y + 5);
    drawText(ctx, mv.name, 10, y + 20);
    const bn = bindNote(moveId) ?? (mv.sure ? '필중' : null); // 속박기 · 필중
    if (bn) drawText(ctx, bn, 16 + textWidth(mv.name), y + 22, '#5848a0', null, 'small'); // 속박기
    const tm = min.typeMult;
    const eff = tm === 0 ? ['효과 없음', '#808080'] : tm > 1 ? ['효과 굉장', '#20a020'] : tm < 1 ? ['효과 별로', '#c07020'] : null;
    if (eff) drawText(ctx, eff[0], W - 12 - textWidth(eff[0]), y + 20, eff[1]);
    drawText(ctx, `명중 ${tm === 0 ? '-' : `${hit}%`}`, 10, y + 35);
    drawText(ctx, `데미지 ${tm === 0 ? 0 : `${min.damage}~${max.damage}`}`, 72, y + 35);
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
    if (one && foes.length) drawText(ctx, `명중 ${hitChance(a, one, { ...mv, accuracy: mv.accuracy ?? 100 }, st.grid[one.y][one.x], effectiveWeather(st))}%`, 10, y + 35);
    const note = one ? ailmentNote(one, mv, a) : null;
    if (note) drawText(ctx, note, W - 12 - textWidth(note), y + 35, '#808080');
    else if (!one) drawText(ctx, list.length ? `대상 ${list.length}마리` : '범위 안에 대상이 없다', 10, y + 35, list.length ? '#383838' : '#a0a0a0');
  }

  function drawMoveInfo(ctx, moveId) {
    const mv = MOVES[moveId];
    const r = ui.menuRect(menu, menuBox.x, menuBox.y);
    const w = r.w, h = 50;
    const x = r.x, y = r.y + r.h + 2;
    ui.drawWindow(ctx, x, y, w, h);
    ui.drawTypeBadge(ctx, mv.type, x + 6, y + 5);
    if (mv.category === 'status') {
      drawText(ctx, '변화', x + 44, y + 4);
      drawText(ctx, `대상 ${TARGET_LABEL[mv.kind]}`, x + 6, y + 19);
      const healNote = !sel ? '' : (sel.healUses ?? 0) <= 0 ? '이번 층에서는 더 못 쓴다' : sel.hp >= sel.maxHp ? 'HP 가 가득 차 있다' : `회복 · 남은 ${sel.healUses}번`;
      drawText(ctx, mv.heal ? healNote : `효과 ${effectSummary(mv)}`, x + 6, y + 33, '#5848a0');
      return;
    }
    drawText(ctx, mv.category === 'physical' ? '물리' : '특수', x + 44, y + 4);
    drawText(ctx, mv.weightPower ? '위력 몸무게' : mv.fixedDamage ? '위력 고정' : `위력 ${mv.power ?? '-'}`, x + 6, y + 19);
    drawText(ctx, `명중 ${mv.accuracy}`, x + 60, y + 19);
    drawText(ctx, ui.shapeLabel(mv), x + 6, y + 33);
    const extra = [...(mv.ailment ? [`${STATUS_KO[mv.ailment]} ${mv.ailmentChance || 100}%`] : []), ...moveEffectTags(mv)].slice(0, 2).join(' · '); // "화상 10% · 흡수 50%"
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
    drawMap(ctx, st.grid, time, cx, cy, W, H, theme);
    ui.drawZones(ctx, st); // 장판 테두리
    ui.drawAuras(ctx, st); // 오라 (쓴 포켓몬을 따라다님)
    ui.drawTraps(ctx, st, anim?.trapsShown ?? [], anim?.trapsHidden ?? []); // 압정 (적 것은 깔 때·밟힌 칸만)
    for (const c of st.chests) drawChest(ctx, c.x, c.y);
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
    if (['idle', 'selected', 'target', 'retreat'].includes(mode)) ui.drawCursor(ctx, cursor.x, cursor.y, time);
    if (anim) anim.drawWorld(ctx);
    if (notice?.hp && notice.at) drawNoticeHp(ctx, notice);
    ctx.restore();

    const onLeft = cursor.x * TILE - cx < W / 2;
    if (mode === 'idle' || mode === 'selected' || mode === 'enemy') {
      const u = unitAt(st, cursor.x, cursor.y);
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

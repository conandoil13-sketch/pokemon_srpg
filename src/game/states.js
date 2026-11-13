// 게임 상태 머신: core(규칙) 와 render(그리기) 를 잇는다
import { createBattle, unitAt, moveUnit, applyMove, targetsOf, endPhase, spec, arrive } from '../core/battle.js';
import { STAT_KO, API_STAT } from '../core/stages.js';
import { STATUS_KO, canInflict } from '../core/status.js';
import { wrapMessage } from '../render/mapAttack.js';
import { reachable, tilesInRange, manhattan, pathTo } from '../core/pathfind.js';
import { enemyTurnOrder, planEnemyAction } from '../core/ai.js';
import { calcDamage, hitChance } from '../core/damage.js';
import { MOVES } from '../data/moves.js';
import { drawMap, drawChest, TILE } from '../render/tiles.js';
import { drawUnitSprite, drawShadow, DIR } from '../render/sprites.js';
import { dirFromDelta } from '../render/pmdData.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { createAttackAnim } from './attackAnim.js';

const STEP = 0.11; // 타일당 이동 시간(초)
const BANNER = 1.4;
const RESULT_LOCK = 0.8; // 결과 화면 입력 잠금(초)
const BLUE = 'rgba(64,128,248,0.45)', RED = 'rgba(248,64,64,0.38)';
const MARGIN = 2; // 카메라: 커서를 화면 가장자리에서 최소 이 칸만큼 안쪽에

const seqRng = (vals) => { let i = 0; return () => vals[i++] ?? 0; };

import { josa } from '../data/text.js';

const ITEM_NAME = { evoStone: '진화의돌', candy: '경험 사탕' };
const TARGET_LABEL = { self: '자신', enemy: '적 하나', enemies: '주변 적 전체', ally: '아군 하나', allies: '주변 아군' };
const pickOne = (mv) => !mv.kind || mv.kind === 'enemy' || mv.kind === 'ally'; // 대상을 직접 고르는 기술
const helpful = (mv) => mv.kind === 'self' || mv.kind === 'ally' || mv.kind === 'allies';
export const effectSummary = (mv) => [...(mv.statChanges ?? []).map((c) => `${STAT_KO[API_STAT[c.stat]]} ${c.change > 0 ? '+' : ''}${c.change}`), ...(mv.ailment ? [STATUS_KO[mv.ailment]] : [])].join(' ');
// 상태이상 변화기 예상 창 경고: 면역 / 이미 상태이상 (없으면 null)
export function ailmentNote(target, mv) {
  if (!mv.ailment) return null;
  const r = canInflict(target, mv.ailment, mv);
  return r.ok ? null : r.reason === 'immune' ? '효과 없음' : '이미 상태이상';
}
const unitLabel = (u) => (u.side === 'enemy' ? '상대 ' : '') + spec(u).name;

export function createGame({ rng, map, party, hpRatio, theme = 'field', floorLabel = null, onExit }) {
  let st, mode, cursor, sel, origin, reach, atkTiles, menu, menuSel, menuBox;
  let move, targets, tIdx, walk, anim, animThen, banner, enemyQueue, pause, focus;
  let resultT = 0, clock = 0, everyone;
  let notice = null; // { lines, then } 대사 후 다음 단계
  let moveLocked = false; // 보물상자를 연 이동은 취소할 수 없다
  const cam = { x: 0, y: 0 };
  const facing = {};

  function reset() {
    st = createBattle(map, party, { hpRatio });
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
  function targetsFor(unit, moveId) {
    const mv = MOVES[moveId];
    if (!pickOne(mv)) return targetsOf(st, unit, mv);
    const [min, max] = mv.range;
    const want = mv.kind === 'ally' ? (o) => o.side === unit.side && o !== unit : (o) => o.side !== unit.side;
    return st.units.filter((o) => want(o) && manhattan(unit, o) >= min && manhattan(unit, o) <= max);
  }

  // 페이즈 종료 때 풀린 랭크 → 대사 (한 건씩)
  function expiryLines() {
    return (st.log.expired ?? []).flatMap((e) => {
      const u = st.units.find((o) => o.id === e.unitId);
      return u ? e.keys.map((k) => wrapMessage(`${unitLabel(u)}의 ${josa(STAT_KO[k], '이/가')} 원래대로 돌아왔다!`)) : [];
    });
  }
  // 페이즈 전환 때 상태이상 이벤트 → 대사 (한 건씩)
  const STATUS_LINE = {
    poison: '독의 데미지를 입었다!', toxic: '독의 데미지를 입었다!', burn: '화상 데미지를 입었다!', fainted: '쓰러졌다!',
    asleep: '쿨쿨 잠들어 있다', woke: '눈을 떴다!', frozen: '얼어 버려서 움직일 수 없다!',
  };
  function statusLines() {
    return (st.log.statusEvents ?? []).map((e) => {
      const who = unitLabel(everyone.get(e.unitId));
      if (e.kind === 'confusionEnd') return wrapMessage(`${who}의 혼란이 풀렸다!`);
      if (e.kind === 'thawed') return wrapMessage(`${who}의 얼음이 녹았다!`);
      return wrapMessage(`${josa(who, '은/는')} ${STATUS_LINE[e.kind]}`);
    });
  }
  const phaseLines = () => [...statusLines(), ...expiryLines()];

  function noticeChain(list, then) {
    if (!list.length) { then(); return; }
    const [first, ...rest] = list;
    showNotice(Array.isArray(first) ? first : [first], () => noticeChain(rest, then));
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
  const playerPhase = (lines = []) => showBanner('아군 턴', floorLabel ? `${floorLabel} · ${st.turn}턴째` : `${st.turn}턴째`, '#4080f8',
    () => noticeChain(lines, () => {
      focus = null;
      if (st.result) { mode = 'result'; return; }
      if (allyUnits().every((u) => u.acted)) { enemyPhase(); return; }
      mode = 'idle';
    }));

  function enemyPhase() {
    sel = null;
    endPhase(st, rng);
    const lines = phaseLines();
    if (st.result) { noticeChain(lines, () => { mode = 'result'; }); return; } // 결과가 났으면 다음 턴 배너 없이
    showBanner('상대 턴', null, '#f84040', () => noticeChain(lines, () => {
      if (st.result) { mode = 'result'; return; }
      enemyQueue = enemyTurnOrder(st).map((u) => u.id);
      mode = 'enemy';
      nextEnemy();
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
    const plan = planEnemyAction(st, u);
    focus = u;
    cursor = { x: u.x, y: u.y };
    pause = { t: 0.35, fn: () => {
      startWalk(u, pathTo(st.grid, st.units, u, plan.moveTo.x, plan.moveTo.y), () => {
        cursor = { ...plan.moveTo };
        if (plan.attack) {
          const target = st.units.find((o) => o.id === plan.attack.targetId);
          pause = { t: 0.2, fn: () => doAttack(u, target, plan.attack.moveId, nextEnemy) };
        } else {
          u.acted = true;
          pause = { t: 0.2, fn: nextEnemy };
        }
      });
    } };
  }

  function startWalk(unit, path, onDone) {
    walk = { unit, path, t: 0, onDone, prevMode: mode };
    mode = 'walking';
  }

  // 공격기·변화기 공통. 자신·범위형 변화기는 target 을 무시한다
  function doAttack(attacker, target, moveId, then) {
    const mv = MOVES[moveId];
    const one = pickOne(mv) && target && target !== attacker ? target : null;
    const hpBefore = one?.hp;
    if (one) {
      facing[attacker.id] = dirFromDelta(one.x - attacker.x, one.y - attacker.y);
      if (mv.category !== 'status') facing[one.id] = dirFromDelta(attacker.x - one.x, attacker.y - one.y);
    }
    const lookup = (id) => st.units.find((u) => u.id === id) ?? [attacker, one].find((u) => u?.id === id);
    const result = applyMove(st, attacker.id, moveId, one?.id ?? null, rng);
    anim = createAttackAnim({ attacker, defender: one, move: mv, result, hpBefore, lookup });
    target = one ?? attacker;
    animThen = then;
    focus = target;
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
      showNotice(a.item ? ['보물상자를 열었다!', '계단을 찾았다!'] : ['계단을 찾았다!'], () => { sel = null; mode = 'result'; });
    } else if (a.item) {
      moveLocked = true;
      showNotice(['보물상자를 열었다!', `${josa(ITEM_NAME[a.item], '을/를')} 얻었다!`], openAction);
    } else openAction();
  }

  function showNotice(lines, then) {
    notice = { lines, then };
    mode = 'notice';
  }

  function openAction() {
    menu = sel.moves.map((m) => ({
      label: MOVES[m].name, moveId: m,
      enabled: MOVES[m].kind === 'self' || targetsFor(sel, m).length > 0,
      ...(MOVES[m].category === 'status' ? { tag: '변화' } : {}),
    }));
    menu.push({ label: '대기', enabled: true });
    const firstAttack = menu.findIndex((i) => i.enabled && i.moveId && !i.tag);
    menuSel = firstAttack >= 0 ? firstAttack : Math.max(0, menu.findIndex((i) => i.enabled));
    menuBox = cornerFor(sel, ui.menuRect(menu, 0, 0).w);
    mode = 'action';
  }

  function finishAllyAction() {
    sel = null;
    if (st.result) { mode = 'result'; return; }
    if (allyUnits().every((u) => u.acted)) enemyPhase();
    else mode = 'idle';
  }

  function openEndMenu() {
    menu = [{ label: '턴 종료', enabled: true }, { label: '취소', enabled: true }];
    menuSel = 0;
    menuBox = cornerFor(cursor, ui.menuRect(menu, 0, 0).w);
    mode = 'endMenu';
  }

  function chooseMenu() {
    const it = menu[menuSel];
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
    targets = targetsFor(sel, move);
    tIdx = 0;
    const t0 = pickOne(MOVES[move]) ? targets[0] : sel; // 자신·범위형: 커서는 사용자, 확인 한 번
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
          else { reset(); playerPhase(); }
        }
        return;
      case 'notice':
        if ((ev.type === 'confirm' || ev.type === 'click') && notice) { const then = notice.then; notice = null; then(); }
        return;
      case 'anim':
        if ((ev.type === 'confirm' || ev.type === 'click') && anim) anim.advance();
        return;
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
          sel.x = origin.x; sel.y = origin.y; sel.moved = false;
          facing[sel.id] = origin.facing;
          cursor = { x: origin.x, y: origin.y };
          mode = 'selected';
        }
        return;
      }
      case 'target': {
        if (!pickOne(MOVES[move])) {
          const inArea = tile && manhattan(tile, sel) <= MOVES[move].range[1];
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
            tIdx = i; cursor = { ...tile };
            if (ev.type === 'click') doAttack(sel, targets[tIdx], move, finishAllyAction);
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
  function update(dt) {
    clock += dt;
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
        const { onDone, prevMode, unit, path } = walk;
        walk = null;
        mode = prevMode;
        const end = path.at(-1);
        moveUnit(st, unit.id, end.x, end.y);
        onDone();
      }
    } else if (mode === 'anim') {
      anim.update(dt);
      if (anim.done) {
        anim = null;
        // 다음 행동 전 대기(pause) 동안 'anim' 에 머물지 않도록 먼저 모드를 되돌린다
        mode = st.result ? 'result' : st.phase === 'enemy' ? 'enemy' : 'idle';
        if (!st.result) animThen();
      }
    }
  }

  function updateCamera(dt) {
    let t;
    if (walk) { const p = unitWorld(walk.unit); t = camTarget({ x: p.x / TILE, y: p.y / TILE }); }
    else if (focus && (mode === 'anim' || mode === 'enemy')) t = camTarget(focus);
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
    const list = [...st.units];
    if (anim && !st.units.includes(anim.defender)) list.push(anim.defender); // 기절 연출 중
    list.sort((a, b) => unitWorld(a).y - unitWorld(b).y);
    for (const u of list) {
      const p = unitWorld(u);
      const cx = p.x + TILE / 2, cy = p.y + TILE / 2;
      const pose = anim?.unitPose(u);
      if (pose?.hidden) continue;
      drawShadow(ctx, cx, cy, u.side === 'ally' ? 'rgba(40,80,200,0.45)' : 'rgba(200,40,40,0.45)');
      const grey = u.acted && !pose && st.phase === (u.side === 'ally' ? 'player' : 'enemy');
      const walking = walk && walk.unit === u;
      const a = pose?.anim ?? (walking ? 'Walk' : u.status === 'sleep' && !pose ? 'Sleep' : 'Idle');
      const t = pose ? pose.t : walking ? walk.t : u.status === 'freeze' ? 0 : clock; // 얼음: 정지
      if (grey) { ctx.save(); ctx.filter = 'grayscale(1) brightness(0.85)'; }
      if (pose?.flash) { ctx.save(); ctx.filter = 'brightness(3)'; }
      drawUnitSprite(ctx, u.species, a, pose?.dir ?? facing[u.id], grey ? 0 : t, cx + (pose?.dx ?? 0), cy + (pose?.dy ?? 0), pose ? pose.loop : true);
      if (pose?.flash) ctx.restore();
      if (grey) ctx.restore();
      if (!pose?.hidden) ui.drawStatusDot(ctx, u, cx, cy);
    }
  }

  function drawForecast(ctx, a, d, moveId) {
    const mv = MOVES[moveId];
    const tile = st.grid[d.y][d.x];
    const hit = hitChance(a, d, mv, tile);
    const min = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0]), defTile: tile });
    const max = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0.99999]), defTile: tile });
    const y = (d.y * TILE - cam.y) > H / 2 ? 2 : H - 54;
    ui.drawWindow(ctx, 2, y, W - 4, 52);
    drawText(ctx, `${spec(a).name} → ${spec(d).name}`, 10, y + 5);
    ui.drawTypeBadge(ctx, mv.type, W - 42, y + 5);
    drawText(ctx, mv.name, 10, y + 20);
    const tm = min.typeMult;
    const eff = tm === 0 ? ['효과 없음', '#808080'] : tm > 1 ? ['효과 굉장', '#20a020'] : tm < 1 ? ['효과 별로', '#c07020'] : null;
    if (eff) drawText(ctx, eff[0], W - 12 - textWidth(eff[0]), y + 20, eff[1]);
    drawText(ctx, `명중 ${tm === 0 ? '-' : `${hit}%`}`, 10, y + 35);
    drawText(ctx, `데미지 ${tm === 0 ? 0 : `${min.damage}~${max.damage}`}`, 72, y + 35);
    const ko = tm === 0 ? '' : min.damage >= d.hp && hit === 100 ? '기절!' : max.damage >= d.hp ? '기절?' : '';
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
    if (one && foes.length) drawText(ctx, `명중 ${hitChance(a, one, { ...mv, accuracy: mv.accuracy ?? 100 }, st.grid[one.y][one.x])}%`, 10, y + 35);
    const note = one ? ailmentNote(one, mv) : null;
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
      drawText(ctx, `효과 ${effectSummary(mv)}`, x + 6, y + 33, '#5848a0');
      return;
    }
    drawText(ctx, mv.category === 'physical' ? '물리' : '특수', x + 44, y + 4);
    drawText(ctx, `위력 ${mv.power}`, x + 6, y + 19);
    drawText(ctx, `명중 ${mv.accuracy}`, x + 60, y + 19);
    drawText(ctx, `사거리 ${mv.range[0]}~${mv.range[1]}`, x + 6, y + 33);
    if (mv.ailment) { // 부가효과 상태이상: "화상 10%"
      const t = `${STATUS_KO[mv.ailment]} ${mv.ailmentChance || 100}%`;
      drawText(ctx, t, x + w - 8 - textWidth(t, 'small'), y + 35, '#5848a0', null, 'small');
    }
  }

  const toPts = (m) => [...m.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });

  function draw(ctx, time) {
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-cx, -cy);
    drawMap(ctx, st.grid, time, cx, cy, W, H, theme);
    for (const c of st.chests) drawChest(ctx, c.x, c.y);
    if (mode === 'selected') {
      ui.drawHighlights(ctx, toPts(reach), BLUE);
      ui.drawHighlights(ctx, atkTiles, RED);
    }
    const area = (mv) => ui.drawHighlights(ctx, tilesInRange(sel.x, sel.y, mv.range, st.width, st.height), helpful(mv) ? BLUE : RED);
    if (mode === 'action' && menu[menuSel]?.moveId) area(MOVES[menu[menuSel].moveId]);
    if (mode === 'target') area(MOVES[move]);
    drawUnits(ctx);
    if (['idle', 'selected', 'target'].includes(mode)) ui.drawCursor(ctx, cursor.x, cursor.y, time);
    if (anim) anim.drawWorld(ctx);
    ctx.restore();

    const onLeft = cursor.x * TILE - cx < W / 2;
    if (mode === 'idle' || mode === 'selected' || mode === 'enemy') {
      const u = unitAt(st, cursor.x, cursor.y);
      if (u) ui.drawUnitInfo(ctx, u, onLeft);
    }
    if (mode === 'action' || mode === 'endMenu') {
      ui.drawMenu(ctx, menu, menuSel, menuBox.x, menuBox.y);
      if (mode === 'action' && menu[menuSel]?.moveId) drawMoveInfo(ctx, menu[menuSel].moveId);
    }
    if (mode === 'target') {
      if (MOVES[move].category === 'status') drawStatusForecast(ctx, sel, MOVES[move], targets);
      else drawForecast(ctx, sel, targets[tIdx], move);
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

  playerPhase();

  return { handle, update, draw, get state() { return st; }, get mode() { return mode; }, get menu() { return menu; }, get menuSel() { return menuSel; }, get camera() { return { ...cam }; } };
}

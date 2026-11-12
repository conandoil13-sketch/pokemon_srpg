// 게임 상태 머신: core(규칙) 와 render(그리기) 를 잇는다
import { createBattle, unitAt, moveUnit, applyAttack, endPhase, spec } from '../core/battle.js';
import { reachable, tilesInRange, manhattan, pathTo } from '../core/pathfind.js';
import { enemyTurnOrder, planEnemyAction } from '../core/ai.js';
import { calcDamage, hitChance } from '../core/damage.js';
import { MOVES } from '../data/moves.js';
import { drawMap } from '../render/tiles.js';
import { drawIcon } from '../render/sprites.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W } from '../render/screen.js';
import { createAttackAnim } from './attackAnim.js';

const STEP = 0.07; // 타일당 이동 시간(초)
const BANNER = 1.4;
const RESULT_LOCK = 0.8; // 결과 화면 입력 잠금(초)
const BLUE = 'rgba(64,128,248,0.45)', RED = 'rgba(248,64,64,0.38)';

const seqRng = (vals) => { let i = 0; return () => vals[i++] ?? 0; };

export function createGame({ rng }) {
  let st, mode, cursor, sel, origin, reach, atkTiles, menu, menuSel, menuBox;
  let move, targets, tIdx, walk, anim, animThen, banner, enemyQueue, pause, ptr;
  let resultT = 0;

  function reset() {
    st = createBattle();
    mode = 'title';
    cursor = { x: 2, y: 5 };
    sel = walk = anim = banner = pause = null;
    ptr = null;
  }
  reset();

  const allyUnits = () => st.units.filter((u) => u.side === 'ally');
  const inMap = (x, y) => x >= 0 && y >= 0 && x < st.width && y < st.height;

  function targetsFor(unit, moveId) {
    const [min, max] = MOVES[moveId].range;
    return st.units.filter((o) => o.side !== unit.side && manhattan(unit, o) >= min && manhattan(unit, o) <= max);
  }

  function attackTilesFrom(unit, tiles) {
    const maxR = Math.max(...spec(unit).moves.map((m) => MOVES[m].range[1]));
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

  const playerPhase = () => showBanner('PLAYER PHASE', `Turn ${st.turn}`, '#4080f8', () => { mode = 'idle'; });

  function enemyPhase() {
    sel = null;
    endPhase(st);
    showBanner('ENEMY PHASE', null, '#f84040', () => {
      enemyQueue = enemyTurnOrder(st).map((u) => u.id);
      mode = 'enemy';
      nextEnemy();
    });
  }

  function nextEnemy() {
    if (st.result) { mode = 'result'; return; }
    const id = enemyQueue.shift();
    if (!id) {
      endPhase(st);
      playerPhase();
      return;
    }
    const u = st.units.find((o) => o.id === id);
    if (!u) { nextEnemy(); return; }
    const plan = planEnemyAction(st, u);
    cursor = { x: u.x, y: u.y };
    pause = { t: 0.35, fn: () => {
      startWalk(u, pathTo(st.grid, st.units, u, plan.moveTo.x, plan.moveTo.y), () => {
        cursor = { ...plan.moveTo };
        if (plan.attack) {
          const target = st.units.find((o) => o.id === plan.attack.targetId);
          pause = { t: 0.25, fn: () => doAttack(u, target, plan.attack.moveId, nextEnemy) };
        } else {
          u.acted = true;
          pause = { t: 0.2, fn: nextEnemy };
        }
      });
    } };
  }

  function startWalk(unit, path, onDone) {
    const prevMode = mode;
    walk = { unit, path, t: 0, onDone, prevMode };
    mode = 'walking';
  }

  function doAttack(attacker, target, moveId, then) {
    const hpBefore = target.hp;
    const result = applyAttack(st, attacker.id, target.id, moveId, rng);
    anim = createAttackAnim({ attacker, defender: target, move: MOVES[moveId], result, hpBefore });
    animThen = then;
    mode = 'anim';
  }

  function select(u) {
    sel = u;
    origin = { x: u.x, y: u.y };
    reach = reachable(st.grid, st.units, u);
    atkTiles = attackTilesFrom(u, reach);
    mode = 'selected';
  }

  function openAction() {
    menu = spec(sel).moves.map((m) => ({ label: MOVES[m].name, enabled: targetsFor(sel, m).length > 0, moveId: m }));
    menu.push({ label: 'Wait', enabled: true });
    menuSel = Math.max(0, menu.findIndex((i) => i.enabled));
    // FE식: 유닛 반대편 화면 모서리에 메뉴, 그 아래 기술 정보
    const r = ui.menuRect(menu, 0, 0);
    const w = Math.max(r.w, 104);
    menuBox = { x: sel.x < 8 ? W - w - 2 : 2, y: 2 };
    mode = 'action';
  }

  function finishAllyAction() {
    sel = null;
    if (st.result) { mode = 'result'; return; }
    if (allyUnits().every((u) => u.acted)) enemyPhase();
    else mode = 'idle';
  }

  function openEndMenu() {
    menu = [{ label: 'End Turn', enabled: true }, { label: 'Cancel', enabled: true }];
    menuSel = 0;
    menuBox = { x: Math.min(cursor.x * 16 + 20, W - 108), y: Math.min(cursor.y * 16, 150) };
    mode = 'endMenu';
  }

  function chooseMenu() {
    const it = menu[menuSel];
    if (!it?.enabled) return;
    if (mode === 'endMenu') {
      if (it.label === 'End Turn') enemyPhase(); else mode = 'idle';
      return;
    }
    if (!it.moveId) { // Wait
      sel.acted = true; sel.moved = true;
      finishAllyAction();
      return;
    }
    move = it.moveId;
    targets = targetsFor(sel, move);
    tIdx = 0;
    cursor = { x: targets[0].x, y: targets[0].y };
    mode = 'target';
  }

  // ---------- 입력 ----------
  function handle(ev) {
    if (ev.type === 'cursor') ptr = ev;
    switch (mode) {
      case 'title':
        if (ev.type === 'confirm' || ev.type === 'click') playerPhase();
        return;
      case 'result':
        // 메시지 넘기던 연타로 결과 화면이 바로 스킵되지 않게 잠깐 입력을 막는다
        if ((ev.type === 'confirm' || ev.type === 'click') && resultT >= RESULT_LOCK) { reset(); playerPhase(); }
        return;
      case 'anim':
        if ((ev.type === 'confirm' || ev.type === 'click') && anim) anim.advance();
        return;
      case 'idle': case 'selected': {
        if (ev.type === 'cursor') cursor = { x: ev.x, y: ev.y };
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
          startWalk(sel, pathTo(st.grid, st.units, sel, cursor.x, cursor.y), openAction);
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
          sel.x = origin.x; sel.y = origin.y; sel.moved = false;
          cursor = { ...origin };
          mode = 'selected';
        }
        return;
      }
      case 'target': {
        if (ev.type === 'dir') {
          tIdx = (tIdx + (ev.dx + ev.dy > 0 ? 1 : -1) + targets.length) % targets.length;
          cursor = { x: targets[tIdx].x, y: targets[tIdx].y };
        }
        if (ev.type === 'cursor' || ev.type === 'click') {
          const i = targets.findIndex((t) => t.x === ev.x && t.y === ev.y);
          if (i >= 0) {
            tIdx = i; cursor = { x: ev.x, y: ev.y };
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
    resultT = mode === 'result' ? resultT + dt : 0;
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
        // 다음 행동 전 대기(pause) 동안에도 'anim' 에 머물지 않도록 먼저 모드를 되돌린다
        mode = st.result ? 'result' : st.phase === 'enemy' ? 'enemy' : 'idle';
        if (!st.result) animThen();
      }
    }
  }

  // ---------- 그리기 ----------
  function unitPos(u) {
    if (walk && walk.unit === u) {
      const f = walk.t / STEP;
      const i = Math.min(Math.floor(f), walk.path.length - 1);
      const a = walk.path[i], b = walk.path[Math.min(i + 1, walk.path.length - 1)];
      const k = f - i;
      return { px: Math.round((a.x + (b.x - a.x) * k) * 16), py: Math.round((a.y + (b.y - a.y) * k) * 16) };
    }
    return { px: u.x * 16, py: u.y * 16 };
  }

  function drawUnits(ctx, time) {
    const list = [...st.units];
    if (anim && !st.units.includes(anim.defender)) list.push(anim.defender); // 기절 연출 중
    list.sort((a, b) => unitPos(a).py - unitPos(b).py);
    const frame = Math.floor(time / 0.5) % 2;
    for (const u of list) {
      const { px, py } = unitPos(u);
      ctx.fillStyle = u.side === 'ally' ? 'rgba(56,112,248,0.75)' : 'rgba(248,56,56,0.75)';
      ctx.fillRect(px + 3, py + 13, 10, 2);
      ctx.fillRect(px + 2, py + 14, 12, 1);
      const grey = u.acted && st.phase === (u.side === 'ally' ? 'player' : 'enemy');
      if (grey) { ctx.save(); ctx.filter = 'grayscale(1) brightness(0.8)'; }
      drawIcon(ctx, u.species, px, py, grey ? 0 : frame);
      if (grey) ctx.restore();
    }
  }

  function drawForecast(ctx, a, d, moveId) {
    const mv = MOVES[moveId];
    const tile = st.grid[d.y][d.x];
    const hit = hitChance(a, d, mv, tile);
    const min = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0]), defTile: tile });
    const max = calcDamage(a, d, mv, { rng: seqRng([0, 0.99, 0.99999]), defTile: tile });
    const y = d.y >= 7 ? 2 : 146;
    ui.drawWindow(ctx, 2, y, W - 4, 44);
    drawText(ctx, `${spec(a).name} > ${spec(d).name}`, 10, y + 6);
    drawText(ctx, mv.name, 10, y + 18);
    drawText(ctx, `HIT ${hit}%`, 10, y + 30);
    const dmg = min.typeMult === 0 ? '0' : `${min.damage}-${max.damage}`;
    drawText(ctx, `DMG ${dmg}`, 64, y + 30);
    const ko = min.damage >= d.hp && hit === 100 ? 'KO!' : max.damage >= d.hp ? 'KO?' : '';
    if (ko) drawText(ctx, ko, 140, y + 30, '#e03030');
    const tm = min.typeMult;
    const eff = tm === 0 ? ['No effect', '#808080'] : tm > 1 ? ['Super effective!', '#20a020'] : tm < 1 ? ['Not very effective', '#c07020'] : null;
    if (eff) drawText(ctx, eff[0], W - 12 - textWidth(eff[0]), y + 18, eff[1]);
    ui.drawTypeBadge(ctx, mv.type, W - 40, y + 5);
    ui.drawHpBar(ctx, 164, y + 32, 80, Math.max(0, d.hp - max.damage), d.maxHp);
  }

  function drawMoveInfo(ctx, moveId) {
    const mv = MOVES[moveId];
    const r = ui.menuRect(menu, menuBox.x, menuBox.y);
    const w = 104, h = 44;
    const x = r.x, y = r.y + r.h + 2;
    ui.drawWindow(ctx, x, y, w, h);
    ui.drawTypeBadge(ctx, mv.type, x + 6, y + 5);
    drawText(ctx, mv.category === 'physical' ? 'PHYS' : 'SPEC', x + 40, y + 6);
    drawText(ctx, `PWR ${mv.power}`, x + 6, y + 18);
    drawText(ctx, `ACC ${mv.accuracy}`, x + 54, y + 18);
    drawText(ctx, `RANGE ${mv.range[0]}-${mv.range[1]}`, x + 6, y + 30);
  }

  function draw(ctx, time) {
    drawMap(ctx, st.grid, time);

    if (mode === 'selected') {
      ui.drawHighlights(ctx, [...reach.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; }), BLUE);
      ui.drawHighlights(ctx, atkTiles, RED);
    }
    if (mode === 'action' && menu[menuSel]?.moveId) {
      ui.drawHighlights(ctx, tilesInRange(sel.x, sel.y, MOVES[menu[menuSel].moveId].range, st.width, st.height), RED);
    }
    if (mode === 'target') ui.drawHighlights(ctx, tilesInRange(sel.x, sel.y, MOVES[move].range, st.width, st.height), RED);

    drawUnits(ctx, time);

    if (['idle', 'selected', 'target', 'enemy'].includes(mode)) ui.drawCursor(ctx, cursor.x, cursor.y, time);

    if (mode === 'idle' || mode === 'selected') {
      const u = unitAt(st, cursor.x, cursor.y);
      if (u) ui.drawUnitInfo(ctx, u, cursor.x);
    }
    if (mode === 'action' || mode === 'endMenu') {
      ui.drawMenu(ctx, menu, menuSel, menuBox.x, menuBox.y);
      if (mode === 'action' && menu[menuSel]?.moveId) drawMoveInfo(ctx, menu[menuSel].moveId);
    }
    if (mode === 'target') drawForecast(ctx, sel, targets[tIdx], move);
    if (mode === 'enemy') {
      const u = unitAt(st, cursor.x, cursor.y);
      if (u) ui.drawUnitInfo(ctx, u, cursor.x);
    }
    if (banner) ui.drawBanner(ctx, banner.text, banner.sub, banner.color, Math.min(1, banner.t));
    if (anim) anim.draw(ctx, time);
    if (mode === 'title') drawTitle(ctx, time);
    if (mode === 'result') drawResult(ctx, time);
  }

  function bigText(ctx, text, y, color, shadow) {
    ctx.save();
    ctx.translate(Math.floor((W - textWidth(text) * 2) / 2), y);
    ctx.scale(2, 2);
    drawText(ctx, text, 0, 0, color, shadow);
    ctx.restore();
  }

  function drawTitle(ctx, time) {
    ctx.fillStyle = 'rgba(16,24,40,0.55)';
    ctx.fillRect(0, 0, W, 192);
    ui.drawWindow(ctx, 24, 48, 208, 84);
    bigText(ctx, 'POKEMON TACTICS', 60, '#304878', '#a8c0e0');
    const sub = '- Sinnoh Skirmish -';
    drawText(ctx, sub, Math.floor((W - textWidth(sub)) / 2), 86, '#606878');
    if (Math.floor(time * 2) % 2 === 0) {
      const p = 'Press Z or Click';
      drawText(ctx, p, Math.floor((W - textWidth(p)) / 2), 108, '#e04040');
    }
    const fan = 'Unofficial fan demo';
    drawText(ctx, fan, Math.floor((W - textWidth(fan)) / 2), 178, '#c8d0e0', null);
  }

  function drawResult(ctx, time) {
    ctx.fillStyle = 'rgba(16,16,24,0.6)';
    ctx.fillRect(0, 0, W, 192);
    const win = st.result === 'win';
    ui.drawWindow(ctx, 40, 56, 176, 76);
    bigText(ctx, win ? 'VICTORY!' : 'DEFEAT...', 68, win ? '#d8a000' : '#c03030', '#d0d0d0');
    const t = `Cleared on turn ${st.turn}`;
    if (win) drawText(ctx, t, Math.floor((W - textWidth(t)) / 2), 94);
    if (Math.floor(time * 2) % 2 === 0) {
      const p = 'Press Z to play again';
      drawText(ctx, p, Math.floor((W - textWidth(p)) / 2), 112, '#606878');
    }
  }

  return { handle, update, draw, get state() { return st; }, get mode() { return mode; } };
}

// 로비 마을 장면: 리더 포켓몬을 걸어서 움직이고, 출격 게시판에서 전투로 나간다
import { TOWN, WATER_GIFT_SPOT } from '../data/town.js';
import { SPECIES } from '../data/species.js';
import { drawMap, TILE } from '../render/tiles.js';
import { drawUnitSprite, drawShadow, DIR } from '../render/sprites.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { createFxManager } from '../render/fx.js';
import { MOVE_MARKER, markerAt } from '../data/moveFx.js';

const STEP = 0.16; // 한 칸 이동 시간(초)
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const TO_DIR = { up: DIR.Up, down: DIR.Down, left: DIR.Left, right: DIR.Right };
const nameOf = (dx, dy) => (dx > 0 ? 'right' : dx < 0 ? 'left' : dy < 0 ? 'up' : 'down');

export function createTown({ onSortie, onParty, onGacha, onBag = null, onTurtwigGift = null, onWaterGift = null, spawn = TOWN.start, message = null, leader = TOWN.leader, companions = [] }) {
  let turtwigTalks = 0; // 이스터에그: 모부기에게 5번 말 걸기
  const fxm = createFxManager({ makeCanvas: typeof document !== 'undefined' ? (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) : null }); // 톡·클릭 목적지 표시
  const map = TOWN;
  const width = map.tiles[0].length, height = map.tiles.length;
  const player = { x: spawn.x, y: spawn.y, facing: spawn.facing ?? 'down' };
  // 동료 = NPC (자리 수만큼)
  const objects = [
    ...map.objects,
    ...companions.slice(0, map.npcSpots.length).map((species, i) => ({ id: `npc-${i}`, kind: 'npc', species, ...map.npcSpots[i] })),
  ];
  const npcFacing = Object.fromEntries(objects.filter((o) => o.kind === 'npc').map((o) => [o.id, 'down']));
  let walk = null; // { from, to, t }
  let held = null; // 누르고 있는 방향 [dx, dy]
  let route = [];  // 클릭 이동 경로
  let afterRoute = null;
  // message: 줄 배열, 또는 여러 쪽([[줄…], [줄…]]) — 확인마다 다음 쪽
  const pageMsg = (pages) => (pages.length ? { lines: pages[0], who: null, then: pages.length > 1 ? () => { msg = pageMsg(pages.slice(1)); } : null } : null);
  let msg = !message ? null : Array.isArray(message[0]) ? pageMsg(message) : { lines: [].concat(message), who: null, then: null };
  let clock = 0;

  const objectAt = (x, y) => objects.find((o) => o.x === x && o.y === y);
  const walkable = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !'#^~'.includes(map.tiles[y][x]) && !objectAt(x, y);

  function tryStep(dx, dy) {
    player.facing = nameOf(dx, dy);
    const to = { x: player.x + dx, y: player.y + dy };
    if (!walkable(to.x, to.y)) return false;
    walk = { from: { x: player.x, y: player.y }, to, t: 0 };
    return true;
  }

  function interact() {
    const [dx, dy] = DIRS[player.facing];
    const o = objectAt(player.x + dx, player.y + dy);
    if (!o && onWaterGift && player.x === WATER_GIFT_SPOT.x && player.y === WATER_GIFT_SPOT.y && player.facing === WATER_GIFT_SPOT.facing) { // 물속의 선물
      msg = onWaterGift() ? { lines: ['…물속에서 무언가 반짝인다!', '10연속 뽑기 바우처를 손에 넣었다!'], who: null, then: null }
        : { lines: ['물결이 잔잔하게 일렁인다…'], who: null, then: null };
      return;
    }
    if (!o) return;
    if (o.kind === 'npc') npcFacing[o.id] = nameOf(-dx, -dy);
    if (o.kind === 'npc' && o.species === 'turtwig' && onTurtwigGift && ++turtwigTalks === 5 && onTurtwigGift()) {
      msg = { lines: ['…모부기가 꼭 쥐고 있던 코인을 건네주었다!', '200코인을 받았다!'], who: o, then: null };
      return;
    }
    const then = o.action === 'sortie' ? onSortie : o.action === 'party' ? onParty : o.action === 'gacha' ? onGacha : null;
    msg = { lines: o.lines, who: o.kind === 'npc' ? o : null, then };
  }

  // X 메뉴 (마을에서만): 가방 · 닫기
  let townMenu = null;
  const MENU = [{ label: '가방', enabled: !!onBag, act: 'bag' }, { label: '닫기', enabled: true, act: 'close' }];
  const menuRect = () => ({ x: W - 70, y: 22 });
  function menuInput(ev) {
    if (ev.type === 'cancel' || ev.type === 'menu') { townMenu = null; return; }
    if (ev.type === 'dir' && ev.dy && !ev.repeat) townMenu.sel = (townMenu.sel + ev.dy + MENU.length) % MENU.length;
    let pick = ev.type === 'confirm' ? MENU[townMenu.sel] : null;
    if (ev.type === 'click' && ev.py !== undefined) {
      const r = menuRect(), k = ui.menuIndexAt(MENU, r.x, r.y, ev.py);
      if (ev.px < r.x || k < 0 || k >= MENU.length) { townMenu = null; return; }
      townMenu.sel = k; pick = MENU[k];
    }
    if (!pick?.enabled) return;
    townMenu = null;
    if (pick.act === 'bag') {
      if (walk) { player.x = walk.to.x; player.y = walk.to.y; walk = null; } // 걷던 칸에 도착한 걸로
      onBag({ x: player.x, y: player.y, facing: player.facing });
    }
  }

  // BFS: 클릭한 칸(또는 클릭한 오브젝트 옆 칸)까지의 경로
  function routeTo(tx, ty) {
    const target = objectAt(tx, ty);
    const goals = target
      ? Object.values(DIRS).map(([dx, dy]) => ({ x: tx + dx, y: ty + dy })).filter((p) => walkable(p.x, p.y) || (p.x === player.x && p.y === player.y))
      : walkable(tx, ty) ? [{ x: tx, y: ty }] : [];
    if (!goals.length) return null;
    const key = (p) => `${p.x},${p.y}`;
    const goalSet = new Set(goals.map(key));
    const prev = new Map([[key(player), null]]);
    const queue = [{ x: player.x, y: player.y }];
    while (queue.length) {
      const cur = queue.shift();
      if (goalSet.has(key(cur))) {
        const path = [];
        for (let k = key(cur); prev.get(k); k = prev.get(k)) path.unshift(k.split(',').map(Number));
        return { path, target, end: cur };
      }
      for (const [dx, dy] of Object.values(DIRS)) {
        const n = { x: cur.x + dx, y: cur.y + dy };
        if (!walkable(n.x, n.y) || prev.has(key(n))) continue;
        prev.set(key(n), key(cur));
        queue.push(n);
      }
    }
    return null;
  }

  function nextRouteStep() {
    if (route.length) {
      const [x, y] = route.shift();
      tryStep(x - player.x, y - player.y);
      return;
    }
    if (afterRoute) { const f = afterRoute; afterRoute = null; f(); }
  }

  function closeMessage() {
    const then = msg.then;
    msg = null;
    then?.();
  }

  const cam = { x: 0, y: 0 };

  return {
    get player() { return player; },
    get leader() { return leader; },
    get objects() { return objects; },
    get message() { return msg; },

    handle(ev) {
      if (msg) {
        if (ev.type === 'confirm' || ev.type === 'click' || ev.type === 'cancel') closeMessage();
        return;
      }
      if (townMenu) { menuInput(ev); return; } // X 메뉴
      if (ev.type === 'menu') { held = null; route = []; afterRoute = null; townMenu = { sel: 0 }; return; }
      if (ev.type === 'dir') {
        if (ev.repeat) return;
        held = [ev.dx, ev.dy];
        route = []; afterRoute = null;
        if (!walk) tryStep(ev.dx, ev.dy);
      } else if (ev.type === 'release') {
        if (held && held[0] === ev.dx && held[1] === ev.dy) held = null;
      } else if (ev.type === 'confirm') {
        if (!walk) interact();
      } else if (ev.type === 'click' && ev.px !== undefined) {
        const tx = Math.floor((ev.px + Math.round(cam.x)) / TILE), ty = Math.floor((ev.py + Math.round(cam.y)) / TILE);
        const r = routeTo(tx, ty);
        if (!r) return;
        route = r.path;
        fxm.unfollow('dest');
        const end = r.end; // 걸어서 도착할 칸 (말 걸 대상이면 그 옆 칸)
        if (route.length) fxm.follow('dest', MOVE_MARKER, () => markerAt(end.x, end.y, TILE));
        afterRoute = r.target ? () => { player.facing = nameOf(r.target.x - player.x, r.target.y - player.y); interact(); } : null;
        if (!walk) nextRouteStep();
      }
    },

    update(dt) {
      clock += dt;
      fxm.update(dt);
      if (!walk && !route.length) fxm.unfollow('dest'); // 도착 (또는 방향키로 끊김)
      if (walk) {
        walk.t += dt;
        if (walk.t >= STEP) {
          player.x = walk.to.x; player.y = walk.to.y;
          walk = null;
          if (route.length || afterRoute) nextRouteStep();
          else if (held && !msg) tryStep(held[0], held[1]);
        }
      }
      // 카메라: 플레이어 중심, 맵 밖은 보이지 않게
      const p = this.playerWorld();
      cam.x = Math.max(0, Math.min(width * TILE - W, p.x + TILE / 2 - W / 2));
      cam.y = Math.max(0, Math.min(height * TILE - H, p.y + TILE / 2 - H / 2));
    },

    get fx() { return fxm; }, // 테스트·디버그용
    get menuOpen() { return !!townMenu; },

    playerWorld() {
      if (!walk) return { x: player.x * TILE, y: player.y * TILE };
      const k = Math.min(1, walk.t / STEP);
      return { x: (walk.from.x + (walk.to.x - walk.from.x) * k) * TILE, y: (walk.from.y + (walk.to.y - walk.from.y) * k) * TILE };
    },

    draw(ctx, time) {
      const cx = Math.round(cam.x), cy = Math.round(cam.y);
      ctx.fillStyle = '#101018';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(-cx, -cy);
      drawMap(ctx, map.tiles, time, cx, cy, W, H);
      fxm.draw(ctx, 'back', { x: cx, y: cy }); // 목적지 표시
      // 그릴 것: 표지판, NPC, 플레이어 — y 순서
      const p = this.playerWorld();
      const items = [
        ...objects.map((o) => ({ y: o.y * TILE, draw: () => (o.kind === 'sign' ? drawSign(ctx, o) : drawPokemon(ctx, o.species, 'Idle', TO_DIR[npcFacing[o.id]], clock, o.x * TILE, o.y * TILE)) })),
        { y: p.y, draw: () => drawPokemon(ctx, leader, walk ? 'Walk' : 'Idle', TO_DIR[player.facing], clock, p.x, p.y) },
      ].sort((a, b) => a.y - b.y);
      for (const it of items) it.draw();
      ctx.restore();

      // 상단 안내
      const hint = 'Z 조사 · 방향키/클릭 이동 · C 메뉴';
      ui.drawWindow(ctx, 2, 2, textWidth(hint, 'small') + 16, 16);
      drawText(ctx, hint, 8, 4, '#383838', '#d8d8d0', 'small');

      if (townMenu) { const r = menuRect(); ui.drawMenu(ctx, MENU, townMenu.sel, r.x, r.y); }
      if (msg) {
        const who = msg.who ? { species: msg.who.species, side: 'ally', emotion: 'Normal' } : null;
        ui.drawMessage(ctx, msg.lines, who, Math.floor(time * 3) % 2 === 0);
      }
    },
  };
}

function drawPokemon(ctx, species, anim, dir, t, x, y) {
  drawShadow(ctx, x + TILE / 2, y + TILE / 2);
  drawUnitSprite(ctx, species, anim, dir, t, x + TILE / 2, y + TILE / 2);
}

// 나무 표지판 (도트)
function drawSign(ctx, o) {
  const x = o.x * TILE, y = o.y * TILE;
  const big = o.action === 'sortie';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 7, y + 20, 10, 2);
  ctx.fillStyle = '#583818';
  ctx.fillRect(x + 11, y + 10, 2, 11);
  const bw = big ? 22 : 16, bx = x + (TILE - bw) / 2, by = y + (big ? 1 : 3);
  ctx.fillStyle = '#583818';
  ctx.fillRect(bx, by, bw, 11);
  ctx.fillStyle = big ? '#e8b048' : '#c89048';
  ctx.fillRect(bx + 1, by + 1, bw - 2, 9);
  ctx.fillStyle = '#885828';
  for (let i = 0; i < 3; i++) ctx.fillRect(bx + 3, by + 3 + i * 2, bw - 6, 1);
  if (big) { ctx.fillStyle = '#e04040'; ctx.fillRect(bx + bw / 2 - 1, by - 2, 2, 3); }
}

export { SPECIES };

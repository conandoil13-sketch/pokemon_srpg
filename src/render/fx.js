// pixelfx 이펙트 관리자: 재생·위치 따라가기·두 층(뒤/앞) 그리기. 이펙트 하나가 실패해도 게임은 계속.
import { FX } from '../vendor/pixelfx/fx-index.js';
import { createFrame, clearFrame, createFx, composite } from '../vendor/pixelfx/core/index.js';

const ORIENT = { right: { flip: false, angle: 0 }, left: { flip: true, angle: 0 }, up: { flip: false, angle: -Math.PI / 2 }, down: { flip: false, angle: Math.PI / 2 } };
const BEAM_PAD = 8; // 빔 클립: 시작점 뒤쪽 여유
const LOOP_FPS = 15; // 지속 표시는 초당 15번만 다시 그리고 그 사이엔 캐시를 찍는다 (픽셀 이펙트라 티가 안 남)

export function createFxManager({ w = 256, h = 192, makeCanvas = null } = {}) {
  const frames = { back: createFrame(w, h), front: createFrame(w, h) };
  const scratch = createFrame(w, h);
  let list = [], failed = 0, out = null;
  const log = []; // 만든 이펙트 id (테스트·디버그용, 최근 200개)

  function make(spec, at, { dir, actor, delay = 0, clipTo = null, key = null, getPos = null } = {}) {
    try {
      const mod = FX[spec?.id];
      if (!mod) throw new Error(`no effect ${spec?.id}`);
      const o = ORIENT[dir] ?? ORIENT.right;
      const fx = createFx(mod, { ...(spec.opts ?? {}), x: at.x + (spec.dx ?? 0), y: at.y + (spec.dy ?? 0), flip: o.flip, angle: o.angle, ...(actor ? { actor } : {}) });
      const e = { fx, actor: actor ?? null, layer: spec.layer ?? 'front', timeScale: spec.timeScale ?? 1, delay, life: spec.life ?? null, age: 0, stopped: false, clipTo, dir, at, key, getPos };
      list.push(e);
      log.push(spec.id); if (log.length > 200) log.shift();
      return e;
    } catch {
      failed++;
      return null;
    }
  }

  // 빔을 직선 끝까지만 남긴다 (축 정렬 사각형 바깥 픽셀 버림)
  function blitClipped(src, dst, e) {
    const { x: ax, y: ay } = e.at, len = e.clipTo, ox = dst.ox, oy = dst.oy;
    const rect = { right: [ax - BEAM_PAD, ay - 40, ax + len, ay + 8], left: [ax - len, ay - 40, ax + BEAM_PAD, ay + 8],
      // 위/아래는 오른쪽 기준 띠(-40..8)가 회전한 것: 위 x ∈ [ax-40, ax+8], 아래 x ∈ [ax-8, ax+40]
      up: [ax - 40, ay - len - 8, ax + 8, ay + BEAM_PAD], down: [ax - 8, ay - BEAM_PAD, ax + 40, ay + len] }[e.dir ?? 'right'];
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const wx = x + ox, wy = y + oy, i = y * src.w + x;
      if (wx < rect[0] || wx > rect[2] || wy < rect[1] || wy > rect[3]) continue;
      if (src.color[i]) dst.color[i] = src.color[i];
      if (src.light[i]) dst.light[i] = src.light[i];
    }
  }

  function drawCached(e, f) {
    const q = Math.floor(e.fx.t * LOOP_FPS), o = e.fx.options;
    const c = e.cache;
    if (!c || c.q !== q || c.x !== o.x || c.y !== o.y || c.ox !== f.ox || c.oy !== f.oy) {
      clearFrame(scratch);
      e.fx.draw(scratch);
      const idx = [];
      for (let i = 0; i < scratch.color.length; i++) if (scratch.color[i] || scratch.light[i]) idx.push(i);
      const ix = Int32Array.from(idx);
      e.cache = { q, x: o.x, y: o.y, ox: f.ox, oy: f.oy, ix, color: Uint32Array.from(ix, (i) => scratch.color[i]), light: Uint32Array.from(ix, (i) => scratch.light[i]) };
    }
    const k = e.cache;
    for (let n = 0; n < k.ix.length; n++) {
      const i = k.ix[n];
      if (k.color[n]) f.color[i] = k.color[n];
      if (k.light[n]) f.light[i] = k.light[n];
    }
  }

  return {
    get count() { return list.length; },
    get failed() { return failed; },
    actorOf(key) { return list.find((e) => e.key === key && !e.stopped)?.actor ?? null; },
    get following() { return list.filter((e) => e.key && !e.stopped).length; },
    log,
    // 공격 연출이 끝난 뒤 꼬리(연기·잔해)는 sec 초 뒤에 정리 (지속 표시는 제외)
    expire(sec) { for (const e of list) if (!e.key && e.life === null) e.life = e.age + sec; },
    spawn: (spec, at, opts) => make(spec, at, opts),
    follow(key, spec, getPos, actor) {
      if (list.some((e) => e.key === key && !e.stopped)) return;
      const p = getPos();
      if (p) make(spec, p, { key, getPos, actor });
    },
    unfollow(key) { for (const e of list) if (e.key === key && !e.stopped) { e.fx.stop(); e.stopped = true; } },
    // wanted: Map(key → { spec, getPos, actor }) — 없는 건 만들고, 빠진 건 멈춘다
    sync(wanted) {
      for (const e of list) if (e.key && !e.stopped && !wanted.has(e.key)) { e.fx.stop(); e.stopped = true; }
      // 스프라이트가 늦게 로드되면 actor(몸 모양)와 위치 계산을 새것으로 바꾼다
      for (const e of list) {
        const v = e.key && !e.stopped ? wanted.get(e.key) : null;
        if (v && v.actor && v.actor !== e.actor) { e.actor = v.actor; e.fx.options.actor = v.actor; e.getPos = v.getPos; e.cache = null; }
      }
      for (const [key, v] of wanted) this.follow(key, v.spec, v.getPos, v.actor);
    },
    stopAll() { for (const e of list) if (!e.stopped) { e.fx.stop(); e.stopped = true; } },
    clear() { list = []; },
    update(dt) {
      for (const e of list) {
        if (e.delay > 0) { e.delay -= dt; continue; }
        if (e.getPos) {
          const p = e.getPos();
          if (!p) { e.gone = true; continue; } // 따라가던 유닛이 사라짐 → 즉시 제거
          e.fx.options.x = p.x; e.fx.options.y = p.y;
        }
        try { e.fx.update(dt * e.timeScale); } catch { e.gone = true; failed++; continue; }
        e.age += dt;
        if (e.life !== null && e.age >= e.life && !e.stopped) { e.fx.stop(); e.stopped = true; }
      }
      list = list.filter((e) => !e.gone && !e.fx.done());
    },
    // ctx 가 없으면(테스트) frame 만 돌려준다
    draw(ctx, layer, cam) {
      const f = frames[layer];
      clearFrame(f);
      f.ox = scratch.ox = Math.round(cam.x); f.oy = scratch.oy = Math.round(cam.y);
      for (const e of list) {
        if (e.layer !== layer || e.delay > 0) continue;
        try {
          if (e.clipTo) { clearFrame(scratch); e.fx.draw(scratch); blitClipped(scratch, f, e); }
          else if (e.key) drawCached(e, f);
          else e.fx.draw(f);
        } catch { e.gone = true; failed++; }
      }
      if (!ctx) return f;
      if (!list.some((e) => e.layer === layer)) return f;
      out ??= (() => { const c = makeCanvas(w, h); const g = c.getContext('2d'); return { c, g, img: g.createImageData(w, h) }; })();
      composite(f, out.img.data, null);
      out.g.putImageData(out.img, 0, 0);
      ctx.drawImage(out.c, f.ox, f.oy); // ctx 는 월드 좌표(카메라만큼 옮겨진 상태)
      return f;
    },
  };
}

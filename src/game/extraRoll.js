// 특성 각성 (편성소): 2칸 특성을 결정 2개로 굴린다. 결과는 rollExtra 가 먼저 정하고, 룰렛은 그 결과를 보여 준다
// 스펙 docs/superpowers/specs/2026-11-24-extra-ability-slot2-design.md
import { SPECIES } from '../data/species.js';
import { ABILITIES } from '../data/abilities.js';
import { josa } from '../data/text.js';
import { abilityOf } from '../core/progress.js';
import { lineRoot } from '../core/gacha.js';
import { rollExtra, extraTier, EXTRA_COST, TIER_ODDS } from '../core/extraAbility.js';
import { reelTimeline, reelAt } from './roulette.js';
import { createFxManager } from '../render/fx.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';

export const TIER_COLOR = { S: '#e0a818', A: '#d84040', B: '#3870d8', C: '#8c8c8c' };
const YN = '확인: 예 · 취소: 아니오';
const shardsOf = (game, m) => game.shards?.[lineRoot(m.species)] ?? 0;
const lineName = (m) => SPECIES[lineRoot(m.species)].name;

// 편성소 동료 메뉴 항목 (결정이 모자라면 회색 + 이유)
export function extraMenuItem(game, m) {
  const n = shardsOf(game, m);
  return { label: '특성 각성', enabled: n >= EXTRA_COST, act: 'extra', why: [`${lineName(m)} 계열 결정이 모자라다 (${n}/${EXTRA_COST})`] };
}

// 확률 막대: S·A·B·C 순서로 폭을 나눔 (마지막 칸이 남은 폭을 채워 합이 정확히 width)
export function oddsSegments(width) {
  const order = ['S', 'A', 'B', 'C'];
  let x = 0;
  return order.map((tier, i) => {
    const w = i === order.length - 1 ? width - x : Math.round(width * TIER_ODDS[tier]);
    const seg = { tier, x, w }; x += w; return seg;
  });
}

// 등급 배지 (작은 색 칸 + 글자)
export function drawTierBadge(ctx, tier, x, y) {
  if (!tier) return 0;
  ctx.fillStyle = TIER_COLOR[tier]; ctx.fillRect(x, y + 1, 11, 10);
  drawText(ctx, tier, x + 3, y + 1, '#ffffff', null, 'small');
  return 13;
}

export function createExtraRoll({ game, member: m, onSave = () => {}, onClose }) {
  let mode = 'view', msg = null, t = 0, result = null, tl = null;
  // 슬롯 연출 상태: 이번 굴림에서 띄운 이펙트 · 지난 단계 · 전구 시계 · 흔들림
  const makeCanvas = typeof document !== 'undefined' ? (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
  let fxm = null, fxLog = [], fxSpots = [], fired = new Set(), chase = 0, shakeT = 0, shakeAmp = 0, flashT = 0, flashColor = '255,240,180';
  const enter = (md) => { mode = md; t = 0; };
  const say = (lines) => { msg = lines; enter('msg'); };
  const revealEnd = () => tl.end;
  // 룰렛이 도는 동안 뒤 화면은 예전 2칸 (결과를 미리 보여 주지 않게)
  const shownExtra = () => (mode === 'spin' && result ? result.prev : m.extraAbility ?? null);

  const PAY_Y = 92; // 가운데 줄 높이
  const spawn = (id, { opts, at = { x: W / 2, y: PAY_Y + 18 }, life, dir } = {}) => {
    fxLog.push(id); fxSpots.push({ id, x: at.x, y: at.y });
    fxm?.spawn({ id, ...(opts ? { opts } : {}), ...(life ? { life } : {}) }, at, dir ? { dir } : undefined);
  };
  // 작은 불꽃은 릴 창 뒤에 가려지므로 가운데 줄 화살표 양옆에서 바깥으로 튄다
  const sideSparks = (opts) => {
    spawn('impacts/hit-spark', { opts, at: { x: W / 2 - 44, y: PAY_Y + 20 }, dir: 'left' });
    spawn('impacts/hit-spark', { opts, at: { x: W / 2 + 44, y: PAY_Y + 20 }, dir: 'right' });
  };
  const GOLD_BURST = ['#2a1405', '#5c3008', '#9a5a0e', '#d48e18', '#f5b92c', '#ffde5e', '#fff4bc', '#ffffff'];
  const shake = (amp, dur) => { shakeAmp = amp; shakeT = dur; };
  const flash = (rgb, dur = 0.35) => { flashColor = rgb; flashT = dur; };
  const BLUE_SPARK = ['#0c1a40', '#183c8c', '#3870d8', '#5c98f0', '#a0c8ff', '#d8ecff', '#ffffff'];
  function fire(kind) { // 단계마다 한 번
    const tier = result.tier;
    if (kind === 'tease') { sideSparks({ palette: GOLD_BURST.slice(1) }); flash('255,230,120', 0.12); } // S 에 걸린 척
    if (kind === 'upgrade') { spawn('lightning/thunderclap', { life: 0.45 }); shake(2, 0.6); flash('255,240,180', 0.3); }
    if (kind === 'stop') {
      if (tier === 'C') sideSparks();
      if (tier === 'B') sideSparks({ palette: BLUE_SPARK });
      if (tier === 'A') { spawn('impacts/crit-hit'); shake(2, 0.25); flash('255,150,150', 0.15); }
      if (tier === 'S') { spawn('lightning/thunderclap', { life: 0.5 }); spawn('holy/blessing'); spawn('pickups/collect-burst', { opts: { palette: GOLD_BURST } }); shake(3, 0.45); flash('255,220,90', 0.35); }
    }
    if (kind === 'reveal') fxm = createFxManager({ makeCanvas }); // 남은 연기·불꽃은 정리하고 카드만
    if (kind === 'reveal' && (tier === 'A' || tier === 'S')) { // 결과 카드 양쪽 모서리 반짝
      const opts = tier === 'S' ? { palette: GOLD_BURST } : undefined;
      spawn('pickups/collect-burst', { opts, at: { x: 30, y: 66 } }); spawn('pickups/collect-burst', { opts, at: { x: W - 30, y: 124 } });
    }
  }

  function start() {
    const r = rollExtra(game, m.uid ?? m.species);
    if (!r.ok) { say([`${lineName(m)} 계열 결정이 모자라다 (${shardsOf(game, m)}/${EXTRA_COST})`]); return; }
    onSave(); // 결과는 연출 전에 이미 저장
    result = r; tl = reelTimeline(r);
    fxm = createFxManager({ makeCanvas }); fxLog = []; fxSpots = []; fired = new Set(); chase = 0; shakeT = 0; flashT = 0;
    enter('spin');
  }

  // 특성 카드: 왼쪽 색 띠(2칸은 등급색) + 칸 이름 + 특성 + 설명 2줄. 빈 2칸은 점선 상자
  function drawAbilityCard(ctx, label, id, y, h, { tier = null, faded = false, note = null, stripe = '#7080a0' } = {}) {
    const x = 4, w = W - 8, ab = id ? ABILITIES[id] : null;
    if (!ab) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#56607c';
      for (let i = x; i < x + w; i += 6) { ctx.fillRect(i, y, 3, 1); ctx.fillRect(i, y + h - 1, 3, 1); }
      for (let j = y; j < y + h; j += 6) { ctx.fillRect(x, j, 1, 3); ctx.fillRect(x + w - 1, j, 1, 3); }
      drawText(ctx, label, x + 8, y + 5, '#8090b8', null, 'small');
      const q = '?'; drawText(ctx, q, W / 2 - textWidth(q) / 2, y + h / 2 - 8, '#8090b8', null);
      const hint = `비어 있음 · 결정 ${EXTRA_COST}개로 각성`;
      drawText(ctx, hint, W / 2 - textWidth(hint, 'small') / 2, y + h - 14, '#8090b8', null, 'small');
      return;
    }
    ui.drawWindow(ctx, x, y, w, h);
    ctx.fillStyle = faded ? '#b0b0b0' : stripe; ctx.fillRect(x + 3, y + 3, 4, h - 6);
    drawText(ctx, label, x + 11, y + 5, '#7080a0', null, 'small');
    const nx = x + 11 + textWidth(label, 'small') + 6;
    drawText(ctx, ab.name, nx, y + 3, faded ? '#a0a0a0' : '#383838', '#d8d8d0');
    let ex = nx + 4 + textWidth(ab.name);
    ex += drawTierBadge(ctx, tier, ex, y + 4);
    if (note) drawText(ctx, note, ex + 2, y + 5, '#a0a0a0', null, 'small');
    ui.wrapWords(ab.desc, w - 20, 'small').slice(0, 2).forEach((l, k) => drawText(ctx, l, x + 11, y + 19 + k * 11, faded ? '#b0b0b0' : '#606060', null, 'small'));
  }

  // 릴 칸 하나 (등급색 타일 + 큰 글자)
  function drawCell(ctx, tier, x, y, w, h, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = TIER_COLOR[tier]; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, w, 3); // 위 빛
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h - 3, w, 3); // 아래 그늘
    drawText(ctx, tier, x + w / 2 - textWidth(tier) / 2, y + h / 2 - 7, '#ffffff', 'rgba(0,0,0,0.45)');
    ctx.globalAlpha = 1;
  }

  function drawSlot(ctx, time) {
    const at = reelAt(tl, Math.min(t, tl.end)), gold = tl.upgrade && t >= tl.steps[1].t;
    const sx = shakeT > 0 ? Math.round(Math.sin(t * 70) * shakeAmp) : 0, sy = shakeT > 0 ? Math.round(Math.cos(t * 53) * shakeAmp * 0.6) : 0;
    ctx.fillStyle = 'rgba(12,10,24,0.88)'; ctx.fillRect(0, 0, W, H);
    if (at.phase === 'reveal') { drawReveal(ctx, time, at.since); return; } // 공개: 기계는 치우고 카드만
    // 기계 틀
    const cx = 60 + sx, cy = 26 + sy, cw = 136, ch = 118;
    ctx.fillStyle = gold ? '#6a4810' : '#2c2050'; ctx.fillRect(cx - 3, cy - 3, cw + 6, ch + 6);
    ctx.fillStyle = gold ? '#3a2408' : '#1a1434'; ctx.fillRect(cx, cy, cw, ch);
    // 전구: 테두리를 따라 번갈아 켜짐 (멈추면 같이 깜빡, S 면 난리)
    const bulbs = [];
    for (let i = 0; i < 9; i++) bulbs.push([cx + 6 + i * 15.5, cy + 3], [cx + cw - 6 - i * 15.5, cy + ch - 4]);
    for (let i = 1; i < 7; i++) bulbs.push([cx + 2, cy + 3 + i * 16], [cx + cw - 3, cy + ch - 4 - i * 16]);
    const stopped = at.phase === 'stop' || at.phase === 'reveal';
    bulbs.forEach(([bx, by], i) => {
      const on = stopped ? (result.tier === 'S' ? (Math.floor(chase) + i * 7) % 3 !== 0 : Math.floor(chase) % 2 === 0) : (Math.floor(chase) + i) % 3 === 0;
      const c = stopped && result.tier === 'S' ? ['#ffe060', '#ff7090', '#80e0ff'][(i + Math.floor(chase)) % 3] : gold ? '#ffd040' : '#ff6060';
      ctx.fillStyle = on ? c : '#40304a'; ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 3);
      if (on) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 1, 1); }
    });
    { // 손잡이: 시작하면 아래로 당겼다가 돌아옴
      const pull = t < 0.4 ? Math.sin((Math.PI * t) / 0.4) : 0, lx = cx + cw + 6, pivot = cy + 62, ky = Math.round(cy + 22 + pull * 52);
      ctx.fillStyle = '#5a5a6a'; ctx.fillRect(lx - 3, pivot - 4, 6, 10); // 받침
      ctx.fillStyle = '#b8b8c8'; ctx.fillRect(lx, Math.min(ky, pivot), 2, Math.abs(pivot - ky) + 1); // 막대
      ctx.fillStyle = '#c02828'; ctx.fillRect(lx - 3, ky - 4, 8, 8); ctx.fillStyle = '#ff8080'; ctx.fillRect(lx - 2, ky - 3, 3, 2); // 손잡이 공
    }
    const title = gold ? '고급 슬롯' : '등급 슬롯';
    drawText(ctx, title, W / 2 - textWidth(title) / 2 + sx, cy + 8, gold ? '#ffe060' : '#c8d0f0', gold ? '#603000' : '#101020');
    if (at.phase !== 'reveal') fxm?.draw(ctx, 'front', { x: 0, y: 0 }); // 이펙트는 릴 창 뒤 (멈춘 칸이 가려지지 않게)
    // 릴 창
    const wx = W / 2 - 30 + sx, wy = PAY_Y - 34 + sy, ww = 60, wh = 68, CELL = 30;
    ctx.fillStyle = '#0c0a14'; ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
    ctx.fillStyle = '#e8e4f0'; ctx.fillRect(wx, wy, ww, wh);
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    const n = at.ring.length, base = Math.floor(at.pos), jitter = at.phase === 'tease' ? Math.round(Math.sin(t * 40)) : 0;
    const blur = at.speed > 8;
    for (let k = base - 2; k <= base + 2; k++) {
      const tier = at.ring[((k % n) + n) % n], y = PAY_Y + sy + (at.pos - k) * CELL - CELL / 2 + 2 + jitter;
      if (blur) { drawCell(ctx, tier, wx + 6, y - 8, ww - 12, CELL - 4, 0.25); drawCell(ctx, tier, wx + 6, y - 4, ww - 12, CELL - 4, 0.4); }
      drawCell(ctx, tier, wx + 6, y, ww - 12, CELL - 4, blur ? 0.7 : 1);
    }
    ctx.fillStyle = 'rgba(10,8,20,0.55)'; ctx.fillRect(wx, wy, ww, 14); ctx.fillRect(wx, wy + wh - 14, ww, 14); // 위·아래 어둡게
    ctx.restore();
    // 가운데 줄 ▶ ◀ (멈추면 등급색으로 맥박)
    const pc = stopped ? TIER_COLOR[result.tier] : '#ff4040';
    for (let i = 0; i < 5; i++) { ctx.fillStyle = pc; ctx.fillRect(wx - 9 + i, PAY_Y + sy - 4 + i, 1, 9 - i * 2); ctx.fillRect(wx + ww + 8 - i, PAY_Y + sy - 4 + i, 1, 9 - i * 2); }
    if (stopped) {
      const g = 1 + Math.round(Math.sin(time * 12) + 1);
      ctx.strokeStyle = TIER_COLOR[result.tier]; ctx.lineWidth = 2;
      ctx.strokeRect(wx + 4 - g, PAY_Y + sy - CELL / 2 + 1 - g, ww - 8 + g * 2, CELL - 2 + g * 2);
    }
    // 글자: 고급 슬롯! · 아깝다…
    if (at.phase === 'upgrade') { const m = '고급 슬롯!'; drawText(ctx, m, W / 2 - textWidth(m) / 2 + sx, 150, '#ffe060', '#805000'); }
    if (result.tease && t > tl.steps.find((s) => s.kind === 'tease').t && at.symbol !== 'S') { // S 에서 미끄러진 뒤
      const m = '아깝다…'; if (Math.floor(time * 4) % 2 === 0) drawText(ctx, m, W / 2 - textWidth(m) / 2, 150, '#c0c8e8', null);
    }
    if (flashT > 0) { ctx.fillStyle = `rgba(${flashColor},${Math.min(0.45, flashT * 1.5)})`; ctx.fillRect(0, 0, W, H); }
  }

  function drawReveal(ctx, time, since) { // 등급 색이 걷히며 특성 등장
    const ab = ABILITIES[result.id], color = TIER_COLOR[result.tier];
    const bx = 20, by = 56, bw = W - 40, bh = 70;
    ui.drawWindow(ctx, bx, by, bw, bh);
    ctx.fillStyle = color; ctx.fillRect(bx + 3, by + 3, bw - 6, 2);
    drawTierBadge(ctx, result.tier, bx + 8, by + 8);
    drawText(ctx, ab.name, W / 2 - textWidth(ab.name) / 2, by + 10, '#383838', '#d8d8d0');
    ui.wrapWords(ab.desc, bw - 20, 'small').slice(0, 3).forEach((l, k) => drawText(ctx, l, bx + 10, by + 30 + k * 11, '#606060', null, 'small'));
    const cover = Math.max(0, 1 - since / 0.45); // 가운데서 양옆으로 걷힘
    if (cover > 0) { const cw = Math.round(bw * cover); ctx.fillStyle = color; ctx.fillRect(bx + (bw - cw) / 2, by, cw, bh); drawText(ctx, result.tier, W / 2 - textWidth(result.tier) / 2, by + 28, '#ffffff', null); }
    fxm?.draw(ctx, 'front', { x: 0, y: 0 });
    if (t >= revealEnd() && Math.floor(time * 3) % 2 === 0) drawText(ctx, '확인: 계속', W / 2 - textWidth('확인: 계속', 'small') / 2, by + bh + 8, '#c8d0f0', null, 'small');
  }

  return {
    get mode() { return mode; },
    get result() { return result; },
    get shownExtra() { return shownExtra(); },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') { if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) { msg = null; mode = 'view'; } return; }
      if (mode === 'confirm') {
        if (ev.type === 'cancel') mode = 'view';
        else if (pick && t >= CHOICE_LOCK) start();
        return;
      }
      if (mode === 'spin') {
        if (!(pick || ev.type === 'cancel')) return;
        if (t < revealEnd()) { // 건너뛰기: 바로 결과 (지난 연출은 조용히 넘기고 공개 반짝임만)
          t = revealEnd(); shakeT = 0; flashT = 0;
          for (const st of tl.steps) if (!fired.has(st.kind)) { fired.add(st.kind); if (st.kind === 'reveal') fire('reveal'); }
        }
        else enter('view');
        return;
      }
      if (ev.type === 'cancel') { onClose(); return; }
      if (pick) {
        if (shardsOf(game, m) < EXTRA_COST) { say([`${lineName(m)} 계열 결정이 모자라다 (${shardsOf(game, m)}/${EXTRA_COST})`]); return; }
        enter('confirm');
      }
    },
    get fxLog() { return fxLog; },
    get fxSpots() { return fxSpots; },
    update(dt) {
      t += dt;
      if (mode !== 'spin' || !tl) return;
      for (const st of tl.steps) if (st.t <= t && !fired.has(st.kind)) { fired.add(st.kind); fire(st.kind); }
      const at = reelAt(tl, Math.min(t, tl.end));
      chase += dt * (at.phase === 'stop' || at.phase === 'reveal' ? (result.tier === 'S' ? 14 : 5) : 3 + at.speed * 0.7);
      shakeT = Math.max(0, shakeT - dt); flashT = Math.max(0, flashT - dt);
      fxm?.update(dt);
    },
    draw(ctx, time) {
      ctx.fillStyle = '#1c2840'; ctx.fillRect(0, 0, W, H);
      ui.drawWindow(ctx, 2, 2, W - 4, 20);
      const who = `${SPECIES[m.species].name} Lv${m.level}`, back = 'X: 돌아가기';
      drawText(ctx, who, 8, 5);
      drawText(ctx, '특성 각성', 14 + textWidth(who), 7, '#c06010', null, 'small');
      drawText(ctx, back, W - 10 - textWidth(back, 'small'), 7, '#7080a0', null, 'small');
      const one = abilityOf(m), two = shownExtra(), same = two && two === one, tier2 = extraTier(two);
      drawAbilityCard(ctx, '1칸', one, 25, 44);
      drawAbilityCard(ctx, '2칸', two, 72, 44, { tier: tier2, faded: same, note: same ? '1칸과 같음' : null, stripe: TIER_COLOR[tier2] ?? '#7080a0' });
      ui.drawWindow(ctx, 2, 120, W - 4, H - 122);
      const n = shardsOf(game, m), have = `${lineName(m)} 계열 결정 ${n}개`, cost = `1회 ${EXTRA_COST}개`;
      drawText(ctx, have, 10, 125, n >= EXTRA_COST ? '#383838' : '#a04040', '#d8d8d0');
      drawText(ctx, cost, W - 12 - textWidth(cost, 'small'), 127, '#7080a0', null, 'small');
      // 확률 막대 (칸 폭 = 확률) + 아래 글자
      const bx = 10, by = 143, bw = W - 20, bh = 9;
      ctx.fillStyle = '#383838'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      let labEnd = bx - 6; // 글자는 왼쪽부터 겹치지 않게
      for (const sg of oddsSegments(bw)) {
        ctx.fillStyle = TIER_COLOR[sg.tier]; ctx.fillRect(bx + sg.x, by, sg.w, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx + sg.x, by, sg.w, 2);
        if (sg.x > 0) { ctx.fillStyle = '#383838'; ctx.fillRect(bx + sg.x, by, 1, bh); }
        const lab = `${sg.tier} ${Math.round(TIER_ODDS[sg.tier] * 100)}%`, lw = textWidth(lab, 'small');
        const lx = Math.min(bx + bw - lw, Math.max(labEnd + 6, bx + sg.x + sg.w / 2 - lw / 2));
        drawText(ctx, lab, lx, by + bh + 3, sg.tier === 'S' ? '#b08000' : '#606060', null, 'small'); labEnd = lx + lw;
      }
      drawText(ctx, `확인: 굴리기 · 취소: 닫기`, 10, 172, '#7080a0', null, 'small');
      const blink = Math.floor(time * 3) % 2 === 0;
      if (mode === 'confirm') ui.drawMessage(ctx, [two ? `지금 2칸 ${josa(ABILITIES[two].name, '은/는')} 사라진다. 굴릴까?` : `결정 ${EXTRA_COST}개로 굴릴까?`, YN], null, blink);
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, blink);
      if (mode === 'spin') drawSlot(ctx, time);
    },
  };
}

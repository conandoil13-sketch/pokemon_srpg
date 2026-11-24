// 특성 각성 (편성소): 2칸 특성을 결정 2개로 굴린다. 결과는 rollExtra 가 먼저 정하고, 룰렛은 그 결과를 보여 준다
// 스펙 docs/superpowers/specs/2026-11-24-extra-ability-slot2-design.md
import { SPECIES } from '../data/species.js';
import { ABILITIES } from '../data/abilities.js';
import { josa } from '../data/text.js';
import { abilityOf } from '../core/progress.js';
import { lineRoot } from '../core/gacha.js';
import { rollExtra, extraTier, EXTRA_COST, TIER_ODDS } from '../core/extraAbility.js';
import { rouletteTimeline, rouletteAt } from './roulette.js';
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

// 등급 배지 (작은 색 칸 + 글자)
export function drawTierBadge(ctx, tier, x, y) {
  if (!tier) return 0;
  ctx.fillStyle = TIER_COLOR[tier]; ctx.fillRect(x, y + 1, 11, 10);
  drawText(ctx, tier, x + 3, y + 1, '#ffffff', null, 'small');
  return 13;
}

export function createExtraRoll({ game, member: m, onSave = () => {}, onClose }) {
  let mode = 'view', msg = null, t = 0, result = null, tl = null;
  const enter = (md) => { mode = md; t = 0; };
  const say = (lines) => { msg = lines; enter('msg'); };
  const revealEnd = () => tl.steps.at(-1).t + 0.6;
  // 룰렛이 도는 동안 뒤 화면은 예전 2칸 (결과를 미리 보여 주지 않게)
  const shownExtra = () => (mode === 'spin' && result ? result.prev : m.extraAbility ?? null);

  function start() {
    const r = rollExtra(game, m.uid ?? m.species);
    if (!r.ok) { say([`${lineName(m)} 계열 결정이 모자라다 (${shardsOf(game, m)}/${EXTRA_COST})`]); return; }
    onSave(); // 결과는 연출 전에 이미 저장
    result = r; tl = rouletteTimeline(r);
    enter('spin');
  }

  function drawAbilityRow(ctx, label, id, y, { tier = null, faded = false, note = null } = {}) {
    drawText(ctx, label, 10, y, '#7080a0', null, 'small');
    const ab = id ? ABILITIES[id] : null;
    if (!ab) { drawText(ctx, '없음', 34, y - 2, '#909090'); return; }
    const color = faded ? '#a0a0a0' : '#383838';
    drawText(ctx, ab.name, 34, y - 2, color, '#d8d8d0');
    let x = 38 + textWidth(ab.name);
    x += drawTierBadge(ctx, tier, x, y - 1);
    if (note) drawText(ctx, note, x + 2, y, '#a0a0a0', null, 'small');
    ui.wrapWords(ab.desc, W - 44, 'small').slice(0, 2).forEach((l, k) => drawText(ctx, l, 34, y + 13 + k * 11, faded ? '#b0b0b0' : '#606060', null, 'small'));
  }

  function drawRoulette(ctx, time) {
    const at = rouletteAt(tl, t), n = at.ring.length, cell = 40, gap = 6;
    const shake = at.phase === 'upgrade' ? Math.round(Math.sin(t * 60) * 2) : 0;
    ctx.fillStyle = 'rgba(16,20,36,0.86)'; ctx.fillRect(0, 0, W, H);
    const x0 = Math.round((W - (n * cell + (n - 1) * gap)) / 2) + shake, y0 = 70;
    if (at.phase !== 'reveal') {
      at.ring.forEach((tier, i) => {
        const x = x0 + i * (cell + gap), lit = i === at.index;
        const stopped = at.phase === 'stop' && lit, grow = stopped ? Math.round(3 + Math.sin(t * 12)) : 0;
        ctx.fillStyle = lit ? TIER_COLOR[tier] : '#3a4058';
        ctx.fillRect(x - grow, y0 - grow, cell + grow * 2, cell + grow * 2);
        ctx.fillStyle = lit ? '#ffffff' : TIER_COLOR[tier];
        ctx.fillRect(x - grow, y0 - grow, cell + grow * 2, 2); // 위 테두리 색
        drawText(ctx, tier, x + cell / 2 - textWidth(tier) / 2, y0 + 13, lit ? '#ffffff' : TIER_COLOR[tier], null);
      });
      drawText(ctx, tl.upgrade && (at.phase !== 'spin' || t >= tl.steps[1].t) ? '고급 룰렛' : '등급 룰렛', W / 2 - textWidth('등급 룰렛') / 2, 44, '#c8d0f0', null);
    }
    if (at.phase === 'upgrade') { // 번쩍임 + 글자
      const a = Math.max(0, 0.8 - at.since * 1.6);
      ctx.fillStyle = `rgba(255,240,180,${a})`; ctx.fillRect(0, 0, W, H);
      const s = '고급 룰렛!';
      drawText(ctx, s, W / 2 - textWidth(s) / 2 + shake, 124, '#ffe060', '#805000');
    }
    if (at.phase === 'reveal') { // 등급 색이 걷히며 특성 등장
      const ab = ABILITIES[result.id], color = TIER_COLOR[result.tier];
      const bx = 20, by = 56, bw = W - 40, bh = 70;
      ui.drawWindow(ctx, bx, by, bw, bh);
      drawTierBadge(ctx, result.tier, bx + 8, by + 8);
      drawText(ctx, ab.name, W / 2 - textWidth(ab.name) / 2, by + 10, '#383838', '#d8d8d0');
      ui.wrapWords(ab.desc, bw - 20, 'small').slice(0, 3).forEach((l, k) => drawText(ctx, l, bx + 10, by + 30 + k * 11, '#606060', null, 'small'));
      const cover = Math.max(0, 1 - at.since / 0.45); // 가운데서 양옆으로 걷힘
      if (cover > 0) { const cw = Math.round(bw * cover); ctx.fillStyle = color; ctx.fillRect(bx + (bw - cw) / 2, by, cw, bh); drawText(ctx, result.tier, W / 2 - textWidth(result.tier) / 2, by + 28, '#ffffff', null); }
      if (t >= revealEnd() && Math.floor(time * 3) % 2 === 0) drawText(ctx, '확인: 계속', W / 2 - textWidth('확인: 계속', 'small') / 2, by + bh + 8, '#c8d0f0', null, 'small');
    }
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
        if (t < revealEnd()) t = revealEnd(); // 건너뛰기: 바로 결과
        else enter('view');
        return;
      }
      if (ev.type === 'cancel') { onClose(); return; }
      if (pick) {
        if (shardsOf(game, m) < EXTRA_COST) { say([`${lineName(m)} 계열 결정이 모자라다 (${shardsOf(game, m)}/${EXTRA_COST})`]); return; }
        enter('confirm');
      }
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      ctx.fillStyle = '#1c2840'; ctx.fillRect(0, 0, W, H);
      ui.drawWindow(ctx, 2, 2, W - 4, 20);
      const who = `${SPECIES[m.species].name} Lv${m.level}`, back = 'X: 돌아가기';
      drawText(ctx, who, 8, 5);
      drawText(ctx, '특성 각성', 14 + textWidth(who), 7, '#c06010', null, 'small');
      drawText(ctx, back, W - 10 - textWidth(back, 'small'), 7, '#7080a0', null, 'small');
      ui.drawWindow(ctx, 2, 24, W - 4, 92);
      const one = abilityOf(m), two = shownExtra(), same = two && two === one;
      drawAbilityRow(ctx, '1칸', one, 32);
      drawAbilityRow(ctx, '2칸', two, 74, { tier: extraTier(two), faded: same, note: same ? '1칸과 같음' : null });
      ui.drawWindow(ctx, 2, 118, W - 4, H - 120);
      const have = `${lineName(m)} 계열 결정 ${shardsOf(game, m)}개`;
      drawText(ctx, have, 10, 124, shardsOf(game, m) >= EXTRA_COST ? '#383838' : '#a04040', '#d8d8d0');
      drawText(ctx, `확인: 결정 ${EXTRA_COST}개로 굴리기 · 취소: 닫기`, 10, 142, '#606060', null, 'small');
      let x = 10;
      x += textWidth('확률 ', 'small'); drawText(ctx, '확률', 10, 158, '#7080a0', null, 'small');
      for (const tier of ['S', 'A', 'B', 'C']) {
        x += drawTierBadge(ctx, tier, x, 157);
        const p = `${Math.round(TIER_ODDS[tier] * 100)}%`;
        drawText(ctx, p, x, 158, '#606060', null, 'small'); x += textWidth(p, 'small') + 8;
      }
      const blink = Math.floor(time * 3) % 2 === 0;
      if (mode === 'confirm') ui.drawMessage(ctx, [two ? `지금 2칸 ${josa(ABILITIES[two].name, '은/는')} 사라진다. 굴릴까?` : `결정 ${EXTRA_COST}개로 굴릴까?`, YN], null, blink);
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, blink);
      if (mode === 'spin') drawRoulette(ctx, time);
    },
  };
}

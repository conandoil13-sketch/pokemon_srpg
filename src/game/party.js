// 편성소: 출전 멤버(메타몽 + 4) 정보, 출전 멤버 바꾸기, 진화의돌 사용
import { SPECIES } from '../data/species.js';
import { stoneTargets } from '../core/progress.js';
import { stoneEvolutionOptions } from '../core/evolution.js';
import { deployed, toggleSortie } from '../core/roster.js';
import { SORTIE_SIZE } from '../core/save.js';
import { expForLevel, MAX_LEVEL } from '../core/stats.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { drawPortrait } from '../render/sprites.js';
import { W, H } from '../render/screen.js';
import { nameOf, moveName } from './learnFlow.js';

const ROW_H = 26, PAGE = 6;

export function evolutionHint(member) {
  const evos = SPECIES[member.species].evolutions;
  if (!evos.length) return '최종 진화';
  const levels = evos.filter((e) => e.rule.kind === 'level').map((e) => e.rule.level);
  const stone = evos.some((e) => e.rule.kind === 'stone');
  if (levels.length && stone) return `Lv.${Math.min(...levels)} 또는 진화의돌`;
  return levels.length ? `Lv.${Math.min(...levels)}에 진화` : '진화의돌로 진화';
}

const REASON = { full: ['출전 자리가 꽉 찼다.', '먼저 다른 동료를 빼자.'], last: ['최소 1마리는', '출전해야 한다.'], ditto: ['메타몽은 항상 출전한다.'] };

export function createParty({ game, onBack, onEvolve }) {
  let mode = 'menu'; // menu | sortie | pick | msg
  let cursor = 0, msg = null, msgBack = 'menu';
  const menu = () => [
    { label: '출전 멤버 바꾸기', enabled: true },
    { label: `진화의돌 사용 (${game.items.evoStone}개)`, enabled: true },
    { label: '돌아가기', enabled: true },
  ];
  const targets = () => stoneTargets(game.party);
  const bench = () => game.party.filter((m) => m.species !== 'ditto'); // 메타몽 외 전체 동료
  const say = (lines, back) => { msg = lines; msgBack = back; mode = 'msg'; };

  function chooseMenu() {
    if (cursor === 0) { mode = 'sortie'; cursor = 0; return; }
    if (cursor === 2) { onBack(); return; }
    if (game.items.evoStone <= 0) { say(['진화의돌을 가지고 있지 않다.'], 'menu'); return; }
    if (!targets().length) { say(['진화의돌로 진화할 수 있는', '포켓몬이 없다.'], 'menu'); return; }
    mode = 'pick'; cursor = 0;
  }

  // 출전 멤버 5줄 (메타몽 + 4)
  function drawDeployed(ctx) {
    deployed(game).forEach((m, k) => row(ctx, m, 2 + k * ROW_H, null, false));
  }

  // 전체 동료 목록 (페이지), 출전 표시
  function drawSortie(ctx) {
    const list = bench();
    const page = Math.floor(cursor / PAGE);
    drawText(ctx, `출전 멤버 (${game.sortie.length}/${SORTIE_SIZE})  Z: 전환  X: 완료`, 6, 2, '#f8f8f8', '#384868', 'small');
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const pg = `${page + 1}/${pages}`;
    drawText(ctx, pg, W - 6 - textWidth(pg, 'small'), 2, '#a8b8d8', null, 'small');
    list.slice(page * PAGE, page * PAGE + PAGE).forEach((m, i) => {
      row(ctx, m, 16 + i * ROW_H, game.sortie.includes(m.species), page * PAGE + i === cursor);
    });
  }

  function row(ctx, m, y, out, focused) {
    ui.drawWindow(ctx, 2, y, W - 4, ROW_H - 1, focused ? '#fff8d8' : undefined);
    ctx.save();
    ctx.beginPath(); ctx.rect(4, y + 2, 26, ROW_H - 6); ctx.clip();
    drawPortrait(ctx, m.species, 'Normal', -3, y - 4);
    ctx.restore();
    drawText(ctx, nameOf(m.species), 34, y + 2);
    drawText(ctx, `Lv.${m.level}`, 110, y + 2);
    if (out !== null) drawText(ctx, out ? '★출전' : '대기', W - 40, y + 3, out ? '#d08000' : '#909090', null, 'small');
    else {
      const hint = evolutionHint(m);
      drawText(ctx, hint, W - 8 - textWidth(hint, 'small'), y + 3, '#c07020', null, 'small');
    }
    const growth = SPECIES[m.species].growth;
    const next = m.level >= MAX_LEVEL ? 0 : expForLevel(growth, m.level + 1) - m.exp;
    drawText(ctx, `다음 Lv까지 ${next}`, 34, y + 13, '#707070', null, 'small');
    drawText(ctx, m.moves.map(moveName).join(' · '), 124, y + 13, '#384868', null, 'small');
  }

  return {
    get mode() { return mode; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') { if (pick || ev.type === 'cancel') mode = msgBack; return; }
      if (ev.type === 'cancel') {
        if (mode === 'menu') onBack();
        else { mode = 'menu'; cursor = 0; }
        return;
      }
      const n = mode === 'menu' ? 3 : mode === 'sortie' ? bench().length : targets().length + 1;
      if (ev.type === 'dir' && ev.dy && n) cursor = (cursor + ev.dy + n) % n;
      if (!pick) return;
      if (mode === 'menu') chooseMenu();
      else if (mode === 'sortie') {
        const m = bench()[cursor];
        if (!m) return;
        const r = toggleSortie(game, m.species);
        if (!r.ok) say(REASON[r.reason], 'sortie');
      } else if (cursor >= targets().length) { mode = 'menu'; cursor = 0; }
      else {
        const m = targets()[cursor];
        onEvolve(m, stoneEvolutionOptions(SPECIES[m.species])); // 돌은 실제로 진화할 때 차감 (main)
      }
    },
    update() {},
    draw(ctx, time) {
      ctx.fillStyle = '#1c2840';
      ctx.fillRect(0, 0, W, H);
      if (mode === 'sortie' || (mode === 'msg' && msgBack === 'sortie')) drawSortie(ctx);
      else drawDeployed(ctx);
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
      else if (mode === 'menu') { const r = ui.menuRect(menu(), 0, 0); ui.drawMenu(ctx, menu(), cursor, 2, H - 2 - r.h); }
      else if (mode === 'pick') {
        const items = [...targets().map((m) => ({ label: `${nameOf(m.species)} Lv.${m.level}`, enabled: true })), { label: '그만둔다', enabled: true }];
        ui.drawMenu(ctx, items, cursor, 2, H - 2 - ui.menuRect(items, 0, 0).h);
      }
    },
  };
}

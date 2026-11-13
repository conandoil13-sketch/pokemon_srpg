// 편성소: 파티 정보(레벨·경험치·기술·진화 조건) + 진화의돌 사용
import { SPECIES } from '../data/species.js';
import { stoneTargets } from '../core/progress.js';
import { stoneEvolutionOptions } from '../core/evolution.js';
import { expForLevel, MAX_LEVEL } from '../core/stats.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { drawPortrait } from '../render/sprites.js';
import { W, H } from '../render/screen.js';
import { nameOf, moveName } from './learnFlow.js';

const ROW_H = 34;

export function evolutionHint(member) {
  const evos = SPECIES[member.species].evolutions;
  if (!evos.length) return '최종 진화';
  const levels = evos.filter((e) => e.rule.kind === 'level').map((e) => e.rule.level);
  const stone = evos.some((e) => e.rule.kind === 'stone');
  if (levels.length && stone) return `Lv.${Math.min(...levels)} 또는 진화의돌`;
  return levels.length ? `Lv.${Math.min(...levels)}에 진화` : '진화의돌로 진화';
}

export function createParty({ game, onBack, onEvolve }) {
  let mode = 'menu'; // menu | pick | msg
  let cursor = 0, msg = null;
  const menu = () => [{ label: `진화의돌 사용 (${game.items.evoStone}개)`, enabled: true }, { label: '돌아가기', enabled: true }];
  const targets = () => stoneTargets(game.party);

  function chooseMenu() {
    if (cursor === 1) { onBack(); return; }
    if (game.items.evoStone <= 0) { msg = ['진화의돌을 가지고 있지 않다.']; mode = 'msg'; return; }
    if (!targets().length) { msg = ['진화의돌로 진화할 수 있는', '포켓몬이 없다.']; mode = 'msg'; return; }
    mode = 'pick'; cursor = 0;
  }

  return {
    get mode() { return mode; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') { if (pick || ev.type === 'cancel') { mode = 'menu'; cursor = 0; } return; }
      if (ev.type === 'cancel') { if (mode === 'pick') { mode = 'menu'; cursor = 0; } else onBack(); return; }
      const n = mode === 'menu' ? 2 : targets().length + 1;
      if (ev.type === 'dir' && ev.dy) cursor = (cursor + ev.dy + n) % n;
      if (!pick) return;
      if (mode === 'menu') chooseMenu();
      else if (cursor >= targets().length) { mode = 'menu'; cursor = 0; }
      else {
        const m = targets()[cursor];
        game.items.evoStone -= 1;
        onEvolve(m, stoneEvolutionOptions(SPECIES[m.species]));
      }
    },
    update() {},
    draw(ctx, time) {
      ctx.fillStyle = '#1c2840';
      ctx.fillRect(0, 0, W, H);
      game.party.forEach((m, k) => {
        const y = 2 + k * ROW_H;
        ui.drawWindow(ctx, 2, y, W - 4, ROW_H - 2);
        ctx.save(); // 40px 초상화를 행 높이에 맞게 잘라서
        ctx.beginPath(); ctx.rect(4, y + 2, 42, ROW_H - 6); ctx.clip();
        drawPortrait(ctx, m.species, 'Normal', 5, y + 2);
        ctx.restore();
        drawText(ctx, nameOf(m.species), 50, y + 3);
        drawText(ctx, `Lv.${m.level}`, 124, y + 3);
        const growth = SPECIES[m.species].growth;
        const next = m.level >= MAX_LEVEL ? 0 : expForLevel(growth, m.level + 1) - m.exp;
        const hint = evolutionHint(m);
        drawText(ctx, hint, W - 8 - textWidth(hint, 'small'), y + 4, '#c07020', null, 'small');
        drawText(ctx, `다음 Lv까지 ${next}`, 50, y + 18, '#707070', null, 'small');
        const mv = m.moves.map(moveName).join(' · ');
        drawText(ctx, mv, 140, y + 18, '#384868', null, 'small');
      });
      if (mode === 'msg') ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
      else if (mode === 'menu') ui.drawMenu(ctx, menu(), cursor, 2, H - 2 - ui.menuRect(menu(), 0, 0).h);
      else {
        const items = [...targets().map((m) => ({ label: `${nameOf(m.species)} Lv.${m.level}`, enabled: true })), { label: '그만둔다', enabled: true }];
        ui.drawMenu(ctx, items, cursor, 2, H - 2 - ui.menuRect(items, 0, 0).h);
      }
    },
  };
}

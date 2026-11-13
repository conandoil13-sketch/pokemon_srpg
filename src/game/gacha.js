// 모집소: 코인 100개로 1회 뽑기. 볼이 흔들림 → 희귀도 색 번쩍임 → 포켓몬 등장
import { SPECIES } from '../data/species.js';
import { josa } from '../data/text.js';
import { pull, GACHA_COST } from '../core/gacha.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { drawUnitSprite, requestSprites, DIR } from '../render/sprites.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';

const SHAKE = 1.2, FLASH = 0.35;
const RARITY = { common: { name: '평범', color: '#f8f8f8' }, rare: { name: '희귀', color: '#58a8f8' }, epic: { name: '매우 희귀', color: '#f8c830' } };

export function createGachaScene({ game, rng, onBack, onPulled }) {
  let mode = 'menu', cursor = 0, t = 0, clock = 0, result = null, msg = null;
  const items = () => [{ label: `뽑기 (${GACHA_COST}코인)`, enabled: true }, { label: '돌아가기', enabled: true }];

  function doPull() {
    const r = pull(game, rng);
    if (!r.ok) { msg = ['코인이 부족하다.', `(${GACHA_COST}코인 필요)`]; mode = 'msg'; t = 0; return; }
    result = r;
    requestSprites([r.species]);
    onPulled(r);
    mode = 'anim'; t = 0;
  }

  return {
    get mode() { return mode; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'anim') return; // 연출 중 입력 무시
      if (mode === 'reveal' || mode === 'msg') { if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) { mode = 'menu'; t = 0; } return; }
      if (ev.type === 'cancel') { onBack(); return; }
      if (ev.type === 'dir' && ev.dy) cursor = 1 - cursor;
      if (pick) { if (cursor === 0) doPull(); else onBack(); }
    },
    update(dt) {
      t += dt; clock += dt;
      if (mode === 'anim' && t >= SHAKE + FLASH) { mode = 'reveal'; t = 0; }
    },
    draw(ctx, time) {
      const g = ctx.createRadialGradient(W / 2, 80, 10, W / 2, 80, 170);
      g.addColorStop(0, '#3a4a78'); g.addColorStop(1, '#141a30');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, '모집소', 10, 6, '#f8f8f8', '#384868');
      const coins = `코인 ${game.coins ?? 0}`;
      drawText(ctx, coins, W - 10 - textWidth(coins), 6, '#f8d050', '#384868');

      if (mode === 'anim' && t < SHAKE) drawBall(ctx, Math.sin(t * 22) * 4 * (1 - t / SHAKE));
      else if (mode === 'anim') {
        drawBall(ctx, 0);
        ctx.fillStyle = RARITY[result.rarity].color;
        ctx.globalAlpha = 1 - (t - SHAKE) / FLASH;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      } else if (mode === 'reveal') {
        const r = RARITY[result.rarity];
        ctx.save();
        ctx.translate(W / 2, 78);
        ctx.scale(2, 2);
        drawUnitSprite(ctx, result.species, 'Idle', DIR.Down, clock, 0, 0);
        ctx.restore();
        const name = SPECIES[result.species].name;
        drawText(ctx, r.name, Math.floor((W - textWidth(r.name)) / 2), 110, r.color, '#202838');
        ui.drawMessage(ctx, result.duplicate
          ? [`이미 ${name} 계열이 있다!`, `${name}의 결정을 얻었다.`]
          : [`${josa(name, '이/가')} 동료가 되었다!`, `Lv.${result.member.level}로 합류`], null, Math.floor(time * 3) % 2 === 0);
      } else if (mode === 'msg') {
        ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
      }
      if (mode === 'menu') {
        drawBall(ctx, 0);
        ui.drawMessage(ctx, ['동료를 모집할까?', `결정: 같은 계열이 또 나오면 모인다`], null, false);
        const r = ui.menuRect(items(), 0, 0);
        ui.drawMenu(ctx, items(), cursor, W - r.w - 4, H - 54 - r.h);
      }
    },
  };
}

// 몬스터볼 도트 (가운데)
function drawBall(ctx, dx) {
  const cx = Math.round(W / 2 + dx), cy = 74, r = 14;
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    ctx.fillStyle = y < -1 ? '#e83838' : y > 1 ? '#f8f8f8' : '#202020';
    ctx.fillRect(cx - w, cy + y, w * 2, 1);
  }
  ctx.fillStyle = '#202020'; ctx.fillRect(cx - 4, cy - 4, 8, 8);
  ctx.fillStyle = '#f8f8f8'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
}

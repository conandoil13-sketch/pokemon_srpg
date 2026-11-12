// 타이틀 장면
import { MAP } from '../data/map.js';
import { drawMap } from '../render/tiles.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';

export function createTitle({ onStart }) {
  const centered = (ctx, text, y, color, shadow) => drawText(ctx, text, Math.floor((W - textWidth(text)) / 2), y, color, shadow);
  return {
    handle(ev) { if (ev.type === 'confirm' || ev.type === 'click') onStart(); },
    update() {},
    draw(ctx, time) {
      drawMap(ctx, MAP.tiles, time);
      ctx.fillStyle = 'rgba(16,24,40,0.55)';
      ctx.fillRect(0, 0, W, H);
      ui.drawWindow(ctx, 24, 44, 208, 96);
      ui.bigText(ctx, '포켓몬 택틱스', W / 2, 54, '#304878', '#a8c0e0');
      centered(ctx, '- 신오 대결전 -', 86, '#606878');
      if (Math.floor(time * 2) % 2 === 0) centered(ctx, 'Z 키 또는 클릭', 112, '#e04040');
      centered(ctx, '비공식 팬 데모', 174, '#c8d0e0', null);
    },
  };
}

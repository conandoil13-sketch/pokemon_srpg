// 부트스트랩 + 게임 루프
import { createScreen } from './render/screen.js';
import { loadSprites } from './render/sprites.js';
import { bindInput } from './game/input.js';
import { createGame } from './game/states.js';
import { createRng } from './core/rng.js';
import { SPECIES, validateData } from './data/species.js';

validateData();
const canvas = document.getElementById('game');
const { ctx, getScale } = createScreen(canvas);
await loadSprites(Object.keys(SPECIES));

const game = createGame({ rng: createRng(Date.now() & 0xffffffff) });
window.__game = game; // 디버그용
bindInput(canvas, getScale, (ev) => game.handle(ev));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.draw(ctx, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

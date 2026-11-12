// 부트스트랩 + 장면 관리 + 게임 루프
// 흐름: 타이틀 → 마을(로비) → 출격 준비 → 전투 → 마을
import { createScreen } from './render/screen.js';
import { loadSprites } from './render/sprites.js';
import { loadFonts } from './render/font.js';
import { bindInput } from './game/input.js';
import { createGame } from './game/states.js';
import { createTitle } from './game/title.js';
import { createTown } from './game/town.js';
import { createStageSelect } from './game/stageSelect.js';
import { createRng } from './core/rng.js';
import { SPECIES, validateData } from './data/species.js';
import { TOWN } from './data/town.js';

validateData();
const canvas = document.getElementById('game');
const { ctx, getScale } = createScreen(canvas);
await Promise.all([loadFonts(), loadSprites(Object.keys(SPECIES))]);

const progress = { cleared: new Set() }; // 이번 실행 동안만 유지 (저장은 아직 없음)
const rng = createRng(Date.now() & 0xffffffff);
let scene;

const go = {
  title: () => { scene = createTitle({ onStart: () => go.town() }); },
  town: (message = null, spawn = TOWN.start) => { scene = createTown({ onSortie: go.select, message, spawn }); },
  select: () => { scene = createStageSelect({ cleared: progress.cleared, onPick: go.battle, onBack: () => go.town(null, TOWN.returnSpot) }); },
  battle: (stage) => {
    scene = createGame({
      rng,
      map: stage.map,
      onExit: (result) => {
        if (result === 'win') progress.cleared.add(stage.id);
        go.town(result === 'win' ? [`${stage.name} 클리어!`, '마을로 돌아왔다.'] : ['후퇴했다...', '마을에서 재정비하자.'], TOWN.returnSpot);
      },
    });
  },
};
go.title();

window.__app = { get scene() { return scene; }, go, progress }; // 디버그용
bindInput(canvas, getScale, (ev) => scene.handle(ev));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  scene.update(dt);
  scene.draw(ctx, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

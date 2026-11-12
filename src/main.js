// 부트스트랩 + 장면 관리 + 게임 루프
// 흐름: 타이틀 → 마을 → 출격 준비 → 전투 → 결산 → (진화…) → 마을 · 마을 편성소 → (진화) → 편성소
import { createScreen } from './render/screen.js';
import { loadSprites } from './render/sprites.js';
import { loadFonts } from './render/font.js';
import { bindInput } from './game/input.js';
import { createGame } from './game/states.js';
import { createTitle } from './game/title.js';
import { createTown } from './game/town.js';
import { createStageSelect } from './game/stageSelect.js';
import { createResults } from './game/results.js';
import { createEvolution } from './game/evolution.js';
import { createParty } from './game/party.js';
import { createRng } from './core/rng.js';
import { newGame, loadGame, saveGame } from './core/save.js';
import { SPECIES, validateData } from './data/species.js';
import { TOWN } from './data/town.js';

validateData();
const canvas = document.getElementById('game');
const { ctx, getScale } = createScreen(canvas);
await Promise.all([loadFonts(), loadSprites(Object.keys(SPECIES))]);

// localStorage 접근 자체가 막힌 환경에서도 게임은 돌아가게
const storage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => localStorage.setItem(k, v), // 예외는 saveGame 이 처리
};
let game = loadGame(storage);
const save = () => saveGame(storage, game);
const rng = createRng(Date.now() & 0xffffffff);
let scene;

// 진화 연출을 차례로
function evolveChain(list, done) {
  const [first, ...rest] = list;
  if (!first) { done(); return; }
  const member = game.party.find((m) => m.species === first.species);
  if (!member) { evolveChain(rest, done); return; }
  scene = createEvolution({ member, to: first.to, onDone: () => evolveChain(rest, done) });
}

const go = {
  title: () => {
    scene = createTitle({
      hasSave: !!game,
      onContinue: () => go.town(),
      onNew: () => { game = newGame(); save(); go.town(); },
    });
  },
  town: (message = null, spawn = TOWN.start) => {
    scene = createTown({ onSortie: go.select, onParty: go.party, message, spawn, leader: game.party[0].species });
  },
  select: () => {
    scene = createStageSelect({ cleared: new Set(game.cleared), onPick: go.battle, onBack: () => go.town(null, TOWN.returnSpot) });
  },
  battle: (stage) => {
    scene = createGame({ rng, map: stage.map, party: game.party, onExit: (result, log) => go.results(stage, result, log) });
  },
  results: (stage, result, log) => {
    const firstClear = result === 'win' && !game.cleared.includes(stage.id);
    if (firstClear) game.cleared.push(stage.id);
    scene = createResults({
      game, result, log, firstClear,
      onDone: (evolutions) => evolveChain(evolutions, () => {
        save();
        go.town(result === 'win' ? [`${stage.name} 클리어!`, '마을로 돌아왔다.'] : ['후퇴했다...', '마을에서 재정비하자.'], TOWN.returnSpot);
      }),
    });
  },
  party: () => {
    scene = createParty({
      game,
      onBack: () => go.town(null, TOWN.partySpot),
      onEvolve: (member, to) => evolveChain([{ species: member.species, to }], () => { save(); go.party(); }),
    });
  },
};
go.title();

window.__app = { get scene() { return scene; }, get game() { return game; }, go, save }; // 디버그용
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

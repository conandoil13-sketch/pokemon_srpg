// 부트스트랩 + 장면 관리 + 게임 루프
// 흐름: 타이틀 → 마을 → 던전 선택 → [층 시작(저장) → 전투 → 결산 → 진화… → 다음 층/귀환]… → 마을 · 편성소
import { createScreen } from './render/screen.js';
import { loadSprites } from './render/sprites.js';
import { loadFonts } from './render/font.js';
import { bindInput } from './game/input.js';
import { createGame } from './game/states.js';
import { createTitle } from './game/title.js';
import { createTown } from './game/town.js';
import { createDungeonSelect } from './game/dungeonSelect.js';
import { createFloorMenu } from './game/floorMenu.js';
import { generateFloor } from './core/floorgen.js';
import { startRun, floorSeed, floorStartHp, afterFloor, addLoot, settleLoot, finishRun } from './core/run.js';
import { dungeonById } from './data/dungeons.js';
import { josa } from './data/text.js';
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
  // (Task 6 에서 갈래 선택 창을 붙인다) 지금은 첫 갈래
  const to = first.to ?? first.options[0];
  scene = createEvolution({ member, to, onDone: () => evolveChain(rest, done) });
}

const newSeed = () => ((Date.now() ^ Math.floor(rng() * 0x7fffffff)) >>> 0);

// ---------- 탐험 ----------
function startFloor() {
  const run = game.run;
  const d = dungeonById(run.dungeonId);
  const map = generateFloor(d, run.floor, floorSeed(run));
  save(); // 층 시작 시점 저장 (같은 시드 → 같은 맵으로 재개)
  scene = createGame({
    rng, map, party: game.party, hpRatio: floorStartHp(run), theme: d.theme,
    floorLabel: `${d.name} B${run.floor}F`,
    onExit: (result, log) => afterBattle(result, log),
  });
}

function afterBattle(result, log) {
  for (const item of log.loot) addLoot(game.run, item, game.run.floor);
  scene = createResults({
    game, result, log, firstClear: false,
    onDone: (evos) => evolveChain(evos, () => afterResults(result, log)),
  });
}

function afterResults(result, log) {
  const prevFloor = game.run.floor;
  const { run, outcome } = afterFloor(game.run, result, log.fainted);
  if (outcome !== 'next') { endRun(outcome); return; }
  game.run = run;
  save();
  scene = createFloorMenu({
    lines: [`B${prevFloor}F 돌파!`, '어떻게 할까?'],
    options: ['다음 층으로', '마을로 돌아가기'],
    onPick: (i) => (i === 0 ? startFloor() : endRun('retreat', prevFloor)), // 다음 층엔 아직 안 들어감
  });
}

// reached: 실제로 들어갔던 가장 깊은 층 (층 사이 메뉴에서 귀환하면 run.floor 는 이미 다음 층)
function endRun(outcome, reached = game.run.floor) {
  const run = { ...game.run, floor: reached };
  const d = dungeonById(run.dungeonId);
  const loot = `진화의돌 ${run.loot.evoStone}개 · 경험 사탕 ${run.loot.candy.length}개`;
  const before = [...game.unlocked];
  const reward = outcome === 'wiped' ? { exp: {} } : settleLoot(game, run);
  finishRun(game, run, outcome);
  save();
  const opened = game.unlocked.filter((id) => !before.includes(id)).map((id) => dungeonById(id).name);
  const lines = outcome === 'cleared'
    ? [`${josa(d.name, '을/를')} 돌파했다!`, opened.length ? `${josa(opened[0], '이/가')} 열렸다!` : loot]
    : outcome === 'retreat' ? ['마을로 돌아왔다.', loot]
    : ['눈앞이 캄캄해졌다...', '모은 보물을 잃고 마을로 돌아왔다.'];
  const toTown = () => go.town(lines, TOWN.returnSpot);
  if (!Object.keys(reward.exp).length) { toTown(); return; }
  // 경험 사탕: 탐험 보상 결산
  scene = createResults({ game, result: 'loot', log: { exp: reward.exp }, firstClear: false, onDone: (evos) => evolveChain(evos, () => { save(); toTown(); }) });
  save(); // 사탕 경험치는 createResults 생성 시 이미 적용됨 → 바로 저장 (결산 중 새로고침해도 유지)
}

const go = {
  title: () => {
    scene = createTitle({
      hasSave: !!game,
      onContinue: () => (game.run ? go.resume() : go.town()),
      onNew: () => { game = newGame(); save(); go.town(); },
    });
  },
  resume: () => {
    const d = dungeonById(game.run.dungeonId);
    scene = createFloorMenu({
      lines: ['탐험을 이어서 할까?', `${d.name} B${game.run.floor}F`],
      options: ['예', '아니요'],
      onPick: (i) => (i === 0 ? startFloor() : go.town()),
    });
  },
  town: (message = null, spawn = TOWN.start) => {
    scene = createTown({ onSortie: go.select, onParty: go.party, message, spawn, leader: game.party[0].species });
  },
  select: () => {
    scene = createDungeonSelect({
      game,
      onStart: (id) => {
        if (game.run) finishRun(game, game.run, 'wiped'); // 포기 = 보물 잃음
        game.run = startRun(id, newSeed());
        startFloor();
      },
      onResume: startFloor,
      onBack: () => go.town(null, TOWN.returnSpot),
    });
  },
  party: () => {
    scene = createParty({
      game,
      onBack: () => go.town(null, TOWN.partySpot),
      onEvolve: (member, options) => evolveChain([{ species: member.species, options }], () => { save(); go.party(); }),
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

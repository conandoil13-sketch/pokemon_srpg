// 부트스트랩 + 장면 관리 + 게임 루프
// 흐름: 타이틀 → 마을 → 던전 선택 → [층 시작(저장) → 전투 → 결산 → 진화… → 다음 층/귀환]… → 마을 · 편성소
import { createScreen } from './render/screen.js';
import { requestSprites } from './render/sprites.js';
import { loadFonts } from './render/font.js';
import { bindInput } from './game/input.js';
import { watchTouch, mountPad } from './game/touchPad.js';
import { sound } from './audio/sound.js';
import { createGame } from './game/states.js';
import { createTitle } from './game/title.js';
import { createTown } from './game/town.js';
import { createDungeonSelect } from './game/dungeonSelect.js';
import { createFloorMenu } from './game/floorMenu.js';
import { generateFloor } from './core/floorgen.js';
import { deployed } from './core/roster.js';
import { memberKey, memberByKey } from './core/members.js';
import { createGachaScene } from './game/gacha.js';
import { startRun, floorSeed, floorStartHp, afterFloor, addLoot, settleLoot, finishRun, addBattleCoins, addFloorCoins } from './core/run.js';
import { dungeonById } from './data/dungeons.js';
import { josa } from './data/text.js';
import { pickupLoot } from './core/abilities.js';
import { rollCapsules } from './core/dittoBuild.js';
import { levelCapFor } from './core/difficulty.js';
import { createResults } from './game/results.js';
import { createEvolution } from './game/evolution.js';
import { createEvolutionChoice } from './game/evolutionChoice.js';
import { createBox } from './game/box.js';
import { createRng } from './core/rng.js';
import { newGame, loadGame, saveGame } from './core/save.js';
import { validateData } from './data/species.js';
import { TOWN } from './data/town.js';

validateData();
const canvas = document.getElementById('game');
// 터치 기기: 게임기 버튼 + 버튼 자리를 뺀 칸에 화면 맞춤. 기기가 바뀌면(개발자도구 기기 전환 등) 새로고침 없이 바뀐다
const { ctx, getScale, refit } = createScreen(canvas, () => (document.body.classList.contains('touch') ? document.getElementById('screen') : null));
const setTouch = (on) => { document.body.classList.toggle('touch', on); refit(); };
setTouch(watchTouch(setTouch));
await loadFonts(); // 스프라이트는 화면에 나올 종족만 그때그때 (requestSprites)

// localStorage 접근 자체가 막힌 환경에서도 게임은 돌아가게
const storage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => localStorage.setItem(k, v), // 예외는 saveGame 이 처리
};
let game = loadGame(storage);
const save = () => saveGame(storage, game);
const rng = createRng(Date.now() & 0xffffffff);
let scene;

// 진화 연출을 차례로. 갈래가 여럿이면 먼저 "어느 모습으로 진화할까?" (진화하지 않으면 건너뜀)
function evolveChain(list, done) {
  const [first, ...rest] = list;
  if (!first) { done(); return; }
  const member = memberByKey(game, first.key ?? first.species); // 같은 종 두 마리여도 그 동료
  if (!member) { evolveChain(rest, done); return; }
  const options = first.options ?? [first.to];
  const evolveTo = (to) => {
    if (!to) { evolveChain(rest, done); return; }
    if (first.stone) game.items.evoStone -= 1; // 진화의돌은 실제로 진화할 때만 소모
    requestSprites([to]);
    sound.bgm('evolution');
    scene = createEvolution({ member, to, onDone: () => { sound.bgm('route1'); evolveChain(rest, done); } }); // 출전 목록은 uid 라 진화해도 같은 자리
  };
  if (options.length === 1) { evolveTo(options[0]); return; }
  requestSprites(options);
  scene = createEvolutionChoice({ species: member.species, options, onPick: evolveTo });
}

const newSeed = () => ((Date.now() ^ Math.floor(rng() * 0x7fffffff)) >>> 0);

// ---------- 탐험 ----------
function startFloor() {
  sound.bgm('route1');
  const run = game.run;
  const d = dungeonById(run.dungeonId);
  const map = generateFloor(d, run.floor, floorSeed(run));
  requestSprites([...deployed(game).map((m) => m.species), ...map.enemies.map((e) => e.species)]);
  save(); // 층 시작 시점 저장 (같은 시드 → 같은 맵으로 재개)
  scene = createGame({
    rng, map, party: deployed(game), hpRatio: floorStartHp(run), theme: d.theme, // 메타몽 + 출전 4
    floorLabel: `${d.name} B${run.floor}F`,
    onExit: (result, log) => afterBattle(result, log),
  });
}

function afterBattle(result, log) {
  const run = game.run;
  if (result !== 'lose') { // 픽업·꿀모으기: 층 돌파 때 가끔 주워 옴
    log.pickup = pickupLoot(deployed(game), Math.random);
    log.loot.push(...log.pickup);
  }
  if (result !== 'lose') { // 메타몽 캡슐: 쓰러뜨린 적에게서 (보스 확정)
    log.capsules = rollCapsules(log.defeated ?? [], Math.random);
    log.loot.push(...log.capsules);
  }
  for (const item of log.loot) addLoot(run, item, run.floor);
  const before = run.loot.coins;
  addBattleCoins(run, log.coins);
  if (result !== 'lose') addFloorCoins(run, run.floor);
  scene = createResults({
    game, result, log, firstClear: false, members: deployed(game), coins: run.loot.coins - before,
    onDone: (evos) => evolveChain(evos, () => afterResults(result, log)),
  });
}

function afterResults(result, log) {
  sound.bgm('route1'); // 승리 음악 끝
  const prevFloor = game.run.floor;
  const { run, outcome } = afterFloor(game.run, result, log.fainted);
  if (outcome !== 'next') { endRun(outcome); return; }
  game.run = run;
  save();
  scene = createFloorMenu({
    lines: [`B${prevFloor}F 돌파!  (코인 ${run.loot.coins}${run.loot.capsules?.length ? ` · 캡슐 ${run.loot.capsules.length}` : ''})`, '어떻게 할까?'],
    options: ['다음 층으로', '마을로 돌아가기'],
    onPick: (i) => (i === 0 ? startFloor() : endRun('retreat', prevFloor)), // 다음 층엔 아직 안 들어감
  });
}

// reached: 실제로 들어갔던 가장 깊은 층 (층 사이 메뉴에서 귀환하면 run.floor 는 이미 다음 층)
function endRun(outcome, reached = game.run.floor) {
  const run = { ...game.run, floor: reached };
  const d = dungeonById(run.dungeonId);
  const powders = Object.values(run.loot.powders ?? {}).reduce((a, n) => a + n, 0), capsules = (run.loot.capsules ?? []).length;
  let loot = `코인 ${run.loot.coins} · 진화의돌 ${run.loot.evoStone} · 사탕 ${run.loot.candy.length}` + (capsules || powders ? ` · 캡슐 ${capsules} · 파우더 ${powders}` : '');
  const before = [...game.unlocked];
  const reward = outcome === 'wiped' ? { exp: {} } : settleLoot(game, run);
  const capThisRun = levelCapFor(game); // 사탕 경험치는 이번 탐험의 상한으로 (돌파로 열린 상한은 다음부터)
  finishRun(game, run, outcome);
  save();
  const opened = game.unlocked.filter((id) => !before.includes(id)).map((id) => dungeonById(id).name);
  const lines = outcome === 'cleared'
    ? [`${josa(d.name, '을/를')} 돌파했다!`, opened.length ? `${josa(opened[0], '이/가')} 열렸다!` : loot]
    : outcome === 'retreat' ? ['마을로 돌아왔다.', loot]
    : ['눈앞이 캄캄해졌다...', '모은 보물을 잃고 마을로 돌아왔다.'];
  const pages = reward.dropped ? [lines, ['가방이 가득 차서', `오래된 캡슐 ${reward.dropped}개를 버렸다.`]] : lines; // 조용히 버리지 않는다
  const toTown = () => { sound.bgm('route1'); go.town(pages, TOWN.returnSpot); sound.jingle('healed'); }; // 마을로: 회복 효과음
  if (!Object.keys(reward.exp).length) { toTown(); return; }
  // 경험 사탕: 탐험 보상 결산
  // 사탕 경험치는 출전 멤버만
  const out = deployed(game);
  const exp = Object.fromEntries(Object.entries(reward.exp).filter(([k]) => out.some((m) => String(memberKey(m)) === k)));
  if (!Object.keys(exp).length) { toTown(); return; }
  scene = createResults({ game, result: 'loot', log: { exp }, firstClear: false, members: out, cap: capThisRun, onDone: (evos) => evolveChain(evos, () => { save(); toTown(); }) });
  save(); // 사탕 경험치는 createResults 생성 시 이미 적용됨 → 바로 저장 (결산 중 새로고침해도 유지)
}

// 이스터에그: 모부기에게 5번 말 걸면 200코인 (저장 하나당 한 번)
function onWaterGift() { // 물속의 선물: 10연속 뽑기 바우처 (한 번)
  if (game.eggs?.water) return false;
  game.items.tenVoucher = (game.items.tenVoucher ?? 0) + 1;
  game.eggs = { ...game.eggs, water: true };
  save();
  return true;
}
function onTurtwigGift() {
  if (game.eggs?.turtwig) return false;
  game.coins += 200;
  game.eggs = { ...game.eggs, turtwig: true };
  save();
  return true;
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
    requestSprites(game.party.map((m) => m.species));
    // 마을 NPC: 출전 멤버 먼저, 남는 자리에 대기 동료
    const outM = deployed(game).slice(1), out = outM.map((m) => m.species);
    const rest = game.party.filter((m) => m.species !== 'ditto' && !outM.includes(m)).map((m) => m.species);
    scene = createTown({ onSortie: go.select, onParty: go.party, onGacha: go.gacha, onTurtwigGift, onWaterGift, message, spawn, leader: game.party[0].species, companions: [...out, ...rest] });
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
  gacha: () => {
    scene = createGachaScene({ game, rng, onBack: () => go.town(null, TOWN.gachaSpot), onPulled: () => { save(); sound.jingle('item'); } });
  },
  party: () => {
    requestSprites(game.party.map((m) => m.species));
    scene = createBox({
      game,
      onBack: () => go.town(null, TOWN.partySpot),
      onSave: () => save(),
      onEvolve: (member, options) => evolveChain([{ key: memberKey(member), species: member.species, options, stone: true }], () => { save(); go.party(); }),
    });
  },
};
go.title();
sound.bgm('route1'); // 기본 배경음악 (첫 터치·키 입력 때부터 들림)
for (const t of ['pointerdown', 'keydown']) addEventListener(t, () => sound.unlock(), { once: true, capture: true });

window.__app = { get scene() { return scene; }, get game() { return game; }, go, save }; // 디버그용
bindInput(canvas, getScale, (ev) => scene.handle(ev));
mountPad(document.getElementById('pad'), (ev) => scene.handle(ev)); // 터치 기기가 아니면 CSS 로 숨김

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  scene.update(dt);
  scene.draw(ctx, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

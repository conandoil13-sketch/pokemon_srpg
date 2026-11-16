# 단풍 숲 던전 + 낙엽더미 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시련의 들판 Ⅰ 자리를 진짜 던전 "단풍 숲"으로 바꾸고, 다가가면 숨은 포켓몬이 기습하거나 상자가 자동으로 열리는 낙엽더미를 넣고, 숲을 pixelfx 단풍 타일로 그린다.

**Architecture:** 던전은 `stageSlots({ 1: AUTUMN_FOREST })` 로 1번 자리를 대체한다. 열리지 않은 낙엽더미는 지형 문자 `*` (누구도 들어갈 수 없음)로 두고 내용물은 `state.piles` 에 둔다. 그러면 길찾기·밀어내기·순간이동·AI가 지금 규칙(`canEnter`)만으로 더미를 피한다. `arrive` 가 아군 이동 끝에 옆 더미를 연다. 그림은 `theme === 'autumn'` 일 때 따로 구운 pixelfx 타일로 그린다.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`, vendored pixelfx.

**Spec:** `docs/superpowers/specs/2026-11-17-autumn-forest-design.md`

## Global Constraints
- 던전: `id: 'autumn-forest'`, 이름 "단풍 숲", `theme: 'autumn'`, `types: ['bug', 'poison', 'fire', 'grass']`, `early: []`, `fallback: 'oddish'`, `weather: [{ id: 'sun', chance: 0.15 }]`, `clusters: { '"': 3, '^': 2, '~': [1, 2], '#': 4 }`, `piles: [2, 4]`. 층·레벨·예산·상한·bstCap·stageCap·boss 는 `fillerStage(1)` 값 그대로. `filler` 표시는 빼기.
- 예전 저장: 로드할 때 `unlocked`·`cleared`·`best` 키·`run.dungeonId` 의 `'trial-1'` → `'autumn-forest'`.
- 더미: 층마다 `piles[0]..piles[1]` 개, 포켓몬 60% · 상자 40%. 바닥 `.` 칸, `x >= 3`, 사용 안 된 칸, 아군 출발 칸과 상하좌우로 붙지 않음, 놓아도 나머지 걸을 수 있는 칸이 출발점에서 모두 닿을 것 (아니면 그 칸 건너뜀). 별도 난수 `createRng(hashSeed(seed, 2000))` — `piles` 가 없는 던전(신오·시련)은 결과·난수 소비 그대로.
- 숨은 포켓몬: 종 = `encounterPool(dungeon, floor)` 에서, 레벨 = `dungeon.baseLevel[floor - 1]`. 상자 아이템 = 기존 상자 확률표 (진화의돌 15% · 파우더 10% · 사탕 45% · 코인 30%).
- 열기: 아군이 이동을 마친 칸의 상하좌우 옆 더미 전부. 적은 열지 않음. 포켓몬 → 그 칸에 적 생성 + 다가간 아군에게 `min(적 레벨, 아군 hp − 1)` 고정 피해 (기습으로 기절 없음). 상자 → 바로 전리품.
- 대사: "낙엽 속에서 ○○이(가) 튀어나왔다!", "○○은(는) 기습을 받았다!" (+ 피해 숫자 표시), 상자 "낙엽 속에 ○○이(가) 있었다!" (아이템 이름, `josa`).
- 브랜치 `feat/autumn-forest` (preview/autumn-forest 에서 이어서). 테스트 `npm test`. 저장 `pokemon-tactics-save` 백업·복원.

## Review Focus
1. 계단 칸에 도착하면서 옆 더미가 열림 → 더미 대사가 먼저, 그다음 계단 결과. → Task 2 테스트: `arrive` 가 `stairs: true` 와 `piles` 를 함께 돌려줌; Task 3 에서 대사 순서.
2. 한 번에 두 더미(포켓몬 둘)가 열려 기습 합이 HP를 넘음 → 두 번째 기습도 HP 1을 남김. → Task 2 테스트.
3. 보스 층: 보스를 쓰러뜨리면 승리 — 아직 안 연 더미나 막 나온 숨은 적 때문에 승리가 막히지 않음(지금 승리 조건 그대로). → Task 2 테스트: 보스층 생성에 더미가 있어도 `bossFloor` 판정·보스 자리 유지.
4. 밀어내기·끌어당기기·순간이동·갸라도스 등장이 `*` 칸에 유닛을 놓지 않음 → `canEnter('*') === false` 하나로 막힘. → Task 2 테스트: `canEnter('*', 아무 유닛)` false, `reachable` 에 더미 칸 없음.
5. 진행 중 탐험이 `trial-1` 인 예전 저장 → 이어하기가 단풍 숲 같은 층으로 이어짐(층 수 7 동일). → Task 1 테스트.

---

### Task 1: 단풍 숲 던전 데이터 · 예전 저장 옮기기

**Files:**
- Create: `src/data/autumnForest.js`, `tests/autumnForest.test.js`
- Modify: `src/data/dungeons.js` (`stageSlots({ 1: AUTUMN_FOREST })`), `src/core/save.js` (로드 때 id 옮기기), `tests/fillerStages.test.js` (1번 자리 기대값)

**Interfaces:**
- Produces: `AUTUMN_FOREST` (Dungeon, 위 Global Constraints 값). `DUNGEONS[2].id === 'autumn-forest'`, `DUNGEONS[3].unlock === 'autumn-forest'`.
- `autumnForest.js` 는 `fillerStage` 를 import (fillerStages.js 가 autumnForest.js 를 import 하지 않게 — 순환 금지).

- [ ] **Step 1: Write the failing tests** (`tests/autumnForest.test.js`)

```js
test('autumn forest takes the first trial slot with the trial curve', () => {
  const d = DUNGEONS[2], t = fillerStage(1);
  assert.equal(d.id, 'autumn-forest'); assert.equal(d.name, '단풍 숲'); assert.equal(d.theme, 'autumn');
  assert.deepEqual(d.types, ['bug', 'poison', 'fire', 'grass']); assert.deepEqual(d.piles, [2, 4]);
  for (const k of ['floors', 'baseLevel', 'budget', 'levelCap', 'bstCap']) assert.deepEqual(d[k], t[k]);
  assert.equal(d.unlock, 'sinnoh-cave'); assert.equal(DUNGEONS[3].unlock, 'autumn-forest'); assert.ok(!d.filler);
});
test('old saves move trial-1 progress to the autumn forest', () => {
  // 저장 데이터: unlocked [sinnoh-field, sinnoh-cave, trial-1, trial-2], cleared [.., trial-1], best { 'trial-1': 7 }, run { dungeonId: 'trial-1', floor: 3, seed: 5, ... }
  // loadGame 뒤: unlocked·cleared 에 'autumn-forest' 있고 'trial-1' 없음, best['autumn-forest'] === 7, run.dungeonId === 'autumn-forest', run.floor === 3
});
test('every autumn floor generates enemies of the forest types and a boss', () => { /* floors 1..7, seeds 1..3: enemies.length >= 1, 마지막 층 boss 존재 */ });
```

- [ ] **Step 2: Run** `node --test tests/autumnForest.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. `tests/fillerStages.test.js` 의 "1번 = trial-1" 기대를 슬롯 기준(`DUNGEONS.slice(3)` 은 trial-2..8, 대체 슬롯 사슬 테스트는 그대로)으로 고친다.
- [ ] **Step 4: Run** `npm test` — Expected: PASS (신오 골든 해시 그대로).
- [ ] **Step 5: Commit** `feat: autumn forest replaces the first trial slot; old trial-1 saves carry over`

---

### Task 2: 낙엽더미 — 층 생성 · 열기 · 기습

**Files:**
- Modify: `src/core/floorgen.js` (8번 단계 뒤 더미 놓기), `src/core/pathfind.js` (`*`), `src/core/battle.js` (`state.piles`, `arrive`)
- Test: `tests/autumnForest.test.js`

**Interfaces:**
- `generateFloor` 결과에 `piles: [{ x, y, kind: 'mon', species, level } | { x, y, kind: 'chest', item }]` (`piles` 없는 던전은 `[]`), 그리고 그 칸 `tiles` 문자 = `'*'`.
- `TILE_COST['*'] = Infinity`; `canEnter('*', who) === false`.
- `createBattle` → `state.piles` (복사본).
- `arrive(state, unitId)` 결과에 `piles: [{ x, y, kind, unitId?, item?, damage? }]` 추가 (열린 순서 = 위→아래, 왼→오른). 열린 칸은 `grid` 에서 `'.'`. 포켓몬은 `makeUnit({ species, side: 'enemy', level, x, y, id: uniqueId(...) })` 로 `state.units` 에 추가, 피해는 다가간 아군 `hp` 에서 뺌, `damage` 에 실제 피해. 상자는 `state.log.loot` 에 추가.

- [ ] **Step 1: Write the failing tests**

```js
test('autumn floors place 2-4 piles that block and keep the floor connected', () => {
  // floors 1..7 × seeds 1..5: 2 <= piles.length <= 4, 각 칸 tiles 문자 '*', x >= 3, 출발 칸과 안 붙음,
  // 같은 seed 두 번 → deepEqual, '*' 를 벽으로 본 reachableFrom(anchor) 가 '.' 칸 모두 포함
  // 비율: 7층 × 시드 40개 합에서 mon 비율 0.45..0.75
});
test('sinnoh floors have no piles', () => { /* generateFloor(sinnoh-field, 1, 7).piles 길이 0 */ });
test('nobody can enter a pile', () => { /* canEnter('*', 'pidgey') false; 부유·유연 유닛도 false; reachable 결과에 더미 칸 없음 */ });
test('an ally finishing next to a pile opens it: ambush deals the level and leaves 1 hp', () => {
  // 손으로 만든 맵 + piles [{x:3,y:1,kind:'mon',species:'paras',level:24}], 아군 hp 30 을 (2,1) 로 → arrive
  // 결과 piles[0].damage === 24, 아군 hp 6, 새 적 paras Lv24 가 (3,1), grid[1][3] === '.', state.piles 비어 있음
  // 아군 hp 10 → damage 9, hp 1
});
test('two mon piles at once never faint the ally', () => { /* 양옆 더미 둘, 아군 hp 20, 레벨 24·24 → hp 1, damage 합 19 */ });
test('a chest pile opens itself into loot', () => { /* kind chest item candy → result piles[0].item==='candy', log.loot 에 candy */ });
test('enemies and diagonal neighbours do not open piles', () => { /* 적 arrive → piles 그대로; 아군 대각선 → 그대로 */ });
test('arriving on stairs next to a pile reports both', () => { /* stairs true, piles.length 1 */ });
test('boss floor with piles keeps its boss', () => { /* autumn 7층 seeds 1..5: enemies 중 boss 1, 보스 칸이 더미 칸 아님 */ });
```

- [ ] **Step 2: Run** `node --test tests/autumnForest.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. 더미 놓기는 기존 단계(지형·계단·적·상자) 다 끝난 뒤 별도 난수로 — 그래야 Global Constraints 의 "piles 없는 던전 그대로" 가 성립.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: leaf piles hide an ambushing pokemon or a chest that opens itself`

---

### Task 3: 숲 그림 · 더미 그림·연출 · 대사 · 문서

**Files:**
- Create: `src/render/autumnTiles.js` (구운 타일 + `drawAutumnMap`), `src/core/leafRoute.js` (+ 테스트), `src/fx-custom/autumn/leaf-burst.js`
- Modify: `src/fx-custom/autumn/tiles.js` (`piece: 'pile'` 볼록 낙엽더미), `src/render/tiles.js` (`drawMap` 에서 `theme === 'autumn'` 이면 `drawAutumnMap`), `src/game/states.js` (더미 대사·기습 피해 표시·연출), `tools/map-preview.html` (`leafRoute` 를 core 것으로, 더미 조각 추가), `docs/ROADMAP.md`, `docs/dungeon-guide.md`

**Interfaces:**
- `leafRoute(tiles: string[], from: {x,y}, to: {x,y}) -> Set<"x,y">` (순수): 걸을 수 있는 칸(`#`·`~`·`*` 제외) BFS, 두 칸 폭으로 듬성듬성 넓힘 (지금 미리보기와 같은 규칙). 목표 = 계단, 보스 층이면 보스 자리.
- `drawAutumnMap(ctx, grid, time, camX, camY, viewW, viewH, route)` — 바닥(칸 좌표 무늬)·단풍길(5변형)·길 옆 흩날림·연못+물가 2px·계단, 그다음 위로 솟는 것(나무 3색·억새·바위·`*` 더미)을 위 줄부터. 조각은 처음 쓸 때 굽고 캐시 (pixelfx `createFrame`·`createFx`·`composite`).
- 대사 순서: 더미(나온 순서대로) → 상자 → 계단. 포켓몬 더미마다 `showNotice(['낙엽 속에서 ○○이(가) 튀어나왔다!', '○○은(는) 기습을 받았다!'], …, { hp: … })` 와 그 칸에 `leaf-burst` 연출; 상자 더미는 `['낙엽 속에 ○○이(가) 있었다!']` + 아이템 소리. 이동·후퇴 두 경로(`afterAllyMove`, 후퇴 이동) 모두.

- [ ] **Step 1: Write the failing test** (`tests/autumnForest.test.js`): `leafRoute` 가 출발→목표를 잇고 `#`·`~`·`*` 칸을 포함하지 않으며 목표 칸을 포함; 목표에 못 가면 빈 Set.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces; pixelfx 조각은 `node tools`/미리보기 페이지에서 눈으로 보고 다듬는다 (더미: 바닥보다 4~6px 솟은 둥근 잎 무더기, 위 왼쪽 빛; 터짐: 잎 8~12장이 사방으로 튀고 떨어지며 0.6초 안에 사라짐).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Browser check** — 저장 백업 → `unlocked` 에 `autumn-forest` → 입장해 숲 그림·단풍길·더미 확인 → 더미 옆으로 이동해 포켓몬 기습(대사·피해·연출)과 상자 자동 열림 확인 → 저장 복원. 콘솔 오류 없음. 스크린샷.
- [ ] **Step 6: Docs** — ROADMAP "완료 (2026-11-17): 단풍 숲(시련 1번 자리) + 낙엽더미 기믹". dungeon-guide 에 `piles` 필드와 `*` 문자 한 단락.
- [ ] **Step 7: Run** `npm test` — Expected: PASS.
- [ ] **Step 8: Commit** `feat: draw the autumn forest with pixelfx tiles; leaf pile sprites, burst and lines`

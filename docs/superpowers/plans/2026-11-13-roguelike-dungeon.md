# 로그라이크 던전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동 생성 층을 내려가는 던전 2종(신오 들판 5층 → 신오 동굴 7층), 계단·보물상자·보스, 층 사이 HP 규칙, 층 시작 저장/재개.

**Architecture:** 층 생성(`core/floorgen.js`)과 탐험 상태(`core/run.js`)는 순수 함수, 시드 고정이면 같은 결과. 전투(`core/battle.js`)는 기존 `createBattle(map, party)` 형태를 유지하면서 계단·상자·보스·시작 HP 비율을 받는다. 장면은 던전 선택·층 메뉴가 새로 생기고 `main.js` 가 탐험 흐름을 잇는다.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, Node 24 `node --test`, localStorage.

**Spec:** `docs/superpowers/specs/2026-11-13-roguelike-dungeon-design.md`

## Global Constraints

- 맵 16×12, 타일 `.` `"` `^` `~` `#` + 새 `>`(계단, 이동 비용 1). 상자는 타일이 아니라 맵 오브젝트.
- 생성·탐험 로직은 `createRng(seed)` 만 쓴다 (`Math.random` 금지). 층 시드 = `hashSeed(runSeed, floor)`.
- 던전 수치(층 수, 레벨 식, 적 수, 적 풀, 보스, 테마, 해금)는 `src/data/dungeons.js` 에만 둔다.
- 층 사이: 매 층 완전 회복, 직전 층 기절자는 `max(1, floor(maxHp × 0.5))`.
- 전멸·포기: 레벨·기술·경험치 유지, 탐험 보상(`run.loot`) 미지급. 성공·귀환: 지급.
- 보물: 진화의돌 20% / 경험 사탕 80%. 사탕 1개 = 파티 전원 `floor × 30` 경험치 (지급 시점에).
- 저장 version 2, v1 이전. 저장 시점: 층 시작 직전, 탐험 종료 후, 편성소 진화 후.
- `core/` 는 DOM 을 모른다. 게임 텍스트 한국어. 각 Task 끝에 커밋.

## Review Focus

1. **탐험 도중 새로고침 → 이어하기**: 같은 층이 같은 지형·적·상자로 다시 생성되고, 기절자 50% 규칙도 유지. → Task 1(결정성) + Task 4(run 저장 왕복).
2. **계단에 도착하는 이동**: 행동 메뉴 없이 즉시 클리어되고, 그 이동은 취소할 수 없다. 상자와 계단은 같은 칸에 생기지 않는다. → Task 1 + Task 5.
3. **두 층 연속 기절한 포켓몬**: 매번 50%(누적 감소 없음), HP 최소 1. → Task 2.
4. **v1 저장(고정 스테이지 시절)**: 레벨·기술·진화의돌 유지, run 없음, 들판만 해금. → Task 4.
5. **진행 중인 탐험이 있는데 다른 던전을 고름**: 확인 후 포기, 보물은 지급되지 않음. → Task 6.

---

### Task 1: 던전 데이터 + 층 생성기

**Files:**
- Create: `src/data/dungeons.js`, `src/core/floorgen.js`
- Test: `tests/floorgen.test.js`

**Interfaces:**
- Produces:
  - `DUNGEONS = [{ id, name, floors, unlock: null | dungeonId, theme: 'field'|'cave', level: (f) => n, count: (f) => n, pool: [{ species, minFloor }], boss: { species, levelBonus: 3 }, clusters: { '"': n, '^': n, '~': [min,max], '#': n } }]`, `dungeonById(id)` — 값은 스펙 §2 표, clusters 는 §3 (field: `"`3 `^`2 `~`[1,2] `#`2 / cave: `"`2 `^`3 `~`[1,1] `#`4)
  - `hashSeed(runSeed, floor) => uint32` (결정적, 예: `(runSeed ^ Math.imul(floor, 0x9e3779b1)) >>> 0`)
  - `generateFloor(dungeon, floor, seed) => FloorMap`
  - `FloorMap = { tiles: string[12], allySlots: [{x,y}×4], enemies: [{ species, level, x, y, boss?: true }], stairs: {x,y} | null, chests: [{ x, y, item: 'evoStone'|'candy' }] }`
  - `reachableFrom(tiles, start) => Set<"x,y">` (땅 이동: `#` `~` 불가) — 테스트와 생성기가 공유
- 알고리즘: 스펙 §3 1~6단계. 연결성 보장은 "도달 못 한 바닥 칸 → 가장 가까운 도달 칸까지 직선(맨해튼, 가로 먼저) 경로의 막힌 칸을 `.` 로" 를 반복. 무작위 걸음은 맵 경계 안에서만.

- [ ] **Step 1: Write the failing test** `tests/floorgen.test.js`
  - 결정성: `generateFloor(field, 2, 123)` 두 번 → deepEqual
  - **(Review Focus 1)** 다른 시드 → tiles 가 다름 (10개 시드 중 서로 다른 결과 ≥ 9)
  - 속성 검사 시드 300개 × (들판 1·5층, 동굴 1·7층):
    - tiles 12행×16열, 문자 `[."^~#>]`
    - `reachableFrom(tiles, allySlots[0])` 에 모든 `.` `"` `^` `>` 칸, 모든 allySlot·적·상자 칸 포함
    - allySlots 4개 모두 `x <= 2`, 적은 모두 `x >= 8`
    - 모든 유닛·상자·계단 좌표가 서로 다름 **(Review Focus 2: 상자 ≠ 계단)**
    - 일반 층: `stairs` 있음, `tiles[y][x] === '>'`, 보스 없음, 적 수 = `count(f)`, 레벨 = `level(f)`
    - 보스 층: `stairs === null`, `boss` 1마리(레벨 `level(f)+3`, 종족 = 던전 보스), 그 외 적 수 = `count(f)`
    - 적 종족은 `minFloor <= f` 인 풀에서만
    - 상자 0~2개, item 은 둘 중 하나
- [ ] **Step 2: Run** `node --test tests/floorgen.test.js` → FAIL (module not found)
- [ ] **Step 3: Implement** `dungeons.js`, `floorgen.js`
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: dungeon table and seeded floor generator`

---

### Task 2: 탐험(런) 상태

**Files:**
- Create: `src/core/run.js`
- Test: `tests/run.test.js`

**Interfaces:**
- Consumes: `dungeonById`, `hashSeed`
- Produces:
  - `Run = { dungeonId, floor, seed, faintedLast: string[], loot: { evoStone: n, candy: [floor…] } }` (사탕은 얻은 층 번호 목록 → 지급 시 `floor × 30`)
  - `startRun(dungeonId, seed) => Run`
  - `floorSeed(run) => hashSeed(run.seed, run.floor)`
  - `floorStartHp(run) => { [species]: 0.5 }` (없는 종족은 1로 간주)
  - `afterFloor(run, result, fainted: string[]) => { run: Run, outcome: 'next'|'cleared'|'wiped' }` — `'stairs'` 또는 비보스 `'win'` → next(`floor+1`, `faintedLast = fainted`); 마지막 층 `'win'` → cleared; `'lose'` → wiped. 원본 run 은 바꾸지 않는다
  - `addLoot(run, item, floor) => void`
  - `settleLoot(game, run) => { evoStone, exp: { [species]: n } }` — `game.items.evoStone += loot.evoStone`, 사탕 경험치는 반환만 (결산 장면이 적용)
  - `finishRun(game, run, outcome: 'cleared'|'retreat'|'wiped') => void` — cleared: `game.cleared` 추가, 다음 던전(`unlock === dungeonId`) 해금; 모든 outcome: `game.best[dungeonId] = max(기존, 도달 층)`; `game.run = null`. (보물 지급은 하지 않음 — cleared·retreat 는 호출 측이 먼저 `settleLoot`)

- [ ] **Step 1: Write the failing test**
  - startRun → floor 1, loot 0, faintedLast []
  - afterFloor('stairs', ['piplup']) → next, floor 2, `floorStartHp` = `{piplup:0.5}`; 이어서 기절 없이 클리어 → piplup 1
  - **(Review Focus 3)** 두 층 연속 기절 → 매번 0.5 (0.25 아님)
  - 들판 5층 'win' → cleared; 'lose' → wiped
  - settleLoot: evoStone 2 + 사탕 [1,3] → items +2, 파티 각 종족 exp 120
  - finishRun(cleared, 'sinnoh-field') → unlocked 에 'sinnoh-cave', cleared 에 'sinnoh-field', best 5, run null; wiped(3층) → best 3, 해금 없음; retreat(2층) → best 2, 해금 없음, items 변화 없음
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `run.js`
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: run state (floors, loot, outcomes, unlocks)`

---

### Task 3: 전투에 계단 · 상자 · 보스 · 시작 HP

**Files:**
- Modify: `src/core/battle.js`, `src/core/pathfind.js`
- Test: `tests/battle.test.js`

**Interfaces:**
- Produces:
  - `createBattle(mapDef, party, { hpRatio = {} } = {})` — 아군 hp = `hpRatio[species] ? max(1, floor(maxHp × r)) : maxHp`; `state.stairs`, `state.chests`(복사), `state.bossFloor = enemies.some(boss)`; 유닛에 `boss: true` 유지; `state.log = { exp: {}, fainted: [], loot: [] }`
  - 아군이 기절하면 `log.fainted` 에 종족 추가 (중복 없음)
  - `arrive(state, unitId) => { stairs: boolean, item: string | null }` — 아군만. 상자 칸이면 상자 제거·`log.loot.push(item)`; 계단 칸이면 `state.result = 'stairs'`
  - `checkResult`: `bossFloor` 이고 보스가 units 에 없으면 `'win'`; 그 외 기존 규칙 (계단 결과는 덮어쓰지 않음)
  - pathfind: `TILE_COST['>'] = 1`, `canEnter('>')` true
- [ ] **Step 1: Write the failing tests** (battle.test 에 추가)
  - hpRatio 0.5 → 해당 종족 hp = floor(maxHp/2), 다른 종족 full; maxHp 1 근처에서도 hp ≥ 1
  - arrive: 계단 칸 → `result === 'stairs'`; 적 유닛 arrive → 아무 일 없음
  - arrive: 상자 칸 → item 반환, `state.chests` 에서 제거, `log.loot` 기록, 두 번째 arrive 는 null
  - 보스 층: 보스 hp 1 → 격파 → `result === 'win'` (다른 적 남아 있어도)
  - 아군 기절 → `log.fainted` 에 종족
  - pathfind: 계단 칸 이동 가능
- [ ] **Step 2: Run** `node --test tests/battle.test.js tests/pathfind.test.js` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: stairs, chests, boss and starting hp in battle`

---

### Task 4: 저장 v2 + v1 이전

**Files:**
- Modify: `src/core/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- Produces:
  - `newGame()` → `{ version: 2, party, items: { evoStone: 0 }, unlocked: ['sinnoh-field'], best: {}, cleared: [], run: null }`
  - `loadGame` 이 version 1 을 받으면 이전(스펙 §6), 2 는 그대로 정리. `run` 은 `dungeonId` 가 실제 던전이고 floor 가 1..floors 일 때만 유지(아니면 null). unlocked 는 실제 던전 id 만, 최소 `['sinnoh-field']`.
- [ ] **Step 1: Write the failing tests**
  - v2 왕복 (run 포함: dungeonId, floor 3, seed, faintedLast, loot) → deepEqual
  - **(Review Focus 4)** v1 저장(party·items·cleared ['sinnoh-field']) → version 2, party·items 유지, unlocked ['sinnoh-field'], cleared [], run null
  - 잘못된 run(없는 던전, floor 99) → run null, 나머지 유지
  - 기존 save 테스트(깨진 JSON, 프로토타입 키 등) 그대로 통과
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: save v2 with run state and v1 migration`

---

### Task 5: 테마 타일 · 계단/상자 그리기 · 전투 장면 처리

**Files:**
- Modify: `src/render/tiles.js`, `src/game/states.js`, `src/render/ui.js`
- Test: `tests/game.test.js`

**Interfaces:**
- Produces:
  - `drawMap(ctx, grid, time, camX, camY, viewW, viewH, theme = 'field')` — cave 팔레트(스펙 §3.1), 계단 `>` 도트, 캐시는 테마별
  - `drawChest(ctx, x, y)` (tiles.js, 월드 좌표 타일)
  - states.js: `createGame({ rng, map, party, hpRatio, theme, onExit })`; 아군 이동이 끝나면 `arrive()` — item 이 있으면 대사 "보물상자를 열었다! ○○을/를 얻었다!"(진화의돌 / 경험 사탕) 후 행동 메뉴, `stairs` 면 대사 "계단을 찾았다!" 후 즉시 결과 처리(행동 메뉴·취소 없음); `onExit(result, log)` 에 `'stairs'` 포함
  - 결과 화면 문구: `stairs` = "다음 층으로!", 보스 격파 = "보스를 쓰러뜨렸다!"
  - 정보창: 보스면 이름 옆 빨간 "보스" 표시
- [ ] **Step 1: Write the failing test** (game.test)
  - 계단 바로 옆 아군 → 계단으로 이동 확정 → 대사 넘김 → `mode === 'result'`, 결과 확정 후 `onExit('stairs', log)`; **(Review Focus 2)** 이동 직후 cancel 을 보내도 결과가 'stairs'
  - 상자 칸으로 이동 → `log.loot` 1개, 그 뒤 행동 메뉴가 열림
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Verify** 브라우저(패널 숨김이면 루프 수동 진행 + 캔버스 픽셀): 동굴 테마·계단·상자가 그려짐
- [ ] **Step 6: Commit** `feat: themed tiles, stairs and chests in battle scene`

---

### Task 6: 던전 선택 · 층 메뉴 장면

**Files:**
- Create: `src/game/dungeonSelect.js`, `src/game/floorMenu.js`
- Delete: `src/game/stageSelect.js`, `src/data/stages.js`
- Test: `tests/town.test.js` (stage select 테스트를 던전 선택으로 교체)

**Interfaces:**
- Produces:
  - `createDungeonSelect({ game, onStart: (dungeonId) => void, onResume: () => void, onBack })` — 목록: (run 있으면) "탐험 이어하기 (이름 B{floor}F)" + 던전들(잠김이면 회색 + "○○ 돌파 시 해금", 최고 기록 "최고 B3F", 돌파면 ★). 다른 던전 선택 시 run 이 있으면 확인 [예/아니요](기본 아니요) → 예: `onStart(id)` (포기 처리는 호출 측)
  - `createFloorMenu({ lines, options: string[], onPick: (index) => void })` — 대사 + 선택 메뉴 (CHOICE_LOCK 0.4초 재사용). 용도: 층 사이 [다음 층으로, 마을로 돌아가기], 재개 확인 [예, 아니요], 돌파/전멸 안내 [확인]
- [ ] **Step 1: Write the failing tests**
  - 잠긴 동굴 선택 불가, `unlocked` 에 추가하면 선택 → onStart('sinnoh-cave')
  - run 있음 → 첫 항목 선택 → onResume
  - **(Review Focus 5)** run 있는데 들판 선택 → 확인창, 기본 아니요(연타 시 onStart 없음), 예 → onStart
  - floorMenu: 잠금 중 연타 무시, 이후 dir+confirm → onPick(1)
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**, 옛 파일 삭제
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: dungeon select and floor menu scenes`

---

### Task 7: 탐험 흐름 연결 · 재개 · 문서

**Files:**
- Modify: `src/main.js`, `src/game/title.js`, `src/game/results.js`, `README.md`, `docs/ROADMAP.md`

**Interfaces:**
- Consumes: Task 1–6 전부
- Produces (main.js 흐름, 스펙 §5):
  - `startFloor()`: `game.run` 기준 `generateFloor(dungeon, floor, floorSeed(run))` → 저장 → 배너 "이름 B{n}F" → `createGame({ map, party, hpRatio: floorStartHp(run), theme, onExit })`
  - onExit → `log.loot` 을 `addLoot` → `createResults({ game, result, log, firstClear: false })` → 진화 체인 → `afterFloor` → next: floorMenu[다음 층으로 → run 갱신 후 startFloor / 마을로 → settleLoot·finishRun('retreat')·저장·사탕 경험치 결산 후 마을], cleared: 같은 지급 + "○○을 돌파했다!" + 해금 안내, wiped: "눈앞이 캄캄해졌다…" + finishRun(wiped)·저장 → 마을
  - 사탕 경험치는 `createResults({ result: 'loot', log: { exp } })` 로 한 번 더 결산(제목 "탐험 보상")
  - 진행 중 탐험 포기(던전 선택에서 다른 던전 확정): `finishRun(game, run, 'wiped')` 후 새 `startRun` — 보물 미지급
  - 타이틀 이어하기: run 있으면 floorMenu["탐험을 이어서 할까?", 예/아니요] → 예 = startFloor, 아니요 = 마을
  - results.js: `result` 가 `'stairs'`·`'loot'` 일 때 제목 문구 ("층 돌파!", "탐험 보상")
- [ ] **Step 1: Implement**
- [ ] **Step 2: Run** `npm test` → PASS
- [ ] **Step 3: Verify** 브라우저 (배율·레벨을 임시로 올려서): 들판 1→5층(계단·상자·보스), 귀환 경로, 전멸 경로, 동굴 해금·테마, 3층에서 새로고침 → 이어하기 → 같은 맵(타일 문자열 비교). 확인 후 임시 값 원복
- [ ] **Step 4: Docs** README(게임 흐름·던전·저장), ROADMAP(던전 완료 표시, 다음: 동료 영입 등)
- [ ] **Step 5: Commit** `feat: roguelike dungeon runs with resume`

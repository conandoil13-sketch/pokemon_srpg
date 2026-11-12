# Pokémon SRPG Browser Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 끝까지 플레이 가능한 4 vs 5 포켓몬 SRPG 전투 1판 (DS 해상도 도트, 타입 상성, 적 AI, 배틀 컷인, 교체 가능한 스프라이트).

**Architecture:** 빌드 없는 ES 모듈. `core/`(순수 규칙, node:test로 검증) ← `game/`(상태 머신·입력) → `render/`(캔버스 그리기). `data/`는 정적 정의.

**Tech Stack:** Vanilla JS (ES2022 modules), HTML5 Canvas 2D, Node 20+ `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-12-pokemon-srpg-demo-design.md`

## Global Constraints

- 내부 해상도 256×192, 정수 배율 확대(최소 2), `image-rendering: pixelated`, `ctx.imageSmoothingEnabled = false`.
- 타일 16×16, 맵 16×12. 좌표는 `{x, y}`, 그리드 접근은 `grid[y][x]`.
- 레벨 50 고정. 실능력치: HP = 종족값 + 75, 그 외 = 종족값 + 20 (IV31/EV0 근사).
- 게임 내 텍스트는 영어. 문서·주석은 한국어.
- 공식 스프라이트 파일을 저장소에 넣지 않는다. `assets/sprites/{icons,front,back}/` 는 `.gitkeep` 만.
- `core/` 와 `data/` 는 DOM·캔버스 API를 import/참조하지 않는다.
- 외부 의존성 0. `package.json` 은 `"type": "module"` 과 `"test": "node --test tests/"` 만.
- 이 폴더는 git 저장소가 아니다. 각 Task의 Commit 단계는 사용자가 `git init` 한 경우에만 수행한다.

## Review Focus

1. **면역 상대** (예: Earthquake → Honchkrow): AI는 데미지 0 조합을 고르지 않는다. 플레이어가 고르면 "It doesn't affect ..." 표시 후 HP 변화 없음. → Task 5 테스트.
2. **적 페이즈 도중 아군 전멸**: 즉시 패배 화면, 남은 적 행동은 실행하지 않는다. → Task 4 테스트(`checkResult`) + Task 7 처리.
3. **완전히 포위된 유닛**: 이동 가능 칸이 제자리뿐이어도 선택·행동 메뉴가 열린다. → Task 3 테스트.
4. **이동 후 사거리 안에 적이 없음**: 행동 메뉴에 `Wait` 만 활성, 기술은 회색. → Task 7 수동 검증 항목.
5. **연출 중·맵 밖 입력**: 컷인/배너 재생 중과 캔버스 밖 클릭은 게임 상태를 바꾸지 않는다(컷인 중 confirm은 메시지 넘김만). → Task 7/8 수동 검증 항목.

---

## File Structure

```
index.html                 캔버스, CSS, main.js 로드
package.json
README.md                  실행법, 스프라이트 넣는 법
src/data/types.js          TYPES, TYPE_COLORS, typeMultiplier
src/data/moves.js          MOVES
src/data/species.js        SPECIES, validateData
src/data/map.js            MAP (tiles + 배치)
src/core/rng.js            createRng
src/core/damage.js         calcDamage, hitChance, expectedDamage
src/core/pathfind.js       TILE_COST, canEnter, reachable, tilesInRange, manhattan
src/core/battle.js         createBattle, unitAt, moveUnit, applyAttack, endPhase, checkResult, spec
src/core/ai.js             enemyTurnOrder, planEnemyAction
src/render/screen.js       createScreen
src/render/font.js         drawText, textWidth
src/render/tiles.js        drawMap
src/render/sprites.js      loadSprites, drawIcon, drawBattleSprite
src/render/ui.js           drawWindow, drawHpBar, drawMenu, drawUnitInfo, drawBanner, drawHighlights
src/render/cutin.js        createCutin
src/game/input.js          bindInput
src/game/states.js         createGame
src/main.js                부트스트랩 + rAF 루프
tests/*.test.js
assets/sprites/{icons,front,back}/.gitkeep
```

---

### Task 1: 프로젝트 골격 + 정적 데이터

**Files:**
- Create: `package.json`, `src/data/types.js`, `src/data/moves.js`, `src/data/species.js`, `src/data/map.js`, `assets/sprites/{icons,front,back}/.gitkeep`
- Test: `tests/data.test.js`

**Interfaces:**
- Produces:
  - `TYPES: string[]` — 소문자 18개 (`normal fire water electric grass ice fighting poison ground flying psychic bug rock ghost dragon dark steel fairy`)
  - `TYPE_COLORS: Record<string,string>` — 각 타입 대표 hex
  - `typeMultiplier(atkType: string, defTypes: string[]) => number` — 6세대 이후 상성표, 이중 타입 곱
  - `MOVES: Record<string, {id,name,type,category:'physical'|'special',power,accuracy,range:[number,number]}>`
  - `SPECIES: Record<string, {key,dex,name,types,stats:{hp,atk,def,spa,spd,spe},move,moves:string[]}>` (stats는 **실능력치**)
  - `validateData() => void` — 모든 species.moves가 MOVES에 있고 types가 TYPES에 있는지 검사, 아니면 throw
  - `MAP: {tiles: string[], allies: {species,x,y}[], enemies: {species,x,y}[]}`

**데이터 값 (spec §8 고정):**

기술 (id / Name / type / cat / power / acc / range):
```
flamethrower Flamethrower fire special 90 100 [1,2]
closecombat Close Combat fighting physical 120 100 [1,1]
machpunch Mach Punch fighting physical 40 100 [1,1]
surf Surf water special 90 100 [1,2]
flashcannon Flash Cannon steel special 80 100 [1,2]
drillpeck Drill Peck flying physical 80 100 [1,1]
woodhammer Wood Hammer grass physical 120 100 [1,1]
earthquake Earthquake ground physical 100 100 [1,1]
razorleaf Razor Leaf grass physical 55 95 [1,2]
thunderbolt Thunderbolt electric special 90 100 [1,2]
crunch Crunch dark physical 80 100 [1,1]
spark Spark electric physical 65 100 [1,1]
aurasphere Aura Sphere fighting special 80 100 [2,3]
dragonclaw Dragon Claw dragon physical 80 100 [1,1]
nightslash Night Slash dark physical 70 100 [1,1]
darkpulse Dark Pulse dark special 80 100 [1,2]
energyball Energy Ball grass special 90 100 [1,2]
sludgebomb Sludge Bomb poison special 90 100 [1,2]
shadowball Shadow Ball ghost special 80 100 [2,3]
psychic Psychic psychic special 90 100 [1,2]
```

종족 (key / dex / types / 종족값 hp-atk-def-spa-spd-spe / 이동력 / moves):
```
infernape 392 fire,fighting      76-104-71-104-71-108  5 flamethrower,closecombat,machpunch
empoleon  395 water,steel        84-86-88-111-101-60   4 surf,flashcannon,drillpeck
torterra  389 grass,ground       95-109-105-75-85-56   3 woodhammer,earthquake,razorleaf
luxray    405 electric           80-120-79-95-79-70    5 thunderbolt,crunch,spark
lucario   448 fighting,steel     70-110-70-115-70-90   5 aurasphere,flashcannon,closecombat
garchomp  445 dragon,ground      108-130-95-80-85-102  5 earthquake,dragonclaw,crunch
honchkrow 430 dark,flying        100-125-52-105-52-71  6 nightslash,drillpeck,darkpulse
roserade  407 grass,poison       60-70-65-125-105-90   4 energyball,sludgebomb,shadowball
bronzong  437 steel,psychic      67-89-116-79-116-33   3 flashcannon,psychic,earthquake
```
`stats` 에는 위 공식으로 변환한 실능력치를 저장한다(예: infernape hp 151, atk 124).

맵 (`.` 풀, `"` 수풀, `^` 바위산, `~` 물, `#` 벽):
```
..""....~~...^^.
.."....~~....^..
.......~~..""...
..^^...~~..""...
..^....~~....#..
................
.......""...#...
..#....~~.......
.......~~..^^...
.""....~~..^....
.""...~~~...""..
......~~~.......
```
배치 — allies: infernape(2,5) empoleon(1,3) torterra(1,7) luxray(2,8) / enemies: lucario(13,5) garchomp(12,3) honchkrow(14,1) roserade(13,9) bronzong(12,7)

- [ ] **Step 1: Write the failing test** `tests/data.test.js`
  - `typeMultiplier('fire',['grass']) === 2`, `('water',['fire','ground']) === 4`, `('ground',['flying']) === 0`, `('fighting',['ghost']) === 0`, `('electric',['grass','ground']) === 0`, `('fire',['water','steel']) === 1`, `('normal',['normal']) === 1`
  - `TYPES.length === 18`; 모든 TYPES에 `TYPE_COLORS` 존재
  - `validateData()` 가 throw 하지 않음
  - `SPECIES.infernape.stats` 가 `{hp:151, atk:124, def:91, spa:124, spd:91, spe:128}`
  - `MAP.tiles.length === 12`, 각 행 길이 16, 문자는 `.\"^~#` 만
  - 모든 배치 좌표의 타일이 `#` 또는 `~` 가 아니고 좌표 중복 없음
- [ ] **Step 2: Run** `npm test` → FAIL (모듈 없음)
- [ ] **Step 3: Implement** 위 Interfaces와 데이터 값대로 4개 data 파일 + `package.json` + `.gitkeep` 3개
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: data definitions (types, moves, species, map)`

---

### Task 2: RNG + 데미지 계산

**Files:**
- Create: `src/core/rng.js`, `src/core/damage.js`
- Test: `tests/damage.test.js`

**Interfaces:**
- Consumes: `SPECIES`, `MOVES`, `typeMultiplier`
- Produces:
  - `createRng(seed: number) => () => number` — mulberry32, [0,1)
  - 유닛 형태(이 Task부터 공통): `{id: string, species: string, side: 'ally'|'enemy', x, y, hp, maxHp, moved: boolean, acted: boolean}`
  - `hitChance(attacker, defender, move, defTile: string) => number` — 0..100. 회피 = (defTile === '"' ? 15 : 0) + max(0, floor((defSpe − atkSpe)/10)), 회피 상한 30. 결과 = clamp(accuracy − 회피, 0, 100)
  - `calcDamage(attacker, defender, move, {rng, defTile}) => {hit: boolean, crit: boolean, typeMult: number, damage: number}` — 순서: 명중 판정(rng()*100 < hitChance) → 급소(rng() < 1/16) → 난수(0.85 + rng()*0.15). spec §4.4 공식, 바위산(`^`)이면 D ×1.2, typeMult 0 → damage 0, 그 외 최소 1. 빗나가면 damage 0.
  - `expectedDamage(attacker, defender, move, defTile) => number` — 난수 0.925, 급소 없음, × hitChance/100

- [ ] **Step 1: Write the failing test**
  - `createRng(1)` 두 번 만든 시퀀스 앞 5개 동일, 값은 모두 [0,1)
  - 고정 rng `() => 0` (명중·급소·최소난수) : infernape `flamethrower` → torterra: `typeMult === 2`, `hit === true`, `crit === true` (0 < 1/16) — 데미지 > 0
  - rng `() => 0.99`: 빗나감 아님(acc 100, 회피 0일 때 hitChance 100 → 99 < 100 hit), 급소 아님
  - garchomp `earthquake` → honchkrow: `damage === 0`, `typeMult === 0`
  - 같은 rng 시퀀스로 수풀 위 방어자의 `hitChance` 가 풀 위보다 15 낮다
  - 바위산 방어자 `expectedDamage` < 풀 방어자
  - STAB·상성 반영: luxray `thunderbolt` → empoleon 의 `expectedDamage` 가 spec §4.4 공식(STAB 1.5, typeMult 2, 난수 0.925, 명중 100%)으로 테스트 안에서 직접 계산한 값과 ±1 이내
  - typeMult > 0 이고 아주 약한 공격도 hit 시 damage ≥ 1
- [ ] **Step 2: Run** `node --test tests/damage.test.js` → FAIL
- [ ] **Step 3: Implement** `rng.js`, `damage.js` (spec §4.4, 이 Task의 Interfaces 그대로)
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: damage calculation and seeded rng`

---

### Task 3: 이동 범위 / 사거리

**Files:**
- Create: `src/core/pathfind.js`
- Test: `tests/pathfind.test.js`

**Interfaces:**
- Consumes: `SPECIES`
- Produces:
  - `TILE_COST: Record<string, number>` — `.`1 `"`1 `^`2 `~`1 `#`Infinity
  - `canEnter(tile: string, speciesKey: string) => boolean` — `~` 는 types에 water 또는 flying 있을 때만, `#` 불가
  - `reachable(grid: string[], units: Unit[], unit: Unit) => Map<string, number>` — 키 `"x,y"`, 값 누적 비용. 다익스트라/BFS, 예산 = 종족 이동력. 같은 편 칸 통과 가능·정지 불가, 다른 편 칸 진입 불가. 시작 칸은 항상 포함(비용 0).
  - `tilesInRange(x, y, [min, max], w, h) => {x,y}[]` — 맨해튼 거리 min..max, 맵 안만
  - `manhattan(a: {x,y}, b: {x,y}) => number`

- [ ] **Step 1: Write the failing test** (작은 5×5 그리드 직접 정의)
  - 풀만 있는 맵, 이동력 3 유닛 중앙: 도달 칸 수 = 맨해튼 ≤3 마름모 중 맵 안 칸 수
  - 바위산 칸 진입 비용 2가 누적됨 (`get("x,y") === 2`)
  - torterra 는 `~` 칸 키가 없고, empoleon·honchkrow 는 있음
  - 적 유닛 칸 뒤쪽은 우회 경로 없으면 도달 불가
  - 아군 칸은 통과해 뒤로 갈 수 있지만 그 칸 자체는 결과에 없음
  - **(Review Focus 3)** 사방이 적/벽으로 막힌 유닛: 결과 크기 1, 시작 칸 포함
  - `tilesInRange(0,0,[2,3],16,12)` 에 (0,0),(1,0) 없음, (2,0),(1,2),(0,3) 있음
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `pathfind.js`
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: movement range and attack range`

---

### Task 4: 전투 상태

**Files:**
- Create: `src/core/battle.js`
- Test: `tests/battle.test.js`

**Interfaces:**
- Consumes: `MAP`, `SPECIES`, `MOVES`, `calcDamage`
- Produces:
  - `createBattle(mapDef = MAP) => State` — `State = {grid: string[], width: 16, height: 12, units: Unit[], phase: 'player'|'enemy', turn: 1, result: null|'win'|'lose'}`. unit id = `${side}-${species}`, hp = maxHp = stats.hp
  - `spec(unit) => SpeciesDef` — `SPECIES[unit.species]`
  - `unitAt(state, x, y) => Unit | undefined`
  - `moveUnit(state, id, x, y) => void` — 좌표 갱신, `moved = true`
  - `applyAttack(state, attackerId, targetId, moveId, rng) => {hit, crit, typeMult, damage, fainted: boolean}` — hp 감소(0 하한), 기절 시 units에서 제거, 공격자 `acted = true`, 그 후 `checkResult` 호출
  - `endPhase(state) => void` — phase 토글, 새 phase 편의 moved/acted 초기화, enemy→player 전환 시 `turn++`
  - `checkResult(state) => null|'win'|'lose'` — 적 0 → 'win', 아군 0 → 'lose', `state.result` 에도 저장

- [ ] **Step 1: Write the failing test**
  - `createBattle()` 유닛 9개, 아군 4·적 5, 모두 hp === maxHp, phase 'player', turn 1
  - `moveUnit` 후 `unitAt` 이 새 좌표에서 찾음
  - 적 hp 1로 설정 후 `applyAttack`(rng `()=>0`) → `fainted === true`, units 에서 빠짐
  - 면역 공격 → hp 불변, `fainted === false`
  - `endPhase` 두 번 → phase 'player', turn 2, 아군 플래그 초기화
  - **(Review Focus 2)** 아군 1마리만 남기고 그 유닛을 기절시키면 `state.result === 'lose'`
  - 적 전멸 시 `'win'`
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `battle.js`
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: battle state transitions`

---

### Task 5: 적 AI

**Files:**
- Create: `src/core/ai.js`
- Test: `tests/ai.test.js`

**Interfaces:**
- Consumes: `reachable`, `tilesInRange`, `manhattan`, `expectedDamage`, `hitChance`, `spec`, `unitAt`, `MOVES`
- Produces:
  - `enemyTurnOrder(state) => Unit[]` — 적 유닛, 스피드 내림차순
  - `planEnemyAction(state, unit) => {moveTo: {x,y}, attack: {moveId, targetId} | null}`

**점수 (spec §5):** `score = exp + (exp >= target.hp ? 100 : 0) − 0.5 × threat(tile)`
- `exp = expectedDamage(unit, target, move, targetTile)`; **exp === 0 인 조합은 후보에서 제외** (Review Focus 1)
- `threat(tile)` = 각 아군에 대해 (아군 reachable 칸 중 하나에서 그 아군 기술 사거리에 tile 이 들어오면) 그 기술의 `expectedDamage(ally, unit, move, tile)` 최댓값
- 동점은 reachable 순회 순서상 먼저 나온 것
- 공격 후보가 없으면: 각 reachable 칸에서 가장 가까운 아군까지 맨해튼 거리 최소인 칸으로 이동, attack null

- [ ] **Step 1: Write the failing test** (작은 맵 직접 구성)
  - 사거리 안에 hp 1 아군과 hp 만땅 아군 → hp 1 대상 선택
  - **(Review Focus 1)** 적 garchomp 옆에 `species: 'honchkrow', side: 'ally'` 인 테스트 유닛만 있으면 `earthquake` 를 고르지 않는다 (`attack.moveId` 가 `crunch` 또는 `dragonclaw`)
  - 아군이 멀어 공격 불가 → `attack === null`, `manhattan(moveTo, 가장 가까운 아군)` 이 시작 위치보다 작음
  - `enemyTurnOrder(createBattle())` 첫 유닛이 garchomp(spe 122)
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `ai.js`
- [ ] **Step 4: Run** → PASS (`npm test` 전체도 PASS)
- [ ] **Step 5: Commit** `feat: enemy ai`

---

### Task 6: 렌더 기초 (화면·폰트·타일·스프라이트)

**Files:**
- Create: `index.html`, `src/render/screen.js`, `src/render/font.js`, `src/render/tiles.js`, `src/render/sprites.js`, `src/main.js`(임시: 맵 + 유닛 아이콘만 그림)

**Interfaces:**
- Consumes: `createBattle`, `SPECIES`, `TYPE_COLORS`
- Produces:
  - `createScreen(canvas) => {ctx, getScale: () => number}` — 256×192, 창 크기 변화 시 CSS 크기를 `최대 정수 배율(최소 2)` 로 갱신
  - `drawText(ctx, text, x, y, color = '#303030', shadow = '#d0d0d0') => void` / `textWidth(text) => number` — 내장 5×7 비트맵(A–Z a–z 0–9 `.,!?'-:/()%`), 글자 폭 6px. 4~5세대식 그림자(오른쪽·아래 1px)
  - `drawMap(ctx, grid, time) => void` — 타일별 도트 그리기(풀 2톤 패턴, 수풀 잎 모양, 바위산 음영, 물은 `time` 기반 2프레임 물결, 벽은 나무)
  - `loadSprites(speciesKeys: string[]) => Promise<void>` — `assets/sprites/{icons,front,back}/{dex}.png` 시도, 실패는 캐시에 null + 경고 1회
  - `drawIcon(ctx, speciesKey, px, py, frame: 0|1) => void` — (px,py)는 칸 왼쪽 위. 시트의 프레임 크기 = 높이, 프레임 수 = 너비/높이. 프레임이 32px 이하면 1배, 초과면 32px 이하가 되는 정수로 축소. 칸의 **하단 중앙**에 발을 맞춰 그리므로 위로 최대 16px 넘칠 수 있다(DS 맵 아이콘 느낌). 폴백 아이콘은 24px
  - `drawBattleSprite(ctx, speciesKey, 'front'|'back', cx, bottomY, size = 64) => void` — 하단 중앙 기준, nearest 정수 배율
  - 폴백 도트(이미지 null): 종족 타입1 색 몸통 + 타입2 색 포인트, 테두리 진한 색, 눈 2개. `key` 해시로 귀/꼬리 모양 4종 중 선택해 개체 구분. 아이콘·배틀 모두 같은 함수가 크기만 달리 생성(오프스크린 캔버스 캐시)

- [ ] **Step 1: Implement** 위 파일들. `index.html` 은 `<canvas id="game" width="256" height="192">`, 검은 배경 중앙 정렬, `<script type="module" src="src/main.js">`
- [ ] **Step 2: Verify** 정적 서버(`python3 -m http.server 8000`) + 브라우저 패널에서 `http://localhost:8000` 스크린샷
  Expected: 맵 전체, 9개 유닛 폴백 도트가 배치 좌표에 보임, 픽셀 번짐 없음, 콘솔 오류는 스프라이트 404 경고뿐
- [ ] **Step 3: Verify 스프라이트 교체** 스크래치패드에서 32×32 ×2 프레임 테스트 PNG를 만들어 `assets/sprites/icons/392.png` 로 잠시 넣고 새로고침 → 해당 유닛만 교체되는지 확인 후 **파일 삭제**
- [ ] **Step 4: Commit** `feat: pixel renderer, map tiles, sprite registry`

---

### Task 7: UI + 상태 머신 + 입력 (플레이 가능)

**Files:**
- Create: `src/render/ui.js`, `src/game/input.js`, `src/game/states.js`
- Modify: `src/main.js` (게임 루프로 교체)

**Interfaces:**
- Consumes: Task 3–6 전부
- Produces:
  - `drawWindow(ctx, x, y, w, h) => void` — 흰 바탕, 2px 진한 테두리, 둥근 모서리(모서리 1px 깎기)
  - `drawHpBar(ctx, x, y, w, hp, maxHp) => void` — >50% `#40c840`, >20% `#f8c800`, else `#f04040`
  - `drawMenu(ctx, items: {label, enabled}[], selected, x, y) => void` — ▶ 커서, 비활성 회색
  - `drawUnitInfo(ctx, unit) => void` — 이름, 타입 배지(TYPE_COLORS), HP 바, `hp/maxHp`. 커서가 화면 왼쪽 절반이면 오른쪽 위, 아니면 왼쪽 위
  - `drawBanner(ctx, text, t: 0..1) => void` — 페이즈 배너 슬라이드 인/아웃
  - `drawHighlights(ctx, tiles: {x,y}[], color) => void` — 반투명 칸
  - `bindInput(canvas, getScale, onEvent) => void` — 이벤트: `{type:'cursor', x, y}`(마우스 이동, 타일 좌표, 맵 밖이면 발생 안 함) `{type:'click'}` `{type:'confirm'}`(Z/Enter) `{type:'cancel'}`(X/Esc/우클릭, 컨텍스트 메뉴 차단) `{type:'dir', dx, dy}`(방향키) `{type:'endTurn'}`(E)
  - `createGame({rng}) => {handle(event), update(dt), draw(ctx, time)}` — 내부에 `createBattle()` 보유

**상태 머신 (spec §7):**
`title → bannerPlayer → idle → unitSelected → actionMenu → targetSelect → animating → idle … → (모든 아군 acted 또는 endTurn) → bannerEnemy → enemyTurn → bannerPlayer …`, 결과 시 `result`(Win/Lose 창, confirm으로 재시작).
- idle: 아군 미행동 유닛 confirm/click → unitSelected (파랑 = reachable, 빨강 = 거기서 닿는 공격 범위)
- unitSelected: 파랑 칸 confirm → 이동(타일당 0.06s 보간. 경로는 목표 칸에서 시작해 reachable 맵 안의 인접 칸 중 비용이 가장 작은 칸으로 역추적해 만든다. 벽·물 위로 미끄러지지 않게) → actionMenu. cancel → idle
- actionMenu: 기술 목록(현재 칸에서 사거리 내 적이 있으면 enabled) + `Wait`. cancel → **원위치 복귀** 후 unitSelected
- targetSelect: 해당 기술 사거리 내 적만 순환(방향키/클릭), 명중률·예상 데미지 미리보기 창, confirm → animating(Task 8 전까지는 즉시 `applyAttack` + 1초 메시지 창으로 대체)
- enemyTurn: `enemyTurnOrder` 순서로 유닛마다 이동 보간 → 공격 연출 → 다음. **각 행동 후 `state.result` 가 있으면 즉시 result 로** (Review Focus 2)
- animating/배너/enemyTurn 중 입력은 무시 (Review Focus 5)
- 맵 그리기 순서: `drawMap` → 하이라이트 → 유닛(y 오름차순, 발밑 타원 표식 아군 `#3870f8`/적 `#f83838`, 아이콘 frame = `floor(time/0.5)%2`, `acted` 유닛은 회색 반투명 덮기) → 커서(흰 모서리 브래킷) → 정보창/메뉴

- [ ] **Step 1: Implement** 위 파일들
- [ ] **Step 2: Verify (브라우저 패널, 수동)**
  - 타이틀 → 배너 → 아군 선택 시 파랑/빨강 범위 표시
  - 이동 후 취소하면 원위치
  - **(Review Focus 4)** 적 없는 곳으로 이동 → 기술 회색, Wait 만 선택 가능
  - 공격 → HP 감소, 상성 메시지(`It's super effective!` / `It's not very effective...` / `It doesn't affect X...`)
  - E 로 턴 종료 → 적 페이즈에서 적들이 접근/공격
  - **(Review Focus 5)** 적 페이즈·메시지 중 클릭 연타해도 상태 깨지지 않음
  - JS 콘솔에서 적 hp를 1로 만들고 끝까지 진행 → Win 창, confirm → 재시작
- [ ] **Step 3: Commit** `feat: playable battle loop`

---

### Task 8: 배틀 컷인

**Files:**
- Create: `src/render/cutin.js`
- Modify: `src/game/states.js` (animating 및 적 공격에 컷인 사용)

**Interfaces:**
- Consumes: `drawBattleSprite`, `drawWindow`, `drawHpBar`, `drawText`, `applyAttack` 결과
- Produces:
  - `createCutin({attacker: Unit, defender: Unit, move, result, hpBefore: number}) => {update(dt), draw(ctx), advance(), done: boolean}`
  - 연출 타임라인(spec §6): 슬라이드 인 0.25s → 공격자 전진 0.2s → (hit 시) 대상 깜빡임 0.3s → HP 바 감소 0.5s → 메시지들(`X used MOVE!` → `A critical hit!`/상성/`X missed!` → 기절 시 `X fainted!` + 대상 아래로 0.3s) 각 메시지는 `advance()` 또는 1.2s 자동 → 슬라이드 아웃 0.2s → `done = true`
  - 레이아웃: 하늘색→연녹 그라데이션 배경, 받침대 타원 2개(좌하 공격자 back, 우상 대상 front, 64px), 상단 왼쪽 대상 HP 창, 하단 오른쪽 공격자 HP 창, 맨 아래 메시지 창 256×48. 아군이 공격받을 때도 "아군이 back" 규칙 유지(공격자/대상 위치를 아군 기준으로 고정)
  - `applyAttack` 은 컷인 시작 **전에** 호출하고 컷인은 결과만 재생한다(로직과 연출 분리)

- [ ] **Step 1: Implement** `cutin.js`, states 연결 (Task 7의 임시 메시지 창 제거)
- [ ] **Step 2: Verify (브라우저 패널)** 아군 공격·적 공격·빗나감·급소·기절 각각 스크린샷 1장씩. confirm 연타로 메시지만 넘어가고 상태 이상 없음
- [ ] **Step 3: Commit** `feat: battle cut-in`

---

### Task 9: README + 전체 검증

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README** — 실행(`python3 -m http.server 8000` → `http://localhost:8000`, `file://` 로는 안 되는 이유), 조작키, 스프라이트 넣는 법(spec §2 표 그대로 + 파일명은 도감번호 정수), 공식 스프라이트를 저장소에 커밋하지 말 것, 테스트(`npm test`)
- [ ] **Step 2: Run** `npm test` → 전체 PASS
- [ ] **Step 3: Verify** 브라우저 패널에서 타이틀부터 승리 또는 패배까지 한 판 실제 플레이, 콘솔 오류 0(스프라이트 404 경고 제외)
- [ ] **Step 4: Commit** `docs: readme`

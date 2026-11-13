# 범위 모양 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공격기마다 범위 모양(single/line/cone/around/blast)을 주고, 전투·AI·화면이 같은 계산으로 다중 대상 공격을 처리한다. 자폭 계열은 쓴 쪽이 기절, 찌리리공·붐볼은 자폭이 주 기믹.

**Architecture:** 모양은 기술 데이터(`move.shape`, `move.friendlyFire`, `move.aimRange`). 맞는 칸 계산은 순수 모듈 `src/core/shapes.js` 하나. 예외는 순수 JSON `src/data/moveShapes.json` (2단계 조정 페이지가 통째로 다시 씀).

**Tech Stack:** vanilla ES modules, Canvas 2D, `node --test` (Node 24, `import … with { type: 'json' }`).

**Spec:** `docs/superpowers/specs/2026-11-13-move-shapes-design.md`

## Global Constraints

- 방향 4개 `'up'|'down'|'left'|'right'`. 거리는 맨해튼, around 만 대각선 포함(체비쇼프).
- line 기본 length 3, 벽 `#` 에서 멈춤(그 칸 미포함). cone = 앞1, 앞1의 양옆, 앞2 (4칸). around radius 1 = 8칸. blast 조준 range 기본 [2,3], 착탄 + 십자 5칸.
- 다른 모양은 지형 무시. 사용자 자신은 절대 안 맞음. friendlyFire 는 target `all-other-pokemon` 만.
- 맞는 유닛 2 이상 → 각자 데미지 ×0.75. 명중·급소·난수·부가효과 대상별. 사용자 자신 효과(`damage-raise`)는 한 명이라도 맞으면 한 번.
- 자폭(`self-destruct`, `explosion`): 데미지 처리 뒤 사용자 기절(빗나감·대상 없음도).
- 찌리리공·붐볼: 시작 기술에 자폭 항상 포함. AI 자기 기절 감점: 찌리리공·붐볼 × 0.3, 그 외 × 2 (자기 가치 = 최선 기대 데미지 × 3).
- 규칙 목록 BEAM/BLAST/SHOT 은 스펙 §3 그대로. 기존 예외 aura-sphere·shadow-ball [2,3], razor-leaf [1,2] single 유지.
- 대사 한국어, 기존 josa 사용.

## Review Focus

1. **맵 가장자리·모서리 유닛의 line/cone 방향** — 맵 밖만 향하는 방향은 조준 목록에 없어야 하고, 모든 방향이 막히면 기술이 메뉴에서 비활성. → Task 1 shapes.test, Task 5 game.test.
2. **지진으로 아군만 맞고 적은 안 맞는 위치** — 메뉴에서 비활성(적이 하나도 안 맞음), AI 도 쓰지 않음. → Task 1/4/5.
3. **한 공격으로 여러 마리 기절(적+아군 섞임)** — 경험치는 적 기절분만, 아군은 log.fainted, 결과(win/lose) 판정 한 번에 맞게. → Task 3.
4. **자폭으로 마지막 아군 기절 + 마지막 적 기절 동시** — 결과는 'win' (적 전멸이 우선, 내 결정: 기존 checkResult 가 적 없음→win 을 먼저 보므로 그대로). → Task 3.
5. **혼란 자해·마비 실패 시 자폭 기술** — 기술이 안 나가면 사용자도 기절하지 않음. → Task 3.

---

### Task 1: 모양 데이터 · 계산

**Files:** Create `src/data/moveShapes.json`, `src/core/shapes.js`, `tests/shapes.test.js` · Modify `src/data/moves.js`, delete `src/data/moveRanges.js` (내용을 JSON 으로) · Test `tests/data.test.js`

**Interfaces — Produces:**
- `src/data/moveShapes.js`: `BEAM`, `BLAST`, `SHOT` 배열, `shapeFor(rawMove, overrides) => { shape: { type, range?, length?, radius? }, friendlyFire: boolean }`
- 각 공격기: `move.shape`, `move.friendlyFire`, `move.aimRange` (single/blast 의 조준 사거리, 그 외 null), `move.range` = coverage `[lo, hi]` (single [lo,hi], blast [lo, hi+1], line [1,length], cone [1,2], around [1,2]). 변화기는 기존 그대로(`shape: null`).
- `src/core/shapes.js`:
  - `DIRS = ['up','down','left','right']`
  - `tilesOf(state, user, move, aim) => {x,y}[]` (aim: `{ unitId }` | `{ dir }` | `{ self: true }` | `{ x, y }`)
  - `unitsHit(state, user, move, aim) => Unit[]`
  - `aimsOf(state, user, move) => Aim[]` — single: 사거리 안 상대 `{unitId}`; line/cone: 맞는 칸이 하나라도 맵 안인 방향 `{dir}`; around: `[{self:true}]`; blast: aimRange 안 칸 중 적이 하나 이상 맞는 칸 `{x,y}`
  - `bestAim(state, user, move) => Aim | null` — 적 수 − 아군 수 최대, 동점은 aimsOf 순서 첫째
  - `coverage(move) => [lo, hi]`

- [ ] **Step 1: tests** — shapes.test: 빈 9×9 맵 중앙 (4,4): line right → (5,4),(6,4),(7,4); line right 에서 (6,4) 가 `#` → (5,4) 만; cone up → (4,3),(3,3),(5,3),(4,2); around → 8칸; blast (4,1) → 5칸; (0,0) 에서 line left·up 은 aimsOf 에 없음; unitsHit: 지진(around, friendlyFire) 에 아군 포함·사용자 제외, 열풍(cone) 아군 제외; blast aimsOf 는 적이 맞는 칸만; bestAim 이 적 2 를 맞히는 방향. data.test: earthquake around+friendlyFire, heat-wave cone, hydro-pump line 3, fire-blast blast aimRange [2,3], shadow-ball single [2,3], tackle single [1,1], razor-leaf single [1,2], ember single [1,2], magnitude around+friendlyFire, `moveRanges.js` 없이 동작
- [ ] **Step 2: Run** `npm test` → FAIL
- [ ] **Step 3: Implement** (JSON import: `import OVERRIDES from './moveShapes.json' with { type: 'json' };`)
- [ ] **Step 4: Run** `npm test` → PASS (기존 테스트 중 `move.range` 를 사거리로 쓰는 곳이 깨지면 aimRange 로 갱신 — Ruling 기록)
- [ ] **Step 5: Commit** `feat: move shape data and area math`

---

### Task 2: 시작 기술 — 찌리리공·붐볼 자폭

**Files:** Modify `src/core/learn.js` · Test `tests/learn.test.js`

**Interfaces:** `SIGNATURE_MOVES = { voltorb: 'self-destruct', electrode: 'self-destruct' }`; `startingMoves(learnset, level, movesData, species?)` — species 가 표에 있고 결과에 없으면 가장 오래된 칸을 그 기술로(4칸 미만이면 앞에 추가). 호출부(`makeUnit`, `newMember`)에 species 전달.

- [ ] **Step 1: tests** — voltorb Lv5 시작 기술에 self-destruct, 4개 이하; pikachu 영향 없음; makeUnit voltorb 적에 self-destruct
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: voltorb line always knows self-destruct`

---

### Task 3: 전투 — 다중 대상 · 자폭

**Files:** Modify `src/core/battle.js` · Test `tests/battle.test.js`

**Interfaces:**
- Consumes: Task 1 `unitsHit`.
- `applyMove(state, userId, moveId, aim, rng)` — aim 이 문자열이면 `{ unitId: aim }`. 공격기: `targets = unitsHit(...)`, `spread = targets.length >= 2 ? 0.75 : 1` (calcDamage 에 `{ spread }` 옵션 추가해 raw 에 곱함). 대상마다: calcDamage → HP → 기절(`knockOut(state, d, a)`; 아군이 아군/적이 적을 쓰러뜨리면 보상 없음) → 해동 → 대상 부가효과(랭크 lower·상태이상, 생존 시). 사용자 부가효과(damage-raise) 한 번(하나라도 landed). 자폭이면 마지막에 사용자 기절(`knockOut(state, a, null)` 단, 보상 없음). checkResult 한 번.
- 결과: `{ kind:'attack', hits: [{ unitId, hit, crit, typeMult, damage, fainted, hpBefore }], expGained, stageChanges, statusChanges, thawed, selfKO: boolean }`; 대상 1명이면 hits[0] 필드를 최상위에도.
- `knockOut(state, d, by)` 보상 규칙: `by` 와 d 가 같은 편이면 경험치·코인 없음.

- [ ] **Step 1: tests** — 지진: 적 둘(사용자 주변)·아군 하나 모두 피해, 각 데미지가 같은 조건 단일 대비 ≈0.75, 사용자 HP 그대로; 대상별 명중(rng 순서로 하나만 빗나감); 인파이트류는 다중 아님 — 대신 cone 기술 + 가짜 damage-raise move 객체로 자신 효과 한 번; **(RF3)** 지진으로 적 하나·아군 하나 기절 → log.exp 는 적 기절분만, log.fainted 에 아군; 자폭: 사용자 기절·log.fainted; **(RF4)** 자폭으로 마지막 적·마지막 아군 동시 기절 → result 'win'; **(RF5)** 혼란 자해로 막히면 자폭 사용자 생존; 단일 기술 결과의 최상위 hit/damage/fainted 유지
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: multi-target attacks and self-destruct`

---

### Task 4: AI

**Files:** Modify `src/core/ai.js`, `src/game/states.js`(enemy plan 실행이 aim 을 넘기도록 한 줄) · Test `tests/ai.test.js`

**Interfaces:** `planEnemyAction` 결과 `attack: { moveId, aim, targetId? }` (single 이면 targetId 도). 점수 = Σ적(`expectedDamage × spread` + 기절 시 KO_BONUS) − Σ같은 편(사용자 제외) `expectedDamage × spread × 1.5` − risk − 자폭 감점(`selfValue × (SIGNATURE ? 0.3 : 2)`, selfValue = 최선 기대 데미지 × 3). 적이 하나도 안 맞는 조준은 제외. `expectedDamage(a, d, move, tile, spread = 1)`. threatMap: 상대 이동 가능 칸에서 `coverage` 거리 안 칸(공격기만)이면 위협.

- [ ] **Step 1: tests** — 적 둘을 일렬로 놓으면 line 방향 선택; 주변에 같은 편이 있고 다른 공격기가 있으면 지진 안 씀; **(RF2)** 지진이 같은 편만 맞는 위치면 지진 안 씀; 찌리리공(자폭+몸통박치기)은 상대 둘이 주변에 있으면 자폭; 같은 상황 다른 종(예: geodude, 자폭+몸통박치기)은 몸통박치기; 기존 계획 테스트 통과; 9×9 맵 적 1마리 계획 < 50ms
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: enemy AI aims area moves`

---

### Task 5: 화면 — 조준 · 하이라이트 · 예상 창 · 연출

**Files:** Modify `src/game/states.js`, `src/render/mapAttack.js`, `src/render/ui.js` · Test `tests/game.test.js`

**Interfaces:**
- 메뉴 활성: 공격기는 `aimsOf` 중 적이 맞는 조준 존재. `attackTilesFrom` 은 `coverage` 기준.
- 조준 모드(`mode 'target'`): 상태 `aim`. single: 기존 대상 순환; line/cone: dir 키로 방향, 클릭은 그 방향 칸; blast: 방향키로 착탄 후보 순환·클릭; around: 확인 한 번. 시작은 `bestAim`. 맞을 칸 빨강, 그 위 아군은 주황 테두리.
- 예상 창: 대상 최대 3줄 `이름 명중% 데미지 min~max (기절?)`, "외 N마리", 아군 "(아군)" 빨강. 자폭이면 "사용자 기절" 표시.
- 정보창 모양 설명(`shapeLabel(move)`): "단일 1", "단일 2~3", "직선 3", "앞 부채꼴", "주변 (아군도)", "착탄 2~3 십자".
- 연출 `createMapAttack({ attacker, defenders, move, result, lookup })` (단일 호환: `defender` 도 받음): act → (line/blast 탄) → 모든 대상 동시 impact(HP 바·숫자) → 대상별 상성·급소 대사(이름 포함, 여러 명이면 "○○에게 효과가 굉장했다!") → 기절 → 부가효과 → 자폭 사용자 기절 대사.
- [ ] **Step 1: tests** — game.test: line 조준 → dir 로 방향 전환 → 확인 → 같은 줄 적 둘 HP 감소; around 기술 확인 한 번으로 사용; **(RF1)** 모서리에서 line 이 모든 방향 막히면 메뉴 비활성; **(RF2)** 지진이 아군만 맞으면 비활성; shapeLabel 6종 문자열; 자폭 사용 후 사용자 사라짐
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Verify** 브라우저: 6종 하이라이트·조준·연출, 자폭 (스크린샷; 창이 숨겨져 있으면 게임 루프 수동 진행으로 상태 확인하고 그렇다고 보고; 저장 백업·복원)
- [ ] **Step 6: Commit** `feat: area move aiming and effects`

---

### Task 6: 문서

**Files:** Modify `README.md`(전투 규칙: 범위 모양 표, 자폭), `docs/ROADMAP.md`(1단계 완료, 다음: 2단계 조정 페이지)
- [ ] **Step 1:** 작성 · **Step 2:** `npm test` → PASS · **Step 3: Commit** `docs: move shapes`

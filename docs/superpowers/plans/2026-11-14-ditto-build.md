# 메타몽 빌드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메타몽을 플레이어가 타입·능력치·기술·특성까지 직접 키우는 주인공으로 만든다 — 적이 떨어뜨리는 소모품 캡슐, 보물상자 파우더, 레벨별 능력치 상한.

**Architecture:** 순수 규칙 `src/core/dittoBuild.js` + 메타몽 멤버의 `build` (저장 v7). 전투는 유닛 `types` 필드를 새로 두고 타입을 읽는 모든 곳을 유닛 기준으로 바꾼다. 캡슐은 전투 로그의 쓰러뜨린 적 → 층 뒤 굴림 → 탐험 보상 → 가방. 빌드 화면은 박스의 메타몽 메뉴.

**Tech Stack:** vanilla ES modules, Canvas 2D, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-ditto-build-design.md` (§7 빌더 체크 뒤 정리 포함)

## Global Constraints
- 상수(한곳, `dittoBuild.js`): `POWDER_STEP = 10`, `STAT_MAX = 255`, `statCap(level) = min(600, 320 + 40 × floor(level/10))`, `CAPSULE_CHANCE = 0.15`(보스 1), `CAPSULE_BAG_MAX = 200`, `SECOND_TYPE_LEVEL = 10`, 메타몽 기본 종족값 48.
- 기본 빌드 `{ types: ['normal'], bonus: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0 }, ability: 'limber' }`.
- 파우더 id `hp|atk|def|spa|spd|spe`, 이름 체력·공격·방어·특공·특방·스피드 + "파우더".
- 캡슐 `{ kind: 'type'|'move'|'ability', value, from }` — 소모품, 쓰면 사라짐, 빠진 것 사라짐.
- 보물상자 비율: 진화의돌 15 · 파우더 10 · 사탕 45 · 코인 30. 상자 위치·수 불변.
- 빌드는 아군 메타몽(멤버에서 만든 유닛)에만. 저장 v7.
- 빌드 화면은 마을 박스에서만.

## Review Focus
1. 탐험 중(저장된 run 이 v6 형태) 게임을 v7 로 불러오면 run 보상이 깨지지 않고 캡슐·파우더 0 으로 이어짐. → Task 1 test.
2. 적 메타몽(makeUnit side enemy, species ditto)은 노말·48 그대로, 아군 빌드 영향 없음. → Task 2 test.
3. 같은 시드 층의 보물상자 위치·수는 이전과 같음(아이템 종류만 일부 파우더). → Task 3 test.
4. 기술 캡슐을 고르고 칸 선택·확인에서 취소 → 캡슐 그대로, 기술 그대로, 저장 안 됨. → Task 4 test.
5. Lv.9 메타몽에 타입 캡슐 → 첫 칸만 바꿀 수 있음, Lv.10 이 되면 두 번째 칸 추가 가능. → Task 1 test.

---

### Task 1: 빌드 규칙 · 멤버 표시 · 저장 v7

**Files:** Create `src/core/dittoBuild.js`, `tests/dittoBuild.test.js` · Modify `src/core/progress.js`, `src/core/save.js`, `src/core/run.js`, `tests/save.test.js`

**Interfaces (Produces):**
- `dittoBuild.js`: 위 상수, `POWDER_KO`, `DEFAULT_BUILD()`(새 객체), `statCap(level)`, `effectiveBase(build) => { hp, atk, … }` (48 + bonus), `bonusTotal(build)`, `canPowder(member, stat) => { ok } | { ok:false, reason:'cap'|'max' }`, `applyPowder(game, stat) => same` (가방 `game.items.powders[stat]` 1 감소, 메타몽 bonus +10; 가방 0 → 'none'), `capsuleUse(member, capsule) => { ok, slots: number[] } | { ok:false, reason:'same'|'level' }` (넣을 수 있는 칸 목록: move = 0..3 중 같은 기술 아닌 칸(빈 칸 포함, 같은 기술 있으면 'same'); type = 0 과 Lv.10 이상이면 1 (다른 칸과 같은 타입 칸 제외, 둘 다 막히면 'same'); ability = [0] (같으면 'same')), `applyCapsule(game, index, slot) => { ok } | { ok:false, reason }` (가방에서 제거, 적용), `clearSecondType(game) => { ok } | { ok:false, reason:'none' }`, `rollCapsules(defeated, rng) => capsule[]` (defeated 항목 `{ species, types, moves, ability, boss }`; 보스는 확정, 아니면 rng() < 0.15; 후보 = types + 배울 수 있는 moves(`MOVES[id].learnable || id === 'tackle'`) + ability 균등), `addCapsules(game, list) => dropped` (가방 뒤에 추가, 200 넘으면 앞에서 버리고 버린 수 반환).
- `progress.js`: `abilityOf(m)` 메타몽이면 `m.build.ability`; `typesOfMember(m)` 메타몽이면 `m.build.types` 아니면 종 타입. `newMember('ditto')` 는 `build: DEFAULT_BUILD()`.
- `save.js` v7: §2-6 그대로(메타몽 build 검증·다른 멤버 build 버림, `items.powders`, `items.capsules` 검증·200, run.loot `capsules`/`powders` 기본값).
- `run.js`: `startRun` loot 에 `capsules: [], powders: {hp:0…}`; `addLoot(run, item, floor)` 가 `{ kind:'powder', stat }` 와 캡슐 객체도 받음; `settleLoot` 가 파우더·캡슐을 가방으로(`addCapsules` 의 dropped 를 결과에 포함).

- [ ] **Step 1: failing tests** — statCap(1/9/10/69/70/99) = 320/320/360/560/600/600; 파우더: 상한 걸리면 'cap'·255 'max'·가방 0 'none', 성공 시 가방 −1 bonus +10; 캡슐: 기술 같은 것 'same', 빈 칸·교체, 타입 Lv.9 이면 slots [0], Lv.10 이면 [0,1], 같은 타입 칸 제외; 특성 같으면 'same'; 적용하면 가방에서 사라짐; clearSecondType; rollCapsules 1만 번 ≈15% (±1.5%p)·보스 100%·내용이 그 적 것·배울 수 없는 기술 안 나옴; addCapsules 200 넘침 → 버린 수; abilityOf/typesOfMember 메타몽 빌드; 저장 v6 → v7(기본 빌드·빈 가방·run 보상 유지 **RF1**), 잘못된 빌드 정리(중복 타입·Lv.10 전 2타입·bonus 합계 초과·없는 특성), 메타몽 아닌 멤버 build 버림.
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3: implement**
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: ditto build rules, capsules, powders, save v7`

### Task 2: 전투 — 유닛 타입·빌드 반영·쓰러뜨린 적 기록

**Files:** Modify `src/core/battle.js`, `src/core/abilities.js`, `src/core/status.js`, `src/core/weather.js`, `src/core/pathfind.js`, `src/core/ai.js`, `src/render/ui.js` · Test `tests/battle.test.js` 또는 `tests/dittoBuild.test.js`

**Interfaces:**
- Consumes: Task 1 `effectiveBase`, `typesOfMember`.
- Produces: 모든 유닛에 `types: string[]`. `makeUnit({ …, types, base })` — `base` 가 있으면 `statsAt(base, level)`, `types` 가 있으면 그것. createBattle 의 아군 메타몽은 `types: m.build.types, base: effectiveBase(m.build), ability: m.build.ability`. `canEnter(tile, unitOrSpecies)` (유닛이면 `unit.types`). 타입 읽기: `abilities.typesOf`(색변환·포캐스트 다음 `unit.types ?? SPECIES…`), `traps`, `status.js` types, `weather.js` types, `ui.drawUnitInfo` 배지 = `unit.types`. `state.log.defeated: [{ species, types, moves, ability, boss }]` — knockOut 에서 보상 있는 적 기절마다(코인 붙는 조건과 같음).

- [ ] **Step 1: failing tests** — 불꽃/강철 빌드 메타몽: 물 기술 기대 데미지 ×2(같은 조건 노말 대비), 독 inflict 'immune', 모래바람 피해 없음; 물 타입 빌드 메타몽은 물 칸 reachable; 공격 bonus 100 → stats.atk 가 기본보다 큼; **(RF2)** makeUnit 적 메타몽 types ['normal']·atk 기본; 적 기절 → log.defeated 1개(보상 없는 자폭 기절 등은 없음).
- [ ] **Step 2:** FAIL · **Step 3:** implement (저장소 전체 `.types` 검색으로 유닛이 있는 읽기는 모두 전환) · **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: units carry types; ditto build in battle`

### Task 3: 획득 — 캡슐 굴림·보물상자 파우더·표시

**Files:** Modify `src/core/floorgen.js`, `src/main.js`(afterBattle, 층 메뉴 보물 줄, 귀환 결산), `src/game/states.js`(ITEM_NAME·상자 대사), `src/game/results.js`(캡슐 +n·버림 표시) · Test `tests/floorgen.test.js`, `tests/game.test.js`

**Interfaces:**
- Consumes: Task 1 `rollCapsules`, `addLoot` 캡슐/파우더, `settleLoot` dropped; Task 2 `log.defeated`.
- Produces: 상자 아이템 `{ powder: stat }` 형태 대신 문자열 유지 위해 `'powder-atk'` 같은 id(states 의 `ITEM_NAME` 에 6종 추가, `addLoot` 가 `powder-` 접두로 처리 — Task 1 의 addLoot 를 이 형태로 맞춤). 파우더 종류는 상자마다 층 시드 별도 난수(`hashSeed(seed, 'powder', i)` 류)로 — 상자 위치·수·나머지 아이템 굴림 순서 불변. afterBattle: `log.capsules = rollCapsules(log.defeated, Math.random)` → 각각 `addLoot`. 결산 머리줄 "캡슐 +n", 층 메뉴·귀환 보물 줄에 `캡슐 n · 파우더 n`, 가방 넘침이면 "오래된 캡슐 n개를 버렸다".

- [ ] **Step 1: failing tests** — **(RF3)** 같은 시드 generateFloor 상자 좌표·수 이전 값과 동일(기존 테스트가 고정값을 갖고 있으면 그것, 없으면 파우더 도입 전 결과를 테스트에 박아 둠), 1000 층 상자 아이템 파우더 ≈10%(±3%p); 상자 대사 "공격파우더를 얻었다!"; settleLoot 캡슐·파우더가 가방으로.
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: capsules drop from foes, powders in chests`

### Task 4: 빌드 화면

**Files:** Create `src/game/dittoBuild.js` · Modify `src/game/box.js`(메타몽 메뉴 `메타몽 빌드`), `src/game/summary.js`(메타몽 특성 페이지 안내, 타입 배지 `typesOfMember`), `src/game/box.js` 패널 타입 배지 `typesOfMember` · Test `tests/town.test.js`

**Interfaces:**
- Consumes: Task 1 전부.
- Produces: `createDittoBuild({ game, onSave, onClose }) => { mode, handle, update, draw }` — mode `list|slot|confirm|msg`. 위: 타입 배지(둘째 칸 잠김이면 `🔒Lv.10` 대신 `Lv.10` 글자), 특성, 능력치 6줄(값·막대) + `합계 n/상한`, 기술 4줄. 아래: 가방 목록(캡슐 최근 순 + 파우더 종류별 ×n, 쓸 수 없는 것 회색), 위아래 고르기·페이지. 고르기 → 캡슐이면 `capsuleUse` 의 slots 중 칸 고르기(slot 모드) → 확인 대사(예/아니오) → `applyCapsule` + onSave. 파우더면 확인 → `applyPowder` + onSave, 거절이면 이유 대사. "둘째 타입 비우기" 는 목록 맨 끝 항목(둘째 타입 있을 때). 취소 = 한 단계 뒤로, list 에서 취소 = onClose.
- box: 메타몽 메뉴에 `메타몽 빌드`(다른 멤버 메뉴엔 없음) → 하위 화면, 닫으면 박스로.

- [ ] **Step 1: failing tests** — 기술 캡슐 → 칸 고르기 → 확인 → 기술 바뀜·캡슐 사라짐·onSave 1; **(RF4)** 칸 고르기에서 취소·확인에서 '아니오' → 그대로·onSave 0; 파우더 상한 → 거절 대사·가방 그대로; **(RF5)** Lv.9 타입 캡슐은 칸 1개만 고를 수 있음; 박스의 메타몽 메뉴에만 `메타몽 빌드`.
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5: Verify** 브라우저(테스트 저장은 끝나고 원래대로): 캡슐·파우더 몇 개 넣고 빌드 화면에서 적용, 전투에서 바뀐 타입 배지 확인
- [ ] **Step 6: Commit** `feat: ditto build screen`

### Task 5: 문서
README 메타몽 빌드(캡슐·파우더·상한·Lv.10 둘째 타입) · ROADMAP · `npm test` · Commit `docs: ditto build`

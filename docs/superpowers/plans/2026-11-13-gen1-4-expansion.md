# 1~4세대 확장 + 메타몽 주인공 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 493종 데이터, 테마 규칙 기반 던전 적, 분기 진화(선택/무작위), 메타몽 주인공(5번째 출전 멤버), 스프라이트 지연 로딩, 저장 v3.

**Architecture:** 데이터는 `tools/fetch-pokeapi.js` 가 PokeAPI 에서 한 번 받아 생성. 진화 갈래·적 선택은 `core/` 순수 함수(시드 RNG). UI 는 기존 확인창/선택 흐름(`learnFlow`)을 재사용해 "어느 모습으로 진화할까?" 를 띄운다.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, Node 24 `node --test`, PokeAPI(도구 실행 시에만).

**Spec:** `docs/superpowers/specs/2026-11-13-gen1-4-expansion-design.md`

## Global Constraints

- 전국도감 1~493, 기본 폼. 494 이후로 가는 진화 갈래는 버린다.
- 습득표: platinum → heartgold-soulsilver → diamond-pearl 순 대체. 타입은 4세대 값(`past_types`).
- 진화 규칙(돌/원작 레벨/대체 레벨 매트릭스)은 기존 `classifyEvolution` 그대로, 갈래마다 적용.
- 적 선택·무작위 진화는 시드 RNG 만 사용.
- 파티 맨 앞은 항상 메타몽(`ditto`). 전투 아군 칸 5개.
- 시작 시 전체 스프라이트 로드 금지 — 필요한 종족만 요청.
- 저장 version 3 (v1 → v2 → v3 이전).
- 게임 텍스트 한국어, `core/` DOM 금지, 각 Task 끝에 커밋.

## Review Focus

1. **진화 선택 창에서 Z 연타**: "진화하지 않는다"나 엉뚱한 갈래가 고르지 않게 기존 확인창 규칙(기본 아니요 + 잠금) 적용. → Task 6.
2. **진화하지 않기를 고른 뒤**: 다음 레벨업에 다시 묻고, 그 사이 다른 갈래 레벨에 도달하면 옵션이 늘어난다(이브이 Lv.25). → Task 2.
3. **후보가 빈 테마·층**: 상한을 올려 찾고, 끝까지 비면 던전 기본 종족으로 대체(크래시 없음). → Task 3.
4. **이미 메타몽이 있는 v2 저장 / 메타몽이 맨 앞이 아닌 저장**: 중복 없이 맨 앞으로. → Task 4.
5. **스프라이트 로딩 중 화면**: 로드 전엔 임시 도트, 로드 실패도 임시 도트, 같은 종족 중복 요청 없음. → Task 5.

---

### Task 1: 분기 진화 분류 (순수)

**Files:** Modify `src/core/evolution.js` · Test `tests/evolution.test.js`

**Interfaces:**
- Produces:
  - `classifyBranches(fromSpecies, branches: [{ to, details: Detail[] }], line) => [{ to, rule }]` — 각 갈래 `classifyEvolution`; 같은 출발에서 **원작 레벨(source 'original')이고 레벨이 같은 갈래가 둘 이상**이면 그 갈래들 `rule.random = true`
  - `levelEvolutionOptions(speciesData, level) => to[]` — `evolutions` 중 kind 'level' 이고 `level >= rule.level`
  - `stoneEvolutionOptions(speciesData) => to[]`
  - `pickEvolution(options, speciesData, rng) => { auto: to } | { choose: to[] } | null` — 0개 null, 1개 auto, 모두 random 이면 rng 로 auto, 그 외 choose
- [ ] **Step 1: tests** — 개무소형(두 갈래 L7 original) → 둘 다 random, pickEvolution 이 rng 값에 따라 각각 선택; 이브이형(돌×3 + friendship×2 + other×2) → stoneOptions 3개, Lv20 options = 에브이·블래키(choose), Lv25 = 4개; 배루키형(other×3) → Lv25 choose 3; 단일 갈래 → auto; 0 → null
- [ ] **Step 2: Run** `node --test tests/evolution.test.js` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: branching evolution classification`

---

### Task 2: 493종 데이터 파이프라인 + 데이터·진행 규칙 전환

**Files:** Modify `tools/fetch-pokeapi.js`, `src/data/species.js`, `src/core/progress.js`, `src/game/party.js`(진화 안내 문구), `.gitignore`(`tools/.cache/`) · Regenerate `src/data/generated/pokedex.js` · Test `tests/data.test.js`, `tests/progress.test.js`

**Interfaces:**
- 생성 종족: `{ api, dex, name, types, base, baseExp, growth, learnset, stage, bst, legendary, evolutions: [{ to, rule }] }` (`evolution` 필드 제거)
- 도구: 1~493 번호로 `pokemon-species/{n}`·`pokemon/{n}`, 진화 사슬 재귀(갈래 전부), 갈래는 `classifyBranches`, 동시 8, `tools/.cache/<url-hash>.json` 캐시
- progress:
  - `applyExp` 이벤트 `{ type: 'evolve', species, options: to[], random: boolean }` — `pickEvolution` 결과가 auto 면 `options=[to]`, choose 면 후보 전부. 무작위 판정용 rng 를 인자로 받음: `applyExp(party, exp, rng = Math.random)`
  - `declined` 없이도 다음 레벨업에 다시 평가되도록(진화 안 했으면 다음 applyExp 에서 다시 이벤트) — 별도 상태 불필요
  - `stoneTargets(party)` = `stoneEvolutionOptions` 가 비지 않은 멤버
  - party.js 안내: 레벨 갈래 최소 레벨 "Lv.N에 진화" / 돌만 "진화의돌로 진화" / 둘 다 "Lv.N 또는 진화의돌" / 없음 "최종 진화"
- [ ] **Step 1: Implement** 도구 → `node tools/fetch-pokeapi.js` → `493 species, N moves` (첫 실행 수 분 소요, 백그라운드)
- [ ] **Step 2: tests** (data) — 493종, `ditto` 존재·시작 기술 `['tackle']`, 모든 종족 시작 기술 ≥ 1, `clefairy.types == ['normal']`, 이브이 갈래(님피아 없음), 개무소 random, 배루키 3갈래 같은 레벨, 기존 9계열 규칙 유지(불꽃숭이 L14 등), 모든 `evolutions[].to` 존재
- [ ] **Step 3: tests** (progress) — **(Review Focus 2)** 이브이 Lv19 → Lv20: evolve options 2개; 진화 안 한 채 Lv25 로 올리면 options 4개; 개무소 Lv7: options 1개, random true; 기존 테스트의 `evolve.to` → `options[0]` 로 갱신
- [ ] **Step 4: Implement** species.js(이동력 규칙 유지), progress.js, party.js
- [ ] **Step 5: Run** `npm test` → PASS
- [ ] **Step 6: Commit** `feat: Gen 1-4 data (493 species) with branching evolutions`

---

### Task 3: 테마 규칙 적 구성

**Files:** Create `src/core/encounters.js` · Modify `src/data/dungeons.js`, `src/core/floorgen.js` · Test `tests/encounters.test.js`, `tests/floorgen.test.js`

**Interfaces:**
- dungeons: `pool` 제거 → `types: string[]`, `bstCap: n`, `stageCap: (f) => 0|1|2`, `boss: { levelBonus: 3 }`, `fallback: speciesKey` (스펙 §4 표: 들판 420 / 동굴 470, 단계 상한 표)
- `encounterPool(dungeon, floor, { boss = false } = {}) => speciesKey[]` — 타입 겹침 ∧ !legendary ∧ ≠ditto ∧ stage ≤ cap ∧ bst ≤ cap(+80 boss); 비면 cap 단계 +1 → bst +50 반복(최대 3회) → 그래도 비면 `[fallback]`; 결과 정렬(결정성)
- floorgen: 적 종족 = `encounterPool` 에서 rng; 보스 = `encounterPool(..., { boss: true })` 중 `stage === stageCap(f)` 우선; `allySlots` 5
- [ ] **Step 1: tests** — 두 던전 × 모든 층 pool 비지 않음, 전설·메타몽 없음, 모든 후보 타입 겹침·단계·bst 조건, **(Review Focus 3)** 단계 상한 0·bst 1 같은 극단 설정에서도 fallback 반환; floorgen 속성 검사(300 시드) 갱신: allySlots 5, 적 종족 ∈ pool
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: themed encounter pools from Gen 1-4`

---

### Task 4: 메타몽 주인공 + 저장 v3

**Files:** Modify `src/core/progress.js`(STARTERS), `src/core/save.js`, `src/data/map.js`(타이틀 맵 allySlots 5) · Test `tests/save.test.js`, `tests/battle.test.js`, `tests/town.test.js`

**Interfaces:**
- `STARTERS = ['ditto', 'chimchar', 'piplup', 'turtwig', 'shinx']`
- save: version 3; v2(이하) 로드 후 `ensureDitto(party)` — 없으면 맨 앞에 `newMember('ditto')`, 있는데 맨 앞이 아니면 맨 앞으로 이동
- 전투: 아군 5 (기존 테스트 기대값 4 → 5 갱신)
- [ ] **Step 1: tests** — newGame 파티 5·첫 멤버 ditto; v2 저장 → ditto 추가; **(Review Focus 4)** ditto 가 3번째에 있는 저장 → 맨 앞, 중복 없음; createBattle 아군 5·`ally-ditto` 몸통박치기; 마을 리더 ditto
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: Ditto protagonist and save v3`

---

### Task 5: 스프라이트 지연 로딩

**Files:** Modify `src/render/sprites.js`, `src/main.js`, `src/game/town.js`, `src/game/party.js` · Test `tests/sprites.test.js` (신규, 요청 관리만)

**Interfaces:**
- `requestSprites(keys) => Promise<void>` — 종족별 요청을 한 번만 (진행 중·완료 모두 기억), 내부 로더는 주입 가능: `setSpriteLoader(fn)` (테스트용)
- 그리기 함수는 로드 전/실패 시 임시 도트 (기존 폴백 재사용)
- 호출: 타이틀→마을 진입 시 파티+NPC, `startFloor` 에서 층 적(+파티), 진화 연출 시작 시 진화 후 종족, 편성소 진입 시 파티
- `loadSprites(전체)` 호출 제거
- [ ] **Step 1: tests** — **(Review Focus 5)** 같은 종족 두 번 요청 → 로더 1회; 실패 로더도 Promise 는 resolve; 요청한 종족만 로더 호출
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Verify** 브라우저 네트워크: 시작 시 sprite 요청이 파티·NPC 종족만
- [ ] **Step 6: Commit** `feat: lazy sprite loading`

---

### Task 6: 진화 갈래 선택 UI

**Files:** Modify `src/game/learnFlow.js`(선택 단계 일반화) 또는 Create `src/game/choiceFlow.js`, `src/game/results.js`, `src/game/evolution.js`, `src/game/party.js`, `src/main.js`(evolveChain) · Test `tests/results.test.js`

**Interfaces:**
- 결산 `onDone(evolutions: [{ species, options, random }])` → main 의 `evolveChain` 이 options 가 여럿이면 먼저 선택 장면: 대사 "○○의 모습이 바뀌려 한다!" / "어느 모습으로 진화할까?" + [갈래 이름…, 진화하지 않는다] → 고른 뒤 예/아니요 확인(기본 아니요, `CHOICE_LOCK`) → 진화 연출 / 취소 시 건너뜀
- 편성소 돌: 돌 갈래 여럿 → 같은 선택
- [ ] **Step 1: tests** — **(Review Focus 1)** 선택 장면에서 Z 연타 20회 → 아무 갈래도 확정되지 않음; 방향키 + 확인 + 예 → 그 갈래로 onPick; "진화하지 않는다" → onPick(null)
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: evolution branch choice`

---

### Task 7: 연결 확인 · 문서

**Files:** Modify `README.md`, `docs/ROADMAP.md`

- [ ] **Step 1: Verify** 브라우저: 새 게임 → 마을 리더 메타몽 → 들판 1~5층(적 종류 다양, 보스 최종형) → 동굴 테마 적; 이브이를 파티에 임시로 넣고 경험치를 줘서 Lv.20 선택 창; 시작 시 네트워크 요청 수; 기존 v2 저장 이어하기 → 메타몽 추가
- [ ] **Step 2: Docs** README(493종, 메타몽, 분기 진화, `node tools/fetch-pokeapi.js` 시간·캐시), ROADMAP(A 완료, 다음 B 뽑기·편성)
- [ ] **Step 3: Run** `npm test` → PASS
- [ ] **Step 4: Commit** `docs: Gen 1-4 expansion`

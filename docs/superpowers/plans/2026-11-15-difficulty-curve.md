# 난이도 곡선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 층별 위협도 예산으로 적을 뽑아 1-1 은 쉽고 뒤로 갈수록 어려워지게 하고, 던전 돌파로 열리는 레벨 상한(넘친 경험치 버림)을 넣는다. 새 던전도 같은 규칙을 따르게 데이터 테스트·가이드로 강제한다.

**Architecture:** 숫자는 `src/data/dungeons.js`(baseLevel·budget·early·levelCap). 순수 모듈 `src/core/difficulty.js` 가 위협도·적 굴림(별도 난수)·상한 계산. `floorgen` 은 예전 공용 난수 소비를 그대로 두고(예약 자리) 실제 적만 바꿔 지형·상자·날씨를 지킨다. `applyExp` 가 상한을 받는다.

**Tech Stack:** vanilla ES modules, `node --test`, node 보고 도구.

**Spec:** `docs/superpowers/specs/2026-11-15-difficulty-curve-design.md` · **Guide:** `docs/dungeon-guide.md`

## Global Constraints
- 위협도 `threat = level × bst / 100`. 예산 들판 [55, 70, 90, 110, 125], 동굴 [115, 130, 145, 160, 175, 190, 200]. 기준 레벨 들판 [6, 7, 9, 10, 12], 동굴 [13..19]. 상한 들판 15, 동굴 22. 보스 = 마지막 기준 + 3.
- 들판 타입 노말·풀·벌레·비행. 초반 종 목록은 스펙 표 그대로(모두 그 던전 타입).
- 유형: 무리 30 · 보통 50 · 준보스 20 / 1~2층 무리 40 · 보통 60, 최대 4. 최소 2마리, 모든 층 합 ≤ 예산 × 1.15.
- 같은 시드의 지형·상자·날씨 비트 동일(기존 상자 스냅샷 테스트 그대로 통과).
- 상한 = 해금 사슬에서 아직 돌파 안 한 첫 던전 `levelCap`, 다 돌파면 마지막 것. 넘친 경험치 버림(전투·사탕), 합류 레벨도 상한까지. 기존 초과 동료 레벨 유지.
- 경험치 배율 ×1, 공유 처치 100 · 나머지 각자 50.

## Review Focus
1. 이미 상한을 넘은 동료(예전 저장): 레벨 안 내려가고 경험치만 안 오름, 진화 판정 영향 없음. → Task 3 test.
2. 레벨 진화가 상한 레벨과 같은 레벨에서 일어나는 경우 정상 진화. → Task 3 test.
3. 물이 많아 오른쪽 자리가 모자란 맵 → 오류 없이 놓을 수 있는 만큼. → Task 2 test (자리 수 강제 축소 상황).
4. 동굴까지 돌파한 저장 → 상한 22 유지(100 아님). → Task 3 test.
5. 새 던전 데이터에 필드가 빠지거나 early 가 타입 밖이면 테스트 실패. → Task 1 test.

---

### Task 1: 던전 데이터 · 위협도 · 후보 · 데이터 검증

**Files:** Modify `src/data/dungeons.js`, `src/core/encounters.js`, `src/data/balance.js`(expMultiplier 1 — 이미 수정됨, 커밋) · Create `src/core/difficulty.js`, `tests/difficulty.test.js`

**Interfaces (Produces):** 던전 필드 `baseLevel: number[]`, `budget: number[]`, `early: string[]`, `levelCap: number`(`level`·`count` 삭제). `difficulty.js`: `threat(level, species)`, `bossLevel(dungeon)`, `levelCapFor(game)`, `COMPOSITION`. `encounterPool(dungeon, floor, { boss, half })` — 1~2층은 `early` ∩ stageCap, 3층+ 지금 규칙 ∪ early; `half: 'low' | 'high'` 는 그 후보 종족값 하위/상위 절반.

- [ ] **Step 1: failing tests** — **(RF5)** 모든 던전: baseLevel·budget 길이 = floors, budget 엄격 증가, baseLevel 비감소, early 모두 SPECIES·stage 0·types 만족, levelCap = bossLevel, unlock 사슬 한 줄(첫만 null, 나머지는 앞 던전 id); 들판 types 에 electric·fairy 없음; encounterPool 들판 1·2층 ⊆ early; threat(7, 'pidgey') ≈ 17.57; expMultiplier 1.
- [ ] **Step 2:** FAIL · **Step 3:** implement (기존 `level(f)`·`count(f)` 를 쓰는 곳은 Task 2 에서 바꿈 — 이번 Task 는 floorgen 이 아직 쓰면 baseLevel 로 임시 대체해 테스트 통과) · **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: dungeon budgets, early species and level caps in data`

### Task 2: 적 굴림 (예산 · 유형 · 예약 자리)

**Files:** Modify `src/core/floorgen.js`, `src/core/difficulty.js`, `tests/floorgen.test.js` · Test `tests/difficulty.test.js`

**Interfaces:** `rollEnemies(dungeon, floor, seed) => [{ species, level }]` (별도 난수 `createRng(hashSeed(seed, 'enemies'))` 류, 보스 제외). floorgen: 예전처럼 공용 난수로 `oldCount = 예전 count(f)` 만큼 `take(right.pop())` + `pick(pool)` 소비(결과 버림, 자리는 예약) → 보스 자리 예약(보스 층) → 상자(그대로) → 실제 적을 예약 자리에 먼저, 남으면 상자 뒤 오른쪽 빈 칸(별도 난수), 자리 없으면 생략. 예전 count 식은 floorgen 안 상수 함수로 보존(`LEGACY_COUNT`).

- [ ] **Step 1: failing tests** — rollEnemies 결정성; 300 시드 × 층: 마릿수 ≥ 2(자리 있으면), 합 ≤ 예산 × 1.15, 1~2층 ≤ 4·early 만·준보스 없음; 던전 안 층별 합 중앙값 엄격 증가; 기존 상자 스냅샷 테스트 그대로 통과 + 같은 시드 tiles·weather 동일(스냅샷에 tiles 해시 추가); **(RF3)** 자리가 2칸뿐인 맵(테스트용 지형 주입 또는 right 축소 훅)에서 예외 없이 ≤ 2마리; 기존 `enemies.length === count` 류 테스트는 새 규칙으로 바꿈.
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: threat-budget enemy rolls keeping terrain and chests`

### Task 3: 레벨 상한

**Files:** Modify `src/core/progress.js`(applyExp cap), `src/core/gacha.js`(joinLevel cap), `src/game/results.js`(상한 표시), `src/main.js`(결산·사탕에 cap 전달) · Test `tests/progress.test.js`, `tests/gacha.test.js`

**Interfaces:** `applyExp(party, expBySpecies, rng, cap = MAX_LEVEL)` — 각 멤버 `m.exp = min(m.exp + gain, max(m.exp, expForLevel(growth, cap)))`(이미 넘은 멤버는 그대로), 이벤트에 `capped: true`. `joinLevel(game)` → `min(기존, levelCapFor(game))`. results 는 createResults 에 `cap` 을 받아 applyExp 에 넘기고, 상한 도달 행에 "레벨 상한" 작은 글씨.

- [ ] **Step 1: failing tests** — 상한 15 에서 경험치 버림·Lv.15 시작점; **(RF1)** Lv.18 멤버(예전) 레벨 유지·경험치 안 오름; **(RF2)** 상한 = 진화 레벨(예: 15 에 진화하는 종)이면 진화 이벤트 발생; levelCapFor: 새 게임 15, cleared ['sinnoh-field'] 22, **(RF4)** 둘 다 돌파 22; joinLevel 상한; 공유 50% 각자 깎임.
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: level caps per dungeon; overflow exp is discarded`

### Task 4: 측정 도구 · 기록 · 문서

**Files:** Create `tools/difficulty-report.js` · Create `codex-reviews/2026-11-15-difficulty-curve-result.md` · Modify `codex-reviews/README.md`(목록), `README.md`, `docs/ROADMAP.md`, `.gitignore`(스프라이트 주석 정리)

- [ ] **Step 1:** 보고 도구 — 시드 1000 × 던전 × 층: 마릿수·위협도 합(최소·중앙·최대)·유형 비율·종족값 범위, 표로 출력. 실행해서 결과를 기록 문서에 붙인다(측정값 · 한계: 실제 플레이 아님).
- [ ] **Step 2:** README(레벨 상한·층 구성·경험치 ×1), ROADMAP(완료 + 다음: 미션 맵), README 의 "변화기 아직 안 배움" 옛 문장 정리(코덱스 지적), `.gitignore` 주석 맞추기.
- [ ] **Step 3:** `npm test` → PASS · Commit `docs: difficulty curve, dungeon guide and measurements`

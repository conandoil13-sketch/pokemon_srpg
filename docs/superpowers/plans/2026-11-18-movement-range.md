# 이동력 구간·후반 맵 크기·메타몽 이동력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이동력을 종족값 스피드 20단위 2~8로 넓히고, 메타몽은 빌드 기준으로, 시작 레벨 40+ 던전 맵을 18×13 / 60+ 를 20×14 로.

**Architecture:** `movementFor(types, speed)` 구간표 교체 (species.js). `moveBudget` 은 유닛 기준 `movementFor(unit.types ?? 종 타입, unit.base?.spe ?? 종 스피드)` — 메타몽 빌드 유닛은 `base`·`types` 를 이미 가짐. 층 생성기의 `W, H` 상수를 `dungeon.size ?? [16, 12]` 로 (모듈 상수 → 함수 안 값), 던전 크기는 `mapSizeFor(startLevel)`.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-movement-range-design.md`

## Global Constraints
- 구간: <30 → 2, <50 → 3, <70 → 4, <90 → 5, <110 → 6, <130 → 7, 그 이상 8. 비행 +1, 최대 8.
- 맵: 시작 레벨(`baseLevel[0]`) <40 → 16×12, <60 → 18×13, 그 이상 20×14. 신오 2개는 `size` 없음(16×12) → 골든 해시 그대로.
- 넓은 맵: `clusters` 개수 × 면적비(W·H / 192) 반올림. 상자 0~2, 적·예산 그대로.
- 브랜치 `feat/movement-range`. 테스트 `npm test`.

## Review Focus
1. 화면·AI·이동 범위가 16×12 를 가정한 곳 (`W`, `H` 상수, 카메라 끝) → Task 2 테스트·브라우저.
2. 아군 출발 3열·`anchor` 중앙이 넓은 맵에서도 맞음 → Task 2 테스트.
3. 메타몽 빌드 없는 기본 상태 이동력 = 3 (48) → Task 1 테스트.
4. 데이터 테스트의 이동력 기대값 (예: 비행 최대 6) 갱신 → Task 1.
5. 저장된 진행 중 탐험의 층이 다시 생성될 때 크기 바뀜 (시련 4+ 진행 중) → 허용, 층 시작 저장이라 새 층으로 시작 — 메모만.

---

### Task 1: 구간표 · 메타몽
**Files:** `src/data/species.js` (`movementFor`), `src/core/status.js` (`moveBudget` 이 유닛 기준) · Test `tests/data.test.js` 또는 새 `tests/movement.test.js`
- [ ] **Step 1: Write the failing tests** — `movementFor(['normal'], 29) === 2`, 30 → 3, 129 → 7, 130 → 8, 160 → 8, `movementFor(['flying'], 130) === 8`, `(['flying'], 110) === 8`, `(['flying'], 109) === 7` / 메타몽 유닛: 빌드 스피드 48 → 3, 75 → 5, 빌드 타입 `['normal','flying']` → +1.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` — PASS (기대값 바뀐 기존 테스트 갱신, 각 갱신은 이유 한 줄).
- [ ] **Step 5: Commit** `feat: movement 2-8 from base speed in 20-point steps; ditto uses its build`

### Task 2: 던전별 맵 크기
**Files:** `src/core/floorgen.js`, `src/data/fillerStages.js` (`size`), `src/data/autumnForest.js` (명시 16×12), `docs/dungeon-guide.md` · Test `tests/floorgen.test.js`
- [ ] **Step 1: Write the failing tests** — 시련 4 층 `tiles.length === 13 && tiles[0].length === 18`, 시련 7 은 14×20, 신오 16×12 · 골든 해시 그대로 · 넓은 맵 모든 층 시드 3개: 연결성·적≥1·보스·계단 · 아군 출발 칸 x ≤ 2.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (`W`,`H` 를 `generateFloor` 안에서 `dungeon.size` 로; 도우미 함수들은 인자로 받음).
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Browser check** — 시련 7 입장(unlocked 조작, 저장 백업·복원) → 넓은 맵·카메라 끝까지 스크롤·이동 범위 표시. 스크린샷.
- [ ] **Step 6: Docs + Commit** dungeon-guide 에 `size` 한 줄, ROADMAP 한 줄 · `feat: wider maps for later trials`

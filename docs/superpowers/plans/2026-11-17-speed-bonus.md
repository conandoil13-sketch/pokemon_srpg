# 스피드 보너스 행동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 편의 가장 느린 포켓몬이 상대 편 가장 느린 포켓몬보다 2배 이상 빠르면, 그 편 페이즈가 끝나기 직전에 가장 빠른 포켓몬이 한 번 더 행동한다.

**Architecture:** 순수 판정 `speedBonusUnit(state, side)` (battle.js) + 페이즈마다 한 번 표시 `state.bonusGiven` (endPhase 가 페이즈 바뀔 때 false). 화면(states.js)은 아군 `enemyPhase()` 진입 직전·적 `nextEnemy()` 대기열이 빌 때 판정해서, 그 유닛의 `moved/acted/spent` 를 풀고 배너를 띄운다.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-speed-bonus-design.md`

## Global Constraints
- 스피드 = `effectiveStat(u, 'spe')` (랭크 반영) × (마비면 0.5). 비교 대상: 그 편 살아 있는 유닛, `bot` 제외.
- 조건: `min(그 편) >= 2 * min(상대 편)` (경계 포함). 상대 편이 비면 없음.
- 보너스 유닛: 그 편에서 스피드 최대 (같으면 `state.units` 순서 앞), 잠듦·얼음(`statusTurns > 0`)이면 보너스 없음.
- 페이즈마다 1번 (`state.bonusGiven`).
- 배너: "스피드 보너스!" / "○○이(가) 한 번 더 움직인다" (josa).
- 브랜치 `feat/speed-bonus`. 테스트 `npm test`. 저장 백업·복원.

## Review Focus
1. 보너스 행동 뒤 차례 끝 효과(상태 피해·턴 감소)가 한 번만 → Task 1 테스트 (보너스는 endPhase 전에 끝남).
2. 보너스 유닛이 보너스 행동 중 기절하면 바로 페이즈 진행 → Task 2 (기존 "모두 행동" 검사 경로).
3. 보너스 받은 아군이 이동만 하고 대기해도 페이즈가 끝남 → Task 2.
4. 적 보너스 유닛이 이번 페이즈에 이미 쓰러짐 → 보너스 없음 → Task 1 테스트(살아 있는 유닛만).
5. 같은 페이즈에 조건이 두 번 맞아도 한 번만 → Task 1 테스트.

---

### Task 1: 판정 (core)

**Files:** Modify `src/core/battle.js` (`speedBonusUnit`, `endPhase` 에서 `bonusGiven = false`) · Test `tests/speedBonus.test.js`

- [ ] **Step 1: Write the failing tests** — 아군 최저 100·적 최저 50 → 아군 최고 스피드 유닛 / 49.9 대 100 경계 / 마비로 절반 되면 조건 깨짐 / 랭크 +2 반영 / 기절·봇 제외 / 잠든 최고 유닛이면 null / 적 쪽도 같은 규칙 / `bonusGiven` true 면 null, `endPhase` 뒤 false.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `speedBonusUnit(state, side) -> unit | null`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: speed bonus check`

### Task 2: 화면 흐름

**Files:** Modify `src/game/states.js`, `docs/ROADMAP.md` · Test `tests/town.test.js` 또는 `tests/speedBonus.test.js` (createGame 으로)

- [ ] **Step 1: Write the failing tests** — createGame 손 맵(아군 빠름·적 느림): 아군 전원 행동 → 배너 "스피드 보너스!" → 그 유닛만 `acted false`, 다시 행동하면 적 턴으로 / START(endTurn)로 끝내도 보너스 먼저, 두 번째 START 는 바로 적 턴 / 적이 빠른 손 맵: 적 대기열 끝 → 가장 빠른 적이 한 번 더 행동(행동 횟수 +1).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — `enemyPhase()` 맨 앞: `const b = speedBonusUnit(st, 'ally'); if (b) { st.bonusGiven = true; b.moved = b.acted = false; b.spent = 0; showBanner('스피드 보너스!', line, color, () => { cursor = { x: b.x, y: b.y }; mode = 'idle'; }); return; }`. `nextEnemy()` 대기열이 비면 같은 판정(`'enemy'`) → `enemyQueue.push(b.id)` + 배너 → `nextEnemy()`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Browser check** — 저장 백업 → 빠른 파티로 낮은 층 → 배너·보너스 행동 확인 → 복원. 스크린샷.
- [ ] **Step 6: Docs + Commit** ROADMAP 한 줄 · `feat: speed bonus action at the end of a phase`

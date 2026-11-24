# 특성 각성 슬롯머신 연출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 특성 각성의 가로 칸 룰렛을 릴 1개 슬롯머신 + pixelfx 보상 연출로 바꾸고, 특성 화면 UI 를 다듬는다.

**Architecture:** 릴 움직임은 `src/game/roulette.js` 의 순수 타임라인(`reelTimeline` / `reelAt`)으로 정하고, `src/game/extraRoll.js` 가 그걸 그리며 단계가 바뀔 때 `createFxManager` 로 pixelfx 를 띄운다. 결과는 여전히 `rollExtra` 가 먼저 정한다.

**Tech Stack:** vanilla JS, canvas 2D, node:test, vendored pixelfx (`src/render/fx.js` 의 `createFxManager`).

**Spec:** docs/superpowers/specs/2026-11-24-slot-roulette-design.md

## Global Constraints
- 결과(등급·특성·낚시)는 연출 전에 정해지고 저장됨 — 연출은 바꾸지 않는다.
- 확인 = 건너뛰기(바로 결과 끝). 전체 길이 ≤ 4.5초.
- 평범한 굴림(업그레이드 없음)엔 S 칸이 절대 안 보임.
- 브랜치 feat/extra-ability-slot2 에 이어서. `git commit -a` 금지, codex-reviews/ 커밋 금지.

## Review Focus
1. 낚시 굴림에서 마지막에 멈춘 칸이 결과 등급과 다름 → Task 1 `reel lands on the result tier` (낚시 포함).
2. 건너뛰기를 업그레이드·멈칫 도중에 눌러도 결과 화면으로 — Task 2 `skip during the reel jumps to the result`.
3. pixelfx 생성 실패(테스트 환경, document 없음) 때 화면이 죽음 → createFxManager 는 실패를 삼킴; Task 2 테스트가 node 에서 update/draw 없이 handle 만 돌려 확인.
4. 같은 단계 이펙트가 매 프레임 반복 생성 → Task 2 에서 단계별 한 번만 (fired 집합).
5. 반복 굴림(두 번째 굴림)에서 이전 연출 상태가 남음 → start() 때 fx·fired 초기화.

---

### Task 1: 릴 타임라인 (순수)

**Files:**
- Modify: `src/game/roulette.js` (rouletteTimeline/rouletteAt 를 대체)
- Test: `tests/roulette.test.js` (룰렛 테스트 5개를 릴 테스트로 교체, 메뉴·shownExtra 테스트는 유지)

**Interfaces:**
- Produces: `BASE_RING=['C','B','A']`, `HIGH_RING=['C','B','A','S']`,
  `reelTimeline({tier, tease}) -> { upgrade, stopTier, steps: [{t, kind}], end }` — kind 순서 `spin`, (`upgrade`), (`tease`: S 가 가운데 줄에 멈칫한 시각), `stop`, `reveal`; `end` = reveal + 0.6.
  `reelAt(tl, t) -> { ring, pos, speed, symbol, phase, since }` — `pos` 는 실수(가운데 줄 칸 번호, 커지는 쪽이 아래로 굴러감), `symbol = ring[mod(round(pos))]`, `speed` 칸/초, `phase` = 그 시각의 마지막 step kind (업그레이드는 0.6초 뒤 'spin' 으로).
- 움직임: 0~0.12초 살짝 위로(pos -0.3), 그다음 18칸/초, 감속은 이차 ease-out 으로 정수 칸에 정확히 도착, 도착 뒤 0.3초 감쇠 튕김(진폭 0.18). 낚시는 S 칸(P-1)에서 0.45초 멈칫 → 0.3초 만에 P 로.
- 시각: 업그레이드 없음 감속 시작 0.9 / 업그레이드 0.9, 감속 시작 1.8. reveal = stop + 0.5.

- [ ] **Step 1: 테스트 교체** — `plain roll never shows S` (0..end 0.02 간격 모든 `reelAt().ring` 에 S 없음, steps 에 upgrade 없음), `S always upgrades` (upgrade 전 ring 에 S 없음, 후엔 있음), `reel lands on the result tier` (S·A낚시·A·B·C·B낚시: stop 시각+0.31 의 symbol === tier, end ≤ 4.5), `tease pauses on S first` (낚시: tease step 시각+0.2 의 symbol === 'S', speed === 0), `steps in order` (spin 먼저, stop·reveal 마지막, 시각 증가).
- [ ] **Step 2:** `node --test tests/roulette.test.js` → 새 테스트 FAIL (reelTimeline 없음).
- [ ] **Step 3:** roulette.js 구현. extraRoll.js 는 임시로 reelAt 쓰게 최소 수정(그리기는 Task 2).
- [ ] **Step 4:** `npm test` → 전부 PASS.
- [ ] **Step 5:** 커밋 `feat: slot reel timeline (kick, slow-down, near-miss tease, bounce)`.

### Task 2: 슬롯머신 그리기 + pixelfx

**Files:**
- Modify: `src/game/extraRoll.js`
- Test: `tests/roulette.test.js`

**Interfaces:**
- Consumes: Task 1 `reelTimeline`, `reelAt`; `createFxManager` (src/render/fx.js) — `spawn({id}, {x,y})`, `update(dt)`, `draw(ctx,'front',{x:0,y:0})`.
- Produces: createExtraRoll 의 `fxLog` getter (이번 굴림에서 띄운 이펙트 id 배열, 테스트용).

- [ ] **Step 1: 테스트** — `skip during the reel jumps to the result` (spin 중 update(1.0) 후 confirm → 다음 confirm 에 mode 'view'); `effects fire once per step` (extraSeq 17 = S: update 를 0.05 씩 end 까지 → fxLog 에 'lightning/thunderclap' 가 업그레이드·멈춤 해서 정확히 2번, 'ui/level-up' 1번; 다시 굴리면 fxLog 가 새로 시작).
- [ ] **Step 2:** 실패 확인.
- [ ] **Step 3:** 구현 — 기계 틀(전구 12~16개 테두리, 빠를수록 빨리 번갈아, 업그레이드 뒤 금색), 릴 창(가운데 줄 ▶ ◀, 위·아래 칸 반쯤 보이고 어둡게, 빠를 때 세로로 늘인 잔상), 제목 '등급 슬롯'→'고급 슬롯', 업그레이드 흔들림·번쩍·"고급 슬롯!", tease 단계 "아깝다…", 멈춤 보상(C hit-spark, B hit-spark, A crit-hit+흔들림, S thunderclap+level-up+collect-burst+금빛 번쩍), 공개 때 A·S 반짝임. 이펙트는 단계당 한 번(fired 집합), start() 때 초기화.
- [ ] **Step 4:** `npm test` PASS. 브라우저: 음소거·세이브 스냅샷 규칙, extraSeq 17(S)·65(B 낚시)·1(C) 로 확인, 스크린샷.
- [ ] **Step 5:** 커밋 `feat: slot machine presentation with pixelfx payoffs`.

### Task 3: 특성 UI 다듬기 + 문서

**Files:**
- Modify: `src/game/extraRoll.js` (보기 화면), `src/game/summary.js` (특성 탭 2칸 줄), `docs/ROADMAP.md`

- [ ] **Step 1:** 특성 각성 보기 화면 — 1칸·2칸 카드에 등급색 테두리(1칸은 등급 있으면 그 색, 없으면 기본), 확률 줄을 등급색 막대(폭 = 확률)로. 자세히 보기 2칸 줄은 배지 위치·색 정리. 기존 slot2Note 테스트 유지.
- [ ] **Step 2:** `npm test` PASS + 브라우저 스크린샷 (보기 화면, 자세히 보기).
- [ ] **Step 3:** ROADMAP 의 2칸 완료 줄에 "슬롯머신 연출(pixelfx)" 추가. 커밋 `feat: tier-coloured ability cards and odds bar`.

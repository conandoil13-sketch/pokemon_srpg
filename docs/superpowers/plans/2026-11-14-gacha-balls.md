# 뽑기 볼 3개 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모집소 뽑기를 "볼 3개 중 하나 고르기 → 클릭마다 몬스터→슈퍼→하이퍼볼 변화 → 열림 → 안 고른 두 볼도 공개"로 바꾼다.

**Architecture:** 순수 규칙 `src/core/gacha.js` 를 굴리기(`rollBalls`, 코인 불변)와 받기(`claimBall`, 코인 차감·적용)로 나눈다. 장면 `src/game/gacha.js` 는 고르는 순간 `claimBall` + 저장, 그 뒤는 연출. 볼 도트는 새 `src/render/balls.js`.

**Tech Stack:** vanilla ES modules, Canvas 2D, pixelfx(이미 vendored), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-gacha-balls-design.md`

## Global Constraints
- 희귀도 3단계 그대로: `common` 70 · `rare` 25 · `epic` 5. 볼: common=몬스터볼, rare=슈퍼볼, epic=하이퍼볼.
- 볼 3개는 각각 독립으로 굴림. 받는 건 고른 하나뿐, 안 고른 볼은 보여 주기만(보상 없음).
- 코인 100(`GACHA_COST`)은 **고르는 순간** 차감·적용·저장(`onPulled`). 고르기 전 종료 → 코인 그대로.
- 고르기 전엔 결과가 화면에 새지 않음 (세 볼 모두 몬스터볼 모양).
- 볼 그림은 코드 도트, 공식 그림 파일 금지. 번쩍임·반짝임은 pixelfx (`createFxManager`).

## Review Focus
1. 고르는 화면·여는 중에 확인/클릭 연타 → 결제·적용 한 번만. → Task 2 test.
2. 고르는 화면에서 취소 → 코인 그대로, 메뉴로. → Task 2 test.
3. 코인 부족 → 볼이 나오지 않고 "코인이 부족하다". → Task 2 test.
4. 고른 볼이 이미 있는 계열 → 결정 +1 대사, 옆 볼이 이미 있는 계열이어도 결정 안 줌. → Task 1 test.
5. 매우 희귀 볼은 클릭 2번에 걸쳐 great → ultra 로 바뀌고 3번째에 열림 (단계 건너뛰지 않음). → Task 2 test.

---

### Task 1: 굴리기·받기 규칙

**Files:** Modify `src/core/gacha.js` · Test `tests/gacha.test.js`

**Interfaces:**
- Produces: `BALL_OF = { common: 'poke', rare: 'great', epic: 'ultra' }`; `rollBall(rng) => { species, rarity }`; `rollBalls(rng, n = 3) => Array<{species, rarity}>` (코인·파티 불변); `claimBall(game, ball, rng) => { ok:false, reason:'coins' } | { ok:true, species, rarity, duplicate, member? }` (지금 `pull` 의 결제·적용 부분 그대로). `pull(game, rng)` 은 `claimBall(game, rollBall(rng), rng)` 로 남겨 기존 테스트 유지.

- [ ] **Step 1: failing tests** — `rollBalls returns 3 independent results without touching the game` (같은 시드 같은 결과, 길이 3, game.coins·party 불변, 1만 번 각 칸 rarity 비율 ≈70/25/5 ±2%p); `claimBall charges once and applies only the chosen ball` (coins 150 → 50, party +1 또는 shards +1, 다른 두 볼 species 는 파티·결정에 없음); `claimBall refuses without coins` (coins 50 → `{ok:false, reason:'coins'}`, 불변); `claimBall on an owned line gives a shard` (chimchar 결과 → shards.chimchar +1, duplicate true).
- [ ] **Step 2:** `npm test` → FAIL (export 없음)
- [ ] **Step 3: implement** — `pull` 의 희귀도·종 고르기를 `rollBall` 로, 결제·적용을 `claimBall` 로 옮김.
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: gacha rolls three balls, claims one`

### Task 2: 볼 3개 장면

**Files:** Create `src/render/balls.js` · Modify `src/game/gacha.js` · Test `tests/town.test.js`

**Interfaces:**
- Consumes: Task 1 의 `rollBalls`, `claimBall`, `BALL_OF`, `GACHA_COST`.
- Produces: `drawBall(ctx, kind: 'poke'|'great'|'ultra', cx, cy, { r = 14, dx = 0, open = 0 })` (open 0..1 = 위 뚜껑이 벌어짐). 장면 상태 getter `mode`(`menu|choose|open|others|done|msg`), `balls`(`[{ kind, opened, chosen }]`, 테스트용), `cursor`.
- 흐름: menu 확인 → 코인 부족이면 msg, 아니면 `rollBalls(rng)` 후 `choose`(세 볼 모두 kind 'poke'). choose: 좌우로 cursor, 확인/클릭(볼 위 클릭이면 그 볼) → `claimBall` → `onPulled(r)` → `open`. open: 확인마다 한 단계 — 목표 kind 보다 낮으면 다음 kind 로(흔들림 + pixelfx 번쩍임), 같으면 열림(포켓몬 2배 크기 + 희귀도 글자 + 합류/결정 대사, 기존 문구 그대로). 그 다음 확인 → `others`: 나머지 두 볼이 자동으로 단계별(각 단계 0.35초 정도) 바뀌고 열려 작은 포켓몬 + 이름. 끝나면 확인 → menu. choose 에서 취소 → menu(코인 그대로). 입력 잠금은 지금처럼 `CHOICE_LOCK`.
- 대사: choose "어느 볼을 열까?" · others 끝 "다른 볼에는 이런 포켓몬이 있었다!".

- [ ] **Step 1: failing tests** (town.test.js, 기존 'mashing after a pull never double-spends' 를 새 흐름으로 고침: coins 150, update+confirm 60번 → coins 50, 얻은 것 +1, onPulled 1회)
  - `gacha: cancel while choosing keeps coins` — menu 확인 → mode 'choose', 3볼 모두 kind 'poke' → cancel → mode 'menu', coins 그대로, onPulled 0.
  - `gacha: no coins → message, no balls` — coins 0 → 확인 → mode 'msg'.
  - `gacha: epic ball steps poke → great → ultra → open` — rng 를 `rollBalls` 첫 볼이 epic 이 되게 고정(예: 시드 탐색 또는 seq), choose 에서 cursor 0 확인 → 확인마다 `balls[0].kind` 가 'great' → 'ultra' → `opened` true 순서.
  - `gacha: unpicked balls open too, rewards only the chosen` — others 끝에 `balls.every(b => b.opened)`, 파티+결정 증가는 1.
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3: implement** `src/render/balls.js`(몬스터 빨강/흰, 슈퍼 파랑+빨간 띠 두 줄, 하이퍼 검정+노란 H 무늬, 가운데 버튼, `open` 으로 뚜껑 벌어짐) + 장면 (세 볼 x = W/2-64, W/2, W/2+64, 고른 볼은 가운데로 이동, 안 고른 볼은 아래쪽 양옆 작게). 이펙트: 단계 변화 `pickups/collect-burst`, epic 열림 `ui/level-up` (없으면 생략, 실패해도 멈추지 않게 fx 매니저가 이미 무시함).
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: Verify** 브라우저(창이 숨겨져 있으면 열어 달라고 요청)에서 평범·희귀·매우 희귀 한 번씩 (테스트용으로 `__app` 에서 rng 대신 결과 주입 가능하면 사용) — 볼 모양·흔들림·옆 볼 공개 확인
- [ ] **Step 6: Commit** `feat: pick one of three balls, upgrade on open`

### Task 2b: 10연속 (사용자 추가 결정)

**Files:** Modify `src/core/gacha.js`, `src/game/gacha.js` · Test `tests/gacha.test.js`, `tests/town.test.js`

**Interfaces:** `GACHA_TEN_COST = 900`; `claimBalls(game, balls, rng) => { ok:false, reason:'coins' } | { ok:true, results: Array<claim result> }` (900 한 번 차감, 순서대로 적용 → 같은 계열 두 번째는 결정). 장면 메뉴 `뽑기 (100코인)` · `10연속 (900코인)` · `돌아가기`; mode `ten`: 볼 10개(5×2), 확인마다 열리지 않은 첫 볼 한 단계, 취소 = 모두 열기(자동 빠르게), 다 열리면 확인 → `tenList`(이름·새 동료/결정 목록) → 확인 → menu. 결제·저장(`onPulled`)은 10개가 나오는 순간 한 번.

- [ ] tests: claimBalls 900 차감·10개 적용·같은 계열 겹치면 결정·부족 거절; 장면 10연속 연타 → 코인 −900 한 번, onPulled 1회, 모든 볼 opened
- [ ] Implement · `npm test` → PASS · Commit `feat: ten-pull with ten balls`

### Task 3: 문서
README 모집소 설명(볼 3개·볼 단계) · ROADMAP 완료 줄 · `npm test` · Commit `docs: gacha balls`

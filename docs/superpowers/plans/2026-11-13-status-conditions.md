# 상태이상 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 본가 4~5세대 규칙의 상태이상(마비·화상·독·맹독·잠듦·얼음·혼란)을 SRPG 규칙으로 넣는다.

**Architecture:** 랭크 때와 같은 방식 — 순수 모듈 `src/core/status.js` 에 규칙을 모으고, 데미지·이동·기술 처리·페이즈 처리·AI·화면에 끼워 넣는다. 유닛은 층마다 새로 만들어지므로 층 끝 회복과 저장은 손대지 않는다.

**Tech Stack:** vanilla ES modules, Canvas 2D, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-status-conditions-design.md`

## Global Constraints

- 주 상태 `unit.status`: `null | 'paralysis' | 'burn' | 'poison' | 'toxic' | 'sleep' | 'freeze'`; 보조 `unit.confusion`: 남은 턴(0 = 없음). 카운터 `unit.statusTurns`(잠듦 남은 수면 / 얼음 남은 턴 / 맹독 n).
- 마비: 이동력 `max(1, floor(move/2))`, 스피드 ×0.5, 기술 사용 시 25% 실패. 화상: 1/8, 물리 ×0.5. 독 1/8. 맹독 n/16 (n 1부터, 최대 15). 잠듦 1~3. 얼음 20% 해동, 최대 3턴 쉼, 불꽃 공격기에 맞으면 해동. 혼란 1~4턴, 50% 자해(위력 40, 물리, 타입 없음, 급소·상성·명중 없음).
- 면역: 불꽃→화상, 얼음→얼음, 독·강철→독/맹독. 전기자석파는 땅 타입 무효.
- 상태 데미지는 최소 1, 대사는 한국어 (스펙 §5 문구 그대로).
- 상태 데미지·혼란 자해로 적이 기절: 살아 있는 아군 전원 `shareRatio` 경험치 + 격파 코인.
- 아군(상대 편) 2마리 이상 잠듦·얼음 → 적 AI 잠듦 기술 점수 0.
- 시작 기술: 변화기 최대 2개.

## Review Focus

1. **잠든·얼은 유닛만 남은 편** — 아군 전원이 쉬면 플레이어 페이즈가 자동으로 넘어가야 하고(입력 대기에 갇히지 않음), 적 전원이 쉬면 적 페이즈도 바로 끝나야 한다. → Task 5 game.test.
2. **상태 데미지로 마지막 적·아군이 기절** — 페이즈 끝에 결과(win/lose)가 정해지면 다음 페이즈로 넘어가지 않고 결과 화면. → Task 3 battle.test, Task 5 game.test.
3. **마비 실패·혼란 자해 후 기절한 유닛** — 자해로 쓰러진 공격자가 연출 뒤 사라지고, 결과 판정·경험치(적이면) 정상. → Task 3.
4. **이미 잠든 대상에 불꽃 공격** — 해동은 얼음만; 잠듦은 그대로. 얼음 대상에 불꽃 변화기(도깨비불)는 해동 안 함(공격기만). → Task 3.
5. **이동 후 상태 기술 메뉴** — 마비로 실패하면 이동은 취소되지 않고 행동 종료(moveLocked 와 무관하게 cancel 불가 상태로). → Task 5.

---

### Task 1: 데이터 · 시작 기술 구성

**Files:** Modify `tools/fetch-pokeapi.js`, `src/core/learn.js` · Regenerate `src/data/generated/pokedex.js` · Test `tests/data.test.js`, `tests/learn.test.js`

**Interfaces — Produces:** 각 기술 `ailment: 'paralysis'|'burn'|'poison'|'toxic'|'sleep'|'freeze'|'confusion'|null`, `ailmentChance: number` (0 = 100%); `BAD_POISON = ['toxic','poison-fang']` → `ailment 'toxic'`. learnable 변화기 = `net-good-stats` ∨ (`effectKind === 'ailment'` ∧ ailment ≠ null ∧ `TARGET_KIND[target]`). `startingMoves` 반환 4개 이하, 변화기 ≤ 2, 공격기 ≥ 1.

- [ ] **Step 1: tests** — `thunder-wave`(learnable, ailment paralysis, kind enemy), `will-o-wisp` burn, `toxic` ailment 'toxic', `poison-fang` ailment 'toxic' chance 50, `ember` burn 10, `sleep-powder` sleep, `confuse-ray` confusion, `teeter-dance`·`swagger`·`flatter` learnable false, `tri-attack` ailment null; 모든 종 × 레벨 [5,8,10,15,20,30] 에서 startingMoves 변화기 ≤ 2 ∧ 공격기 ≥ 1 ∧ 길이 ≤ 4; `oddish@15` 에 공격기 ≥ 2 (공격기가 2개 이상 배워져 있으면).
- [ ] **Step 2: Run** `npm test` → FAIL
- [ ] **Step 3: Implement** 도구 필드·learnable → `node tools/fetch-pokeapi.js`; `startingMoves`: 최근 learnable 목록에서 뒤에서부터 4칸을 채우되 변화기는 2개까지만 받고, 칸이 남으면 더 오래된 공격기로 채움, 공격기가 0 이면 FALLBACK
- [ ] **Step 4: Run** `npm test` → PASS (다른 테스트의 기술 목록 기대치가 바뀌면 Task 1 범위로 갱신)
- [ ] **Step 5: Commit** `feat: status condition move data and starting move cap`

---

### Task 2: 상태이상 규칙 (순수)

**Files:** Create `src/core/status.js` · Modify `src/core/stages.js`(effectiveStat spe), `src/core/damage.js`(화상·자해), `src/core/pathfind.js`(이동력) · Test `tests/status.test.js`, `tests/damage.test.js`, `tests/pathfind.test.js`

**Interfaces — Produces:**
- `STATUS_KO = { paralysis:'마비', burn:'화상', poison:'독', toxic:'맹독', sleep:'잠듦', freeze:'얼음', confusion:'혼란' }`
- `newStatus() => { status: null, statusTurns: 0, confusion: 0 }`
- `canInflict(unit, ailment, move?) => { ok: boolean, reason?: 'immune'|'already' }` (move 로 전기자석파 땅 무효)
- `inflict(unit, ailment, rng) => { ok, reason? }` — sleep: statusTurns = 1 + floor(rng()*3); freeze: 3; toxic: 1; confusion: 1 + floor(rng()*4)
- `moveBudget(unit) => number` (마비 절반 최소 1); `pathfind.search` 가 사용
- `speedMultiplier(unit) => 0.5 | 1`; `effectiveStat(u,'spe')` 에 곱함
- `phaseStart(unit, rng) => { skip: boolean, event?: 'asleep'|'woke'|'frozen'|'thawed' }` — 잠듦: statusTurns>0 → −1, skip; 0 → 해제 woke. 얼음: rng()<0.2 또는 statusTurns===0 → thawed; 아니면 −1, skip
- `phaseEnd(unit) => { damage: number, kind?: 'poison'|'toxic'|'burn', confusionEnded: boolean }` — HP 감소는 호출 측(battle)이 적용; 맹독 n 증가, 혼란 −1
- `checkAction(unit, rng) => null | 'paralysis' | 'confusion'` — 마비 rng()<0.25 → 'paralysis'; 혼란 중 rng()<0.5 → 'confusion'
- damage.js: 화상 물리 ×0.5 (calcDamage·expectedDamage), `confusionDamage(unit) => number` (위력 40, 자기 atk/def 랭크 반영, 화상 ×0.5, 난수·급소 없음, 최소 1)

- [ ] **Step 1: tests** — 면역 표(charmander 화상 ✕, glaceon? → 1~4세대 얼음 타입 아무거나 얼음 ✕, bulbasaur(풀/독) 독 ✕, steelix 맹독 ✕, 땅 타입에 thunder-wave ✕, 다른 마비 기술은 땅 OK), 이미 독인데 잠듦 → already, 혼란은 주 상태와 공존·중복 already; moveBudget 3→1, 4→2, 5→2; spe 100 마비 → 50; 독 최대HP 80 → 10, 맹독 1/16 → 5 그다음 10; 화상 물리 기대 데미지 절반 특수 그대로; 잠듦 rng 0 → 1턴 쉼 후 기상, rng 0.99 → 3턴; 얼음 rng 0.5 3번 쉼 → 4번째 반드시 thawed, rng 0.1 → 바로 thawed; 혼란 감소; checkAction 마비 0.2 → 'paralysis' 0.3 → null; 상태 데미지 최소 1
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: status condition rules`

---

### Task 3: 전투 — 걸기 · 행동 판정 · 페이즈 처리

**Files:** Modify `src/core/battle.js`, `src/game/states.js`(endPhase 호출에 rng 만 전달) · Test `tests/battle.test.js`

**Interfaces:**
- Consumes: Task 2 전부.
- 유닛 생성 시 `...newStatus()`.
- `applyMove(state, userId, moveId, focusId, rng)` 결과 추가 필드: `blocked?: 'paralysis'|'confusion'`, `selfHit?: { damage, fainted }`, `statusChanges: [{ unitId, ailment, ok, reason? }]`, `thawed: unitId[]`. 판정 순서: `checkAction` → blocked 면 기술 없이 (혼란이면 자해 적용) 종료. 변화기: 대상별 명중(적만) → stat 변화 → `ailment` 이 있으면 inflict (명중 실패면 둘 다 없음). 공격기: 맞음 ∧ 면역 아님 ∧ 대상 생존 → `ailmentChance`(0=100) 로 inflict (조용히 실패: statusChanges 에 ok:false 로 남기되 연출은 ok 만); 불꽃 공격기가 맞으면(데미지>0) 얼음 대상 해동.
- `endPhase(state, rng = Math.random)`: (1) 끝나는 편: `phaseEnd` 데미지 적용 → 기절 처리(공유 경험치·코인·fainted·결과), 혼란 해제 이벤트, 그다음 랭크 만료 (2) 페이즈 전환 (3) 시작하는 편: `phaseStart` → skip 이면 `moved = acted = true`. `state.log.statusEvents = [{ unitId, kind: 'poison'|'toxic'|'burn'|'confusionEnd'|'asleep'|'woke'|'frozen'|'thawed'|'fainted', damage? }]` 매 호출 새로.
- 상태 데미지·자해 기절의 적 보상: `awardShare(state, defender)` — 살아 있는 아군 각 `floor(full × shareRatio)`, 코인 `3 + floor(level/3)`.

- [ ] **Step 1: tests** — 전기자석파 → 마비 / 땅 타입(gible) 무효 reason immune; 독 걸린 대상에 수면가루 → already; 불꽃세례 rng 로 화상 발동/불발, 대상 기절 시 없음; 마비 유저 rng 0.1 → blocked 'paralysis', 대상 HP 그대로, acted true; 혼란 유저 rng → blocked 'confusion' + selfHit 데미지; **(RF3)** 자해로 HP 1 적 기절 → 유닛 제거, log.coins 증가, 아군 경험치; 얼음 대상에 불꽃 공격 → thawed·status null, **(RF4)** 잠든 대상 불꽃 → 그대로, 얼음 대상에 도깨비불 → already(해동 없음); 페이즈 끝 독 데미지 이벤트; **(RF2)** 마지막 적이 독으로 기절 → state.result 'win'; 잠든 적: 적 페이즈 시작에 acted true·이벤트 asleep; 혼란 턴 만료 이벤트; createBattle 새 층 → status null
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: status conditions in battle`

---

### Task 4: AI

**Files:** Modify `src/core/ai.js`, `src/game/states.js`(쉬는 적 건너뛰기) · Test `tests/ai.test.js`

**Interfaces:** `planEnemyAction` 은 `unit.acted` 면 `{ moveTo: 현재 위치, attack: null }`. 상태이상 점수는 `positionalStatus` 의 `valueOn` 에 더함 (스펙 §4 계수 그대로: 잠듦·얼음 ×1.5, 마비 ×0.5, 화상 물리형 ×0.5 / 아니면 ×0.2 + maxHp/8×2, 독 maxHp/8×3, 맹독 maxHp/16×6, 혼란 ×0.4; `canInflict` 실패 0; 상대 편 잠듦·얼음 ≥ 2 → 잠듦 0). 명중 기대 곱하기는 기존대로.

- [ ] **Step 1: tests** — 잠든 적은 이동·공격 없음; 이미 마비인 대상에 전기자석파 안 씀; 공격이 닿지 않고 수면가루 사거리 안이면 수면가루; 아군 2마리 잠듦이면 수면가루 안 씀(대신 다른 행동)
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: enemy AI uses status conditions`

---

### Task 5: 화면

**Files:** Modify `src/game/states.js`, `src/render/mapAttack.js`, `src/render/ui.js` · Test `tests/game.test.js`

**Interfaces:**
- `ui.STATUS_COLOR = { paralysis:'#e0b818', burn:'#e07030', poison:'#a050c0', toxic:'#702890', sleep:'#909090', freeze:'#60b8e8', confusion:'#d060a0' }`; 정보창 이름 옆 배지(`STATUS_KO`), 혼란은 랭크 줄 앞; 맵 유닛 그림자 옆 4×4 점. 잠듦·얼음 유닛은 PMD `Sleep` 포즈가 있으면 Sleep, 없으면 회색 정지(얼음은 하늘색 틴트).
- 기술 정보창: 상태이상 변화기 효과 요약에 `STATUS_KO[ailment]`, 공격기에 부가효과가 있으면 "화상 10%".
- `mapAttack`: `statusMessages(changes, get)` (걸림 문구 §5, ok:false 는 변화기일 때만 "효과가 없는 것 같다..."), blocked 연출(대사 "몸이 저려서 움직일 수 없다!" / "○○는 혼란스러워 한다!" → "영문도 모르고 자신을 공격했다!" + 자해 HP 감소·기절), thawed 대사 "○○의 얼음이 녹았다!".
- states: 페이즈 배너 뒤 `noticeChain` 으로 `statusEvents` 대사(§5 문구, 데미지 이벤트는 대사에 HP 표시 없이 텍스트만) → 랭크 만료 대사; 쉬는 아군 선택 불가(acted); **(RF1)** 시작 처리 뒤 아군이 전원 acted 면 자동으로 적 페이즈, 적 전원 acted 면 바로 아군 페이즈; **(RF2)** 이벤트 처리 중 `st.result` 가 정해지면 결과 화면; **(RF5)** blocked 로 끝난 아군 행동은 finishAllyAction.
- [ ] **Step 1: tests** (game.test) — 마비 아군(rng 고정)이 기술 선택 → 연출 → idle, 유닛 acted; 아군 전원 잠듦 → 아군 페이즈가 연타 없이 적 페이즈로 진행; 적 전원 독 HP 1 → 적 페이즈 끝 이벤트 후 result 'win'; statusMessages 문구 5종
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Verify** 브라우저: 전기자석파 → 배지·이동 범위 감소, 수면가루 → 쉬는 턴 대사, 독 데미지 대사, 혼란 자해 (스크린샷, 사용자 저장 백업·복원)
- [ ] **Step 6: Commit** `feat: status condition UI`

---

### Task 6: 문서

**Files:** Modify `README.md`(전투 규칙 요약에 상태이상), `docs/ROADMAP.md`(완료, 다음: 결정 사용처)
- [ ] **Step 1:** 작성 · **Step 2:** `npm test` → PASS · **Step 3: Commit** `docs: status conditions`

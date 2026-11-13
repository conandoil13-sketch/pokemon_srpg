# 능력치 랭크 + 변화기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 변화기(자신·적·범위·아군)와 공격기 능력치 부가효과, −6~+6 랭크(3턴 지속), AI 사용, 화면 표시.

**Architecture:** 랭크 계산은 `core/stages.js` 순수 함수. 데이터는 PokeAPI 의 `stat_changes`·`target`·`meta` 를 생성 파일에 추가. 전투는 `applyAttack` 을 `applyMove`(공격·변화 공통)로 넓힌다. 연출은 기존 맵 위 공격 연출 흐름에 "랭크 팝업" 단계를 더한다.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-stat-stages-design.md`

## Global Constraints

- 랭크 −6~+6. 배율 `n≥0 → (2+n)/2`, `n<0 → 2/(2−n)` (공·방·특공·특방·스피드). 명중·회피는 랭크당 ±8%p, 최종 0~100.
- 지속 3턴: 변화 시 남은 턴 3, 그 유닛 편 페이즈 종료마다 −1, 0 이면 단계 0. ±6 에서 더 바뀌지 않으면 남은 턴 갱신 안 함.
- 대상 매핑은 스펙 §3 표 그대로. 범위형 거리 ≤ 2. 적 대상 변화기만 명중 판정.
- 부가효과: `damage+raise` → 사용자, `damage+lower` → 대상, `statChance` 0 = 100%, 빗나감·면역·대상 기절 시 대상 효과 없음.
- learnable = 위력 있는 공격기 ∨ (statChanges 있고 지원 대상인 변화기).
- 게임 텍스트 한국어, `core/` DOM 금지, 각 Task 끝에 커밋.

## Review Focus

1. **±6 에서 같은 기술 반복**: 단계·남은 턴 변화 없음, "더 이상 오르지 않는다" 메시지. → Task 1·4.
2. **범위형 변화기에 범위 안 대상이 0**: 메뉴에서 회색, AI 도 쓰지 않음. → Task 5·6.
3. **부가효과로 공격자 자신이 기절 상태?** (반동 아님, 해당 없음) 대신 **대상이 기절한 공격의 대상 부가효과**: 적용되지 않음, 사용자 쪽 효과는 적용. → Task 4.
4. **페이즈가 넘어갈 때 만료**: 상대 편 페이즈 종료로는 줄지 않음(자기 편 종료에만). → Task 1·4.
5. **랭크가 걸린 채 층 이동**: 다음 층은 랭크 없음(유닛 새로 생성). → Task 4.

---

### Task 1: 랭크 계산 (순수)

**Files:** Create `src/core/stages.js` · Test `tests/stages.test.js`

**Interfaces:**
- `STAT_KEYS = ['atk','def','spa','spd','spe','acc','eva']`, `API_STAT = { attack:'atk', defense:'def', 'special-attack':'spa', 'special-defense':'spd', speed:'spe', accuracy:'acc', evasion:'eva' }`, `STAGE_TURNS = 3`, `ACC_PER_STAGE = 8`
- `newStages() => { stages: {…0}, turns: {…0} }`
- `stageMultiplier(n) => number`
- `effectiveStat(unit, key) => unit.stats[key] × stageMultiplier(unit.stages?.[key] ?? 0)` (atk/def/spa/spd/spe)
- `accuracyShift(attacker, defender) => 8 × (acc − eva)`
- `applyStageChange(unit, key, change) => { key, before, after, applied: number }` — 클램프, applied ≠ 0 이면 turns[key] = 3
- `tickStages(unit) => key[]` — 남은 턴 −1, 0 이 된 능력치는 단계 0 으로, 그 키 목록 반환
- [ ] **Step 1: tests** — 배율 표 (−6 → 0.25, −1 → 2/3, 0 → 1, +2 → 2, +6 → 4); **(Review Focus 1)** +6 에서 +2 → applied 0·turns 그대로; 누적(+2,+1 → +3) 과 turns 3 갱신; tick 3번 → 만료 키 반환·단계 0; accuracyShift(+1 vs +2) = −8
- [ ] **Step 2: Run** `node --test tests/stages.test.js` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: stat stage math`

---

### Task 2: 데이터 — 변화기 필드 · learnable 확장 · 대상 규칙

**Files:** Modify `tools/fetch-pokeapi.js`, `src/data/moves.js` · Regenerate `src/data/generated/pokedex.js` · Test `tests/data.test.js`

**Interfaces:**
- 생성 기술: `{ …기존, target, statChanges: [{stat, change}], statChance, effectKind }`
- moves.js: `TARGET_KIND = { user:'self', 'selected-pokemon':'enemy', 'selected-pokemon-me-first':'enemy', 'random-opponent':'enemy', 'all-opponents':'enemies', 'opponents-field':'enemies', ally:'ally', 'user-and-allies':'allies', 'users-field':'allies' }`; 각 MOVE 에 `kind = TARGET_KIND[target]`, 변화기 `range`: self `[0,0]`, enemy `[1,2]`, enemies/allies `[0,2]`(범위), ally `[1,1]`; `area: boolean`
- learnable: 공격기 ∨ (category 'status' ∧ statChanges.length ∧ kind 있음)
- [ ] **Step 1: Implement** 도구 필드 추가·learnable 규칙 → `node tools/fetch-pokeapi.js` (캐시로 빠름; 캐시된 응답에 필드가 있음)
- [ ] **Step 2: tests** — `swords-dance`(self, attack +2, learnable), `growl`(enemies, attack −1), `agility`(speed +2), `thunder-wave` learnable false, `crunch` effectKind damage+lower·statChance 20, `close-combat` damage+raise·자신 −1 −1, 모든 learnable 변화기 kind 존재; 기존 시작 기술 테스트는 변화기가 섞여도 ≥1
- [ ] **Step 3: Implement** moves.js
- [ ] **Step 4: Run** `npm test` → (다른 실패는 Task 4 범위면 기록 후 진행) data 테스트 PASS
- [ ] **Step 5: Commit** `feat: status move data (stat changes, targets)`

---

### Task 3: 데미지 · 명중 · 순서에 랭크 반영

**Files:** Modify `src/core/damage.js`, `src/core/ai.js`(enemyTurnOrder) · Test `tests/damage.test.js`, `tests/ai.test.js`

**Interfaces:** A/D 에 `effectiveStat`, `hitChance` 의 스피드 비교에 유효 스피드 + `accuracyShift`, enemyTurnOrder 는 유효 스피드
- [ ] **Step 1: tests** — 공격 +2 → expectedDamage 약 2배(±1), 방어 −1 → 약 1.5배, 명중 −2 → hitChance 16 감소, 스피드 +2 가 회피/순서에 반영
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: stat stages in damage, accuracy and turn order`

---

### Task 4: 전투 — applyMove (공격·변화 공통), 부가효과, 만료

**Files:** Modify `src/core/battle.js` · Test `tests/battle.test.js`

**Interfaces:**
- 유닛 생성 시 `stages`, `turns` (newStages)
- `targetsOf(state, user, moveId, focus?) => Unit[]` — kind 별: self → [user], enemy/ally → [focus] (사거리 검사), enemies/allies → 거리 ≤ 2 의 해당 편 (allies 는 자신 포함)
- `applyMove(state, userId, moveId, focusId, rng) => { kind: 'attack'|'status', …attack 결과(공격일 때), stageChanges: [{ unitId, key, applied, after }], missed?: boolean }` — 공격기는 기존 applyAttack 경로 + 부가효과, 변화기는 대상별(적이면 명중 판정) `applyStageChange`
- `applyAttack` 은 `applyMove` 로 위임(기존 호출 호환)
- `endPhase(state)` 가 끝나는 편 유닛들 `tickStages` → `state.log.expired = [{ unitId, keys }]`(화면 알림용, 페이즈마다 새로)
- [ ] **Step 1: tests** — 칼춤 atk +2/turns 3; 울음소리: 거리 2 안 적 −1, 거리 3 은 영향 없음; 가짜 아군 대상 기술(테스트 내 MOVES 주입 없이 targetsOf 에 kind 'ally' 를 쓰는 로컬 move 객체로); 인파이트: 자신 def/spd −1 (100%); 깨물어부수기 rng 로 발동/불발; **(Review Focus 3)** 대상 기절 시 대상 효과 없음·자신 효과 있음; 빗나감·면역 시 부가효과 없음; **(Review Focus 4)** 아군 버프는 적 페이즈 종료로 줄지 않고 아군 페이즈 종료 3번에 만료, expired 기록; **(Review Focus 5)** createBattle 새로 만들면 stages 0
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: status moves and secondary stat effects in battle`

---

### Task 5: AI 변화기 사용

**Files:** Modify `src/core/ai.js` · Test `tests/ai.test.js`

**Interfaces:** `planEnemyAction` 결과 `attack` 에 변화기도 가능 (`{ moveId, targetId }`, 자신·범위형은 targetId = 사용자 id)
- 점수: 스펙 §7 — 자신 버프 = 공격 가능한 적이 없으면 고정 점수 20, 있으면 `(다음 턴 최선 기대 데미지 × (배율−1)) × 1.5`; 이미 그 능력치 +2 이상 또는 남은 턴 ≥ 2 면 제외. 범위·단일 디버프 = Σ대상 `(그 대상이 아군에게 줄 기대 데미지 × (1 − 새 배율))`, 대상 0 이면 제외. 명중 기대 반영.
- [ ] **Step 1: tests** — 공격 가능한 적이 없으면 칼춤 선택; +2 이면 칼춤 안 함(대신 접근/공격); **(Review Focus 2)** 범위 안 적 0 이면 울음소리 안 씀; 때릴 수 있고 강하면 공격 우선
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: enemy AI uses status moves`

---

### Task 6: 화면 — 메뉴·대상 선택·연출·정보창

**Files:** Modify `src/game/states.js`, `src/render/mapAttack.js`, `src/render/ui.js` · Test `tests/game.test.js`

**Interfaces:**
- 메뉴: 변화기 enabled = 대상 1 이상(자신은 항상), 라벨 옆 "변화" 작은 글자; 기술 정보창: 분류 "변화", 대상 이름("자신"/"적 하나"/"주변 적 전체"/"주변 아군"), 효과 요약("공격 +2")
- 대상 선택: enemy/ally → 기존 순환, self/area → 범위 하이라이트 + 확인 한 번
- 연출(`createMapAttack` 확장): 변화기는 'act'(Attack 대신 Idle 짧게) → 대상마다 ▲/▼ + "공격 +2" 팝업 → 대사 "○○의 공격이 크게 올라갔다!"/"더 이상 오르지 않는다!"/"빗나갔다"; 공격기 부가효과는 기존 연출 뒤 같은 팝업·대사
- 만료: 페이즈 배너 직후 `log.expired` 가 있으면 대사 "○○의 공격이 원래대로 돌아왔다" (여러 개면 한 줄씩)
- 정보창: 랭크 줄 "공+2 방−1 (3)" (0 은 생략)
- [ ] **Step 1: tests** (game.test) — 칼춤 선택 → 대상 선택 없이 확인 → 연출 후 유닛 atk +2; 울음소리: 범위 안 적이 없으면 메뉴 항목 disabled
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Verify** 브라우저: 칼춤 팝업·정보창 랭크·3턴 만료 대사, 적 변화기 사용, 인파이트 자신 하락 (스크린샷)
- [ ] **Step 6: Commit** `feat: status move UI and stage effects`

---

### Task 7: 문서

**Files:** Modify `README.md`, `docs/ROADMAP.md`
- [ ] **Step 1:** README 전투 규칙에 랭크·변화기·HP 배율, ROADMAP 완료/다음(상태이상)
- [ ] **Step 2: Run** `npm test` → PASS
- [ ] **Step 3: Commit** `docs: stat stages`

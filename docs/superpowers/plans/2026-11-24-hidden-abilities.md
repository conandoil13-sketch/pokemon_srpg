# 숨겨진 특성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1~5세대 숨겨진 특성을 결정 4개로 해금해 쓰게 하고, 새 5세대 특성 11개를 구현한다.

**Architecture:** 종 데이터에 `hidden` 한 칸, 동료에 `hiddenUnlocked` + `abilitySlot: 'hidden'`. 특성 효과는 기존 자리(`abilities.js` 배율, `stages.js` 랭크, `battle.js` 기술 처리·페이즈 끝)에 한 줄씩. 해금 잠금 목록은 `NO_EFFECT` 하나로.

**Tech Stack:** vanilla JS ES modules, node:test (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-24-hidden-abilities-design.md`

## Global Constraints
- 비용 `HIDDEN_UNLOCK_COST = 4`, 일반 해금(3)과 별개 — 일반 해금 없이도 가능.
- 준비 중(해금 거절) = `NO_EFFECT` 에 있는 특성. 새로 넣을 것: harvest · pickpocket · zen-mode · imposter.
- 숨겨진 특성은 5세대까지 나온 것만 (일반 슬롯과 같은 되돌림 규칙), 일반 특성과 같으면 `null`.
- 저장 v10 → v11. 적은 숨겨진 특성 없음. 메타몽 제외.
- 애널라이즈 1.3배 · 열폭주/독폭주 1.5배 · 프렌드가드 30% + 6%p/마리 · 멀티스케일 0.5 · 헤비메탈 ×2 · 라이트메탈 ×0.5.
- `codex-reviews/README.md`, `codex-reviews/2026-11-23-town-gen3-sublegendary.md` 는 커밋하지 않는다.

## Review Focus
1. 진화형에 `hidden` 이 없는데 `abilitySlot === 'hidden'` 인 동료 (진화·testParty·옛 저장) → 첫 일반 특성, 예외 없음.
2. 메타몽·일반 특성 하나뿐인 종에서 일반 칸 전환과 숨겨진 칸 전환이 섞일 때 (`setAbilitySlot` 이 잠긴 칸으로 안 가는지).
3. 매직미러가 되돌린 기술이 다시 튀는 무한 반사 · 매직미러끼리 · 틀깨기 공격자는 반사 안 됨.
4. 심술꾸러기와 클리어바디류·단순의 순서 (반전 먼저), 자기 기술의 자기 랭크 하락(엄청난힘 등)도 반전.
5. 변덕쟁이가 이미 +6/−6 인 능력을 고르는 경우 (다른 능력을 고르거나 그냥 적용 0) — 예외 없음.

---

### Task 1: 종 데이터에 숨겨진 특성
**Files:** Modify `tools/fetch-pokeapi.js` (abilityCandidates 옆, species 출력), regenerate `src/data/pokeapi.js`(생성 파일), Test `tests/hiddenAbilities.test.js` (new)
**Produces:** `SPECIES[key].hidden: string | null`; `ABILITIES` 에 숨겨진 특성 id 포함.
- [ ] Test: `hidden data` — `SPECIES.bulbasaur.hidden === 'chlorophyll'`, `SPECIES.foongus.hidden === 'regenerator'`; 모든 종 `hidden === null || ABILITIES[hidden]`; `hidden` 이 그 종 `abilities` 에 없음; `competitive`·`protean` 을 `hidden` 으로 가진 종 없음; `hidden` 이 있는 종 수 > 560.
- [ ] Run `node --test tests/hiddenAbilities.test.js` → FAIL.
- [ ] `hiddenCandidate(pokemon, genOf)`: 숨겨진 슬롯 특성이 `GEN_LIMIT` 이하면 그것, 아니면 `past_abilities` 의 숨겨진 슬롯 중 최근 허용 특성, 없으면 null; 일반과 같으면 null. `used` 집합에 hidden 포함. `node tools/fetch-pokeapi.js` (캐시 사용).
- [ ] Run → PASS, `npm test` 전체 PASS (validateData 포함). Commit.

### Task 2: 해금·전환·저장
**Files:** `src/core/progress.js` (abilityOf, unlockHidden, setAbilitySlot), `src/core/abilities.js:209` (abilityOf 사용), `src/core/save.js` (v11), `src/core/testParty.js:23`, 진화 처리(abilitySlot 유지하는 곳), `src/data/abilities.js` (NO_EFFECT 추가), Test `tests/hiddenAbilities.test.js`
**Consumes:** Task 1 `SPECIES[k].hidden`. **Produces:** `HIDDEN_UNLOCK_COST = 4`; `unlockHidden(game, key) → {ok} | {ok:false, reason:'missing'|'none'|'pending'|'already'|'shards'}`; `setAbilitySlot(game, key, slot: number | 'hidden')`; `hiddenPending(speciesKey) → boolean`; `abilityOf(m)` 가 `'hidden'` 처리.
- [ ] Tests: 결정 4개로 해금 → `abilitySlot === 'hidden'`, `abilityOf` 가 hidden, 결정 −4; 일반 해금 안 한 동료도 가능; 결정 3 → `shards`; 두 번 → `already`; `hidden === null` 종 → `none`; 숨겨진 특성이 NO_EFFECT(예: unnerve 가진 종) → `pending`, 결정 그대로; 잠긴 상태 `setAbilitySlot('hidden')` → `locked`; 해금 후 `setAbilitySlot(0)` → 일반, 다시 `'hidden'` 가능; 숨겨진 칸에서 진화형에 hidden 없음 → 첫 일반 특성; v10 저장 로드 → `hiddenUnlocked: false`, v11; v11 저장의 `'hidden'` 칸 유지, 잘못된 값은 0.
- [ ] Run → FAIL. 구현. Run → PASS, `npm test` PASS. Commit.

### Task 3: 요약 화면 특성 탭
**Files:** `src/game/summary.js` (특성 탭 그리기·입력, 116~137 근처)
**Consumes:** Task 2 함수들.
- [ ] 특성 탭 = 행 목록 `[일반 0, 일반 1?, 숨겨진?]` (없는 칸은 빼고, 메타몽은 지금 문구). 위아래 커서, 확인: 지금 칸이면 무시, 일반 칸은 지금 규칙(해금 3/전환), 숨겨진 칸은 잠김→`unlockHidden`, 열림→`setAbilitySlot('hidden')`. 행 표시: 이름, "숨겨진" 표시, 상태(`해금 결정 n/4` · 준비 중 회색 · 사용 중). 커서 행 설명 2줄. 거절 이유 대사: shards `결정이 모자란다 (n/4)`, pending `아직 이 게임에서 효과가 없어 해금할 수 없다.`
- [ ] 순수 로직이 없으면 테스트는 Task 2 로 충분. 브라우저 확인은 Task 6. Commit.

### Task 4: 배율·랭크 특성 8개
**Files:** `src/core/abilities.js` (attackMult, defendMult), `src/core/individual.js:12` (weightOf), `src/core/stages.js:37` (applyStageChange), `src/core/battle.js` (applyMove 시작의 플래그 계산 — plusActive 옆; 피격 후 정의 justified 옆), Test `tests/hiddenAbilities.test.js`
**Produces:** 유닛 플래그 `analyticActive: boolean`, `friendGuards: number` (applyMove 가 매번 계산).
- [ ] Tests (gen5abilities 의 `duel` 패턴 복사): analytic 가장 느릴 때 ×1.3, 아닐 때 ×1; flare-boost 화상+특수 ×1.5, 물리 ×1; toxic-boost 독+물리 ×1.5; heavy-metal `weightOf` ×2, light-metal ×0.5 (안다리걸기 위력 변화로 확인); multiscale 만피 ×0.5, 한 대 맞은 뒤 ×1; friend-guard 옆 보유자 1마리 → 받는 피해 ×0.7, 2마리 ×0.64, 보유자 자신은 안 줄어듦; rattled 악 공격에 맞으면 spe +1, 노말이면 0; contrary 울음소리 맞으면 atk +1, 칼춤 −2, 틀깨기 공격자의 울음소리는 −1.
- [ ] Run → FAIL. 구현 (contrary 는 `applyStageChange` 첫 줄에서 `!breaker && has(unit,'contrary')` 이면 부호 반전 — stageGuard 앞). Run → PASS, `npm test` PASS. Commit.

### Task 5: 변덕쟁이·매직미러
**Files:** `src/core/battle.js` (endPhase 의 speed-boost 옆; applyMove 변화기 루프 677~), `src/core/field.js` (layTraps 반사), Test `tests/hiddenAbilities.test.js`
- [ ] Tests: moody 페이즈 끝 → 서로 다른 두 능력이 +2/−1 (rng 고정), 명중·회피 안 건드림, 전부 +6 이어도 예외 없음; magic-bounce 보유자에게 전기자석파 → 시전자가 마비, 보유자 멀쩡, `abilityEvents` 에 magic-bounce; 보유자 옆 아군에게 울음소리 → 시전자 atk −1; 2칸 떨어진 아군은 반사 안 됨; 매직미러끼리 → 한 번만 튀고 끝(시전자 매직미러여도 시전자가 맞음); 틀깨기 시전자 → 반사 안 됨; 자기 자신·아군 대상 변화기는 반사 안 됨; 보호 범위에 압정 → 압정이 시전자 주변(시전자 편을 해치는 쪽)으로.
- [ ] Run → FAIL. 구현: 변화기 루프에서 대상 `t` 가 상대이고 `!breaker` 이고 (t 또는 t 의 상하좌우 같은 편)에 magic-bounce 가 있으면, 그 대상 처리를 (시전자=보유자, 대상=a) 로 바꿔 한 번 적용 (되돌린 처리는 다시 반사 검사 안 함). Run → PASS, `npm test` PASS. Commit.

### Task 6: 설명·문서·브라우저
**Files:** `src/data/abilities.js` (`SRPG_ABILITY_TEXT` 11개), `docs/dungeon-guide.md` ("숨겨진 특성" 절), `docs/ROADMAP.md` 완료 줄
- [ ] 11개 특성의 SRPG 설명 (스펙 표 문장 그대로). 테스트: 11개 모두 `ABILITIES[id].desc` 가 `SRPG_ABILITY_TEXT` 와 같고 `inactive` 아님.
- [ ] `npm test` PASS. 브라우저(음소거·세이브 스냅샷): 요약 화면에서 숨겨진 특성 해금·전환 스크린샷, 전투에서 매직미러 반사 한 번. 세이브 복원. Commit.

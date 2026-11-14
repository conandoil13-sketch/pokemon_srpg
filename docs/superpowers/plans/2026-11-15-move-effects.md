# 기술 효과 채우기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 흡수·반동·연속 공격·급소율·고정 데미지·회복기(층당 2번)와 SRPG 판 선제기(치고 빠지기)·풀죽음(다음 차례 기술 봉인)을 넣고, 독 연출을 보라색으로, 이펙트 미리보기 페이지를 만든다.

**Architecture:** 데이터 도구가 기술 메타(흡수·회복·타수·급소·풀죽음·우선도)를 더한다(기존 값 해시 불변). `moves.js` 덮어쓰기 표가 배울 수 있음·고정 데미지·회복·날씨 회복을 정한다. 전투(`battle.js`·`damage.js`·`abilities.js`·`status.js`)가 효과를 적용하고, `states.js` 에 치고 빠지기 모드, AI·예상 창이 기대값을 반영한다. 연출은 `moveFx.js`·`mapAttack.js`, 미리보기는 `tools/fx-preview.html`.

**Tech Stack:** vanilla ES modules, Canvas 2D, pixelfx(vendored), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-move-effects-design.md` (§6 결정 포함)

## Global Constraints
- 흡수 = 실제로 깎인 HP × drain%(최소 1), 해감액이면 그만큼 피해. 꿈먹기는 잠든 대상만.
- 반동 = 실제로 깎인 HP 합 × |drain|%(최소 1), 돌머리·매직가드 면역, 반동 기절 보상 없음.
- 연속: 2~5회 = 2(37.5)·3(37.5)·4(12.5)·5(12.5)%, 고정 2회, 스킬링크 최대. 명중 대상마다 한 번, 타마다 데미지·급소·접촉 특성, 옹골참 첫 타만, 부가효과·풀죽음은 마지막 타 뒤 한 번, 쓰러지면 멈춤.
- 급소 단계: 0 → 1/16, 1 → 1/8, 2+ → 1/4. 대운 +1, 전투무장·조가비갑옷 면역 우선.
- 고정: 지구던지기·나이트헤드 = 레벨, 용의분노 40, 소닉붐 20, 상성 무효만 적용.
- 회복기: 자신만, healing%(광합성·아침햇살·달의불빛: 쾌청 2/3 · 비/모래/싸라기눈 1/4 · 그 외 1/2), 유닛 `healUses` 층 시작 2, HP 가득·0회면 메뉴 회색.
- 선제기(priority > 0 공격기): 기술이 나갔으면(마비·혼란 막힘 제외) 차례에 한 번 `moveBudget − spent` 로 다시 이동, 취소 = 제자리 끝. AI 는 아군에게서 먼 칸.
- 풀죽음: flinchChance, 맞고 살아남으면 `flinch` → 그 편 다음 페이즈 시작 `sealed`(모든 기술 불가, 이동 가능) → 페이즈 끝 해제. flinch/sealed 중 재풀죽음 없음. 정신력·보스 면역. 속이다는 대상마다 한 층 한 번(`fakedOut`).
- 독 보라 팔레트: 독 타입 기술 + `status/poisoned`·`nature/acid-splash` (각 색 R ≥ G, B ≥ G).
- 새 효과 없는 기술의 난수 소비 순서 불변.

## Review Focus
1. 연속 공격 도중 대상이 기절 → 남은 타격 없음, 경험치 한 번, 연출이 멈추지 않음. → Task 2 test.
2. 반동으로 마지막 아군이 기절하고 적도 전멸 → 결과(승리 우선, 지금 자폭 규칙과 같게). → Task 2 test.
3. 치고 빠지기 이동 중 보물상자·계단 칸 → 지금 이동과 같은 도착 처리(상자 열기·계단 돌파). → Task 3 test.
4. 풀죽은(sealed) 유닛만 남은 아군 차례 → 이동만 하고 끝낼 수 있음(멈춤 없음). → Task 3 test.
5. 회복기 2번 다 쓴 뒤 다음 층 → 다시 2번. → Task 2 test.

---

### Task 1: 기술 데이터
**Files:** Modify `tools/fetch-pokeapi.js`, `src/data/generated/pokedex.js`(재생성), `src/data/moves.js` · Test `tests/data.test.js`
**Produces:** `MOVES[id]` 에 `drain`, `healing`, `minHits`, `maxHits`, `critRate`, `flinchChance`, `priority`; 덮어쓰기 `fixedDamage: 'level' | number`, `heal: { weather?: true }`, `dreamOnly: true`(꿈먹기); 고정 4개·회복기 7개 `learnable: true`.
- [ ] tests: 새 필드(기가드레인 drain 50, 이판사판태클 −33, 바늘미사일 2~5, 베어가르기 critRate 1, 물기 flinch 30, 전광석화 priority 1, 속이다 priority 3·flinch 100), 지구던지기·HP회복 learnable, 기존 필드 해시(learnable·새 필드 제외) 불변
- [ ] FAIL · 도구 수정 · `node tools/fetch-pokeapi.js` · PASS · Commit `feat: move meta for drain, recoil, multi-hit, crit, flinch, priority`

### Task 2: 본가 효과 (흡수·반동·연속·급소·고정·회복기)
**Files:** Modify `src/core/battle.js`, `src/core/damage.js`, `src/core/abilities.js`, `src/data/abilities.js`(돌머리·스킬링크·해감액·정신력 효과 있음으로) · Test `tests/moveEffects.test.js`(신규)
**Interfaces:** `critRate(attacker, defender, move)`; `fixedDamage(attacker, defender, move) => number|null`; applyMove 결과 `hits[]` 타격별(`strike`), `strikes`, `drained`, `recoil`, `healed`; 유닛 `healUses`(makeUnit 2).
- [ ] tests: 흡수 50%·최대 HP·해감액 피해·꿈먹기 실패; 반동 비율·돌머리·매직가드·**(RF2)** 반동 동시 전멸 결과; 연속 분포(1만 번)·스킬링크·**(RF1)** 기절하면 멈춤·경험치 한 번; 급소 1/8·대운 1/4·전투무장 0; 고정 레벨·40·20·고스트 무효; 회복 50%·광합성 날씨·healUses 2→0 거절·HP 가득 거절·**(RF5)** 새 층 2
- [ ] FAIL · implement · PASS · Commit `feat: drain, recoil, multi-hit, crit stages, fixed damage and limited healing`

### Task 3: SRPG 효과 (치고 빠지기 · 풀죽음)
**Files:** Modify `src/core/battle.js`(spent 기록, flinch/sealed, fakedOut), `src/core/status.js`(phaseStart sealed), `src/game/states.js`(retreat 모드, 봉인 메뉴), `src/core/ai.js`(공격 뒤 후퇴) · Test `tests/moveEffects.test.js`, `tests/game.test.js`
**Interfaces:** `moveUnit` 이 `unit.spent += 경로 비용`(states·AI 가 비용 전달), `canRetreat(state, unit) => budget|0`, `retreatMove(state, id, x, y)`; 결과 `retreat: true`. 유닛 `flinch`, `sealed`, `fakedOut`.
- [ ] tests: 선제기 뒤 reachable 이 남은 이동력, 한 번만, 마비 막힘이면 없음; **(RF3)** 후퇴 칸이 상자면 열림; 풀죽음 확률·다음 차례 sealed·이동 가능·정신력·보스·재풀죽음 없음·속이다 한 층 한 번; **(RF4)** sealed 아군만 남아도 차례 진행; AI 가 선제기 뒤 멀어짐
- [ ] FAIL · implement · PASS · Commit `feat: hit-and-run priority moves and flinch seals`

### Task 4: AI · 예상 창 · 기술 정보
**Files:** Modify `src/core/damage.js`(expectedDamage 평균 타수·고정), `src/core/ai.js`(흡수 가산·반동 감산·자기 기절 제외·회복기), `src/game/states.js`(기술 정보 효과 글자, 회복기 회색 사유) · Test `tests/ai.test.js`, `tests/game.test.js`
- [ ] tests: 기대 데미지 2~5회 ≈ 3.17배; 반동으로 자기 기절 기대면 그 기술 안 고름; HP 40% 적이 회복기 고름, 0회면 안 고름; 기술 정보 "흡수 50%"·"2~5회"·"선제"·"풀죽음 30%"
- [ ] FAIL · implement · PASS · Commit `feat: AI and forecasts understand the new move effects`

### Task 5: 연출 · 독 보라 · 미리보기
**Files:** Modify `src/data/moveFx.js`(보라 팔레트, 상태 연출 palette 옵션), `src/render/mapAttack.js`(흡수·반동·연속·회복 연출, 풀죽음·봉인 대사) · Create `tools/fx-preview.html` · Test `tests/fx.test.js`
- [ ] tests: 독 팔레트 각 색 R ≥ G·B ≥ G, 독 상태 연출 spec 에 palette; 연속 연출 단계 수 = 타수(짧게), 흡수·반동 메시지
- [ ] FAIL · implement · PASS · Verify 브라우저(미리보기 페이지·독 연출·연속기 한 판, 확인용 저장은 원래대로) · Commit `feat: purple poison, effect animations and fx preview page`

### Task 6: 문서
README(기술 효과·치고 빠지기·풀죽음·회복 횟수) · ROADMAP · `npm test` · Commit `docs: move effects`

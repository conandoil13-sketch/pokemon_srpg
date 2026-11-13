# 특성 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4세대 기준 특성 123개를 데이터·저장·전투·AI·화면에 넣는다 (스펙 §4 분류대로).

**Architecture:** 특성 효과는 순수 모듈 `src/core/abilities.js` 의 훅 표. 데미지·명중·상태·랭크·페이즈·이동·층 시작 지점에서 훅을 부른다. 데이터는 PokeAPI 생성 + 한국어 설명 덮어쓰기 표.

**Tech Stack:** vanilla ES modules, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-abilities-design.md`

## Global Constraints
- 4세대 기준: 숨겨진 특성 제외, gen ≥ 5 특성 제외(과거 특성으로 되돌림).
- 결정 3개로 특성 바꾸기 (같은 계열 뿌리). 특성 하나뿐인 종은 불가.
- 접촉 = 거리 1 에서 쓴 물리 기술.
- 저장 v5 (v4 → v5: 기존 멤버에 결정적 무작위 특성).
- 위협: 이동을 마쳤을 때 인접 적 공격 −1(2턴), 같은 대상 연속 발동 불가. 위험예지·예지몽: 적 정보창 경고.

## Review Focus
1. 진화하면 특성 슬롯 유지 (슬롯 2 → 진화형 슬롯 2, 진화형에 슬롯 2 없으면 슬롯 1). → Task 2.
2. 특성 효과로 HP 회복이 최대치를 넘지 않음, 기절한 유닛은 회복 안 됨. → Task 4.
3. 날씨 특성끼리 충돌(아군 잔비 vs 적 가뭄) → 정한 우선순위로 하나만. → Task 5.
4. 매직가드 유닛이 독·날씨·반격·자폭 피해를 안 받음, 그러나 기술 데미지는 받음. → Task 4/5.
5. 틀깨기 공격자가 부유·축전 등 방어 특성을 무시. → Task 3.

---

### Task 1: 특성 데이터
**Files:** Modify `tools/fetch-pokeapi.js` (+ 재생성), Create `src/data/abilities.js`(생성 데이터 + `src/data/abilityText.js` 설명 덮어쓰기), Modify `src/data/species.js` · Test `tests/data.test.js`
**Produces:** `SPECIES[k].abilities: string[]` (슬롯 순, 1~2개), `ABILITIES[id] = { id, name, desc }`.
- [ ] tests: gengar ['levitate'], koffing ['levitate'](화학변화가스 아님), geodude ['rock-head','sturdy'], 모든 종 1~2개·모든 id 가 ABILITIES 에, gen ≥ 5 특성 id 없음, ③ 특성 desc 가 abilityText 의 SRPG 문구
- [ ] Run → FAIL · Implement · Run → PASS · Commit `feat: ability data (gen 4 basis)`

### Task 2: 멤버·유닛 특성, 저장 v5, 결정으로 바꾸기
**Files:** Modify `src/core/progress.js`(newMember 에 ability), `src/core/battle.js`(makeUnit ability: 멤버 값 또는 rng/해시), `src/core/save.js`(v5), `src/core/evolution.js`(진화 시 슬롯 유지), Create `swapAbility(game, species) => {ok, reason?}` in `src/core/progress.js` · Test `tests/save.test.js`, `tests/progress.test.js`
- [ ] tests: newMember 결정적(rng 주입) 특성; v4 저장 불러오면 모든 멤버 특성 있음; cleanMember 잘못된 특성 → 첫 슬롯; **(RF1)** 진화 슬롯 유지; swapAbility 결정 3 소모·다른 특성, 부족/특성 하나 거절; 적 makeUnit 특성 목록 안
- [ ] Run → FAIL · Implement · Run → PASS · Commit `feat: units and members carry abilities; swap with shards`

### Task 3: 훅 틀 + 데미지·명중·급소·무효/흡수 (① 의 데미지 계열)
**Files:** Create `src/core/abilities.js`, Modify `src/core/damage.js`, `src/core/battle.js` · Test `tests/abilities.test.js`
**Interfaces:** `damageMult(attacker, defender, move, ctx)`, `immunity(attacker, defender, move) => null|{ blocked:true, heal?, boost?, text }`, `accuracyMult`, `critStage`, `critMult`, `stabMult`, `moveType(attacker, move)`(노말스킨·기분파), `ignoresAbility(attacker)`(틀깨기). damage.js 가 호출, battle.js 가 무효/흡수 결과 적용·이벤트.
- [ ] tests (특성마다 1개 이상): 심록류 1/3 이하, 적응력, 테크니션, 색안경, 노말스킨, 배짱, 천하장사, 근성(화상 감소 무시), 이상한비늘, 의욕, 두꺼운지방, 내열, 필터/하드록, 전투무장, 대운, 스나이퍼, 복안, 노가드, 축전/저수/전기엔진/타오르는불꽃/부유/불가사의부적/건조피부(물), 철주먹, 방음, **(RF5)** 틀깨기
- [ ] Run → FAIL · Implement · Run → PASS · Commit `feat: damage and immunity abilities`

### Task 4: 상태이상·랭크·날씨·페이즈 특성 (① 나머지) + 접촉 반격
**Files:** Modify `src/core/abilities.js`, `status.js`, `stages.js`, `weather.js`, `battle.js` · Test `tests/abilities.test.js`
- [ ] tests: 면역류 7종, 클리어바디/하얀연기/괴력집게/날카로운눈, 단순, 천진, 가속, 탈피, 포이즌힐, 젖은접시/아이스바디/촉촉바디/선파워/리프가드/건조피부(날씨), 모래숨기/눈숨기, 에어록, 기분파, 매직가드(**RF4**), 하늘의은총, 인분, 일찍기상, 갈지자걸음, 분노의경혈, 변색, 습기, 접촉 반격 6종(거리 1 물리만), **(RF2)** 회복 최대치·기절 유닛
- [ ] Run → FAIL · Implement · Run → PASS · Commit `feat: status, stage, weather and contact abilities`

### Task 5: SRPG 재해석 특성 (③)
**Files:** Modify `src/core/abilities.js`, `battle.js`(이동 도착 훅·층 시작 훅·끌어오기·묶기), `src/core/pathfind.js`(묶임 이동력 1), `src/core/run.js`(픽업), `src/core/ai.js`(위협 등 반영 필요 시) · Test `tests/abilities.test.js`
- [ ] tests: 위협(도착 시 인접 적 −1, 같은 대상 연속 불가), 날씨 특성 **(RF3)** 우선순위, 피뢰침/마중물 끌어오기, 개미지옥/그림자밟기/자력 묶기, 옹골참(한 층 한 번), 게으름, 슬로스타트, 트레이스, 다운로드, 플러스/마이너스, 플라워기프트, 나이트메어, 싱크로, 픽업/꿀모으기
- [ ] Run → FAIL · Implement · Run → PASS · Commit `feat: SRPG-adapted abilities`

### Task 6: 화면
**Files:** Modify `src/render/ui.js`, `src/game/states.js`, `src/render/mapAttack.js`, `src/game/party.js`, 결산 화면 · Test `tests/game.test.js`
- [ ] tests: 정보창에 특성 이름; 특성 발동 이벤트 → 대사; 위험예지 경고 문구; 편성소 특성 바꾸기 메뉴(결정 부족 시 비활성)
- [ ] Run → FAIL · Implement · Run → PASS · Verify (오프라인 또는 브라우저) · Commit `feat: abilities on screen`

### Task 7: 문서
README 특성 요약, ROADMAP · `npm test` · Commit `docs: abilities`

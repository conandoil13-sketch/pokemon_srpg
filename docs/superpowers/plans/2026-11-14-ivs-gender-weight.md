# 개체값 · 성별 · 몸무게 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동료·적마다 개체값(0~31)·성별·몸무게를 두고, 뽑기 중복으로 개체값을 능력치별 최대로 합치고 성별을 해금하며, 성별 진화·헤롱헤롱·투쟁심·몸무게 기술을 넣는다.

**Architecture:** 데이터 도구가 성별 비율·몸무게·진화 성별 조건·풀묶기를 받아 생성 파일에 더한다. 순수 모듈 `src/core/individual.js` 가 개체값·성별 규칙, `statsAt(base, level, ivs)` 가 개체값 반영. 유닛은 `ivs/gender/weight` 를 들고, 헤롱헤롱은 혼란 같은 휘발 상태. 저장 v8.

**Tech Stack:** vanilla ES modules, node (데이터 도구, 네트워크), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-ivs-gender-weight-design.md` (§6 빌더 체크 뒤 정리)

## Global Constraints
- 개체값 0~31 정수, 키 `hp atk def spa spd spe`. 메타몽 31 고정. ivs 없는 호출은 31 (호환).
- 성별 `'male' | 'female' | null`, `genderRate` −1 없음 · 0 ♂만 · 8 ♀만 · 그 외 ♀ 확률 rate/8.
- 기호: ♂ `#4878f0`, ♀ `#f05878`. 종 이름에 ♂/♀ 가 있으면 생략. 성별 없음은 기호 없음.
- 성별 진화: 킬리아→엘레이드 ♂ / 눈꼬마→눈여아 ♀ / 도롱벌레→도롱마담 ♀ · 나메일 ♂ / 세꿀버리→비퀸 ♀. 레벨·종류는 지금 데이터 그대로.
- 헤롱헤롱: 반대 성별만, 기술 쓸 때 50% 실패, 3(그 편 페이즈 끝마다 −1), 건 유닛(`infatuatedBy`) 기절 시 풀림, 둔감 면역. 헤롱헤롱바디 접촉 30%. 투쟁심 같은 ×1.25 반대 ×0.75. 유혹 반대 성별만 특공 −2.
- 몸무게 위력: <10 20 · <25 40 · <50 60 · <100 80 · <200 100 · 이상 120 (kg).
- 개체값 판정: 31 최고 · 26~30 훌륭함 · 16~25 꽤 좋음 · 1~15 그럭저럭 · 0 별로.
- 저장 v8.

## Review Focus
1. 데이터를 다시 받은 뒤 기존 필드(종족값·타입·습득표·진화 규칙 레벨/종류·특성)가 한 글자도 안 바뀜. → Task 1 test (스냅샷 비교).
2. 성별을 바꾼 뒤 진화 판정: ♀ 킬리아에 진화의돌 → 엘레이드 후보 없음, ♂ 로 바꾸면 있음. → Task 2 test.
3. 헤롱헤롱 건 유닛이 쓰러지면 걸린 쪽이 다음 행동부터 정상. → Task 3 test.
4. 10연속에서 같은 계열이 두 번 나오면 두 번째가 개체값 합치기·성별 해금(결과에 `ivUp`). → Task 2 test.
5. v7 저장(개체값·성별 없음)을 불러오면 모든 멤버 채워지고 메타몽 31·성별 null. → Task 2 test.

---

### Task 1: 데이터 — 성별 비율 · 몸무게 · 진화 성별 · 풀묶기

**Files:** Modify `tools/fetch-pokeapi.js`, `src/data/generated/pokedex.js`(재생성), `src/data/species.js`(필드 노출), `src/data/moves.js` 또는 기술 덮어쓰기 표(low-kick/grass-knot `weightPower`, 배울 수 있음) · Test `tests/data.test.js`

**Interfaces (Produces):** `SPECIES[k].genderRate: -1..8`, `SPECIES[k].weight: number(kg)`, 진화 규칙 `rule.gender?: 'male'|'female'`, `MOVES['grass-knot']`, `MOVES['low-kick'].weightPower === true`(위력 null 대신 표시용 null 유지), 둘 다 `learnable: true`.

- [ ] **Step 1: 재생성 전 스냅샷** — 지금 `SPECIES` 각 종의 `{ base, types, learnset, evolutions(gender 제외), abilities, stage, bst }` 를 scratch JSON 으로 저장(테스트 파일엔 해시만: 정렬 JSON 의 문자열 해시를 상수로).
- [ ] **Step 2: failing tests** — 모든 종 `genderRate` 정수 −1~8·`weight > 0`; 메타몽 −1·4kg, 니드런♀ 8, 니드런♂ 0, 이브이 1; 킬리아→엘레이드 rule.gender 'male', 눈꼬마→눈여아 'female', 도롱벌레 두 갈래 성별, 세꿀버리→비퀸 'female'; **(RF1)** 기존 필드 해시가 스냅샷과 같음; grass-knot·low-kick weightPower.
- [ ] **Step 3: implement** — 도구: species `gender_rate`, pokemon `weight / 10`, toDetail 에 `gender`(1 → 'female', 2 → 'male')를 남겨 classifyBranches 결과 rule 에 붙임(**레벨·종류 분류 로직은 건드리지 않음** — gender 는 `extra` 판정에서 빼고 규칙에만 덧붙임; 그 결과 분류가 바뀌면 바뀐 종을 테스트가 잡음), 풀묶기 기술 받기. `node tools/fetch-pokeapi.js` 실행(네트워크, 캐시 사용).
- [ ] **Step 4:** `npm test` → PASS, `git diff --stat src/data/generated` 확인
- [ ] **Step 5: Commit** `feat: gender rate, weight and gendered evolutions in data`

### Task 2: 개체값 · 성별 규칙 · 뽑기 합치기 · 저장 v8

**Files:** Create `src/core/individual.js`, `tests/individual.test.js` · Modify `src/core/stats.js`, `src/core/progress.js`, `src/core/evolution.js`, `src/core/gacha.js`, `src/core/save.js`, `tests/save.test.js`

**Interfaces (Produces):**
- `individual.js`: `IV_KEYS`, `rollIvs(rng) => ivs`, `hashIvs(...seed)`, `mergeIvs(have, add) => { ivs, up: string[] }`, `rollGender(species, rng) => gender|null`, `hashGender(species, ...seed)`, `setGender(game, species, g) => {ok} | {ok:false, reason:'missing'|'fixed'|'locked'}`, `genderSymbol(species, gender) => '♂'|'♀'|''` (이름에 기호 있으면 ''), `GENDER_COLOR`, `ivGrade(v) => string`, `weightPower(kg) => number`.
- `statsAt(base, level, ivs = null)`.
- `newMember(species, level, rng)` → `ivs`, `gender`, `genders: [gender]`(null 이면 []); 메타몽 ivs 31.
- 진화: `levelEvolutionOptions(sp, level, gender)`, `stoneEvolutionOptions(sp, gender)` — rule.gender 가 있으면 일치할 때만. 호출하는 곳(applyExp·box·main)에 멤버 성별 전달.
- gacha `applyBall` 중복: `ivUp`(오른 능력치 목록)·`newGender`(해금된 성별 또는 null)를 결과에 추가; 굴린 성별/개체값은 rng.
- save v8: §3 그대로 (`ivs` 없으면 `hashIvs(species)`, `gender` 없으면 `hashGender(species)`, `genders` 정리, 메타몽 31·null).

- [ ] **Step 1: failing tests** — rollIvs 범위·rng 결정; mergeIvs 최대·up 목록; statsAt ivs 0 < 31; rollGender 분포(이브이 ♀ ≈12.5% ±2%p, 루주라 항상 ♀, 코일 null); setGender 잠김/해금/고정; genderSymbol 니드런 ''; ivGrade 경계; weightPower 경계(9.9/10/24.9/25/…/200); **(RF2)** ♀ 킬리아 stoneEvolutionOptions 에 엘레이드 없음 → setGender ♂ 후 있음; 도롱벌레 Lv.25 ♂ → 나메일만; 세꿀버리 ♂ Lv.25 → 없음; **(RF4)** claimBalls 에 같은 계열 둘 → 두 번째 결과 `ivUp` 배열·성별 다르면 `newGender`; **(RF5)** v7 저장 → v8 채움(메타몽 31·null).
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: IVs and gender for members; duplicate pulls merge IVs; save v8`

### Task 3: 전투 — 유닛 개체값·성별·몸무게, 헤롱헤롱, 성별 특성·기술, 몸무게 위력

**Files:** Modify `src/core/battle.js`, `src/core/status.js`, `src/core/abilities.js`, `src/core/damage.js`, `src/core/ai.js`, `src/data/abilities.js`(NO_EFFECT 에서 rivalry·cute-charm·oblivious 빼고 SRPG 설명) · Test `tests/abilities.test.js`, `tests/battle.test.js`

**Interfaces:**
- Consumes: Task 2 `hashIvs`, `hashGender`, `weightPower`.
- Produces: 유닛 `ivs`, `gender`, `weight`(메타몽 `build.weight ?? 종`). makeUnit 아군은 멤버 값, 적은 해시. `infatuation: 0..3`, `infatuatedBy: id|null` (newStatus). `checkAction` 에 헤롱헤롱 50% → blocked `'infatuation'`. phaseEnd 감소·`infatuationEnd` 이벤트, knockOut 시 그 유닛이 건 헤롱헤롱 해제. 기술 `attract`(ailment infatuation), `captivate`(반대 성별 조건 특공 −2). 데미지: `move.weightPower` → 위력 = `weightPower(defender.weight)` (calcDamage·expectedDamage 공통). 투쟁심 attackMult, 헤롱헤롱바디 접촉 30%, 둔감 면역.

- [ ] **Step 1: failing tests** — 아군 유닛 stats 가 멤버 ivs 반영, 적 ivs 결정적; 메로메로: 같은 성별·성별 없음 실패, 반대 성공; 헤롱헤롱 rng 0.4 → blocked 'infatuation', 0.6 → 정상; 페이즈 끝 3번 → 풀림 이벤트; **(RF3)** 건 유닛 기절 → 바로 풀림; 둔감 면역; 헤롱헤롱바디 접촉 30%; 투쟁심 같은 ×1.25·반대 ×0.75·성별 없음 ×1; 유혹 반대만 특공 −2; 안다리걸기 메타몽(4kg) 상대 위력 20 vs 잠만보(460kg) 120 기대 데미지 비.
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: IVs, gender and weight in battle; infatuation and gender abilities`

### Task 4: 화면

**Files:** Modify `src/render/ui.js`(정보창 이름 옆 기호), `src/game/box.js`(패널 기호), `src/game/summary.js`(정보 페이지 성별·몸무게·성별 전환, 능력치 페이지 개체값·판정), `src/game/gacha.js`(중복 대사·10연속 목록 "개체값↑"/새 성별), `src/game/results.js`(이름 옆 기호), `src/game/states.js`(헤롱헤롱 대사·`phaseNotices`·blocked 연출), `src/render/mapAttack.js`(blocked 'infatuation' 문구) · Test `tests/game.test.js`, `tests/town.test.js`

**Interfaces:** `drawNameWithGender(ctx, species, gender, x, y, color?, font?)` (ui.js) — 이름 + 색 기호, 이후 x 반환. 자세히 보기 정보 페이지 확인 키 = 성별 전환(해금된 다른 성별 있을 때, 없으면 이유 대사), onSave.

- [ ] **Step 1: failing tests** — 성별 전환: 해금 1개 → "다른 성별을 얻은 적이 없다", 2개 → 바뀜·onSave; 뽑기 중복 대사에 "개체값이 올랐다" 포함(ivUp 있을 때); phaseNotices 헤롱헤롱 풀림 문구; 헤롱헤롱 blocked 문구 "헤롱헤롱해서 기술을 쓸 수 없었다".
- [ ] **Step 2:** FAIL · **Step 3:** implement · **Step 4:** PASS
- [ ] **Step 5: Verify** 브라우저(테스트 저장은 끝나고 원래대로): 기호 색·니드런, 개체값 페이지, 성별 전환, 뽑기 중복 대사
- [ ] **Step 6: Commit** `feat: gender symbols, IV grades and gender switch on screen`

### Task 5: 문서
README(개체값·성별·몸무게·헤롱헤롱) · ROADMAP(같은 계열 여러 마리 = 다음 후보) · `npm test` · Commit `docs: IVs, gender and weight`

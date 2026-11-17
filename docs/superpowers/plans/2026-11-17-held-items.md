# 지니는 도구 1차 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동료에게 도구 한 칸을 주고(가방·저장·상자에서 얻기·박스에서 지니기), 나무열매를 뺀 "그대로 옮기는" 도구 약 45종을 전투 계산에 넣는다.

**Architecture:** `src/data/heldItems.js` 가 도구 표(이름·설명·효과 값·희귀도)를 갖고, `src/core/items.js` 의 작은 함수들이 전투 계산 자리(데미지 배수·급소·명중·차례 끝·버티기·랭크 하락·헤롱헤롱·장판/날씨/속박 턴·구애 고정)에서 불린다. 발동은 특성 알림 로그에 `{ unitId, item }` 으로 넣어 같은 알림 경로로 보여 준다.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-held-items-design.md`

## Global Constraints
- 도구 id 는 PokeAPI 이름 (예: `leftovers`, `choice-band`, `life-orb`, `focus-sash`). 한국어 이름은 표에.
- 동료 `held: id | null`. 가방 `game.items.held: { [id]: n }` (지닌 것은 빠짐). 저장 왕복, 모르는 id 는 버림.
- 상자: 기존 상자 굴림은 그대로 두고, **별도 난수** `createRng(hashSeed(seed, 3000 + i))` 로 20% 확률에 그 상자를 `held-<id>` 로 바꿈 (희귀: `life-orb`·`choice-band`·`choice-specs`·`focus-sash` 는 가중치 1, 나머지 4). 낙엽더미 상자도 같은 규칙 (`hashSeed(seed, 3100 + 순번)`). 전리품 `held-<id>` → `run.loot.held[id]++`, 층 돌파 때 가방으로, 전멸·포기면 잃음.
- 값: 타입 강화 1.2 · 힘의머리띠/박식안경 1.1 · 달인의띠 1.2(효과 굉장) · 생명의구슬 1.3 + 맞히면 최대HP 1/10 · 구애머리띠/안경 1.5 + 그 층 첫 기술 고정 · 먹다남은음식 1/16 · 검은진흙 독 1/16 회복 아니면 1/8 피해 · 조개껍질방울 준 피해 1/8 · 기합의띠 HP 가득이면 HP 1 (층마다 1번) · 기합의머리띠 10% · 초점렌즈/예리한손톱 급소 +1 · 광각렌즈 명중 ×1.1 · 빛의가루/느긋한향로 상대 명중 ×0.9 · 화염구슬/독독구슬 자기 차례 끝 (상태이상 없을 때) · 하얀허브·멘탈허브 층마다 1번 · 붉은실 · 끈적끈적바늘 1/8 · 빛의점토 +3 · 날씨 바위 +3 · 끈기갈고리 +2 · 전용(전기구슬 피카츄 공·특공 2, 굵은뼈 탕구리·텅구리 공 2, 심해의이빨 진주몽 특공 2, 심해의비늘 진주몽 특방 2, 메탈파우더 변신 안 한 메타몽 방어 2, 럭키펀치 럭키 급소 +2, 대파 파오리 급소 +2).
- 층마다 돌아옴: 1회 도구의 사용 여부는 전투 유닛(`u.itemUsed`)에만 — 층마다 새 유닛이니 저절로 돌아옴.
- 적은 도구 없음. 신오 골든 해시 그대로.
- 브랜치 `feat/held-items`. 테스트 `npm test`. 저장 `pokemon-tactics-save` 백업·복원.

## Review Focus
1. 위액·틀깨기 같은 특성 끄기는 도구를 끄지 않음 → Task 2 테스트: `abilityOff` 유닛의 먹다남은음식이 그대로 발동.
2. 구애 고정 중 그 기술이 PP 같은 이유로 막히면(도발·사슬묶기) 행동 메뉴가 전부 회색이어도 이동·대기는 됨 → Task 3 테스트(메뉴 enabled 계산이 대기를 막지 않음).
3. 진화·메타몽 빌드 저장 때 `held` 가 사라지지 않음 → Task 1 테스트: 진화 후·빌드 저장 후 `held` 유지.
4. 같은 도구 둘을 서로 다른 포켓몬에 지니기·빼기 반복 → 가방 개수가 음수·중복 생성 없음 → Task 1 테스트.
5. 생명의구슬 반동·끈적끈적바늘로 기절 → 기절 처리(경험치·기절 목록)가 일반 기절과 같음 → Task 2 테스트.

---

### Task 1: 도구 표 · 저장 · 가방 · 지니기 · 상자에서 얻기

**Files:**
- Create: `src/data/heldItems.js`, `src/core/heldBag.js`, `tests/heldItems.test.js`
- Modify: `src/core/save.js` (cleanMember `held`, `items.held`), `src/core/run.js` (`addLoot` 의 `held-`, 정산), `src/core/floorgen.js` (상자 변환, 낙엽더미 상자), `src/core/battle.js` (`makeUnit` 에 `held`)

**Interfaces:**
- `HELD_ITEMS: { [id]: { name, desc, rare?: true, ...효과 필드 } }` — 효과 필드: `typeBoost: 'fire'`, `physMult`, `specMult`, `seMult`, `lifeOrb`, `choice: 'physical'|'special'`, `endHeal`, `blackSludge`, `shellBell`, `sash`, `band`, `crit`, `accMult`, `foeAccMult`, `orb: 'burn'|'toxic'`, `whiteHerb`, `mentalHerb`, `destinyKnot`, `stickyBarb`, `screenTurns`, `weatherTurns: 'rain'|…`, `bindTurns`, `species: [...]`, `statMult: { atk: 2 … }`.
- `equip(game, uid, id) -> boolean`, `unequip(game, uid) -> boolean` (heldBag.js). 바꾸기 = equip 이 지닌 것을 가방으로 돌려놓고 지님.
- `rollChestHeld(seed, index) -> id | null` (heldItems.js, 20%·가중치).
- `makeUnit({ ..., held })` → `u.held`.

- [ ] **Step 1: Write the failing tests** — 표에 45종 안팎이 있고 모든 항목에 `name`·`desc`; 나무열매 id(`oran-berry` 등) 없음 / 저장 왕복에 `held`·`items.held` 유지, 모르는 id 버림 / `equip` 이 가방을 1 줄이고 바꾸면 이전 것이 돌아옴, 개수 0 이면 실패, `unequip` 이 돌려놓음 / 진화(`evolve` 경로)·메타몽 빌드 저장 후 `held` 유지 / 같은 시드 → 같은 상자 도구, 신오 상자 `item` 문자열 분포는 그대로(별도 난수) / `addLoot(run, 'held-leftovers')` → 층 돌파 정산 때 `game.items.held.leftovers` +1, 전멸 정산은 0.
- [ ] **Step 2: Run** `node --test tests/heldItems.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npm test` — Expected: PASS (신오 골든 해시 그대로).
- [ ] **Step 5: Commit** `feat: held item slot, bag, equip and chest drops`

---

### Task 2: 전투 효과

**Files:**
- Create: `src/core/items.js`
- Modify: `src/core/damage.js`·`src/core/abilities.js` (배수·급소·명중), `src/core/battle.js` (생명의구슬·조개껍질방울·기합의띠/머리띠·구애 고정·랭크 하락 뒤 하얀허브·헤롱헤롱 뒤 멘탈허브/붉은실), `src/core/volatile.js`·`src/core/status.js` (차례 끝: 먹다남은음식·검은진흙·구슬·바늘), `src/core/field.js` (빛의점토·날씨 바위), 속박 턴
- Test: `tests/heldItems.test.js`

**Interfaces:**
- `items.js`: `itemOf(u) -> 표 항목 | null` (적·없음 null), `itemAttackMult(a, d, move, typeMult) -> number`, `itemDefMult(d, move) -> number`, `itemCritBonus(u) -> number`, `itemAcc(a, d) -> number`, `itemPhaseEnd(u) -> { heal?, damage?, ailment? }`, `survives(u, damage, rng) -> 'sash'|'band'|null`.
- 발동 로그: 지금 특성 로그(`abilityEvents`·`phaseAbilityEvents`)에 `{ unitId, item: id }` 를 넣음 (`ability` 없음).
- 구애: 첫 공격·변화기 사용 때 `u.choiceLock = moveId`; `moveBlock` 이 다른 기술을 `'choice'` 로 막음.

- [ ] **Step 1: Write the failing tests** — 대표 하나씩: 목탄 불꽃 1.2 · 힘의머리띠 물리만 · 달인의띠 효과 굉장만 · 생명의구슬 1.3 + 맞혔을 때만 1/10 (빗나가면 없음) · 구애머리띠 1.5 + 두 번째 다른 기술 `blocked: 'choice'`, 새 전투(다음 층)에선 풀림 · 먹다남은음식 1/16 (가득이면 없음) · 검은진흙 독/비독 · 조개껍질방울 · 기합의띠 가득 HP 일격 → 1, 두 번째는 기절, 새 전투에서 다시 · 기합의머리띠 rng<0.1 · 초점렌즈 급소율 증가 · 광각렌즈·빛의가루 명중 · 화염구슬 차례 끝 화상(이미 독이면 없음) · 하얀허브 랭크 하락 즉시 0, 두 번째는 유지 · 멘탈허브 · 붉은실 · 끈적끈적바늘 · 빛의점토 장판 턴 8 · 축축한바위 비 턴 8 · 끈기갈고리 속박 5 · 전기구슬 피카츄 2배·다른 종 1배 · 메탈파우더 메타몽(빌드 안 함)만 · 위액 맞아도 먹다남은음식 발동 · 생명의구슬 반동 기절이 `log.fainted` 에 들어감 · 적 유닛은 `itemOf` null.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces (자리마다 기존 특성 배수 바로 옆에 곱함).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: held item effects in battle`

---

### Task 3: 화면 · 알림 · 문서

**Files:**
- Modify: `src/game/box.js` (포켓몬 메뉴 "도구" → 목록 화면: 가방 도구 이름·개수·설명, 지니기/빼기), `src/game/summary.js` (지닌 도구 줄), `src/game/states.js` (정보 창 도구 이름, `abilityNotices` 가 `e.item` → `○○의 <도구>!` 와 도구별 문구: 기합의띠 "○○은(는) 기합의띠로 버텼다!", 생명의구슬 "○○은(는) 생명이 조금 깎였다!", 구애 막힘 "구애 ○○ 때문에 다른 기술을 쓸 수 없다!"), `src/game/results.js` (얻은 도구 표시), `docs/ROADMAP.md`
- Test: `tests/town.test.js` 또는 `tests/heldItems.test.js`

**Interfaces:**
- Consumes: Task 1 `equip`/`unequip`, `HELD_ITEMS`; Task 2 로그 `{ unitId, item }`, `blocked: 'choice'`.

- [ ] **Step 1: Write the failing tests** — `abilityNotices([{ unitId, item: 'leftovers' }], get)` 가 "의 먹다남은음식!" 포함 / 기합의띠 문구 / 박스 메뉴에 "도구" 항목, 가방이 비고 지닌 것도 없으면 회색 + 이유 / 구애 고정으로 모든 기술이 막혀도 대기 가능.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Browser check** — 저장 백업 → 가방에 먹다남은음식·기합의띠·목탄 → 박스에서 지니기·바꾸기·빼기 → 던전에서 먹다남은음식 알림, 정보 창 도구 이름 → 저장 복원. 콘솔 오류 없음. 스크린샷.
- [ ] **Step 6: Docs** — ROADMAP "완료 (2026-11-17): 지니는 도구 1차 (약 45종, 나무열매 제외, 1회 도구는 층마다 돌아옴)".
- [ ] **Step 7: Commit** `feat: hold items from the box, item notices and results`

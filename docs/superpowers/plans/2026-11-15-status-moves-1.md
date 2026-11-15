# 변화기 묶음 1차 (포켓몬에 붙는 것) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포켓몬에게 붙는 변화기 27개(나에게 · 상대·아군에게 · 방해·견제)를 배울 수 있게 하고, 아군·적이 SRPG 규칙대로 쓰게 한다.

**Architecture:** 새 순수 모듈 `src/core/volatile.js` 가 유닛에 붙는 효과(필드·적용·턴 감소·기술 제한·이동 불가)를 맡는다. `src/data/moveEffects.js` 표가 기술 id → 효과 이름을 정하고 `moves.js` 가 그 기술에 `effect`·`learnable: true` 를 붙인다. `battle.js` 의 `applyMove`·`endPhase` 는 volatile 의 함수를 부르기만 하고, 피해 쪽 규칙(방어·버티기·길동무·도우미·꿰뚫어보기·기충전)은 각각 그 계산이 있는 곳에 한 줄씩 끼운다.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`, Canvas 256×192.

**Spec:** `docs/superpowers/specs/2026-11-15-status-moves-batch-design.md` (이 계획은 "나눠 만들기" 1차만. 오라·장판·날씨·압정·밀어내기·흑안개는 2차.)

## Global Constraints
- "턴" = 아군 차례 + 적 차례 한 바퀴. 포켓몬에 붙는 효과의 남은 턴은 **그 포켓몬 편 페이즈 끝**에 줄어든다.
- 모든 새 효과는 층이 끝나면 사라진다 — 유닛은 층마다 `createBattle` 로 새로 만들어지므로, 새 필드를 **파티 멤버(세이브)에 쓰지 않는다**.
- 같은 효과를 다시 걸면 실패(이미 걸려 있음).
- 방해·견제 대상: 사거리 1~2 적 하나. 회복봉인도 하나(PokeAPI 의 주변 전체 대상을 덮어씀).
- 시작 기술: 새 변화기는 지금 규칙(변화기 최대 2칸)대로 들어간다. 그래서 깨지는 기존 테스트는 기대값을 고친다. 저장된 동료에게 소급하지 않는다.
- 대사는 한국어, 조사는 기존 `josa()` 사용.
- 브랜치 `feat/status-moves-1`. 테스트 명령 `npm test`.

## Review Focus
1. 방어 중인 유닛이 범위 공격에 휘말림 → 그 유닛만 0 피해("몸을 지켰다"), 나머지는 그대로 맞는다(다수 명중 ×0.75 는 막힌 유닛도 센 대상 수 기준 그대로). → Task 2 테스트.
2. 앙코르로 묶인 기술을 지금 쓸 수 없음(회복기 횟수 0 등) → 메뉴의 기술이 모두 회색이고 '대기'만 남는다, AI 는 이동만. 오류·무한 루프 없음. → Task 4 테스트.
3. 길동무 상대가 자폭·반동·혼란 자해로 같이 쓰러지는 경우 → 두 번 기절 처리되지 않는다(이미 빠진 유닛은 건너뜀). → Task 4 테스트.
4. 회복봉인 중 회복 경로 전부(회복기·잠자기·흡수 공격·아쿠아링·뿌리박기·씨뿌리기로 얻는 쪽·날씨 회복 특성·포이즌힐) → HP 가 오르지 않는다. → Task 4 테스트.
5. 하품이 걸린 뒤 다른 상태이상에 먼저 걸리거나, 신비의부적(2차) 이전이라도 잠듦 면역 특성으로 바뀜(고민씨) → 잠들지 않고 하품만 풀린다. → Task 3 테스트.

---

### Task 1: 효과 기반 (volatile 모듈 · 표 · 기술 제한 · 이동 불가) + 기충전·도발·검은눈빛 계열

**Files:**
- Create: `src/core/volatile.js`, `src/data/moveEffects.js`, `tests/volatile.test.js`
- Modify: `src/data/moves.js` (끝에 표 적용), `src/core/battle.js` (`makeUnit`, `targetsOf`, `applyMove`, `endPhase`), `src/core/status.js` (`moveBudget`), `src/core/abilities.js` (`critRate`)

**Interfaces:**
- Produces (`src/data/moveEffects.js`):
  - `export const EFFECT_MOVES = { 'focus-energy': 'focusEnergy', taunt: 'taunt', 'mean-look': 'noMove', block: 'noMove', 'spider-web': 'noMove' }` — 다음 Task 들이 줄을 더한다.
  - `export const KIND_OVERRIDES = { 'heal-block': { kind: 'enemy', range: [1, 2], area: false } }`
- Produces (`src/core/volatile.js`):
  - `newVolatile() -> object` — 유닛 필드 기본값: `guard: null, guardPrev: false, bond: false, bondPrev: false, focusEnergy: false, aquaRing: false, rooted: false, cursed: false, leechBy: null, yawnBy: null, helped: false, identNormal: false, identPsychic: false, abilityOff: false, taunt: 0, encore: null, disable: null, torment: 0, healBlock: 0, noMove: 0, lastMove: null` (`encore`/`disable` = `{ move, turns }`).
  - `applyEffect(state, user, target, move, rng, weather) -> { unitId, effect, ok, reason? }` — 효과 하나 적용. `reason` 은 `'already' | 'immune' | 'chain' | 'noLast' | 'full' | 'uses' | 'blocked'` 중.
  - `moveBlock(unit, moveId) -> null | 'taunt' | 'encore' | 'disable' | 'torment' | 'healBlock'` — 지금 그 기술을 못 쓰는 이유.
  - `tickEnd(state, unit, events, rng) -> void` — 그 유닛 편 페이즈 끝 처리(턴 감소·지속 피해/회복·하품). 이벤트는 `events.push({ unitId, kind, ... })`.
  - `tickStart(unit) -> void` — 그 유닛 편 페이즈 시작 처리(방어·길동무 해제 등).
  - `moveFor(unit, moveId) -> move` — 쓰는 유닛 기준 기술(저주: 고스트면 `kind:'enemy', range:[1,2]`, 아니면 `kind:'self', range:[0,0]`; 나머지는 `MOVES[moveId]` 그대로).
- Produces (unit 필드): `makeUnit` 이 `...newVolatile()` 를 펼친다.
- Produces (applyMove 결과): `result.effects: Array<{unitId, effect, ok, reason?}>`; 기술 제한이면 `result.blocked = moveBlock(...)` 값.

- [ ] **Step 1: Write the failing tests** (`tests/volatile.test.js`)

```js
test('effect moves become learnable with an effect name', () => {
  for (const id of ['focus-energy', 'taunt', 'mean-look', 'block', 'spider-web']) {
    assert.equal(MOVES[id].learnable, true, id);
    assert.ok(MOVES[id].effect, id);
  }
  assert.equal(MOVES['heal-block'].kind, 'enemy');
  assert.deepEqual(MOVES['heal-block'].range, [1, 2]);
});
test('focus energy raises crit stage by 2 for the floor', () => {
  // 기충전 쓴 뒤 critRate(a, d, tackle) === 1/4, 다시 쓰면 effects[0] = { ok:false, reason:'already' }
});
test('taunt blocks status moves for 3 turns of the target side', () => {
  // 아군 페이즈에 적에게 도발 → moveBlock(enemy, 'growl') === 'taunt', moveBlock(enemy, 'tackle') === null
  // endPhase 를 적 페이즈 끝까지 3번 돌리면(적 편 페이즈 끝 3번) moveBlock(enemy,'growl') === null
  // 도발 중 applyMove(enemy,'growl') → result.blocked === 'taunt', enemy.acted === true (행동은 소모)
});
test('mean look stops movement for 2 turns but not moves', () => {
  // moveBudget(target) === 0, 적 편 페이즈 끝 2번 뒤 moveBudget > 0. 걸린 상태에서 공격기는 쓸 수 있음
  // 다시 걸면 reason 'already'
});
test('new effects do not carry into the next floor', () => {
  // 도발·기충전 건 유닛의 파티 멤버로 createBattle 다시 → 새 유닛 taunt 0, focusEnergy false
});
test('lastMove records the move that was used', () => {
  // applyMove 한 뒤 unit.lastMove === 그 기술 id. 마비로 실패해도(blocked) 기록하지 않음
});
```

- [ ] **Step 2: Run** `node --test tests/volatile.test.js` — Expected: FAIL (모듈 없음).
- [ ] **Step 3: Implement**
  - `moves.js` 끝: `EFFECT_MOVES` 의 각 id 에 `{ effect, learnable: true }`, `KIND_OVERRIDES` 덮어쓰기. 저주는 `type:'ghost'` 로(4세대 '???' 대신, 데이터 생성 타입이 'unknown').
  - `applyMove` 변화기 분기: `move.effect` 가 있으면 대상마다(명중 판정·흡수 특성은 지금 루프 그대로) `applyEffect` 를 부르고 결과를 `effects` 에 모은다. 기술 실행 첫머리(봉인 검사 바로 뒤)에서 `moveBlock` → `blocked` 결과로 돌아간다(행동은 소모: `acted = true`). 기술이 실제로 나갔으면(마비·혼란·헤롱헤롱 실패 아님) `a.lastMove = moveId`.
  - `targetsOf` 는 `moveFor(user, id)` 기준.
  - `endPhase`: 끝나는 편 유닛마다 `tickEnd`, 시작하는 편 유닛마다 `tickStart`. 기절 이벤트는 지금 규칙대로 `knockOut` + `{kind:'fainted'}`.
  - `moveBudget`: `noMove > 0 || rooted` 이면 0.
  - `critRate`: 단계에 `attacker.focusEnergy ? 2 : 0` 더함.
- [ ] **Step 4: Run** `npm test` — Expected: 새 테스트 PASS. 시작 기술이 바뀌어 깨진 기존 테스트가 있으면 그 기대값만 고친다(테스트 이름과 고친 이유를 커밋 메시지에).
- [ ] **Step 5: Commit** `feat: volatile effects base with focus energy, taunt and mean look`

---

### Task 2: 나에게 쓰는 기술 — 방어·판별·버티기·잠자기·아쿠아링·뿌리박기·저주

**Files:** Modify `src/data/moveEffects.js`, `src/core/volatile.js`, `src/core/battle.js` (공격 루프·변화기 루프·회복 분기); Test `tests/volatile.test.js`

**Interfaces:**
- Consumes: Task 1 의 `applyEffect`, `tickStart`, `tickEnd`, `moveFor`.
- Produces: `EFFECT_MOVES` 에 `protect/detect: 'protect', endure: 'endure', rest: 'rest', 'aqua-ring': 'aquaRing', ingrain: 'ingrain', curse: 'curse'`. 공격 결과 hit 항목에 `protected: true` 또는 `endured: true`. 변화기 결과 `missed` 와 별도로 `protectedIds: string[]`.

- [ ] **Step 1: Write the failing tests**

```js
test('protect blocks attacks and status moves until its side starts again', () => {
  // 방어 쓴 아군을 적이 공격 → hits[0].protected === true, damage 0, HP 그대로. 적이 도발 → protectedIds 에 포함, taunt 0
  // 아군 페이즈 시작(tickStart) 뒤에는 guard null
});
test('protect area: only the guarded unit is spared', () => {
  // 범위 공격에 아군 2마리, 하나만 방어 → 방어한 쪽 0, 다른 쪽 damage > 0 이고 spread 0.75 적용값과 같음
});
test('protect or endure twice in a row fails', () => {
  // 방어 → 다음 아군 차례 방어: effects[0] { ok:false, reason:'chain' }. 그다음 차례에는 성공
  // 방어 → 다음 차례 버티기도 'chain'
});
test('endure keeps 1 hp against attacks only', () => {
  // 버티기 뒤 큰 공격 → hp 1, hits[0].endured. 연속 공격 각 타 1 유지. 독 피해(endPhase)로는 0 될 수 있음
});
test('rest heals fully, cures, sleeps exactly 2 turns and uses a heal charge', () => {
  // 화상·HP 절반 → hp === maxHp, status 'sleep', statusTurns 2, healUses 1. 다음 두 아군 차례 쉬고 세 번째 행동
  // HP 가득: reason 'full' / healUses 0: 'uses' / 불면 특성: 'immune'
});
test('aqua ring and ingrain heal 1/16 each own phase end, ingrain roots', () => {
  // 두 개 다면 1/8. ingrain → moveBudget 0
});
test('curse: ghost pays half hp and curses, others boost', () => {
  // 고스트(gastly): 대상 cursed, 쓴 쪽 hp −floor(maxHp/2), 대상 편 페이즈 끝마다 floor(maxHp/4) 피해
  // HP 가 절반 이하인 고스트가 쓰면 쓴 쪽 기절(보상 없음)
  // 비고스트: spe −1, atk +1, def +1. moveFor(nonGhost,'curse').kind === 'self'
});
```

- [ ] **Step 2: Run** `node --test tests/volatile.test.js` — Expected: 새 테스트 FAIL.
- [ ] **Step 3: Implement** — 방어 판정은 변화기 루프(대상이 `guard === 'protect'` 이고 쓴 유닛이 아니면 건너뜀)와 공격 루프(타 계산 전에 0 피해 hit 항목) 두 곳. 버티기는 옹골참 줄 바로 옆. 잠자기는 회복기 분기와 같은 횟수 규칙을 쓰고 `blocksAilment(unit,'sleep')` 이면 'immune'. 지속 회복·저주 피해는 `tickEnd`, 매직가드면 저주 피해 0.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: protect, endure, rest, aqua ring, ingrain and curse`

---

### Task 3: 상대·아군에게 — 하품·씨뿌리기·도우미·꿰뚫어보기·냄새구별·미라클아이

**Files:** Modify `src/data/moveEffects.js`, `src/core/volatile.js`, `src/core/battle.js` (공격 위력), `src/core/abilities.js` (`typeEffect`), `src/core/stages.js` (`accuracyShift`); Test `tests/volatile.test.js`

**Interfaces:**
- Produces: `EFFECT_MOVES` 에 `yawn: 'yawn', 'leech-seed': 'leechSeed', 'helping-hand': 'helpingHand', foresight/odor-sleuth: 'identNormal', 'miracle-eye': 'identPsychic'`. 이벤트 kind: `'yawnSleep' | 'yawnFizzle' | 'leech'`(`{unitId, by, damage, healed}`).
- Constants (volatile.js): `YAWN_RANGE = 3` (거리 ≤ 3 이면 잠듦, ≥ 4 면 풀림).

- [ ] **Step 1: Write the failing tests**

```js
test('yawn sleeps the target at its next phase end if within 3 tiles', () => {
  // 거리 3 → 적 페이즈 끝에 status 'sleep', 이벤트 yawnSleep. 거리 4 로 이동 → 잠들지 않고 yawnFizzle, yawnBy null
});
test('yawn fizzles if the user faints first or the target gets another status', () => {
  // 쓴 유닛을 units 에서 제거 → yawnFizzle. 대상이 먼저 독 → 잠들지 않음, yawnBy null
  // 이미 상태이상/불면 대상에게 쓰면 reason 'immune' 또는 'already'
});
test('leech seed drains 1/8 to the seeder, grass is immune', () => {
  // 대상 편 페이즈 끝: 대상 −floor(maxHp/8), 쓴 쪽 +같은 양(최대치까지). 쓴 쪽 기절 뒤엔 빼앗기만
  // 풀 타입 대상 reason 'immune', 다시 걸면 'already'. 매직가드 대상 피해 0
});
test('helping hand boosts the ally next attack once by 1.5x', () => {
  // 같은 rng 로 도우미 받은 공격 damage ≈ 1.5배 (floor 오차 1 이내), 두 번째 공격은 원래대로
  // 인접하지 않으면 targetsOf 비어 있음. 이미 행동한 아군 대상 → reason 'already'
  // 그 편 페이즈 끝에 helped false
});
test('foresight lets normal and fighting hit ghosts and ignores evasion boosts', () => {
  // typeEffect(normal 기술 → gastly) 0 → 꿰뚫어보기 뒤 1. 회피 +2 대상의 accuracyShift 가 0 (회피 −1 은 그대로 반영)
  // 미라클아이: 에스퍼 → 악(murkrow) 0 → 1 (악 쪽 상성 값)
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — 도우미 위력은 `calcDamage` 에 넘기는 move 를 `{ ...move, power: move.power * 1.5 }` 로(고정 데미지 기술은 그대로), 첫 공격기에서 `helped = false`. 하품 판정은 `tickEnd` 에서 `canInflict(unit,'sleep',null,weather)` 로.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: yawn, leech seed, helping hand and foresight family`

---

### Task 4: 방해·견제 나머지 — 앙코르·사슬묶기·트집·회복봉인·뽐내기·부추기기·위액·고민씨·길동무

**Files:** Modify `src/data/moveEffects.js`, `src/core/volatile.js`, `src/core/battle.js` (흡수·회복·기절 처리), `src/core/abilities.js` (`has`); Test `tests/volatile.test.js`

**Interfaces:**
- Produces: `EFFECT_MOVES` 에 `encore, disable, torment, 'heal-block': 'healBlock', 'gastro-acid': 'abilityOff', 'worry-seed': 'worrySeed', 'destiny-bond': 'bond'`. 뽐내기·부추기기는 효과 이름 없이 `learnable: true` 만(기존 변화기 루프가 랭크+혼란 처리). 공격 결과 `bond: string[]`(길동무로 같이 쓰러진 유닛 id).
- Produces: `has(u, id)` 는 `u.abilityOff` 면 false.

- [ ] **Step 1: Write the failing tests**

```js
test('encore locks the last move for 3 turns, fails without one', () => {
  // lastMove 'tackle' → moveBlock(t,'growl') 'encore', moveBlock(t,'tackle') null. lastMove 없으면 'noLast'
});
test('encored move that cannot be used leaves only waiting', () => {
  // 앙코르 기술 = 회복기, healUses 0 → planEnemyAction 결과 attack null (이동만), 예외 없음
});
test('disable seals the last move 3 turns; torment forbids repeats 3 turns', () => {});
test('heal block stops every heal source for 3 turns', () => {
  // 회복기 healFailed 'blocked', 잠자기 reason 'blocked', 흡수 공격 drained 0, 아쿠아링·뿌리박기 0,
  // 씨뿌리기 쓴 쪽 회복 0(대상 피해는 그대로), 비 + 젖은접시 회복 0, 포이즌힐 회복 0
});
test('swagger and flatter confuse even at max stage', () => {
  // atk +6 대상에게 뽐내기 → confusion > 0
});
test('gastro acid turns the ability off; worry seed makes it insomnia', () => {
  // 위액 뒤 has(t, 원래특성) false. 고민씨: ability 'insomnia', 잠들어 있었으면 깸. 나태/불면 대상 reason 'immune'
});
test('destiny bond takes the attacker down, once, not a boss', () => {
  // 길동무 쓴 아군을 적이 공격으로 쓰러뜨림 → 적도 units 에서 빠짐, bond 에 적 id
  // 자폭으로 쓰러뜨림 → 예외 없음, 적은 한 번만 기절 처리(log.defeated 길이 1)
  // 보스가 쓰러뜨림 → 보스는 그대로(내 결정: 보스 면역)
  // 연속 사용 reason 'chain'. 독 피해로 쓰러지면 발동 안 함
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — 회복봉인 검사는 회복 경로마다 `healBlock > 0` 한 줄. 길동무는 `knockOut` 이 공격 기절일 때(`by` 가 상대 편, `by` 가 아직 units 안, `!by.boss`) `by` 도 `knockOut(state, by, null)`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: encore, disable, torment, heal block, gastro acid, worry seed, destiny bond`

---

### Task 5: 적 AI

**Files:** Modify `src/core/ai.js`; Test `tests/ai.test.js`

**Interfaces:**
- Consumes: `moveBlock`, `moveFor`, `MOVES[id].effect`.
- 규칙(스펙 "적 AI"): 방어·판별·버티기 = 상대 공격 사거리 안 칸이고 HP ≤ 50% 일 때, 바로 앞 차례에 안 썼을 때. 잠자기 = HP ≤ 40%. 방해기·하품·씨뿌리기 = 아직 안 걸린 대상, 하품은 잠듦 규칙(`SLEEP_LOCK`)도 따름. 기충전·아쿠아링 = 때릴 적이 없을 때 자신 버프처럼. 도우미 = 인접 아군이 아직 행동 안 했을 때. 점수 상수는 빌더가 정하되 상수로 이름 붙여 파일 위에.
- `moveBlock` 이 막는 기술은 후보에서 뺀다. `moveBudget` 0 이면 제자리만.

- [ ] **Step 1: Write the failing tests**

```js
test('enemy protects only when threatened and hurt', () => {
  // HP 40%, 아군 사거리 안: attack.moveId 'protect'. HP 90%: 'protect' 아님. 직전 차례 방어: 'protect' 아님
});
test('enemy does not pick moves blocked by taunt', () => {});
test('enemy yawns an awake target and skips already yawned ones', () => {});
test('enemy rooted by ingrain stays put', () => {});
```

- [ ] **Step 2: Run** `node --test tests/ai.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** in `planEnemyAction` / `positionalStatus` / `bestSelfBuff`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: enemy ai uses the new status moves`

---

### Task 6: 화면 — 대사·메뉴 회색·상태 줄·이펙트, 문서

**Files:** Modify `src/render/mapAttack.js` (변화기·공격·막힘 연출), `src/game/states.js` (메뉴 `enabled`, 페이즈 이벤트 대사), `src/render/ui.js` (`stageLine` 에 새 상태), `src/data/moveFx.js` (효과 → 이펙트), `tools/vendor-pixelfx.js` (새로 쓰는 이펙트 가져오기), `tools/fx-preview.html`, `docs/ROADMAP.md`, `README.md`; Test `tests/fx.test.js`, `tests/town.test.js` 또는 상태 화면 테스트 파일

**Interfaces:**
- Consumes: `result.effects`, `result.blocked`(새 이유), hit `protected`/`endured`, `result.bond`, 이벤트 `yawnSleep/yawnFizzle/leech/curse/aquaRing/ingrain/effectEnd`.
- Produces: `export const EFFECT_FX = { [effect]: { id, opts, timeScale?, life? } }` (`moveFx.js`), `export function volatileTags(unit) -> string[]` (`ui.js`, 예: `['도발3', '이동불가2', '기충전']`).
- 대사(정해진 문구): 방어 성공 "{이름}은/는 몸을 지켰다!", 버티기 발동 "{이름}은/는 공격을 버텼다!", 길동무 "{이름}은/는 상대를 길동무로 삼았다!", 하품 걸림 "{이름}은/는 졸음이 왔다!", 하품 풀림 "{이름}의 졸음이 달아났다!", 씨뿌리기 피해 "씨뿌리기가 {이름}의 체력을 빼앗는다!", 기술 제한(메뉴·막힘) 도발 "도발당해서 변화기를 쓸 수 없다!", 앙코르 "앙코르 때문에 다른 기술을 쓸 수 없다!", 사슬묶기 "그 기술은 사슬묶기로 봉인됐다!", 트집 "같은 기술을 연달아 쓸 수 없다!", 회복봉인 "회복봉인으로 회복할 수 없다!", 효과 실패 공통 "그러나 실패했다!". 나머지 걸림 대사는 빌더가 같은 말투로.
- 메뉴: `moveBlock` 이면 회색, 고르면 위 이유 대사(박스의 회색 이유 방식과 같게).
- 이펙트 후보(가져와서 미리보기로 고름): 방어 `holy/divine-shield`, 기충전 `status/rage`, 뿌리박기·검은눈빛 계열 `nature/root-snare`·`shadow/grasping-hands`, 아쿠아링 `nature/healing-bloom`(물 팔레트), 씨뿌리기 `nature/spore-burst`, 저주 `shadow/curse`, 도발·사슬묶기·위액 `shadow/hex-sigil`, 도우미 `holy/blessing`, 꿰뚫어보기 `arcane/rune-circle`, 하품 `status/sleep`, 길동무 `shadow/soul-drain`, 트집 `status/slowed`.

- [ ] **Step 1: Write the failing tests**

```js
test('every effect has an fx that is registered', () => {
  // Object.values(EFFECT_MOVES) 의 모든 효과에 EFFECT_FX 항목, 그 id 가 fx 등록 목록에 있음
});
test('volatileTags lists active effects with turns', () => {
  // taunt 3, noMove 2, focusEnergy → ['도발3', '이동불가2', '기충전'] 포함
});
test('move menu greys out blocked moves with a reason', () => {
  // 도발 걸린 아군 메뉴: 변화기 항목 enabled false, why '도발당해서 변화기를 쓸 수 없다!'
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — `vendor-pixelfx.js` 실행으로 새 이펙트 가져오기. 연출 단계는 기존 `statusSteps`·`stageSteps` 처럼 `effectSteps(result, get)` 를 만들어 변화기 연출에 끼우고, 단계에 들어갈 때 `onBody(fx, EFFECT_FX[effect], unit)`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS. 그리고 브라우저(preview)로 확인: 방어로 공격 막힘, 도발 메뉴 회색, 하품 → 잠듦, 씨뿌리기 피해 대사, 상태 줄 표시. `fx-preview.html` 로 이펙트 짝 육안 확인.
- [ ] **Step 5: Docs + Commit** — ROADMAP "완료 (2026-11-15): 변화기 묶음 1차 …" 한 줄, 다음: 2차. README 기능 목록 한 줄. `feat: status move effects on screen` / `docs: status moves batch 1`

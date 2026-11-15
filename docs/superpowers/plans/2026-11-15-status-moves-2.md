# 변화기 묶음 2차 (맵에 보이는 것) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오라·장판·날씨 부르기·압정·밀어내기·흑안개 변화기 17개를 배울 수 있게 하고, 아군·적이 SRPG 규칙대로 쓰게 하며 맵에 보이게 한다.

**Architecture:** 새 순수 모듈 `src/core/field.js` 가 전장에 놓이는 것(`state.auras`·`state.zones`·`state.spikes`·`state.weatherTimer`)을 맡는다. 위치가 바뀔 때마다 `refreshField(state)` 가 각 유닛에 `u.field = { tailwind, safeguard, mist, luckyChant, reflect, lightScreen, mudSport, waterSport }` 플래그를 다시 계산하고, 데미지·상태이상·랭크·이동력·스피드 계산은 이 플래그만 읽는다(상태 객체를 모르는 순수 함수들이 그대로 남도록). 1차의 `volatile.js`·`EFFECT_MOVES` 구조를 그대로 확장한다.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`, Canvas 256×192.

**Spec:** `docs/superpowers/specs/2026-11-15-status-moves-batch-design.md` ("나눠 만들기" 2차: 오라·장판·맵 전체·흑안개, 적 AI, 화면·연출).

## Global Constraints
- "턴" = 아군 차례 + 적 차례 한 바퀴. **오라·장판·날씨 남은 턴은 쓴 편 페이즈 끝**에 줄어든다. 모두 5턴.
- 오라: 쓴 포켓몬 맨해튼 거리 ≤ 2 의 같은 편(쓴 포켓몬 포함)에게, 쓴 포켓몬을 따라다님. 쓴 포켓몬이 기절하면 사라짐. 같은 쓴 포켓몬이 같은 종류를 다시 쓰면 남은 턴 5로. 같은 종류 효과는 겹쳐 세지 않음.
- 장판: 쓴 자리 중심 맨해튼 ≤ 2 칸에 고정. 리플렉터·빛의장막은 장판 안 **쓴 편**만, 흙놀이·물놀이는 장판 안 **모두**(쓰거나 맞는 쪽 하나라도 장판 안).
- 순풍 = 이동 +1칸, 스피드 ×1.25 (스피드가 쓰이는 곳 모두). 신비의부적 = 새 상태이상(주 상태이상·혼란·하품) 막음. 흰안개 = 상대가 거는 랭크 다운 막음. 주술 = 급소에 안 맞음.
- 리플렉터 물리 ×0.5, 빛의장막 특수 ×0.5, 급소면 무시. 흙놀이 전기 ×0.5, 물놀이 불꽃 ×0.5.
- 날씨 부르기: 5턴 그 날씨, 끝나면 **층 시작 때 날씨(날씨 특성 반영 후)**로. 같은 날씨면 실패. 안개 층에서는 실패. 날씨 특성으로 바뀐 날씨는 덮어씀.
- 압정·독압정: 고른 칸(사거리 1~3) 중심 맨해튼 ≤ 1 의 들어갈 수 있는 칸. 상대 편이 들어오면(지나가기·밀려나기 포함, 칸마다) 압정 = 최대 HP 1/8 피해, 독압정 = 독. 비행 타입·부유 특성 면역(독압정은 독·강철도 면역). 독 타입 상대가 밟으면 그 칸 독압정 사라짐. 층 끝까지. 같은 칸 같은 종류는 겹치지 않음. 아군 압정은 계속 보이고, **적 압정은 까는 연출 때만 보이고 숨음, 아군이 밟은 칸만 드러나 계속 보임**. 이동 범위·경로 계산은 압정을 모름.
- 울부짖기·날려버리기: 사거리 1~2 적 하나를 쓴 포켓몬 반대쪽으로 3칸(차이가 큰 축, 같으면 x). 못 서는 칸·다른 포켓몬 앞에서 멈춤. 밀려난 포켓몬 랭크 변화 지움. `boss` 와 뿌리박기(`rooted`)는 안 밀림. 밀려 지난 압정 칸은 밟은 것.
- 흑안개: 쓴 포켓몬 맨해튼 ≤ 2 안 모든 포켓몬(자신 포함) 랭크 변화 지움.
- 층이 끝나면 모두 사라짐(전투 상태째 새로 만들어지므로 자동). 세이브에 쓰지 않음.
- 대사 한국어, `josa()` 사용. 브랜치 `feat/status-moves-2`. 테스트 `npm test`.

## Review Focus
1. 오라 주인이 움직이거나 기절함 → 범위 안 아군 플래그가 바로 바뀐다(다음 데미지·이동 계산부터). → Task 1 테스트.
2. 압정 칸을 지나는 경로(멈추지 않고 통과)와 밀려나며 지나기 → 칸마다 한 번씩, 그 칸에서 쓰러지면 이동·행동이 거기서 끝나고 화면이 멈추지 않는다. → Task 3·6 테스트.
3. 날씨 부르기 5턴이 끝날 때 층 시작 날씨가 날씨 특성으로 바뀐 날씨였다 → 그 날씨로 돌아간다(null 아님). → Task 2 테스트.
4. 밀어내기 대상 뒤가 맵 끝·벽·물(못 들어가는 유닛)·다른 포켓몬 → 그 앞에서 멈추고, 0칸이면 "꿈쩍도 하지 않았다". → Task 4 테스트.
5. 흙놀이 장판 안에서 장판 밖의 상대에게 전기 기술 / 장판 밖에서 장판 안의 상대에게 → 둘 다 ×0.5. 리플렉터는 상대 편이 그 장판에 서도 혜택 없음. → Task 1 테스트.

---

### Task 1: 전장 기반 + 오라 4종 + 장판 4종

**Files:**
- Create: `src/core/field.js`, `tests/field.test.js`
- Modify: `src/data/moveEffects.js`, `src/core/volatile.js` (`applyEffect` 분기), `src/core/battle.js` (`createBattle`·`applyMove`·`moveUnit`·`knockOut`·`endPhase` 에서 `refreshField`·`tickField`), `src/core/stages.js` (`effectiveStat` 스피드, 흰안개는 `applyStageChange` 의 fromOther 다운), `src/core/status.js` (`moveBudget`, `canInflict`), `src/core/abilities.js` (`critRate`), `src/core/damage.js` (`calcDamage`·`expectedDamage`)

**Interfaces:**
- Produces (`moveEffects.js`): `EFFECT_MOVES` 에 `tailwind: 'tailwind', safeguard: 'safeguard', mist: 'mist', 'lucky-chant': 'luckyChant', reflect: 'reflect', 'light-screen': 'lightScreen', 'mud-sport': 'mudSport', 'water-sport': 'waterSport'`. `KIND_OVERRIDES` 에 이 8개 모두 `{ kind: 'self', range: [0, 0], area: false }`.
- Produces (`field.js`):
  - `FIELD_TURNS = 5`, `FIELD_RADIUS = 2`, `AURAS = ['tailwind','safeguard','mist','luckyChant']`, `ZONES = ['reflect','lightScreen','mudSport','waterSport']`
  - `newField() -> { auras: [], zones: [], spikes: [], weatherTimer: null }` — `createBattle` 이 `state` 에 펼침.
  - `castField(state, user, effect) -> { ok, reason? }` — 오라: `{ kind, ownerId, side, turns }` 추가/갱신. 장판: `{ kind, side, x, y, turns }` 추가.
  - `refreshField(state) -> void` — 모든 유닛 `u.field` 다시 계산.
  - `tickField(state, side, events) -> void` — 그 편이 쓴 오라·장판 턴 감소, 0이면 제거하고 `events.push({ kind: 'fieldEnd', what, side })`.
  - `fieldDamageMult(attacker, defender, move, crit) -> number` — 리플렉터·빛의장막(급소 무시)·흙놀이·물놀이 곱.
- Consumes: 1차 `applyEffect` 분기 방식(효과 이름별 switch, `{ unitId, effect, ok, reason }`).

- [ ] **Step 1: Write the failing tests** (`tests/field.test.js`, 1차 `tests/volatile.test.js` 의 `duel`/`round` 같은 도우미를 이 파일에 둔다)

```js
test('field moves become learnable as self moves', () => {}); // 8개 learnable, kind 'self', effect 이름
test('tailwind aura: +1 move and x1.25 speed for allies within 2 of the user, follows the user', () => {
  // 아군 둘(거리 2) · 하나(거리 4). 순풍 → 가까운 둘 moveBudget +1, effectiveStat spe = 기존×1.25, 먼 하나 그대로
  // 쓴 포켓몬을 moveUnit 으로 먼 아군 옆으로 옮기면 → 먼 아군에게 켜지고 처음 아군 중 멀어진 쪽은 꺼짐
});
test('aura ends after 5 turns of its side, or when its owner faints; recast refreshes to 5', () => {});
test('safeguard blocks new ailments and yawn from foes; mist blocks foe stat drops; lucky chant stops crits', () => {
  // 신비의부적 안: 독가루 statusChanges reason 'safeguard', 하품 effects reason 'safeguard'
  // 흰안개 안: 울음소리 applied 0. 주술 안: critRate(공격자, 대상, 기술) === 0
});
test('reflect and light screen halve hits on their side inside the zone, crits ignore them', () => {
  // 쓴 자리 중심 거리 ≤2 칸의 아군만. 같은 rng 로 장판 있음/없음 데미지 비 ≈ 0.5 (floor 오차 1)
  // 급소(critRate 강제 1 상황)면 같음. 적이 그 장판 칸에 서도 적은 그대로
  // 쓴 포켓몬이 장판 밖으로 나가도 장판은 그 자리에 남음
});
test('mud sport and water sport halve electric and fire if either side stands in the zone', () => {
  // 공격자만 안 / 대상만 안 / 둘 다 밖 → 0.5 / 0.5 / 1
});
```

- [ ] **Step 2: Run** `node --test tests/field.test.js` — Expected: FAIL (모듈 없음).
- [ ] **Step 3: Implement** — `u.field` 는 `refreshField` 만 쓴다. 읽는 쪽: `moveBudget` (+1, 이동 불가면 0 유지), `effectiveStat('spe')` (×1.25), `canInflict` (상대가 거는 경우만 — `move` 가 있거나 하품일 때 `reason: 'safeguard'`; 잠자기 자기 잠듦은 막지 않음), `applyStageChange` fromOther 다운 0, `critRate` 0, `calcDamage`·`expectedDamage` 에 `fieldDamageMult`. `refreshField` 를 부르는 곳: `createBattle` 끝, `applyMove` 시작, `moveUnit` 끝, `knockOut` 끝, `endPhase` 의 `tickField` 뒤.
- [ ] **Step 4: Run** `npm test` — Expected: PASS (시작 기술이 바뀌어 깨지는 기존 테스트는 1차처럼 기대값만 고치고 이유를 커밋 메시지에).
- [ ] **Step 5: Commit** `feat: field auras (tailwind, safeguard, mist, lucky chant) and zones (screens, sports)`

---

### Task 2: 날씨 부르기 4종

**Files:** Modify `src/data/moveEffects.js`, `src/core/field.js`, `src/core/volatile.js`, `src/core/battle.js` (`createBattle` 에 `baseWeather`, `endPhase`); Test `tests/field.test.js`

**Interfaces:**
- Produces: `EFFECT_MOVES` 에 `'rain-dance': 'weather', 'sunny-day': 'weather', sandstorm: 'weather', hail: 'weather'` 과 `WEATHER_OF = { 'rain-dance': 'rain', 'sunny-day': 'sun', sandstorm: 'sand', hail: 'hail' }` (field.js). `KIND_OVERRIDES` 4개 `self`.
- Produces: `state.baseWeather` (= `floorStartAbilities` 뒤의 `state.weather`), `state.weatherTimer = { side, turns }`. 끝나면 `state.weather = state.baseWeather`, 이벤트 `{ kind: 'weatherEnd' }`.

- [ ] **Step 1: Write the failing tests**

```js
test('weather moves set the weather for 5 turns of the user side, then the floor weather returns', () => {
  // 층 날씨 null → 비바라기 → state.weather 'rain', 5바퀴 뒤 null, statusEvents 에 weatherEnd
});
test('weather move fails on the same weather and on a fog floor; overrides an ability weather and returns to it', () => {
  // 비 층에서 비바라기 reason 'already'. 안개 층 reason 'fog'.
  // 가뭄(drought) 특성으로 시작한 쾌청 층에서 비바라기 → 비, 5턴 뒤 'sun' 으로 돌아감
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — 날씨를 바꾼 뒤 `u.fieldWeather` 를 다시 넣어 쓱쓱·엽록소 이동력이 바로 반영되게 한다(`applyMove` 처음처럼).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: weather moves (rain dance, sunny day, sandstorm, hail)`

---

### Task 3: 압정뿌리기·독압정

**Files:** Modify `src/data/moveEffects.js`, `src/core/field.js`, `src/core/battle.js` (`applyMove` 변화기 분기에서 칸 조준, `moveUnit` 에 경로), `src/data/moves.js` (칸 조준 표시); Test `tests/field.test.js`

**Interfaces:**
- Produces: `EFFECT_MOVES` 에 `spikes: 'spikes', 'toxic-spikes': 'toxicSpikes'`, 두 기술 `KIND_OVERRIDES` = `{ kind: 'tile', range: [1, 3], area: false, aimTile: true }`.
- Produces (`field.js`): `layTraps(state, user, effect, aim: {x,y}) -> { ok, tiles: [{x,y}] }`, `stepOn(state, unit, x, y) -> event|null` (밟기 판정: 피해·독·치우기·드러남), 함정 `{ x, y, kind: 'spikes'|'toxicSpikes', side, revealed }`.
- Produces (`battle.js`): `moveUnit(state, id, x, y, cost = 0, path = null)` — `path` 가 있으면 시작 칸을 뺀 칸마다 `stepOn`, 없으면 `pathTo(state.grid, state.units, u, x, y)` 로 계산(이동 시작 전 위치 기준). 결과 `state.log.trapEvents = [{ unitId, kind: 'spikes'|'toxicSpikes'|'cleared', damage?, x, y, fainted? }]`. 쓰러지면 그 칸에서 멈추고(`u.x,u.y` = 그 칸) `knockOut`.
- `applyMove` 의 결과에 `trapsLaid: [{x,y}]`.

- [ ] **Step 1: Write the failing tests**

```js
test('spikes lay on the aimed tile and its 4 neighbours, walls skipped, no duplicates', () => {});
test('a foe walking through spikes takes 1/8 per tile; flying and levitate are immune; own side is safe', () => {
  // 경로 3칸 중 2칸이 압정 → 피해 두 번. 비행/부유 0. 같은 편은 무시
});
test('toxic spikes poison; a poison-type foe clears them; steel is immune', () => {});
test('enemy traps stay hidden until an ally steps on that tile', () => {
  // 적이 깐 칸 revealed false. 아군이 밟은 칸만 revealed true, 나머지 false
});
test('a foe that faints on spikes stops on that tile', () => {
  // HP 1 적이 압정 칸을 지나가는 경로 → 그 칸에서 units 에서 빠짐, trapEvents 마지막 fainted
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — 칸 조준 기술은 `applyMove(state, userId, moveId, { x, y }, rng)`. 사거리 밖·맵 밖 조준이면 `effects[0] = { ok: false, reason: 'range' }`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: spikes and toxic spikes as hidden-for-foes tile traps`

---

### Task 4: 울부짖기·날려버리기·흑안개

**Files:** Modify `src/data/moveEffects.js`, `src/core/field.js`, `src/core/volatile.js` 또는 `battle.js` (밀어내기는 `moveUnit` 의 경로 처리를 재사용); Test `tests/field.test.js`

**Interfaces:**
- Produces: `EFFECT_MOVES` 에 `roar: 'push', whirlwind: 'push', haze: 'haze'`. `haze` `KIND_OVERRIDES` = `self`. `PUSH_TILES = 3`.
- Produces: 결과 `pushed: { unitId, from: {x,y}, to: {x,y}, path: [{x,y}] }` (0칸이면 `effects[0].reason = 'stuck'`), 흑안개 결과 `hazed: [unitId]`.

- [ ] **Step 1: Write the failing tests**

```js
test('roar pushes the target 3 tiles away and clears its stat changes', () => {});
test('push stops before walls, water it cannot enter, other units and the map edge', () => {}); // 0칸이면 reason 'stuck'
test('bosses and ingrain users are not pushed; mean look victims are', () => {}); // reason 'immune'
test('diagonal push goes along the larger axis, ties along x', () => {});
test('a push through spikes triggers them', () => {});
test('haze clears stat changes of everyone within 2, including the user', () => {});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — 랭크 지우기는 `Object.assign(u, newStages())` (stages.js).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: roar, whirlwind push and haze`

---

### Task 5: 적 AI

**Files:** Modify `src/core/ai.js`; Test `tests/ai.test.js`

**Interfaces:** Consumes `castField`·`WEATHER_OF`·`FIELD_RADIUS`, `u.field`. 칸 조준 기술은 `{ moveId, aim: { x, y } }` 로 돌려준다.
- 규칙(스펙): 오라·장판 = 주변 2칸에 아군 2마리 이상이고 같은 종류가 이미 걸려 있지 않을 때. 날씨 = 자기 타입에 유리할 때(물→비, 불꽃→쾌청, 바위·땅·강철→모래바람, 얼음→싸라기눈)이고 지금 그 날씨가 아닐 때. 압정 = 사거리 안 칸 중 가장 가까운 상대와 자신 사이 칸(상대 쪽으로 가장 가까운 칸). 밀어내기 = 인접한 상대에게(보스·뿌리박기 제외). 흑안개 = 주변 2칸 상대 양의 랭크 합 > 아군 양의 랭크 합. 점수 상수는 파일 위에 이름 붙여.

- [ ] **Step 1: Write the failing tests**

```js
test('enemy sets reflect when two allies are near and not already covered', () => {});
test('a water enemy calls rain only when it is not already raining', () => {});
test('enemy roars an adjacent foe', () => {});
test('enemy lays spikes on a tile, not a unit', () => {}); // attack.aim 에 x,y
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat: enemy ai uses field moves`

---

### Task 6: 화면 — 오라·장판·압정·날씨 표시, 칸 조준, 밀려나기, 대사, 이펙트, 문서

**Files:** Modify `src/game/states.js` (그리기·칸 조준 흐름·이동 뒤 함정 알림·쓰러짐 처리·배너 날씨 남은 턴), `src/render/mapAttack.js` (대사·밀려나기·흑안개·함정 깔기 연출), `src/render/ui.js` (오라·장판·압정 그리기 함수, 정보창 표시), `src/data/moveFx.js` (`FIELD_FX`), `tools/fx-preview.html` ("2차 예정" 표시가 비면 목록에서 자연히 빠짐 — 남은 목록 확인), `docs/ROADMAP.md`, `README.md`; Test `tests/game.test.js`, `tests/moveFx.test.js`

**Interfaces:**
- Produces (`ui.js`): `drawAuras(ctx, state, time)` — 쓴 포켓몬 중심 맨해튼 ≤2 칸에 종류별 옅은 색(순풍 하늘·신비의부적 분홍·흰안개 흰·주술 보라), `drawZones(ctx, state)` — 장판 칸 묶음의 바깥 테두리(리플렉터 주황·빛의장막 노랑·흙놀이 갈색·물놀이 파랑), `drawTraps(ctx, state, viewerSide = 'ally')` — 아군 압정·드러난 적 압정만(압정 회색 가시·독압정 보라 가시). 순서: 맵 → 장판 → 오라 → 압정 → 상자 → 유닛.
- Produces (`moveFx.js`): `FIELD_FX = { [effect]: spec }` — 모든 2차 효과에 하나씩(기존 이펙트 팔레트 스왑, 미리보기로 고름).
- 대사(정해진 문구): 순풍 "순풍이 불기 시작했다!", 신비의부적 "신비의 베일이 주위를 감쌌다!", 흰안개 "흰 안개가 주위를 감쌌다!", 주술 "주술로 급소를 막는다!", 리플렉터 "리플렉터로 물리 공격에 강해졌다!", 빛의장막 "빛의장막으로 특수 공격에 강해졌다!", 흙놀이 "전기의 위력이 약해졌다!", 물놀이 "불꽃의 위력이 약해졌다!", 비 "비가 내리기 시작했다!", 쾌청 "햇살이 강해졌다!", 모래바람 "모래바람이 불기 시작했다!", 싸라기눈 "싸라기눈이 내리기 시작했다!", 압정 "발밑에 압정이 뿌려졌다!", 독압정 "발밑에 독압정이 뿌려졌다!", 밀려남 "{이름}은/는 날려가 버렸다!", 못 밀림 "{이름}은/는 꿈쩍도 하지 않았다!", 흑안개 "모든 랭크 변화가 원래대로 돌아왔다!", 압정 밟음 "{이름}은/는 압정에 찔렸다!", 독압정 밟음 "{이름}은/는 독압정을 밟았다!", 치움 "{이름}은/는 독압정을 치웠다!", 신비의부적 막음 "{이름}은/는 신비의 베일이 지켜 주고 있다!", 끝 "{기술 이름}의 효과가 사라졌다!", 날씨 끝 "날씨가 원래대로 돌아왔다!".
- 적 압정: 까는 연출 중에만 `drawTraps` 에 그 칸들을 보이게(연출 객체가 깐 칸 목록을 들고 그림), 끝나면 숨김.
- 칸 조준(`aimTile`): 메뉴에서 고르면 사거리 1~3 의 들어갈 수 있는 칸을 커서로 고른다(공격기 조준 흐름 재사용, 적이 맞아야 한다는 거르기는 하지 않음). 범위 미리보기는 조준 칸 + 4방 칸.
- 이동 뒤 `trapEvents` 가 있으면 대사를 보이고 이동 취소를 막는다(위협과 같은 `moveLocked`). 그 칸에서 쓰러지면 그 유닛 행동 끝(아군은 다음 선택, 적은 다음 적).
- 밀려남: 대상이 원래 칸에서 새 칸까지 미끄러지는 연출(0.3초), 지난 압정 대사 이어서.
- 배너 날씨: 날씨 부르기 중이면 "· 비 (3)" 처럼 남은 턴.

- [ ] **Step 1: Write the failing tests**

```js
test('every field effect has a registered fx', () => {}); // moveFx.test.js
test('field messages for each cast, push, haze and trap step', () => {}); // effectMessages 에 정해진 문구
test('enemy traps are not drawn unless revealed; ally traps are', () => {}); // drawTraps 가 그리는 칸 목록을 돌려주게 해서 검사
test('spikes are aimed at a tile from the menu', () => {}); // game: 아군 압정뿌리기 → mode 'target', 빈 칸 확인 → state.spikes 5칸
test('an ally that faints on spikes ends its action without getting stuck', () => {}); // game: 이동 확인 → idle (또는 result)
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` — PASS. 그리고 브라우저(preview)로: 리플렉터 장판 테두리, 순풍 오라가 쓴 포켓몬을 따라감, 아군 압정 보임·적 압정 숨김·밟으면 드러남, 울부짖기 미끄러짐, 비바라기 배너 남은 턴, 미리보기 남은 기술 목록에서 2차 17개가 빠짐.
- [ ] **Step 5: Docs + Commit** — ROADMAP "완료 (2026-11-15): 변화기 묶음 2차 …", README 기능 한 줄. `feat: field moves on screen` / `docs: status moves batch 2`

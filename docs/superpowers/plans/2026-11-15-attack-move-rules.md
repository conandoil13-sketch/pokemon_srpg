# 공격기 고유 효과 2차 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 필중 9개, 재충전 3개, 점프킥·무릎차기, 칼등치기, 페인트, 깨뜨리다, 고속스핀, 숨는 기술 5개(섀도다이브 포함), 준비 기술 4개(모으기 → 다음 차례 돌진 발사)를 규칙·대사·표시까지 넣는다.

**Architecture:** 규칙은 모두 `applyMove`(battle.js) 안에서 기술 id 집합으로 갈라 처리하고, 결과 객체에 새 필드를 실어 `mapAttack.js` 가 대사를 낸다. 숨기는 대상 선택의 공통 관문(`unitsHit`·`targetsOf`)에서 빼고, 준비 기술은 `applyMove` 가 첫 사용을 "모으기" 로 바꾸며 다음 차례 시작에 `states.js` 가 `chargeRoute` 로 돌진 경로를 받아 걷기 + 공격을 자동 재생한다.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-attack-move-rules-design.md`

## Global Constraints
- 필중: `aerial-ace aura-sphere feint-attack magical-leaf magnet-bomb shadow-punch shock-wave swift vital-throw` — 명중 판정 없음(수풀·회피·명중 랭크·안개). 방어·타입 무효·특성 면역·숨기에는 막힘. 예상 창 100% + "필중".
- 재충전: `hyper-beam giga-impact rock-wrecker` — 기술이 나가면(맞든 빗나가든, 봉인·도발로 막힌 건 제외) 다음 자기 차례 기술 봉인, 이동 가능. 대사 "○○은(는) 반동으로 기술을 쓸 수 없다!".
- 점프킥·무릎차기 `jump-kick high-jump-kick`: 빗나감·방어·타입 무효면 자기 최대 HP 1/2(최소 1), 매직가드 면제. 대사 "○○은(는) 땅에 부딪혔다!".
- 칼등치기 `false-swipe`: 대상 HP 최소 1 남김, 예상 창 기절 표시 없음.
- 페인트 `feint`·섀도다이브 `shadow-force`: 방어를 뚫고 대상의 방어를 없앰.
- 깨뜨리다 `brick-break`: 피해 전에 대상 편의 `reflect`/`lightScreen` 장판 중 대상을 덮는 것(거리 ≤ `FIELD_RADIUS`) 제거. 대사 "장벽이 깨졌다!".
- 고속스핀 `rapid-spin`: 맞으면 쓴 포켓몬의 `bound`·`leechBy` 해제, 쓴 포켓몬 주변 2칸의 상대 편 압정·독압정 제거. 대사 "○○은(는) 몸이 자유로워졌다!" / "압정이 날아갔다!".
- 숨기 `fly bounce dig dive shadow-force`: 바로 공격, 상대 다음 페이즈가 끝날 때까지 `burrow = { kind, moveId }` (kind: fly·bounce→`sky`, dig→`ground`, dive→`water`, shadow-force→`shadow`). 그동안 다른 포켓몬 기술의 대상·범위에서 빠짐. 예외: `ground` ← earthquake·magnitude(위력 2배), `sky` ← thunder·gust·twister·sky-uppercut, `water` ← surf·whirlpool(위력 2배), `shadow` ← 없음. 예외 기술은 게임 데이터에 있는 것만. 다음 자기 차례 기술 봉인(재충전과 같은 장치).
- 숨기 표시: 숨은 포켓몬은 반투명(알파 0.45), 칸 표시 — ground 흙더미, water 물웅덩이, sky 구름, shadow 포켓몬 위 검은 반투명 그림자. 코드로 그림(`ui.js`).
- 준비 `solar-beam razor-wind skull-bash sky-attack`: 첫 사용은 모으기(`charging = { moveId, targetId }`, 피해 없음, 대사 "○○은(는) 힘을 모으고 있다!" — 솔라빔 "빛을 모으고 있다!"). 로켓박치기는 모을 때 방어 +1. 솔라빔은 날씨가 `sun` 이면 바로 발사. 다음 자기 페이즈 시작에 자동: 이동력 무시 최단 경로로 대상을 맞힐 수 있는 가장 가까운 칸까지 걸어가 발사, 그 포켓몬은 그 차례 끝. 불발(대상 없음·경로 없음·잠듦·얼음·이동 불가·속박): "모은 힘이 흩어졌다!", `charging` 해제, 그 차례는 평소대로.
- 브랜치 `feat/attack-move-rules`. 테스트 `npm test`. 저장 `pokemon-tactics-save` 백업·복원.

## Review Focus
1. 숨은 포켓몬만 사거리 안에 있는 적 → 공격 메뉴에서 그 기술이 회색(대상 없음), AI 도 그 대상을 고르지 않음. → Task 2 테스트(`aimsOf`+`unitsHit` 결과 비어 있음).
2. 모으는 동안 모으던 포켓몬이 쓰러짐 / 층이 끝남 → 다음 차례 자동 발사가 없고 오류 없음. → Task 3 테스트.
3. 돌진 경로 중간에 압정 → 평소처럼 밟고, 압정에 쓰러지면 발사 없음. → Task 3 테스트.
4. 숨은 포켓몬이 숨은 채 상태이상 피해·날씨 피해로 쓰러짐 → 표시가 남지 않음. → Task 2 테스트.
5. 칼등치기 + 연속 공격·버티기·옹골참 → 기존 1 남김 규칙과 겹쳐도 HP 1, 기절 없음. → Task 1 테스트.

---

### Task 1: 값·조건 규칙 — 필중 · 재충전 · 점프킥 · 칼등치기 · 페인트 · 깨뜨리다 · 고속스핀

**Files:**
- Modify: `src/data/moves.js` (필중 9개에 `sure: true`), `src/core/damage.js` (`hitChance`: `move.sure` → 100), `src/core/battle.js` (applyMove 분기 · 페이즈 시작 `recharge` → `sealed`), `src/render/mapAttack.js` (대사), `src/game/states.js` (예상 창 "필중"·칼등치기 기절 표시, 페이즈 대사 `recharge`)
- Test: Create `tests/attackRules.test.js` (volatile.test.js 의 `duel`/`round`/`hit` 도우미 모양을 복사)

**Interfaces:**
- Produces:
  - `RECHARGE_MOVES`, `CRASH_MOVES`, `BREAKS_PROTECT` (Set, battle.js export).
  - `unit.recharge: boolean` — 다음 자기 페이즈 시작에 `sealed = true` + 이벤트 `{ unitId, kind: 'recharge' }`.
  - applyMove 결과 새 필드: `crash: number` (자기 피해, 없으면 0), `screensBroken: string[]` (깨진 장판 kind), `spun: { freed: boolean, cleared: number } | null`.

- [ ] **Step 1: Write the failing tests** (`tests/attackRules.test.js`)

```js
test('sure-hit moves ignore grass, evasion and accuracy drops but not protect', () => {
  // hitChance(a, d, MOVES['aerial-ace'], '"') === 100 even with d.stages acc/eva changed
  // protect → hits[0].protected
});
test('hyper beam seals the user next own phase but still lets it move', () => {
  // applyMove hyper-beam → a.recharge; round → a.sealed true, moveBudget(a) > 0, statusEvents has recharge
  // applyMove again → blocked 'sealed'
});
test('jump kick that misses or hits protect costs half max HP; magic guard is spared', () => {});
test('false swipe always leaves at least 1 HP', () => { /* d.hp = 1 → after false-swipe d.hp === 1, d alive */ });
test('feint and shadow force break protect and remove it', () => {});
test('brick break shatters screens covering the target before damage', () => {
  // foe side lightScreen + reflect zone at foe → after brick-break s.zones has neither, r.screensBroken has both
});
test('rapid spin frees bind and leech seed and clears nearby foe spikes', () => {});
```
(빈 본문은 각 이름의 조건마다 assert 하나 이상, Global Constraints 값으로.)

- [ ] **Step 2: Run** `node --test tests/attackRules.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** per Global Constraints/Interfaces. 칼등치기는 endure 1 남김 옆에서. 깨뜨리다는 대상 루프 전에 장판을 지우고 `refreshField(state)`. 재충전 플래그는 `a.moved = true` 직후(기술이 실제로 나간 시점).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: sure-hit, recharge, crash, false swipe, feint, brick break and rapid spin`

---

### Task 2: 숨는 기술 — 대상에서 빠짐 · 예외 · 풀림 · 표시

**Files:**
- Modify: `src/core/battle.js` (숨기 설정·풀림·예외 2배·섀도다이브), `src/core/shapes.js` (`unitsHit` 필터), `src/core/battle.js` `targetsOf` 필터, `src/render/ui.js` (`drawBurrowMark`), `src/game/states.js` (`drawUnits` 반투명 + 표시), `src/render/mapAttack.js` (대사 "○○은(는) 하늘 높이 날아올랐다!" / "땅속으로 파고들었다!" / "물속으로 잠수했다!" / "모습을 감췄다!")
- Test: `tests/attackRules.test.js`, `tests/game.test.js`

**Interfaces:**
- Consumes: Task 1 `recharge`.
- Produces:
  - `HIDE_MOVES: Record<moveId, 'sky'|'ground'|'water'|'shadow'>`, `canTarget(move, unit) -> boolean` (shapes.js export; `!unit.burrow` 이거나 예외 기술).
  - `unit.burrow = { kind, moveId } | null` — 쓸 때 설정 + `recharge = true`, 상대 편 페이즈가 끝날 때(`endPhase` 의 ending side ≠ 그 유닛 side) 해제.
  - `drawBurrowMark(ctx, unit, px, py)` (ui.js) — 칸 좌상단 px,py.

- [ ] **Step 1: Write the failing tests**

```js
test('a hidden unit cannot be targeted until the foe phase ends, then it is sealed', () => {
  // ally uses dig on foe → a.burrow.kind 'ground'; unitsHit(s, foe, MOVES.tackle, { unitId: a.id }) is []
  // aimsOf(foe ...) filtered to a → none; endPhase(ally end) → still burrowed; endPhase(enemy end) → burrow null
  // next ally phase start → a.sealed
});
test('earthquake hits a digger for double, thunder hits a flier, nothing hits shadow force', () => {});
test('a burrowed unit fainting from poison leaves no burrow behind', () => {});
test('burrow mark draws by kind', () => { /* drawBurrowMark with fake ctx records fillStyle calls; ground/water/sky/shadow each draw something */ });
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** 2배는 피해 계산에 넘기는 기술의 `power` 를 2배로. 섀도다이브는 Task 1 `BREAKS_PROTECT` 에 이미 있음. 표시: 반투명은 `ctx.globalAlpha = 0.45` 로 그 유닛만, 표시 그림은 유닛 그리기 전(흙·물·구름)·후(그림자) — 내 판단으로 크기·색.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: fly, bounce, dig, dive and shadow force hide the user until the foe phase ends`

---

### Task 3: 준비 기술 — 모으기 · 다음 차례 돌진 발사 · 불발

**Files:**
- Modify: `src/core/battle.js` (applyMove 모으기 분기, `chargeRoute`), `src/game/states.js` (페이즈 시작 자동 발사: 아군·적 공통), `src/render/mapAttack.js` (모으기·불발 대사)
- Test: `tests/attackRules.test.js`, `tests/game.test.js`

**Interfaces:**
- Produces:
  - `CHARGE_MOVES: Set`, `unit.charging = { moveId, targetId } | null`.
  - applyMove: 준비 기술이고 `!a.charging` 이고 (솔라빔 쾌청이 아니면) → 피해 없이 `{ kind: 'attack', charged: { moveId, targetId }, hits: [], stageChanges, ... }` (로켓박치기 방어 +1 은 `stageChanges` 로). `a.charging` 이 같은 기술이면 → 평소 공격 후 `charging = null`.
  - `chargeRoute(state, unit) -> { path: {x,y}[], aim } | null` (battle.js export) — 이동력 무시(`reachable(grid, units, unit, null)`), 목적지마다 `aimsOf`+`unitsHit` 로 대상이 맞는지, 경로 비용이 가장 작은 칸. 잠듦·얼음·`noMove`·`bound`·대상 없음·칸 없음이면 `null`.
  - states: 페이즈 배너 뒤, 그 편 `charging` 유닛마다 차례로 `chargeRoute` → 있으면 `startWalk(path)` 뒤 `attackWith(unit, target, mv, next, aim)` 후 `unit.moved = unit.acted = true`; 없으면 불발 알림(대사) 후 `charging = null`. 그 다음 평소 흐름(플레이어 조작 / 적 AI).

- [ ] **Step 1: Write the failing tests**

```js
test('solar beam charges first, skull bash raises defense while charging, sunny solar beam fires at once', () => {});
test('the charged move fires next turn after rushing past the normal move range', () => {
  // charmander(1,1) charges sky-attack at foe(2,1); move foe to (8,6); chargeRoute → path ends next to foe, path length - 1 > moveBudget
  // applyMove at path end with returned aim → hits foe, charging null
});
test('a fainted target, no path, or a sleeping charger fizzles', () => {});
test('spikes on the rush path are stepped on; fainting on them cancels the shot', () => {});
// game.test.js: createGame 으로 아군 하나에 sky-attack 만 주고 모으기 → 턴 종료·적 턴 진행 → 다음 아군 페이즈 시작에 자동 발사가 일어나 그 유닛 acted
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces. AI 는 바꾸지 않는다(모으기 기술을 골라도 applyMove 가 모으기로 바꿈, 발사는 페이즈 시작 자동).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: charge moves gather power, then rush the target and fire next turn`

---

### Task 4: 브라우저 확인 · 문서

**Files:** Modify `docs/ROADMAP.md`

- [ ] **Step 1: Browser check** (`.claude/launch.json` 의 서버, 저장 백업·복원, 디버그 `window.__app` 로 기술 지정·적 위치 조정): 파괴광선 → 다음 차례 봉인 대사, 공중날기 → 반투명+구름 표시·적이 못 노림, 구멍파기 흙·다이빙 물 표시, 솔라빔 모으기 → 다음 차례 돌진 발사. 콘솔 오류 없음.
- [ ] **Step 2: ROADMAP** — "완료 (2026-11-15): 공격기 고유 효과 2차 — 필중 9 · 재충전 3 · 점프킥류 충돌 · 칼등치기 · 페인트 · 깨뜨리다 · 고속스핀 · 숨기 5(표시 포함) · 준비 4(모으기 → 돌진 발사)".
- [ ] **Step 3: Run** `npm test` — Expected: PASS.
- [ ] **Step 4: Commit** `docs: attack move rules in roadmap`

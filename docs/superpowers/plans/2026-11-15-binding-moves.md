# 속박기 7개 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조이기·껍질끼우기·회오리불꽃·마그마스톰·모래지옥·바다회오리·김밥말이에 맞은 포켓몬이 3턴 동안 못 움직이고 페이즈 끝마다 1/8 피해를 받으며, 묶은 쪽이 쓰러지거나 사거리 밖으로 가면 풀리게 한다.

**Architecture:** 규칙은 `src/core/volatile.js`(상태 `bound`, 걸기·틱·풀림)와 `battle.js`(공격 부가효과에서 걸기, 기절·페이즈 시작에서 풀림), 이동 금지는 `status.js` `moveBudget`. 표시(태그·대사·예상 창)와 AI 가산은 기존 자리에 한 줄씩. 이펙트는 pixelfx 로 2개 새로 그린다.

**Tech Stack:** 바닐라 JS ES 모듈, pixelfx scratch checkout, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-binding-moves-design.md`

## Global Constraints
- 속박기: `bind`, `clamp`, `fire-spin`, `magma-storm`, `sand-tomb`, `whirlpool`, `wrap`.
- `BIND_TURNS = 3`, 피해 = 최대 HP 의 1/8 (최소 1, 기존 `quarter(unit, 8)`), 매직가드는 피해 없음(이동 불가는 유지).
- 걸리는 조건: 그 대상에게 피해가 실제로 들어갔고(`landed`, 피해 > 0) 살아남음. 빗나감·방어·타입 무효·기절이면 안 걸림. 이미 `bound` 면 그대로(턴·묶은 쪽 갱신 없음). 보스도 걸림. 인분(shield-dust)은 막지 않음 *(부가효과지만 원작에서도 속박은 인분과 무관)*.
- 풀림: 묶은 쪽(`bound.by`)이 쓰러지면 즉시(조용히), 묶은 쪽과 맨해튼 거리 > `bound.reach`(그 기술 최대 사거리) 이면 묶인 쪽 페이즈 시작·끝에 풀림(대사). 3턴이 끝나도 풀림(대사).
- 대사: 걸림 — 조이기·김밥말이·껍질끼우기 "○○은(는) ●●에 묶였다!", 나머지 "○○은(는) ●●에 갇혔다!" (●● = 기술 이름). 피해 "○○은(는) ●●의 데미지를 입고 있다!". 풀림 "○○은(는) ●●에서 풀려났다!". 상태 줄 태그 `속박n`. 예상 창 "맞으면 3턴 속박".
- 기존 `u.trapped`(개미지옥 등 특성)와 이름이 겹치지 않게 새 필드는 `bound`.
- 브랜치 `feat/binding-moves`. 테스트 `npm test`. 저장 `pokemon-tactics-save` 백업·복원.

## Review Focus
1. 묶은 쪽이 다른 공격·압정·저주 등으로 쓰러짐 → 묶인 쪽이 바로(그 페이즈 안에) 움직일 수 있다. → Task 1 테스트(knockOut 경로).
2. 묶인 쪽이 속박 피해로 쓰러짐 → 기절 처리·대사 순서 정상, 남은 `bound` 없음. → Task 1 테스트.
3. 연속 공격·범위 공격 속박기(현재 없음이지만 `unitsHit` 여러 명) → 맞은 대상마다 따로 걸림. → Task 1 테스트(두 대상).
4. 묶은 쪽이 원거리(사거리 2) 기술로 묶고 그대로 2칸 거리 유지 → 안 풀림; 3칸으로 가면 다음 묶인 쪽 페이즈 시작에 풀림. → Task 1 테스트.
5. 묶인 포켓몬의 이동 범위 표시·AI 이동 → 0칸(제자리 공격만). → Task 1 `moveBudget` 테스트 + Task 3 브라우저 확인.

---

### Task 1: 규칙 — 걸기 · 이동 불가 · 피해 · 풀림

**Files:**
- Modify: `src/core/volatile.js` (`BIND_MOVES`, `BIND_TURNS`, `newVolatile` 에 `bound: null`, `bindCheck`, `tickEnd` 속박 처리), `src/core/battle.js` (공격 부가효과에서 걸기 → `out.bound`, `knockOut` 에서 풀기, `endPhase` 페이즈 시작에서 `bindCheck`), `src/core/status.js` (`moveBudget`)
- Test: `tests/volatile.test.js`

**Interfaces:**
- Produces:
  - `BIND_MOVES: Set<string>` (위 7개), `BIND_TURNS = 3` (`volatile.js`).
  - `unit.bound = { by: unitId, moveId, turns, reach } | null`.
  - `applyMove` 결과 `bound: [{ unitId, moveId }]` (이번에 새로 걸린 대상, 없으면 `[]`).
  - `bindCheck(state, unit, events) -> void` — 거리가 `reach` 를 넘거나 묶은 쪽이 없으면 `unit.bound = null` + `events.push({ unitId, kind: 'bindEnd', moveId })`.
  - `tickEnd` 이벤트: `{ unitId, kind: 'bind', moveId, damage, hpBefore, maxHp, x, y }`, 3턴 끝 `{ unitId, kind: 'bindEnd', moveId }`. 순서: `bindCheck` → (아직 묶였으면) 피해 → 턴 감소.

- [ ] **Step 1: Write the failing tests** (`tests/volatile.test.js`; 기존 파일의 `field`/`hit`/`round` 식 도우미가 없으면 같은 모양으로 만든다 — `createBattle` + `newMember`, 명중 rng `() => 0.01`)

```js
test('a binding move holds the target in place for 3 turns and chips 1/8 each phase end', () => {
  // wrap 쓰는 아보크(1,1) vs 꼬마돌(2,1)
  const r = applyMove(s, ekans.id, 'wrap', foe.id, hit);
  assert.deepEqual(r.bound, [{ unitId: foe.id, moveId: 'wrap' }]);
  assert.equal(foe.bound.turns, BIND_TURNS);
  assert.equal(moveBudget(foe), 0);
  const hp = foe.hp; endPhase(s, () => 0.9); endPhase(s, () => 0.9); // 적 페이즈 끝
  assert.equal(hp - foe.hp, Math.max(1, Math.floor(foe.maxHp / 8)));
  assert.ok(s.log.statusEvents.some((e) => e.kind === 'bind' && e.unitId === foe.id));
  // 3번째 묶인 쪽 페이즈 끝에 풀림
});
test('a miss, protect or immunity does not bind; an already bound target keeps its first binder', () => {});
test('the binder fainting frees the target at once; moving out of reach frees it at the target phase start', () => {
  // knockOut(binder) → foe.bound === null, moveBudget(foe) > 0 (같은 페이즈 안)
  // fire-spin(reach 2): binder 를 거리 2 → 유지, 거리 3 → 다음 endPhase 로 foe 편 페이즈가 시작될 때 bindEnd
});
test('magic guard takes no bind damage but still cannot move; a bound unit fainting from bind damage leaves no bind', () => {});
```
(빈 본문 테스트는 이 Task 에서 Global Constraints 값으로 채운다 — 각 이름의 조건 하나당 assert 하나 이상.)

- [ ] **Step 2: Run** `node --test tests/volatile.test.js` — Expected: FAIL (`BIND_TURNS` 없음).
- [ ] **Step 3: Implement** per Interfaces. 걸기는 `battle.js` 대상 부가효과 블록(풀죽음 옆)에서 `landed && !fainted && last?.damage > 0 && BIND_MOVES.has(move.id) && !d.bound`. `reach = move.range[1]`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: binding moves hold the target for 3 turns with chip damage, freed when the binder falls or moves away`

---

### Task 2: 표시 · 대사 · 예상 창 · AI

**Files:**
- Modify: `src/render/ui.js` (`volatileTags`), `src/render/mapAttack.js` (공격 결과 `bound` → 대사), `src/game/states.js` (`phaseNotices` 의 `bind`/`bindEnd`, 공격 예상 창 한 줄), `src/core/ai.js` (`bindValue`, `aimScore` 가산)
- Test: `tests/game.test.js`, `tests/ai.test.js`

**Interfaces:**
- Consumes: Task 1 `BIND_MOVES`, `BIND_TURNS`, `unit.bound`, 결과 `bound`, 이벤트 `bind`/`bindEnd`.
- Produces: `bindLine(name, moveId) -> string` (mapAttack.js, export), `bindValue(move, target) -> number` (ai.js, export) = 속박기이고 대상이 안 묶였고 이번에 안 쓰러질 기대면 `HINDER_SCORE / 2`, 아니면 0.

- [ ] **Step 1: Write the failing tests**

```js
// game.test.js
test('bind tag, catch lines and phase notices', () => {
  assert.ok(volatileTags({ bound: { by: 'a', moveId: 'wrap', turns: 2, reach: 1 } }).includes('속박2'));
  assert.equal(bindLine('꼬마돌', 'wrap'), '꼬마돌은 김밥말이에 묶였다!');
  assert.equal(bindLine('꼬마돌', 'fire-spin'), '꼬마돌은 회오리불꽃에 갇혔다!');
  // phaseNotices: bind → "꼬마돌은 김밥말이의 데미지를 입고 있다!", bindEnd → "꼬마돌은 김밥말이에서 풀려났다!"
});
// ai.test.js
test('binding an unbound foe is worth a little more than hitting a bound one', () => {
  assert.equal(bindValue(MOVES.wrap, { bound: null, hp: 50 }), HINDER_SCORE / 2);
  assert.equal(bindValue(MOVES.wrap, { bound: { by: 'x' }, hp: 50 }), 0);
  assert.equal(bindValue(MOVES.tackle, { bound: null, hp: 50 }), 0);
});
```

- [ ] **Step 2: Run** `node --test tests/game.test.js tests/ai.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** — 대사는 공격 연출 `after` 목록(풀죽음 줄 옆)에 `result.bound` 마다 한 줄, `efx: { effect: 'bind', unitId, moveId }` (Task 3 이펙트가 붙을 자리; 이 Task 에선 `EFFECT_FX.bind` 를 임시로 기존 `fxOn('nature/root-snare')` 로 등록해 'every effect has an fx' 테스트 유지). 예상 창: 단일 대상 예상(`drawForecast`)에서 속박기면 "맞으면 3턴 속박" 을 빈 줄에. `bindValue` 는 `aimScore` 의 적 대상 루프에서 `score += bindValue(move, t)` (`ko` 가 아니면). `HINDER_SCORE` 를 export.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: bind tag, lines, forecast note and AI value`

---

### Task 3: 이펙트 2개 · 미리보기 · 브라우저 확인 · 문서

**Files:**
- Create: `src/fx-custom/pokemon/bind-coil.js`, `src/fx-custom/pokemon/bind-vortex.js`
- Modify: `src/fx-custom/index.js`, `src/data/moveFx.js` (`bindFx`), `src/render/mapAttack.js` (bind 단계 이펙트), `tools/fx-preview.html`, `docs/ROADMAP.md`
- Test: `tests/moveFx.test.js`

**Interfaces:**
- Produces: `bindFx(moveId) -> FxSpec` — `bind`/`wrap`/`clamp` → `pokemon/bind-coil` (wrap·bind 는 기술 타입 팔레트, clamp 는 물 팔레트), 나머지 → `pokemon/bind-vortex` 에 기술 타입 팔레트 (`pal(type)` 재사용; 마그마스톰은 `PAL.lava` 가 있으면 그것).
- 이펙트: 원점 = 발밑, 몸(`o.actor` 있으면 그 몸 크기)을 감싸며 약 1.2초 한 번. coil = 띠가 아래에서 위로 몸을 두세 바퀴 감고 조였다가 풀리며 사라짐. vortex = 바닥에서 소용돌이 기둥이 몸을 감싸고 돌다 가라앉음.

- [ ] **Step 1: Write the failing test**

```js
test('wrap-like moves coil, vortex moves swirl in their type colour', () => {
  assert.equal(bindFx('wrap').id, 'pokemon/bind-coil');
  assert.equal(bindFx('clamp').id, 'pokemon/bind-coil');
  assert.equal(bindFx('whirlpool').id, 'pokemon/bind-vortex');
  assert.notDeepEqual(bindFx('fire-spin').opts.palette, bindFx('sand-tomb').opts.palette);
});
```

- [ ] **Step 2: Run** `node --test tests/moveFx.test.js` — Expected: FAIL.
- [ ] **Step 3: Draw both effects** in the scratch pixelfx checkout (`/private/tmp/claude-501/-Users-alltimesuho-Desktop----pokemonfangame/ea1e5bc2-8a74-4ff0-805e-a2889d3000d7/scratchpad/pixelfx`; 없으면 다시 clone): render → contact.png 보고 3번 이상 다듬기 → `check` 통과 → import 경로를 `../../vendor/pixelfx/core/index.js` 로 바꿔 복사, `CUSTOM_FX` 등록.
- [ ] **Step 4: Wire** — 공격 연출의 bind 대사 단계에서 `onBody(fx, bindFx(moveId), 묶인 포켓몬)`; `EFFECT_FX.bind` 는 `bindFx('wrap')` 로. 미리보기 "기술 재생" 에서 속박기면 hit 뒤에 `bindFx` 를 적 몸에.
- [ ] **Step 5: Browser check** — 미리보기에서 7개 재생; 실제 전투에서 속박기 하나(저장 백업·복원): 맞은 적 태그 `속박3`, 이동 범위 0, 페이즈 끝 피해 대사. 콘솔 오류 없음.
- [ ] **Step 6: ROADMAP** — "완료 (2026-11-15): 속박기 7개 — 3턴 이동 불가 + 페이즈 끝 1/8, 묶은 쪽이 쓰러지거나 사거리 밖이면 풀림, 감는 띠·소용돌이 이펙트".
- [ ] **Step 7: Run** `npm test` — Expected: PASS.
- [ ] **Step 8: Commit** `feat: coil and vortex effects for binding moves`

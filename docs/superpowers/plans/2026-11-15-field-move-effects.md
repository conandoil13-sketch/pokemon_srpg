# 2차 변화기 이펙트 다듬기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 순풍·신비의부적·흰안개·흑안개·주술·날씨 4개·압정 2개·날려버리기(+울부짖기)를 기술의 뜻이 보이는 연출로 바꾼다. 규칙은 그대로.

**Architecture:** 새 픽셀 이펙트 6개는 pixelfx 방식으로 scratch checkout 에서 그려 보고 다듬은 뒤 `src/fx-custom/pokemon/` 에 복사해 `CUSTOM_FX` 에 등록한다. 기술 → 이펙트 대응은 `src/data/moveFx.js`, 재생 순서(던지기·펑·바람)는 `src/render/mapAttack.js` 의 `createStatusAnim` 단계(steps)와 getter 로, 화면 전체 펑은 `src/render/weatherFx.js` 의 캔버스 그리기로 한다. `states.js` 는 anim getter 두 개(`weatherShown`, `trapsHidden`)만 읽는다.

**Tech Stack:** 바닐라 JS ES 모듈, pixelfx (scratch checkout: `tools/render.mjs`, `tools/check.mjs`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-field-move-effects-design.md`

## Global Constraints
- 규칙(범위·턴·효과·압정 십자 5칸)은 바꾸지 않는다. 리플렉터·빛의장막·흙놀이·물놀이 이펙트와 맵에 계속 깔린 오라·장판·압정 그림은 손대지 않는다.
- 칸 = 24px (`TILE`). 오라·흑안개 범위 = 주변 2칸(마름모) → 이펙트 그림은 원점(발밑)에서 좌우 ±60px, 위아래 ±48px 안을 덮는다.
- 새 이펙트 파일은 `src/fx-custom/pokemon/<name>.js`, 첫 줄 주석에 "Original design for 포켓몬 택틱스 (MIT, same as pixelfx).", import 는 `../../vendor/pixelfx/core/index.js`. `Math.random` 금지, 원점 = 발밑, 한 번 재생(loop: false)이고 끝에는 비어야 한다.
- pixelfx 작업: scratch checkout `/private/tmp/claude-501/-Users-alltimesuho-Desktop----pokemonfangame/ea1e5bc2-8a74-4ff0-805e-a2889d3000d7/scratchpad/pixelfx` (없으면 `git clone https://github.com/patch-gg/pixelfx` 로 다시). `src/fx/pokemon/<name>.js` 로 그리고 `node tools/render.mjs pokemon/<name>` → `records/pokemon/<name>/contact.png` 를 눈으로 보고 3번 이상 다듬기 → `node tools/check.mjs pokemon/<name>` 깨끗이 통과 → 게임 쪽으로 복사(import 경로만 바꿈). 함정: `smooth(e0,e1,x)` 인자 3개, 음수 나머지, 색은 `hex()` 거쳐서.
- 색: 순풍 하늘·흰색, 신비의부적 분홍 반투명, 흰안개 흰색, 흑안개 보랏빛 검정, 주술 자주, 독압정 `POISON_PAL` 보라, 압정 회색 쇠.
- 날씨 펑 색: rain `#4890f0`, sun `#f8c040`, sand `#c8a060`, hail `#c8e8ff`.
- 브랜치 `feat/field-move-effects`. 테스트 `npm test`.

## Review Focus
1. 날씨 기술이 실패(같은 날씨·안개 층) → 펑도 없고 화면 날씨도 그대로. → Task 2 테스트.
2. 압정 칸 일부가 이미 깔려 있거나 벽이라 `trapsLaid` 가 5칸보다 적음 → 던지는 압정 수도 그만큼, 숨김 목록도 그만큼. → Task 3 테스트.
3. 날려버리기가 실패(보스·뿌리박기·막힘) → 바람은 대상 쪽으로 불고 대상은 안 밀림. → Task 4 테스트.
4. 연출 중 대사를 넘김(`advance`) → 펑·압정 착지 뒤 상태가 남지 않고 끝나면 `weatherShown`/`trapsHidden` 이 비어 실제 상태가 보인다. → Task 2·4 테스트(끝까지 돌린 뒤 값).
5. 적이 압정을 깜 → 날아가는 동안엔 안 보이고 착지하면 보였다가 연출이 끝나면 다시 숨음(기존 규칙). → Task 3 테스트.

---

### Task 1: 오라·안개·주술 이펙트 4개

**Files:**
- Create: `src/fx-custom/pokemon/tailwind-gust.js`, `veil-dome.js`, `ground-fog.js`, `chant-pool.js`
- Modify: `src/fx-custom/index.js`, `src/data/moveFx.js` (`EFFECT_FX.tailwind/safeguard/mist/luckyChant/haze`)
- Test: `tests/moveFx.test.js`

**Interfaces:**
- Produces: CUSTOM_FX ids `pokemon/tailwind-gust`, `pokemon/veil-dome`, `pokemon/ground-fog` (옵션 `palette`), `pokemon/chant-pool`.

- [ ] **Step 1: Write the failing test**

```js
test('auras and fog get their own fx: wind, a see-through veil, rolling fog, a purple pool', () => {
  assert.equal(fxForEffect('tailwind', 'tailwind').id, 'pokemon/tailwind-gust');
  assert.equal(fxForEffect('safeguard', 'safeguard').id, 'pokemon/veil-dome');
  assert.equal(fxForEffect('mist', 'mist').id, 'pokemon/ground-fog');
  assert.equal(fxForEffect('haze', 'haze').id, 'pokemon/ground-fog');
  assert.notDeepEqual(fxForEffect('mist', 'mist').opts.palette, fxForEffect('haze', 'haze').opts.palette); // 흰 / 검정
  assert.equal(fxForEffect('luckyChant', 'lucky-chant').id, 'pokemon/chant-pool');
});
```

- [ ] **Step 2: Run** `node --test tests/moveFx.test.js` — Expected: FAIL (ids 다름).
- [ ] **Step 3: Draw the four effects** in the scratch checkout (Global Constraints 의 순서). 모습은 spec 그대로:
  - tailwind-gust: 하늘·흰 바람 줄기 여러 가닥이 범위 바깥에서 쓴 포켓몬 쪽으로 휘어 들어오고 나뭇잎 몇 장이 같이 날림, 약 1.2초.
  - veil-dome: 범위를 덮는 분홍 반투명 막(`p.disc` 같은 진짜 반투명)이 스르륵 생겼다가 테두리 한 번 반짝, 옅어짐.
  - ground-fog: 낮은 안개 덩어리가 발밑에서 바닥을 따라 바깥으로 굴러 퍼져 범위를 덮고 잠깐 머물다 걷힘 (palette 로 흰/검정).
  - chant-pool: 발밑에 자주 웅덩이가 번지고 물방울이 떠오르다 톡 터짐.
- [ ] **Step 4: Register and map** — `CUSTOM_FX` 에 넷 추가. `EFFECT_FX`: tailwind/safeguard/mist/luckyChant/haze 를 `spec(id, opts, 1, 'back'|'front', { life })` 로 (안개·웅덩이·바람은 바닥에 깔리므로 `'back'` 가 기본, 막·떠오르는 물방울이 몸을 가려야 하면 빌더 판단). 흑안개 팔레트는 `['#08060c','#16101e','#2a2036','#40344e','#5a4c6a']` 계열, 흰안개는 `PAL.bone` 밝은 쪽.
- [ ] **Step 5: Run** `npm test` — Expected: PASS (기존 'every effect has an fx that is registered' 포함).
- [ ] **Step 6: Commit** `feat: wind, veil, fog and chant pool effects for aura moves and haze`

---

### Task 2: 날씨 — 모으기 → 화면 전체 펑 → 날씨 시작

**Files:**
- Modify: `src/core/field.js` (`castWeather` 반환에 `from`, `to`), `src/core/volatile.js:113` (그 값을 effect 에 실음), `src/render/mapAttack.js` (`createStatusAnim` 단계·`weatherShown`·펑 그리기), `src/render/weatherFx.js` (`WEATHER_BURST`, `drawWeatherBurst`), `src/game/states.js:927` (`anim?.weatherShown`)
- Test: `tests/field.test.js`, `tests/game.test.js`

**Interfaces:**
- Produces:
  - `castWeather(...)` 성공 → `{ ok: true, from: string|null, to: string }`; 날씨 effect 항목 = `{ unitId, effect: 'weather', ok: true, from, to }`.
  - `WEATHER_BURST = { rain: '#4890f0', sun: '#f8c040', sand: '#c8a060', hail: '#c8e8ff' }`, `BURST_TIME = 0.5` (`weatherFx.js`).
  - `drawWeatherBurst(ctx, weather, k, x, y, w, h)` — k 0→1, 화면 좌표 (x,y)=쓴 포켓몬 중심. 화면 전체를 그 색으로 번쩍(알파 높게 시작해 0으로) + 고리가 (x,y)에서 화면 끝까지 퍼짐.
  - 상태 연출 anim getter `weatherShown`: 날씨 기술 성공이면 펑 단계 전까지 `from`, 펑 단계부터 `to`, 연출이 끝나면 `undefined`. 날씨 기술이 아니거나 실패면 항상 `undefined`.
  - 단계 순서(날씨 성공): `act` → `{k:'wcharge', d:0.6}` (들어갈 때 사용자 몸에 기존 `fxForEffect('weather', moveId)` 모으기) → `{k:'wburst', d: BURST_TIME}` → 날씨 대사 msg (이 msg 의 `efx` 는 비움 — 모으기를 두 번 띄우지 않음).

- [ ] **Step 1: Write the failing tests**

```js
// field.test.js
test('a weather call reports the weather before and after', () => {
  const { s, a } = field([['squirtle', 1, 1]], [['geodude', 11, 7]]);
  const e = applyMove(s, a[0].id, 'rain-dance', a[0].id, hit).effects[0];
  assert.equal(e.from, null);
  assert.equal(e.to, 'rain');
});
// game.test.js
import { createMapAttack } from '../src/render/mapAttack.js';
const statusAnim = (moveId, result, units) => createMapAttack({ attacker: units[0], defender: units[1] ?? null, move: { ...MOVES[moveId], id: moveId }, result: { kind: 'status', stageChanges: [], statusChanges: [], ...result }, lookup: (id) => units.find((u) => u.id === id), fx: null });
const runFor = (anim, sec) => { for (let t = 0; t < sec; t += 0.05) anim.update(0.05); };
test('weather shows the old weather until the screen-wide burst, then the new one', () => {
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 };
  const anim = statusAnim('rain-dance', { effects: [{ unitId: 'a', effect: 'weather', ok: true, from: 'sun', to: 'rain' }] }, [me]);
  assert.equal(anim.weatherShown, 'sun');
  runFor(anim, 0.45 + 0.6 - 0.1); assert.equal(anim.weatherShown, 'sun'); // 모으는 중
  runFor(anim, 0.2); assert.equal(anim.weatherShown, 'rain');           // 펑
  while (!anim.done) { anim.advance(); anim.update(0.05); }
  assert.equal(anim.weatherShown, undefined);
});
test('a failed weather call has no burst and leaves the weather alone', () => {
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 };
  const anim = statusAnim('rain-dance', { effects: [{ unitId: 'a', effect: 'weather', ok: false, reason: 'already' }] }, [me]);
  assert.equal(anim.weatherShown, undefined);
  runFor(anim, 1.2); assert.equal(anim.weatherShown, undefined);
});
```

- [ ] **Step 2: Run** `node --test tests/field.test.js tests/game.test.js` — Expected: FAIL (`from` 없음, `weatherShown` 없음). `createMapAttack` 가 node 에서 `actorFor` 때문에 터지면: `onBody` 가 `fx` 없을 때 actor 를 만들기 전에 `null` 을 돌려주게 하는 것까지 이 Task 에 포함.
- [ ] **Step 3: Implement** — 위 Interfaces 대로. `drawScreen` 은 `wburst` 단계에서 `drawWeatherBurst(ctx, to, t / BURST_TIME, 쓴 포켓몬 화면 좌표, 256, 192)` 를 대사창보다 먼저 그린다 (anim 은 카메라를 모르므로 `drawWorld` 에서 월드 좌표 고리 + `drawScreen` 에서 번쩍, 또는 anim 생성 때 `camera` 를 받는 것 중 빌더 판단; 고리 중심이 쓴 포켓몬이면 됨). `states.js:927`: `drawWeather(ctx, anim?.weatherShown !== undefined ? anim.weatherShown : st.weather, time)`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: weather moves charge, burst across the screen, then the weather starts`

---

### Task 3: 압정 던지기

**Files:**
- Create: `src/fx-custom/pokemon/caltrop-toss.js`
- Modify: `src/fx-custom/index.js`, `src/data/moveFx.js` (`trapTossFx`), `src/render/mapAttack.js` (던지기 생성·`trapsHidden`), `src/render/ui.js` (`drawTraps` 숨김 인자), `src/game/states.js:902`
- Test: `tests/moveFx.test.js`, `tests/game.test.js`

**Interfaces:**
- Produces:
  - 이펙트 `pokemon/caltrop-toss`: 원점 = 떨어질 칸의 발밑. 옵션 `fromX, fromY` = 던진 포켓몬 발밑의 상대 위치(px), `palette`. 압정 하나가 그 점에서 포물선으로 날아와 원점에 떨어져 살짝 튕기고 작은 먼지. 날아오는 시간 `TOSS_FLIGHT = 0.45`초에 착지.
  - `trapTossFx(kind, fromX, fromY) -> FxSpec` (`moveFx.js`, kind `'spikes'|'toxicSpikes'`; 독압정은 `POISON_PAL`, 압정은 회색 쇠). `TOSS_FLIGHT`, `TOSS_GAP = 0.08` 도 여기서 export.
  - anim getter `trapsHidden`: `result.trapsLaid` 중 아직 안 떨어진 칸 (k번째 칸은 압정 대사 단계 시작 + `TOSS_GAP*k + TOSS_FLIGHT` 에 착지). 압정 기술이 아니면 `[]`.
  - `drawTraps(ctx, state, shown = [], hidden = [])` — hidden 칸은 안 그림.
  - 압정 대사 단계에 들어갈 때 칸마다 `trapTossFx` 를 `delay: TOSS_GAP*k` 로 생성, 사용자 몸의 기존 `EFFECT_FX.spikes` (땅 내려찍기) 는 더 안 띄운다 (`EFFECT_FX.spikes/toxicSpikes` 는 `trapTossFx(kind, 0, 0)` 로 바꿔 등록 테스트를 계속 통과).

- [ ] **Step 1: Write the failing tests** (test imports: `trapTossFx, TOSS_FLIGHT, TOSS_GAP, POISON_PAL` from moveFx, `drawTraps` from ui, `MOVES`; `statusAnim`/`runFor` helpers from Task 2)

```js
// moveFx.test.js
test('spikes are tossed one by one, toxic spikes in purple', () => {
  const s = trapTossFx('spikes', -48, 0), t = trapTossFx('toxicSpikes', -48, 0);
  assert.equal(s.id, 'pokemon/caltrop-toss');
  assert.equal(s.opts.fromX, -48);
  assert.deepEqual(t.opts.palette, POISON_PAL);
  assert.equal(fxForEffect('spikes', 'spikes').id, 'pokemon/caltrop-toss');
});
// game.test.js
test('tossed spikes stay hidden until each one lands', () => {
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 };
  const laid = [{ x: 5, y: 2 }, { x: 6, y: 2 }, { x: 5, y: 3 }]; // 벽·이미 깔린 칸 빼고 3칸만
  const anim = statusAnim('spikes', { effects: [{ unitId: 'a', effect: 'spikes', ok: true }], trapsLaid: laid }, [me]);
  assert.equal(anim.trapsHidden.length, 3);
  runFor(anim, 0.45 + TOSS_FLIGHT + 0.01); assert.equal(anim.trapsHidden.length, 2); // 첫 압정 착지
  runFor(anim, TOSS_GAP * 2); assert.equal(anim.trapsHidden.length, 0);
  assert.equal(anim.trapsShown.length, 3); // 적 압정이어도 연출 중엔 보임 (기존)
});
test('hidden trap tiles are not drawn', () => {
  const ctx = { fillRect() {}, set fillStyle(v) {} };
  const st = { spikes: [{ x: 1, y: 1, kind: 'spikes', side: 'ally', revealed: false }, { x: 2, y: 1, kind: 'spikes', side: 'ally', revealed: false }] };
  assert.deepEqual(drawTraps(ctx, st, [], [{ x: 2, y: 1 }]).map((t) => [t.x, t.y]), [[1, 1]]);
});
```

- [ ] **Step 2: Run** `node --test tests/moveFx.test.js tests/game.test.js` — Expected: FAIL.
- [ ] **Step 3: Draw `caltrop-toss`** in the scratch checkout (Global Constraints 순서; `drain-orbs.js` 의 fromX/fromY 처리를 참고). 착지 시점이 `TOSS_FLIGHT` 와 맞는지 contact sheet 로 확인.
- [ ] **Step 4: Implement** the wiring above; `states.js:902`: `ui.drawTraps(ctx, st, anim?.trapsShown ?? [], anim?.trapsHidden ?? [])`.
- [ ] **Step 5: Run** `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat: spikes are tossed onto each tile and appear as they land`

---

### Task 4: 날려버리기 바람 · 울부짖기 음파를 대상 쪽으로

**Files:**
- Create: `src/fx-custom/pokemon/gust-blast.js`
- Modify: `src/fx-custom/index.js`, `src/data/moveFx.js` (`MOVE_EFFECT_FX.whirlwind`, `pushFx`), `src/render/mapAttack.js` (생성)
- Test: `tests/moveFx.test.js`, `tests/game.test.js`

**Interfaces:**
- Produces:
  - 이펙트 `pokemon/gust-blast`: 원점 = 쓴 포켓몬 발밑, 오른쪽을 향함. 옵션 `reach`(px, 대상까지 거리). 굵은 바람 줄기가 몰아쳐 reach 지점에서 소용돌이, 약 0.6초.
  - `pushFx(moveId, tiles) -> FxSpec` (`moveFx.js`): whirlwind → `pokemon/gust-blast` with `opts.reach = tiles * 24`; 그 밖(울부짖기) → 기존 `EFFECT_FX.push` (음파).
  - `createStatusAnim`: `move.effect === 'push'` 이고 대상(`result.pushed?.from` 또는 `defender`)이 있으면 연출을 만들 때 `fx.spawn(pushFx(move.id, 거리), feet(attacker), { dir })` (dir = 대상 쪽, 거리 = 맨해튼 칸 수). 실패(꿈쩍 안 함)여도 바람은 분다. anim getter `pushFxSpec` 은 두지 않는다 — 테스트는 가짜 fx 의 `spawn` 기록으로 확인.

- [ ] **Step 1: Write the failing tests**

```js
// moveFx.test.js
test('whirlwind is a gust that reaches the target, roar keeps the sound wave', () => {
  assert.equal(pushFx('whirlwind', 2).id, 'pokemon/gust-blast');
  assert.equal(pushFx('whirlwind', 2).opts.reach, 48);
  assert.equal(pushFx('roar', 1).id, 'pokemon/sound-wave');
});
// game.test.js
test('push moves blow toward the target even when it does not budge', () => {
  const made = [];
  const fx = { spawn: (spec, at, o) => { made.push({ id: spec.id, dir: o?.dir }); return {}; } };
  const me = { id: 'a', species: 'squirtle', side: 'ally', x: 2, y: 2 }, foe = { id: 'e', species: 'geodude', side: 'enemy', x: 2, y: 4 };
  createMapAttack({ attacker: me, defender: foe, move: { ...MOVES.whirlwind, id: 'whirlwind' }, result: { kind: 'status', stageChanges: [], statusChanges: [], effects: [{ unitId: 'e', effect: 'push', ok: false, reason: 'immune' }] }, lookup: (id) => [me, foe].find((u) => u.id === id), fx });
  assert.deepEqual(made.find((m) => m.id === 'pokemon/gust-blast'), { id: 'pokemon/gust-blast', dir: 'down' });
});
```

- [ ] **Step 2: Run** `node --test tests/moveFx.test.js tests/game.test.js` — Expected: FAIL.
- [ ] **Step 3: Draw `gust-blast`** in the scratch checkout (Global Constraints 순서; `pokemon/sound-wave` 의 방향 처리 참고). reach 48/72 둘 다 렌더해 보기.
- [ ] **Step 4: Implement** the wiring above.
- [ ] **Step 5: Run** `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat: whirlwind blows a gust at the target; roar's wave now shows in battle`

---

### Task 5: 이펙트 미리보기 · 브라우저 확인 · 문서

**Files:**
- Modify: `tools/fx-preview.html`, `docs/ROADMAP.md`

- [ ] **Step 1: Preview** — "효과 재생" 에서: 날씨 기술은 나 몸에 모으기 → `drawWeatherBurst` 펑(같은 함수) → 그 날씨 `drawWeather` 몇 초; 압정·독압정은 적 칸 + 4방에 `trapTossFx` 를 `TOSS_GAP` 간격으로; 날려버리기·울부짖기는 나 → 적 방향 `pushFx`; 나머지는 지금처럼 `onBody`.
- [ ] **Step 2: Browser check** — `.claude/launch.json` 의 기존 서버를 preview_start 로 미리보기 페이지에서 새 이펙트 전부 재생해 스크린샷으로 확인. 실제 전투에서 비바라기·압정뿌리기·날려버리기 한 번씩 (localStorage 저장 `pokemon-tactics-save` 백업·복원). 콘솔 오류 없음.
- [ ] **Step 3: ROADMAP** — "완료 (2026-11-15): 2차 변화기 이펙트 — 순풍 바람·신비의부적 막·안개 깔림·주술 웅덩이·날씨 펑·압정 던지기·날려버리기 바람".
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `docs: field move effects in preview and roadmap`

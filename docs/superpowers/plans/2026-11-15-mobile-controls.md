# 모바일 조작 (세로 휴대용 게임기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 터치 기기에서 화면 아래에 십자키·A·B·START·SELECT 를 띄우고 화면 터치도 받아, 휴대폰으로 게임 전체를 할 수 있게 한다.

**Architecture:** 버튼과 반복 규칙은 순수 모듈 `src/game/touchPad.js`(이벤트 대응·누르고 있기 반복기)와 DOM 붙이기(`mountPad`)로 나눈다. 버튼은 키보드와 같은 게임 이벤트를 `scene.handle` 로 보내므로 게임 장면 코드는 바꾸지 않는다. 화면 배율은 `screen.js` 의 순수 함수 `fitScale` 로 계산하고, 버튼이 보이면 버튼 자리를 뺀 화면 칸 크기에 맞춘다.

**Tech Stack:** 바닐라 JS ES 모듈, HTML/CSS, Pointer Events, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-mobile-controls-design.md`

## Global Constraints
- 버튼 대응: 십자키 = 방향(`{type:'dir',dx,dy}`), A = `{type:'confirm'}`, B = `{type:'cancel'}`, START = `{type:'endTurn'}`, SELECT = `{type:'sort'}` (키보드 E·S 와 같음).
- 십자키 누르고 있기: 키보드처럼 `repeat: true` 이벤트 반복, 떼면 `{type:'release',dx,dy}`.
- 버튼은 **터치 기기에서만**(`matchMedia('(pointer: coarse)')` 또는 `'ontouchstart' in window`). PC 는 지금 그대로.
- 화면 터치: 손가락이 닿으면 `cursor` + `click`, 누른 채 끌면 `cursor` 만. PC 마우스 동작은 그대로.
- 배율: 정수 배율이 2 이상 들어가면 정수, 아니면 칸에 맞춘 비정수(최소 1 이하로도 줄어듦).
- 가로 방향: 화면 가운데, 십자키 왼쪽, A·B 오른쪽, START·SELECT 아래.
- 두 번 톡 확대·끌어 스크롤·길게 눌러 메뉴 막기, safe area 여백.
- 진동: `navigator.vibrate?.(10)` 버튼 누를 때.
- 색: 어두운 몸체, A 빨강·B 파랑 같은 일반 색 (특정 게임기 디자인을 따라 하지 않음).
- 브랜치 `feat/mobile-controls`. 테스트 `npm test`.

## Review Focus
1. 십자키를 누른 채 손가락이 버튼 밖으로 미끄러지거나(`pointerleave`/`pointercancel`) 화면이 꺼짐 → `release` 가 반드시 나가서 마을에서 계속 걷지 않는다. → Task 1 반복기 테스트(`cancelAll`) + Task 2 연결.
2. 십자키를 누른 채 A 를 누름(멀티 터치) → 둘 다 동작, 십자키 반복이 끊기지 않는다. → Task 1 테스트.
3. 폰을 돌림(세로↔가로) → 배율·배치가 다시 맞춰지고 화면이 잘리지 않는다. → Task 2 `resize`/`orientationchange` + 브라우저 확인.
4. 버튼이 보이는 상태에서 화면을 톡 → 그 칸이 골라지고, 같은 톡이 마우스 클릭으로 한 번 더 들어가지 않는다. → Task 2 테스트(`touchToEvents`) + 확인.
5. 아주 작은 화면(가로 320px) → 버튼이 화면을 가리지 않고, 게임 화면은 비율을 지키며 줄어든다. → Task 1 `fitScale` 테스트.

---

### Task 1: 순수 로직 — 버튼 대응 · 누르고 있기 반복 · 배율

**Files:**
- Create: `src/game/touchPad.js`, `tests/touchPad.test.js`
- Modify: `src/render/screen.js` (`fitScale` 추가, `createScreen` 이 사용)

**Interfaces:**
- Produces (`touchPad.js`):
  - `PAD_EVENTS = { up, down, left, right, a, b, start, select }` (값은 Global Constraints 의 이벤트).
  - `REPEAT_DELAY = 300`, `REPEAT_EVERY = 90` (ms).
  - `createRepeater() -> { press(name, now) -> event[], release(name) -> event[], tick(now) -> event[], cancelAll() -> event[] }` — 십자키만 반복. `press` 는 첫 이벤트, `tick` 은 지연 뒤 간격마다 `{...dir, repeat: true}`, `release`/`cancelAll` 은 방향이면 `{type:'release',dx,dy}`. 여러 버튼 동시 누름 가능.
- Produces (`screen.js`): `fitScale(availW, availH) -> number`.

- [ ] **Step 1: Write the failing tests** (`tests/touchPad.test.js`)

```js
test('pad buttons map to the same events as the keyboard', () => {
  assert.deepEqual(PAD_EVENTS.a, { type: 'confirm' });
  assert.deepEqual(PAD_EVENTS.b, { type: 'cancel' });
  assert.deepEqual(PAD_EVENTS.start, { type: 'endTurn' });
  assert.deepEqual(PAD_EVENTS.select, { type: 'sort' });
  assert.deepEqual(PAD_EVENTS.left, { type: 'dir', dx: -1, dy: 0 });
});
test('holding a direction repeats after a delay and releases on lift', () => {
  const r = createRepeater();
  assert.deepEqual(r.press('up', 0), [{ type: 'dir', dx: 0, dy: -1 }]);
  assert.deepEqual(r.tick(REPEAT_DELAY - 1), []);
  assert.deepEqual(r.tick(REPEAT_DELAY), [{ type: 'dir', dx: 0, dy: -1, repeat: true }]);
  assert.equal(r.tick(REPEAT_DELAY + REPEAT_EVERY).length, 1);
  assert.deepEqual(r.release('up'), [{ type: 'release', dx: 0, dy: -1 }]);
  assert.deepEqual(r.tick(5000), []);
});
test('A does not repeat; a direction keeps repeating while A is pressed', () => {
  const r = createRepeater();
  r.press('left', 0);
  assert.deepEqual(r.press('a', 100), [{ type: 'confirm' }]);
  assert.equal(r.tick(REPEAT_DELAY).filter((e) => e.type === 'dir').length, 1);
  assert.deepEqual(r.release('a'), []);
});
test('cancelAll releases every held direction', () => {
  const r = createRepeater();
  r.press('up', 0); r.press('right', 0);
  assert.deepEqual(r.cancelAll().map((e) => e.type), ['release', 'release']);
  assert.deepEqual(r.tick(5000), []);
});
test('fitScale uses whole numbers when 2x or more fits, otherwise fits exactly', () => {
  assert.equal(fitScale(1024, 800), 4);   // 1024/256=4, 800/192=4.16
  assert.equal(fitScale(600, 500), 2);
  assert.equal(fitScale(390, 400), 390 / 256); // 폰 세로: 폭에 맞춤
  assert.equal(fitScale(320, 140), 140 / 192); // 아주 작음: 높이에 맞춤
});
```

- [ ] **Step 2: Run** `node --test tests/touchPad.test.js` — Expected: FAIL (모듈 없음).
- [ ] **Step 3: Implement** — `createScreen` 의 `fit` 은 `fitScale` 을 쓰되, 이 Task 에서는 지금처럼 창 크기 기준 (Task 2 에서 화면 칸 기준으로 바꿈). PC 기본 동작이 바뀌지 않게: 창이 512×384 이상이면 결과가 예전 `Math.max(2, floor(...))` 와 같음.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: pad event mapping, hold-to-repeat and screen fit for touch`

---

### Task 2: 화면에 붙이기 — 게임기 레이아웃 · 버튼 · 화면 터치

**Files:**
- Modify: `index.html` (레이아웃·CSS·viewport), `src/game/touchPad.js` (`mountPad`, `isTouchDevice`), `src/game/input.js` (터치 포인터, `touchToEvents`), `src/render/screen.js` (화면 칸 크기 기준 맞추기), `src/main.js` (연결)
- Test: `tests/touchPad.test.js`

**Interfaces:**
- Consumes: Task 1 `PAD_EVENTS`, `createRepeater`, `fitScale`.
- Produces:
  - `isTouchDevice() -> boolean` (`touchPad.js`).
  - `mountPad(root: HTMLElement, onEvent) -> { destroy() }` — 버튼 8개를 만들고 pointerdown/up/leave/cancel 연결, `requestAnimationFrame` 으로 `tick`, `visibilitychange`·`blur` 때 `cancelAll`, 누를 때 `navigator.vibrate?.(10)`.
  - `touchToEvents(kind: 'down'|'move', p: {px,py}|null) -> event[]` (`input.js`, 순수) — down: `[cursor, click]`, move: `[cursor]`, 화면 밖이면 `[]`.
  - `index.html`: `<div id="console">` 안에 `<div id="screen">`(캔버스) 과 `<div id="pad">`. `body.touch` 일 때만 `#pad` 표시. 세로: 위 화면·아래 패드, `@media (orientation: landscape)`: 화면 가운데·십자키 왼쪽·A/B 오른쪽·START/SELECT 아래. `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`, `env(safe-area-inset-*)`, viewport 에 `maximum-scale=1, user-scalable=no, viewport-fit=cover`.
  - `createScreen(canvas, box = null)` — `box` 가 있으면 그 요소 크기로 `fitScale`, `resize`·`orientationchange` 때 다시.

- [ ] **Step 1: Write the failing tests**

```js
test('touch on the screen: down picks the tile, move only moves the cursor, outside does nothing', () => {
  assert.deepEqual(touchToEvents('down', { px: 10, py: 20 }), [{ type: 'cursor', px: 10, py: 20 }, { type: 'click', px: 10, py: 20 }]);
  assert.deepEqual(touchToEvents('move', { px: 10, py: 20 }), [{ type: 'cursor', px: 10, py: 20 }]);
  assert.deepEqual(touchToEvents('down', null), []);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — 캔버스는 `pointerdown`(`pointerType === 'touch'` 이면 `touchToEvents('down')` 후 `preventDefault` 로 이어지는 마우스 흉내 막기, `setPointerCapture`), `pointermove`(누르는 중일 때만 `move`). 마우스는 기존 `mousemove`/`mousedown` 그대로. 패드 버튼 모양은 CSS (십자키 한 덩어리, A·B 원형, START·SELECT 작은 알약), 누르면 눌린 색.
- [ ] **Step 4: Run** `npm test` — Expected: PASS. 그리고 브라우저 패널에서 `resize_window` 모바일(375×812)로: 세로 배치·화면이 폭에 맞음·버튼 눌러 메뉴 이동/확인/취소/턴 종료, 화면 톡으로 칸 고르기, 마을에서 십자키 누르고 있기 → 계속 걷고 떼면 멈춤. 가로(812×375)로: 양옆 배치. 데스크톱 프리셋으로 돌려 PC 에서 버튼이 안 보이고 화면이 예전 크기.
- [ ] **Step 5: Commit** `feat: handheld-style touch pad and screen touch for mobile`

---

### Task 3: 문서

**Files:** Modify `README.md` (조작법에 모바일 줄), `docs/ROADMAP.md` (완료 줄)

- [ ] **Step 1:** README 조작법: "휴대폰·태블릿: 화면 아래 십자키·A(확인)·B(취소)·START(턴 종료)·SELECT(정렬), 화면을 톡 쳐서 고르기". ROADMAP: "완료 (2026-11-15): 모바일 조작 — 세로 휴대용 게임기 버튼(터치 기기만), 화면 터치, 화면 맞춤".
- [ ] **Step 2: Run** `npm test` — Expected: PASS.
- [ ] **Step 3: Commit** `docs: mobile controls`

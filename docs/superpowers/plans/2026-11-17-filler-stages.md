# 임시 스테이지 8개 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신오 동굴 뒤에 곡선 규칙으로 만든 임시 스테이지 8개(들판·동굴 번갈아, Lv 23~80)를 붙이고, 던전 선택 화면이 긴 목록을 스크롤하게 한다.

**Architecture:** `src/data/fillerStages.js` 의 `fillerStage(n)` 이 던전 표 한 줄과 같은 모양을 만든다. `dungeons.js` 는 신오 2개 뒤에 `stageSlots()` 결과(임시 또는 `REPLACED` 의 진짜 던전)를 붙이고 해금 사슬을 순서대로 다시 잇는다. 나머지 시스템(레벨 상한·적 굴림·층 생성)은 데이터만 따르므로 바꾸지 않는다.

**Tech Stack:** 바닐라 JS ES 모듈, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-17-filler-stages-design.md`

## Global Constraints
- 8개, n = 1..8. 테마: n 홀수 `field`, 짝수 `cave`. id `trial-<n>`. 이름 "시련의 들판 Ⅰ/Ⅱ/Ⅲ/Ⅳ"·"시련의 동굴 Ⅰ/Ⅱ/Ⅲ/Ⅳ" (테마별 로마 숫자).
- 층: n 1~2 → 7, 3~5 → 8, 6~8 → 9.
- 레벨: 시작 S = 23 + 7(n−1), 마지막 층 = S + 5. 층 f(0..floors−1)의 연속 레벨 L(f) = S + 5·f/(floors−1); `baseLevel[f] = round(L)`, `budget[f] = round(9·L)` (엄격히 증가). `boss.levelBonus = 3`, `levelCap = 마지막 baseLevel + 3` (= 31, 38, 45, 52, 59, 66, 73, 80).
- `bstCap = 470 + 25n` (최대 670). `stageCap(f)`: f ≤ ⌈floors/3⌉ → 0, f ≤ floors − 2 → 1, 나머지 → 2; n ≥ 5 이면 마지막 2층 2 (같은 규칙이 이미 만족하면 그대로).
- `types`·`early`·`fallback`·`clusters`·`weather` 는 같은 테마의 신오 던전(`sinnoh-field`/`sinnoh-cave`) 값을 복사.
- 해금: 1번 `sinnoh-cave` 돌파 뒤, 이후 앞 단계 돌파 뒤. `REPLACED[n]` 가 있으면 그 자리에 진짜 던전, 사슬은 실제 순서대로 다시 이음.
- 기존 신오 2개의 층 생성 결과는 그대로 (골든 해시 테스트는 신오 2개만 대상으로 유지).
- 브랜치 `feat/filler-stages`. 테스트 `npm test`. 저장 `pokemon-tactics-save` 백업·복원.

## Review Focus
1. 예전 저장(`unlocked` 에 신오 2개만) → 동굴을 이미 깬 저장이면 다음 로드나 다음 돌파 때 시련 1이 열려야 함 (지금은 돌파 순간에만 해금). → Task 1 테스트: `cleared` 에 `sinnoh-cave` 가 있는 저장을 로드하면 `trial-1` 이 `unlocked` 에 들어감.
2. 높은 단계 층에서 적 후보가 비어 생성이 막힘(bstCap·types 조합) → 모든 임시 단계 모든 층을 시드 몇 개로 생성해 적 ≥ 1, 보스 존재. → Task 1 테스트.
3. 선택 화면에서 화면 밖 항목을 마우스로 클릭/톡 → 스크롤된 위치 기준으로 맞는 항목. → Task 2 테스트.
4. 레벨 상한: 시련 단계까지 깬 뒤의 상한이 다음 단계 상한으로 이어짐. → Task 1 테스트.
5. 진행 중 탐험이 있을 때 "이어하기" 줄 + 10개 → 스크롤 시 이어하기도 함께 움직임. → Task 2 테스트.

---

### Task 1: 임시 스테이지 데이터 · 해금 사슬 · 예전 저장 보정

**Files:**
- Create: `src/data/fillerStages.js`, `tests/fillerStages.test.js`
- Modify: `src/data/dungeons.js` (신오 2개 뒤에 슬롯), `src/core/save.js` (로드 때 해금 보정), `tests/difficulty.test.js` (골든 해시를 신오 2개로, 상한 기대값)

**Interfaces:**
- Produces: `fillerStage(n: 1..8) -> Dungeon`, `FILLER_COUNT = 8`, `REPLACED: { [n]: Dungeon }` (지금은 빈 객체), `stageSlots() -> Dungeon[]` (fillerStages.js). `DUNGEONS` 길이 10.
- `unlockFromCleared(game) -> void` (save.js 또는 run.js): `cleared` 의 각 던전에 대해 `unlock` 이 그것인 던전을 `unlocked` 에 추가 — 로드 때 호출.

- [ ] **Step 1: Write the failing tests** (`tests/fillerStages.test.js`)

```js
test('eight filler stages follow the curve and alternate field and cave', () => {
  const t = DUNGEONS.slice(2);
  assert.equal(t.length, 8);
  assert.deepEqual(t.map((d) => d.theme), ['field', 'cave', 'field', 'cave', 'field', 'cave', 'field', 'cave']);
  assert.deepEqual(t.map((d) => d.floors), [7, 7, 8, 8, 8, 9, 9, 9]);
  assert.deepEqual(t.map((d) => d.baseLevel[0]), [23, 30, 37, 44, 51, 58, 65, 72]);
  assert.deepEqual(t.map((d) => d.levelCap), [31, 38, 45, 52, 59, 66, 73, 80]);
  assert.equal(t[0].name, '시련의 들판 Ⅰ'); assert.equal(t[1].name, '시련의 동굴 Ⅰ'); assert.equal(t[7].name, '시련의 동굴 Ⅳ');
  assert.equal(t[0].unlock, 'sinnoh-cave'); assert.equal(t[1].unlock, 'trial-1');
});
test('a replaced slot keeps the unlock chain in order', () => { /* stageSlots with REPLACED[2] = fake → fake.unlock === 'trial-1', trial-3.unlock === fake.id */ });
test('every filler floor generates enemies and a boss', () => { /* for each t, floors 1..floors, seeds 1..3: generateFloor → enemies.length >= 1, last floor has a boss */ });
test('loading a save that cleared the cave unlocks trial 1', () => { /* newGame + cleared ['sinnoh-field','sinnoh-cave'] + unlocked without trial-1 → save/load → unlocked includes 'trial-1' */ });
test('level cap continues into the trials', () => { assert.equal(levelCapFor({ cleared: ['sinnoh-field', 'sinnoh-cave'] }), 31); assert.equal(levelCapFor({ cleared: DUNGEONS.map((d) => d.id) }), 80); });
```
(빈 본문은 주석의 조건 그대로 assert.)

- [ ] **Step 2: Run** `node --test tests/fillerStages.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** per Global Constraints/Interfaces. 그다음 `tests/difficulty.test.js`: 골든 해시 루프를 `DUNGEONS.slice(0, 2)` 로 (해시 값 그대로 통과해야 함), 상한 테스트의 "둘 다 깬 뒤 22" → 31.
- [ ] **Step 4: Run** `npm test` — Expected: PASS (dungeon guide 테스트가 8개 임시 단계에도 통과).
- [ ] **Step 5: Commit** `feat: eight filler stages on a difficulty curve after the sinnoh cave`

---

### Task 2: 던전 선택 화면 스크롤 · 확인 · 문서

**Files:**
- Modify: `src/game/dungeonSelect.js`, `docs/ROADMAP.md`, `docs/dungeon-guide.md` (임시 단계·대체 방법 한 단락)
- Test: `tests/town.test.js` (선택 화면 테스트가 있는 곳)

**Interfaces:**
- 선택 화면: 한 번에 `VISIBLE = 7` 줄. `top` = 맨 위 항목 index, 커서가 화면 밖으로 가면 따라 이동. 위에 더 있으면 ▲, 아래에 더 있으면 ▼. 클릭/커서 좌표 → `top + row`. getter `visibleTop` (테스트용).

- [ ] **Step 1: Write the failing test**

```js
test('dungeon select scrolls to reach the last stage and clicks map to the scrolled row', () => {
  const g = newGame(); g.unlocked = DUNGEONS.map((d) => d.id);
  let started = null;
  const sel = createDungeonSelect({ game: g, onStart: (id) => { started = id; }, onResume() {}, onBack() {} });
  for (let i = 0; i < 9; i++) sel.handle({ type: 'dir', dx: 0, dy: 1 });
  assert.ok(sel.visibleTop > 0);
  sel.handle({ type: 'confirm' }); assert.equal(started, 'trial-8');
  // 클릭: 보이는 첫 줄 = visibleTop 항목
});
```

- [ ] **Step 2: Run** — Expected: FAIL (`visibleTop` 없음).
- [ ] **Step 3: Implement** scroll per Interfaces; 창 높이는 `min(items, VISIBLE)` 줄.
- [ ] **Step 4: Browser check** — 저장 백업 → `game.unlocked` 에 시련 1 추가 → 선택 화면 스크롤·▲▼ 표시, 시련 1 입장해 1층 생성·적 레벨(23 근처) 확인 → 저장 복원. 콘솔 오류 없음.
- [ ] **Step 5: Docs** — ROADMAP "완료 (2026-11-17): 임시 스테이지 8개(시련의 들판·동굴 Ⅰ~Ⅳ, Lv 23~80) — 새 맵을 만들면 `REPLACED` 로 자리 대체". dungeon-guide 에 대체 방법 한 단락.
- [ ] **Step 6: Run** `npm test` — Expected: PASS.
- [ ] **Step 7: Commit** `feat: scrolling dungeon list; docs for filler stages`

# 같은 계열 여러 마리 보유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 박스에서 결정 4개로 같은 계열 포켓몬을 한 마리 더 데려오고, 같은 종 두 마리가 출전·전투·경험치·진화·특성·성별에서 섞이지 않게 한다.

**Architecture:** 포켓몬마다 정수 `uid` 를 붙이고, 지금 종 이름으로 포켓몬을 찾던 곳(출전 목록·전투 경험치/기절 기록·층 시작 HP·결산·진화·특성·성별·박스 선택)을 `memberKey(m) = m.uid ?? m.species` 로 바꾼다(uid 없는 테스트용 멤버는 종 이름으로 그대로 동작). 개체값·얻은 성별은 같은 계열 포켓몬마다 같은 값을 복사해 두고 바뀔 때 계열 전체에 다시 쓴다. 세이브 v8 → v9.

**Tech Stack:** vanilla JS (ES modules), Canvas, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-line-copies-design.md`

## Global Constraints
- 비용: 계열 뿌리 결정 **4개** (`COPY_COST = 4`). 특성 해금은 3개 그대로.
- 새 포켓몬: 계열 첫 단계(`lineRoot`), 레벨 `max(5, floor(고른 포켓몬 레벨 × 0.8))`, 시작 경험치·시작 기술은 `newMember` 규칙, 특성 슬롯 무작위·잠김.
- 수 제한: 계열당 `max(2, 최종 모습 수)` (이브이 7, 배루키 3, 나머지 2). 메타몽 불가.
- 얻은 성별은 진화해도 지우지 않는다. 포켓몬은 **지금 모습에 맞는 것만** 쓴다. 중복 뽑기 성별은 **계열 뿌리**에 맞으면 기록.
- 새 포켓몬은 출전에 자동으로 넣지 않는다. 이름 옆 구분 표시 없음.
- UI 글은 한국어. 커밋은 단계마다, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. 같은 종 두 마리가 출전해 한쪽만 적을 쓰러뜨릴 때 경험치가 각자 따로 (공유 50% 포함) — Task 2 테스트.
2. 한쪽이 기절하고 다음 층으로 갈 때 그 포켓몬만 HP 50% — Task 2 테스트.
3. 진화(레벨·진화의돌)해도 출전 자리·uid 유지, 다른 같은 종은 그대로 — Task 2 테스트.
4. 진행 중 탐험이 있는 v8 세이브 불러오기(출전·기절 기록이 uid 로) — Task 1 테스트.
5. 엘레이드에서 꺼낸 랄토스가 암컷을 얻은 적 있으면 암컷으로 바꿔 가디안 진화 가능 — Task 3·4 테스트.

---

### Task 1: uid · 계열 도우미 · 세이브 v9 · 출전 목록

**Files:**
- Create: `src/core/members.js`
- Modify: `src/core/save.js`, `src/core/roster.js`, `src/core/progress.js` (`newParty`), `src/core/gacha.js` (새 합류에 uid)
- Test: `tests/members.test.js`, `tests/save.test.js`, `tests/roster.test.js`

**Interfaces:**
- Produces (`src/core/members.js`):
  - `memberKey(m): number|string` — `m.uid ?? m.species`
  - `memberByKey(game, key): Member|undefined` — `String(memberKey(m)) === String(key)` (JSON 키는 문자열이 되므로)
  - `giveUid(game, m): Member` — `game.nextUid`(없으면 파티 최대 uid+1) 부여 후 증가
  - `lineMembers(game, root): Member[]` — `lineRoot(m.species) === root`
  - `lineLimit(root): number` — `max(2, 최종 모습 수)` (진화 없는 종을 뿌리별로 셈, 메모해 둠)
  - `syncLine(game, root, { ivs, genders })` — 그 계열 모든 멤버의 `ivs`·`genders` 를 같은 값(복사본)으로
  - `unifyLines(game)` — 계열마다 능력치별 큰 개체값, 성별 합집합(계열 뿌리에 맞는 것만)으로 `syncLine`
- `newParty()` 는 uid 1..5, `newGame()` 은 `nextUid: 6`.
- `game.sortie` 는 uid 배열. `cleanSortie(sortie, party)` 는 파티에 있는 key 만(메타몽 제외, 중복 제거, 최대 4), 비면 파티 앞에서 key 로 채운다.
- `deployed(game)` / `toggleSortie(game, key)` 는 key 로. `renameSortie` 삭제(uid 는 진화해도 그대로).

- [ ] **Step 1: 실패하는 테스트**
  - `members.test.js`: `lineLimit('eevee') === 7`, `lineLimit('tyrogue') === 3`, `lineLimit('ralts') === 2`, `lineLimit('chimchar') === 2`; `giveUid` 가 증가; `memberByKey(game, '3')` 가 uid 3 을 찾음; `unifyLines` 가 두 랄토스 계열(랄토스 ivs atk 10, 가디안 ivs atk 25 / genders ['female'] 와 ['male'])을 atk 25, genders ['female','male'] 로 맞춤.
  - `save.test.js`: v8 세이브(종 이름 출전 `['chimchar']`, run.faintedLast `['piplup']`, uid 없음) → v9 로 불러오면 모든 멤버에 서로 다른 uid, `sortie` 는 침착 uid, `run.faintedLast` 는 팽도리 uid, `nextUid` = 최대+1; v9 저장→불러오기 왕복이 같음; 중복 uid 가 들어간 세이브는 뒤쪽에 새 uid.
  - `roster.test.js`: 같은 종 두 마리(uid 다름) 중 하나만 출전 → `deployed` 에 그 하나만; `toggleSortie(game, uid)` 로 넣고 빼기.
- [ ] **Step 2:** `npm test` → 새 테스트 FAIL 확인.
- [ ] **Step 3: 구현.** `VERSION = 9`, v8→v9 단계에서: 멤버 uid 정리(양의 정수·중복 없음, 없으면 부여) → 옛 종 이름 `sortie`·`run.faintedLast` 를 그 종의 uid 로 바꿈(v8 은 종당 하나) → `unifyLines`. `cleanRun` 의 `faintedLast` 는 양의 정수만. `cleanMember` 는 `uid` 를 보존. 뽑기 새 합류(`applyBall`)는 `giveUid`.
- [ ] **Step 4:** `npm test` 전부 PASS (기존 roster/save 테스트는 key 기반으로 고친다).
- [ ] **Step 5:** 커밋 `feat: member uids, save v9, sortie by uid`.

### Task 2: 전투 경험치 · 기절 · 결산 · 진화를 uid 로

**Files:**
- Modify: `src/core/battle.js` (유닛 `memberKey`, `log.exp`·`log.fainted`·`hpRatio`), `src/core/progress.js` (`applyExp` 키·이벤트에 `key`), `src/core/run.js` (`settleLoot` 사탕 경험치 키), `src/game/results.js`, `src/main.js` (`evolveChain`, 사탕 결산 필터, 박스 `onEvolve`), `src/game/evolution.js`·`src/game/states.js` (호출부 맞춤)
- Test: `tests/battle.test.js`, `tests/progress.test.js`, `tests/run.test.js`

**Interfaces:**
- Consumes: `memberKey`, `memberByKey` (Task 1).
- 아군 유닛에 `memberKey: memberKey(m)`. `log.exp: { [memberKey]: n }`, `log.fainted: memberKey[]`, `createBattle(..., { hpRatio: { [memberKey]: ratio } })`.
- `applyExp(party, expByKey, rng, cap)` — 이벤트마다 `key: memberKey(m)` 추가(`species` 는 그대로 둠).
- `evolveChain` 항목 `{ key, options, stone? }`; `memberByKey` 로 찾는다.

- [ ] **Step 1: 실패하는 테스트**
  - `battle.test.js`: uid 1·2 인 같은 종 두 마리 출전, uid 1 이 적을 쓰러뜨림 → `log.exp[1] === full`, `log.exp[2] === floor(full × shareRatio)`; uid 2 기절 → `log.fainted` 에 2 만; `hpRatio: { 2: 0.5 }` 면 uid 2 유닛만 반 HP.
  - `progress.test.js`: 같은 종 두 마리에 `applyExp(party, { 1: n })` → uid 1 만 경험치·레벨업 이벤트(`key: 1`).
  - `run.test.js`: `settleLoot` 사탕 경험치가 멤버마다 key 로.
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3: 구현.** results.js 는 `before`·`gained`·`cappedSet`·`member` 를 key 로; 진화 목록에 `key`. main.js 사탕 결산은 출전 멤버 key 로 필터. 박스 `onEvolve(member, options)` → `evolveChain([{ key: memberKey(member), options, stone: true }], …)`; `renameSortie` 호출 제거.
- [ ] **Step 4:** `npm test` 전부 PASS.
- [ ] **Step 5:** 커밋 `feat: battle exp, faint and evolution tracked per member`.

### Task 3: 얻은 성별 보관 · 중복 뽑기가 계열 전체를 올림 · 특성/성별을 key 로

**Files:**
- Modify: `src/core/progress.js` (`evolveMember` 성별 목록 안 지움, `unlockAbility`·`setAbilitySlot` 이 key 로), `src/core/individual.js` (`setGender(game, key, g)`, `usableGenders(m)`), `src/core/save.js` (`cleanIndividual` 은 계열 뿌리 기준으로 목록 보존), `src/core/gacha.js` (`applyBall` 중복), `src/game/summary.js`, `src/game/box.js` (호출부)
- Test: `tests/individual.test.js`, `tests/progress.test.js`, `tests/gacha.test.js`

**Interfaces:**
- `usableGenders(m): string[]` — `m.genders` 중 `genderFits(m.species, g)`.
- `setGender(game, key, g)` — `usableGenders` 안에서만, 아니면 `{ ok:false, reason:'locked' }`.
- `unlockAbility(game, key)`, `setAbilitySlot(game, key, slot)` — 멤버 하나만 바뀜.
- `applyBall` 중복: 계열의 첫 멤버 대신 계열 전체 — `mergeIvs` 결과와 새 성별(계열 뿌리에 맞으면)을 `syncLine`. 반환값은 그대로(`ivUp`, `newGender`).

- [ ] **Step 1: 실패하는 테스트**
  - 엘레이드(genders ['male','female']) 진화 후에도 목록 유지, `usableGenders` 는 ['male']; 가디안 진화 시 성별 ♀ 목록 유지.
  - 랄토스 두 마리 계열에 중복 뽑기 → 두 마리 모두 ivs 올라감, 새 성별이 두 마리 모두에 추가; 지금 모습이 엘레이드여도 ♀ 가 기록됨.
  - 같은 종 두 마리 중 uid 2 만 특성 해금 → uid 1 은 잠김 그대로; `setGender(game, 2, 'female')` 는 uid 2 만.
  - 불러오기: 엘레이드의 genders ['male','female'] 가 지워지지 않음.
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3: 구현.** `evolveMember` 는 지금 성별이 새 종에 안 맞을 때만 고치고(목록에 맞는 게 있으면 그걸로, 없으면 `hashGender`), 목록은 그대로(새 성별은 추가). summary 성별 바꾸기·표시는 `usableGenders`, 박스/요약의 특성·성별·출전 호출은 `memberKey(m)`.
- [ ] **Step 4:** `npm test` 전부 PASS.
- [ ] **Step 5:** 커밋 `feat: line-wide genders and ivs, per-member ability and gender by uid`.

### Task 4: 한 마리 더 꺼내기 (규칙 + 박스 메뉴)

**Files:**
- Modify: `src/core/members.js` (`copyMember`), `src/game/box.js` (메뉴·메시지·포커스), `src/game/summary.js` (필요하면 결정 줄 옆 안내)
- Test: `tests/members.test.js`, `tests/box.test.js`

**Interfaces:**
- `COPY_COST = 4`
- `copyMember(game, key, rng): { ok: true, member } | { ok: false, reason: 'missing'|'ditto'|'limit'|'shards' }`
  - 순서: 없음 → 메타몽 → 수 제한(`lineMembers(...).length >= lineLimit(root)`) → 결정 부족.
  - 새 멤버: `newMember(root, max(5, floor(src.level × 0.8)), rng)` → `ivs`·`genders` 는 원본 계열 값 복사 → 성별 = 원본 지금 성별이 `root` 에 맞으면 그것, 아니면 `usableGenders` 중 첫 번째, 없으면 `newMember` 가 고른 것(그 값은 genders 에 추가 후 `syncLine`) → `giveUid` → 파티 끝에 추가 → 결정 4 차감.
- 박스 메뉴 항목 `한 마리 더 (결정 4)` (메타몽 제외): 실패면 이유 메시지 — `limit`: "이 계열은 더 데려올 수 없다.", `shards`: "결정이 모자라다. (4개 필요)"; 성공: "{이름}{이/가} 한 마리 더 합류했다!" 후 새 멤버에 포커스, `onSave()`.

- [ ] **Step 1: 실패하는 테스트**
  - `copyMember`: 결정 4 차감, 가디안 Lv40 → 랄토스 Lv32, 특성 잠김, ivs·genders 원본과 같음(복사본, 같은 객체 아님), 새 uid, 출전 목록 그대로; Lv5 원본 → Lv5; 결정 3이면 `shards`; 계열 2마리면 `limit`, 이브이는 7마리까지; 메타몽 `ditto`.
  - 엘레이드(♂, genders ['male','female'])에서 꺼낸 랄토스는 ♂ 시작, `setGender(game, newUid, 'female')` 성공.
  - `box.test.js`: 메뉴에 "한 마리 더" 가 있고, 고르면 파티가 1 늘고 새 멤버가 선택됨; 결정 부족이면 파티 그대로·메시지.
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** `npm test` 전부 PASS.
- [ ] **Step 5:** 커밋 `feat: copy a line member from the box for 4 shards`.

### Task 5: 문서 · 브라우저 확인 · 리뷰
- [ ] README·`docs/ROADMAP.md` 에 기능과 세이브 v9 한 줄씩.
- [ ] 브라우저(사용자 세이브는 백업 후 복원): 박스에서 한 마리 더 꺼내기 → 출전에 넣기 → 1층 전투에서 두 마리 경험치·결산이 따로 나오는지 확인, 스크린샷.
- [ ] Opus 최종 리뷰 → Important 수정 → 커밋 `docs: line copies`.

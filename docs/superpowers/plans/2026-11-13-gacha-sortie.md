# 뽑기 동료 해금 + 출전 편성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 던전 코인 → 모집소 뽑기(1단계·희귀도 3단계·중복은 결정) → 편성소에서 출전 4마리 선택 → 출전 멤버만 전투·경험치.

**Architecture:** 뽑기(`core/gacha.js`)와 출전 편성(`core/roster.js`)은 순수 함수(rng 주입). 코인은 기존 탐험 보물(`run.loot`)과 같은 경로로 쌓이고 지급·상실된다. 장면은 모집소(신규)와 편성소(확장).

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-gacha-sortie-design.md`

## Global Constraints

- 뽑기 1회 100코인. 희귀도: 계열 최종형 최대 BST `<450` 평범 70% · `450–534` 희귀 25% · `≥535` 매우 희귀 5%.
- 뽑기 후보: `stage 0`, `!legendary`, ≠ `ditto`.
- 코인: 적 격파 `3 + floor(lv/3)`, 층 돌파 `10 × 층`, 상자 코인 주머니 `20 × 층`. 상자 확률 진화의돌 15 / 사탕 55 / 코인 30.
- 출전 = `[ditto, ...sortie]`, sortie ≤ 4, 메타몽 제외, 중복 없음, 파티에 있는 종족만, 최소 1.
- 출전하지 않은 동료는 경험치(전투·사탕) 없음.
- 저장 version 4. 게임 텍스트 한국어, `core/` DOM 금지, 각 Task 끝에 커밋.

## Review Focus

1. **코인 부족 상태에서 뽑기 연타**: 코인이 음수가 되거나 동료가 생기지 않는다. → Task 1·5.
2. **출전 4마리가 꽉 찬 상태에서 대기 동료 선택 / 마지막 출전 멤버 빼기**: 거부 + 안내. → Task 4.
3. **진화한 동료와 같은 계열이 뽑힘**(예: 파이숭이 보유 중 불꽃숭이): 중복 → 결정. → Task 1.
4. **저장의 sortie 가 깨짐**(없는 종족·메타몽 포함·5개·중복·빈 배열): 정리 후 파티 앞에서 채움. → Task 3.
5. **전멸·포기 시 코인**: 이번 탐험 코인만 잃고 기존 보유 코인은 그대로. → Task 2.

---

### Task 1: 뽑기 규칙

**Files:** Create `src/core/gacha.js` · Test `tests/gacha.test.js`

**Interfaces:**
- `GACHA_COST = 100`, `RARITY = [{ id: 'common', weight: 70 }, { id: 'rare', weight: 25 }, { id: 'epic', weight: 5 }]`
- `lineFinalBst(speciesKey) => number` — evolutions 를 끝까지 따라가 최대 bst (자기 자신 포함)
- `rarityOf(speciesKey) => 'common'|'rare'|'epic'`
- `gachaPool() => { common: key[], rare: key[], epic: key[] }` (정렬, 결정적)
- `lineRoot(speciesKey) => key` — 1단계 조상 (evolutions 역방향 탐색)
- `pull(game, rng) => { ok: false, reason: 'coins' } | { ok: true, species, rarity, duplicate: boolean, member?: Member }` — 코인 차감, 중복이면 `game.shards[root] += 1`, 아니면 `newMember(species, joinLevel(game))` 를 `game.party` 끝에 추가
- `joinLevel(game) => max(5, round(avg(출전 동료 레벨)) - 2)` (출전 = `deployed(game)` from Task 4 — Task 1 에서는 `game.sortie` 종족의 레벨 평균, 비면 파티 메타몽 외 평균)
- [ ] **Step 1: tests** — 후보 조건; 경계 449/450/534/535 (가짜 데이터 주입 없이 실제 예: `dratini` epic, `bulbasaur` rare, `caterpie` common — 값은 데이터로 계산해 단언); 갈래 최댓값(이브이 계열); 시드 10,000회 분포 70/25/5 ±2%; **(Review Focus 3)** 파티에 `monferno` 가 있을 때 `chimchar` 뽑힘 → duplicate, shards.chimchar 1, 파티 수 불변; **(Review Focus 1)** coins 99 → `{ok:false}` 이고 coins 그대로; 합류 레벨 (평균 12 → 10, 평균 5 → 5)
- [ ] **Step 2: Run** `node --test tests/gacha.test.js` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: gacha rules (rarity, duplicates to shards)`

---

### Task 2: 코인 획득 · 지급 · 상실

**Files:** Modify `src/core/battle.js`, `src/core/floorgen.js`, `src/core/run.js` · Test `tests/battle.test.js`, `tests/floorgen.test.js`, `tests/run.test.js`

**Interfaces:**
- battle: `state.log.coins` — 적 기절 시 `+= 3 + floor(lv/3)` (공격자가 아군일 때만)
- floorgen: chest item ∈ `evoStone | candy | coins`, 확률 15/55/30
- run: `loot.coins` (startRun 0); `addLoot(run, 'coins', floor)` → `+= 20 × floor`; `addFloorCoins(run, floor)` → `+= 10 × floor`; `addBattleCoins(run, n)`; `settleLoot` 가 `game.coins += loot.coins` 하고 반환에 `coins` 포함; 전멸·포기는 지급 안 함(기존 경로)
- [ ] **Step 1: tests** — 격파 코인 공식(Lv 9 → 6), 아군 기절은 0; floorgen 상자 item 3종(300 시드 중 coins 등장); **(Review Focus 5)** game.coins 50 + run 코인 80 → settle 130, wiped 경로(finishRun 만) → 50 그대로; addFloorCoins(3) → 30
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: coins from battles, floors and chests`

---

### Task 3: 저장 v4

**Files:** Modify `src/core/save.js` · Test `tests/save.test.js`

**Interfaces:**
- newGame: `coins: 0, shards: {}, sortie: ['chimchar','piplup','turtwig','shinx']`, version 4
- v3 → v4 이전: coins 0, shards {}, sortie = 파티 메타몽 외 앞 4; run.loot.coins 없으면 0
- `cleanSortie(sortie, party) => string[]` — 파티에 있는 종족·메타몽 제외·중복 제거·최대 4, 비면 파티 앞에서 채움
- shards: 실제 종족 키만, 정수 ≥ 0
- [ ] **Step 1: tests** — v4 왕복; v3 → v4; **(Review Focus 4)** sortie `['ditto','missingno','chimchar','chimchar','piplup','turtwig','shinx']` → `['chimchar','piplup','turtwig','shinx']`, `[]` → 앞에서 채움
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: save v4 (coins, shards, sortie)`

---

### Task 4: 출전 편성 규칙 + 편성소 화면

**Files:** Create `src/core/roster.js` · Modify `src/game/party.js`, `src/core/gacha.js`(joinLevel 이 deployed 사용) · Test `tests/roster.test.js`, `tests/town.test.js`

**Interfaces:**
- `deployed(game) => Member[]` — `[ditto, ...sortie 순서대로 멤버]`
- `toggleSortie(game, species) => { ok: true } | { ok: false, reason: 'full'|'last'|'ditto' }`
- party.js 메뉴 [출전 멤버 바꾸기, 진화의돌 사용, 돌아가기]; 출전 화면: 동료 목록(메타몽 제외) 한 화면 5줄 페이지, 각 줄 "★출전"/"대기", Z 로 토글, 거부 시 대사("출전 자리가 꽉 찼다" / "최소 1마리는 출전해야 한다"), X 로 메뉴
- [ ] **Step 1: tests** — deployed 순서; **(Review Focus 2)** 4마리 출전 중 대기 추가 → full, 마지막 1마리 빼기 → last, 메타몽 → ditto; 토글 왕복
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** roster.js, party.js 화면
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: sortie selection in the party office`

---

### Task 5: 모집소 장면 · 흐름 연결

**Files:** Create `src/game/gacha.js` (장면) · Modify `src/data/town.js`(dex 표지판 → `action: 'gacha'`, "모집소다." / "동료를 찾아볼까?"), `src/game/town.js`(onGacha), `src/main.js`, `src/game/results.js`(코인 표시) · Test `tests/town.test.js`

**Interfaces:**
- `createGachaScene({ game, rng, onBack, onPulled })` — [뽑기 (100코인), 돌아가기], 결과 연출(볼 흔들림 1.2초 → 희귀도 색 번쩍임 → 포켓몬 + 이름·희귀도·"새 동료!"/"결정을 얻었다"), 코인 부족 대사; 뽑을 때마다 `onPulled()`(main 이 저장·스프라이트 요청)
- main: 전투 `party: deployed(game)`; 층 시작 `requestSprites(deployed)`; 결산 `game.party` 대신 출전 멤버만 경험치 적용(전투 로그는 출전 유닛만 있으므로 그대로, 사탕은 `settleLoot` 반환 exp 를 출전 멤버로 한정); 층 돌파 시 `addFloorCoins`, 전투 로그 코인 `addBattleCoins`; 마을 NPC = 출전 멤버 → 대기 동료 순 (최대 6); 모집소 연결
- results: 상단에 "코인 +N" (log.coins + 층 돌파 코인)
- [ ] **Step 1: tests** — 모집소 표지판 → onGacha; **(Review Focus 1)** 모집소 장면에서 코인 150 → 뽑기 1회 성공 후 연타해도 코인 50 에서 더 줄지 않고 동료 1 증가
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: recruit office scene and sortie-based battles`

---

### Task 6: 확인 · 문서

**Files:** Modify `README.md`, `docs/ROADMAP.md`

- [ ] **Step 1: Verify** 브라우저: 던전 층 돌파 → 결산 코인 → 귀환 → 모집소 뽑기 연출(스크린샷) → 편성소 출전 교체 → 다음 탐험에 새 동료 출전·경험치
- [ ] **Step 2: Docs** README(코인·모집소·출전 편성·결정), ROADMAP(B 완료, 다음: 메타몽 변신 / 결정 사용처 알기술·특성)
- [ ] **Step 3: Run** `npm test` → PASS
- [ ] **Step 4: Commit** `docs: gacha and sortie`

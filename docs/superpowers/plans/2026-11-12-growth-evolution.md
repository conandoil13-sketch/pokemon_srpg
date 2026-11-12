# 성장 루프 (레벨업 · 기술 습득 · 진화) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1단계 포켓몬으로 시작해 전투 경험치로 레벨업하고, PokeAPI Pt 습득표로 기술을 배우며, 규칙 매트릭스대로 진화하고, 진행이 저장되는 성장 루프.

**Architecture:** `tools/fetch-pokeapi.js` 가 PokeAPI 를 한 번 받아 `src/data/generated/pokedex.js` 를 만든다. 규칙은 모두 `src/core/` 의 순수 함수(evolution · stats · learn · progress · save)로 두고 테스트한다. 전투 유닛은 종족 고정값 대신 자기 level·stats·moves 를 가진다. 결산 · 진화 · 편성은 새 장면이다.

**Tech Stack:** Vanilla JS ES modules, Canvas 2D, Node 24 `node --test`, PokeAPI (도구 실행 시에만), localStorage.

**Spec:** `docs/superpowers/specs/2026-11-12-growth-evolution-design.md`

## Global Constraints

- 4세대 기준: 습득표는 version group `platinum` 의 `level-up` 만. 타입은 `past_types` 에 generation-iv 이하 값이 있으면 그것.
- 게임 실행 중 PokeAPI 호출 금지. 생성 파일 `src/data/generated/pokedex.js` 는 커밋한다.
- 능력치: IV 31, EV 0, 무보정. HP=`floor((2B+31)·L/100)+L+10`, 그 외=`floor((2B+31)·L/100)+5`.
- 데미지의 레벨 항은 공격자 레벨 `(2·L/5+2)`.
- 경험치: KO 1마리당 `floor(baseExp·적Lv/7)·배율`(배율 2). 그 순간 KO 한 아군 100%, 살아 있는 다른 아군 각 `floor(50%)`.
- 진화 매트릭스·배율·시작 레벨(8)·2차 보정(+8)은 `src/data/balance.js` 에만 둔다.
- 변화기(`damage_class status`)·`power === null` 기술은 `learnable: false`, 습득에서 건너뜀.
- 사거리 기본 물리 `[1,1]`, 특수 `[1,2]`; 예외는 `src/data/moveRanges.js`. 이동력: 스피드 종족값 `<50:3, <80:4, <100:5, 그 외 6`, 비행 +1(최대 6).
- 기술·종족 키는 PokeAPI 식별자(`close-combat`, `chimchar`). 전투 유닛 id 는 `${side}-${species}`.
- `core/` 는 DOM 을 모른다. `save.js` 는 `{ getItem, setItem }` 저장소를 주입받는다. localStorage 키 `pokemon-tactics-save`, `version: 1`.
- 게임 내 텍스트 한국어. 커밋 단계는 각 Task 끝에서 한다.

## Review Focus

1. **한 번에 여러 레벨이 오르며 진화 레벨과 기술 습득 레벨을 함께 넘는 경우**: 이벤트가 레벨 순 → 진화는 마지막, 진화 후 새 종족의 현재 레벨 기술까지 처리. → Task 6 테스트.
2. **기술 4개 상태에서 이미 아는 기술이 습득표에 다시 나옴**: 건너뜀(선택창 없음). → Task 3 테스트.
3. **깨진·옛 버전·없는 종족이 든 저장 데이터**: 크래시 없이 새 게임 또는 보충. → Task 7 테스트.
4. **KO 한 아군이 같은 페이즈에 기절 / 다른 아군 전멸 상태에서 KO**: 이미 받은 경험치 유지, 50% 몫은 살아 있는 아군에게만. → Task 5 테스트.
5. **결산에서 기술 선택창이 열린 채 Z 연타**: 선택이 끝나기 전엔 다음 단계(진화·마을)로 넘어가지 않음. → Task 8 테스트.

---

## File Structure

```
tools/fetch-pokeapi.js            (신규) PokeAPI → generated/pokedex.js
tools/check-pokeapi.js            (삭제)
src/data/generated/pokedex.js     (생성, 커밋)
src/data/balance.js               (신규) BALANCE
src/data/moveRanges.js            (신규) MOVE_RANGES
src/data/species.js               (재작성) 생성 데이터 → SPECIES, validateData
src/data/moves.js                 (재작성) 생성 데이터 → MOVES
src/data/map.js                   (수정) allySlots + 레벨 있는 1단계 적
src/data/stages.js                (수정) reward
src/data/town.js                  (수정) 편성소 action 'party'
src/core/evolution.js             (신규)
src/core/stats.js                 (신규)
src/core/learn.js                 (신규)
src/core/progress.js              (신규)
src/core/save.js                  (신규)
src/core/battle.js, damage.js, ai.js, pathfind.js   (수정) 유닛 값 사용, 경험치 기록
src/render/mapAttack.js           (수정) +N EXP 표시
src/game/results.js, evolution.js, party.js        (신규 장면)
src/game/states.js, title.js, town.js, main.js     (수정)
tests/evolution|stats|learn|progress|save|results.test.js (신규), 기존 테스트 갱신
```

---

### Task 1: 진화 분류 규칙 + 밸런스 값

**Files:**
- Create: `src/data/balance.js`, `src/core/evolution.js`
- Test: `tests/evolution.test.js`

**Interfaces:**
- Produces:
  - `BALANCE = { startLevel: 8, expMultiplier: 2, shareRatio: 0.5, secondStageMinGap: 8, evoMatrix: { two: { friendship: 20, trade: 30, other: 25 }, three1: { friendship: 16, trade: 20, other: 18 }, three2: { friendship: 32, trade: 36, other: 34 } } }`
  - 입력 타입 `Detail = { trigger: string, minLevel: number|null, minHappiness: number|null, item: string|null, extra: boolean }` (extra = 시간대 외의 추가 조건: 기술·장소·성별·파티 등. 시간대는 친밀도와 함께 무시)
  - `classifyEvolution(details: Detail[], line: { length: 2|3, order: 1|2, prevLevel: number|null }, balance = BALANCE) => { kind: 'stone' } | { kind: 'level', level: number, source: 'original'|'friendship'|'trade'|'other' }`
    - 우선순위: 어떤 detail 이든 `trigger === 'use-item'` → stone; `level-up && minLevel && !minHappiness && !extra` → original; `minHappiness` → friendship; `trigger === 'trade'` → trade; 그 외 other
    - 매트릭스 칸: length 2 → `two`, length 3 & order 1 → `three1`, order 2 → `three2`
    - 보정: order 2 이고 prevLevel 이 숫자면 `level = max(level, prevLevel + gap)` (원작 레벨에도 적용하지 않음 — source !== 'original' 일 때만)
  - `levelEvolutionReady(speciesData, level) => boolean` — `evolution?.rule.kind === 'level' && level >= rule.level`
  - `stoneEvolutionReady(speciesData) => boolean`

- [ ] **Step 1: Write the failing test** `tests/evolution.test.js`
  - 원작 레벨: `[{trigger:'level-up',minLevel:14,...}]`, line `{length:3,order:1}` → `{kind:'level',level:14,source:'original'}`
  - 리올루형: `[{trigger:'level-up',minLevel:null,minHappiness:160,extra:false}]`, `{length:2,order:1}` → level 20 friendship
  - 꼬몽울형: 같은 조건 `{length:3,order:1}` → 16; 로젤리아형 `use-item` → stone
  - 매트릭스 6칸 각각 (friendship/trade/other × two/three1/three2) 값 일치
  - 보정: `{length:3,order:2,prevLevel:30}` + friendship → 38; prevLevel null(1차가 돌) → 32
  - 우선순위: `[{use-item}, {level-up minLevel 20}]` → stone; `[{level-up minLevel 30 extra:true}]` → other(25 for length 2)
  - `levelEvolutionReady({evolution:{to:'x',rule:{kind:'level',level:14}}}, 14) === true`, 13 → false; stone 규칙은 false
- [ ] **Step 2: Run** `node --test tests/evolution.test.js` → FAIL (module not found)
- [ ] **Step 3: Implement** `balance.js`, `evolution.js` per Interfaces
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: evolution rule classification and balance table`

---

### Task 2: 능력치 · 성장 곡선 · 경험치 계산

**Files:**
- Create: `src/core/stats.js`
- Test: `tests/stats.test.js`

**Interfaces:**
- Produces:
  - `statsAt(base: {hp,atk,def,spa,spd,spe}, level) => {hp,atk,def,spa,spd,spe}` (Global Constraints 공식)
  - `expForLevel(growth: string, level) => number` — growth 는 PokeAPI 이름: `fast` 4n³/5, `medium` n³, `medium-slow` 6n³/5−15n²+100n−140, `slow` 5n³/4, `slow-then-very-fast`(erratic), `fast-then-very-slow`(fluctuating) 원작 구간식. 결과는 floor, Lv1 은 0, 음수는 0
  - `levelForExp(growth, exp) => number` (1..100)
  - `expYield(baseExp, enemyLevel, multiplier) => floor(baseExp·enemyLevel/7)·multiplier`

- [ ] **Step 1: Write the failing test**
  - `statsAt({hp:76,atk:104,def:71,spa:104,spd:71,spe:108}, 50)` → `{hp:151,atk:124,def:91,spa:124,spd:91,spe:128}` (기존 Lv50 값과 같음)
  - `statsAt(같은 base, 8)` → `hp: floor(183·8/100)+18 = 32`, `atk: floor(239·8/100)+5 = 24`
  - `expForLevel`: medium-slow 10 → 560, 50 → 117360, 100 → 1059860; medium 50 → 125000; fast 100 → 800000; slow 100 → 1250000; slow-then-very-fast 100 → 600000; fast-then-very-slow 100 → 1640000; 모든 곡선 Lv1 → 0
  - `levelForExp('medium-slow', 559) === 9`, `560 → 10`, `1e9 → 100`
  - `expYield(62, 8, 2) === 140`
- [ ] **Step 2: Run** `node --test tests/stats.test.js` → FAIL
- [ ] **Step 3: Implement** `stats.js`
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: level stats, growth curves and exp yield`

---

### Task 3: 기술 습득 규칙

**Files:**
- Create: `src/core/learn.js`
- Test: `tests/learn.test.js`

**Interfaces:**
- Consumes: 습득표 형식 `learnset: [level, moveApi][]` (레벨 오름차순), `movesData: { [api]: { learnable: boolean } }`
- Produces:
  - `startingMoves(learnset, level, movesData) => string[]` — level 이하 learnable 중 마지막 4개(습득 순서 유지, 중복 제거). 0개면 `['tackle']`
  - `movesLearnedBetween(learnset, fromExclusive, toInclusive, movesData) => string[]` — 구간 안 learnable, 레벨 순
  - `learnOutcome(knownMoves: string[], move) => 'known' | 'learn' | 'choose'` — 이미 앎 / 4개 미만 / 4개

- [ ] **Step 1: Write the failing test** (작은 가짜 learnset·movesData)
  - learnset `[[1,'scratch'],[1,'leer'],[7,'ember'],[9,'taunt'],[15,'fury-swipes'],[17,'flame-wheel']]`, leer/taunt learnable false
  - `startingMoves(.., 8)` → `['scratch','ember']`; `(.., 20)` → `['scratch','ember','fury-swipes','flame-wheel']`; 5개 이상 learnable 이면 마지막 4개
  - learnable 0개 → `['tackle']`
  - `movesLearnedBetween(.., 7, 17)` → `['fury-swipes','flame-wheel']` (7 은 제외, taunt 건너뜀)
  - **(Review Focus 2)** `learnOutcome(['a','b','c','ember'], 'ember') === 'known'`; 4개 + 새 기술 → 'choose'; 3개 → 'learn'
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `learn.js`
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: move learning rules`

---

### Task 4: PokeAPI 데이터 파이프라인 + 데이터 모듈 교체

**Files:**
- Create: `tools/fetch-pokeapi.js`, `src/data/generated/pokedex.js` (생성), `src/data/moveRanges.js`
- Rewrite: `src/data/species.js`, `src/data/moves.js`
- Delete: `tools/check-pokeapi.js`
- Modify: `tests/data.test.js`, `tests/text.test.js`

**Interfaces:**
- Consumes: `classifyEvolution` (Task 1)
- Produces:
  - 생성 파일 `export default { species: { [api]: { api, dex, name, types, base:{hp,atk,def,spa,spd,spe}, baseExp, growth, learnset:[[lv, moveApi]], evolution: { to, rule } | null } }, moves: { [api]: { api, name, type, category, power, accuracy, learnable } } }`
  - `MOVE_RANGES = { 'aura-sphere':[2,3], 'shadow-ball':[2,3], 'razor-leaf':[1,2] }` (기존 20개 중 기본 규칙과 다른 것만)
  - `SPECIES[api] = { ...generated, key: api, move: movementFor(types, base.spe) }` / `validateData()` — 24종 존재, evolution.to 가 존재하는 종족, learnset 의 기술이 MOVES 에 존재
  - `MOVES[api] = { ...generated, id: api, range: MOVE_RANGES[api] ?? (category==='physical' ? [1,1] : [1,2]) }`
  - 도구: 24종 목록(§2 스펙)을 받아, 진화 사슬을 따라 line length/order/prevLevel 을 계산해 `classifyEvolution` 호출. 요청 실패 시 1회 재시도, 그래도 실패면 파일을 쓰지 않고 exit 1. `fetch` 결과를 정렬해 결정적(diff 안정) 출력.

- [ ] **Step 1: Implement** `tools/fetch-pokeapi.js`, `moveRanges.js`
- [ ] **Step 2: Run** `node tools/fetch-pokeapi.js` → Expected: `src/data/generated/pokedex.js` 생성, 콘솔에 `24 species, N moves`
- [ ] **Step 3: Write the failing test** (data.test 갱신)
  - 24종 존재, 모두 `learnset.length > 0`, `startingMoves(learnset, 8)` 비어 있지 않음
  - 스펙 §4 검증표: `SPECIES.chimchar.evolution.rule` = level 14, `monferno` → 36, `riolu` → level 20 friendship, `murkrow` → stone, `budew` → 16, `roselia` → stone, `bronzor` → 33, 최종형 `evolution === null`
  - `SPECIES.chimchar.name === '불꽃숭이'`, `MOVES['close-combat'].name === '인파이트'`, `MOVES.growl.learnable === false`
  - 이동력: `bronzor` 3 (스피드 23), `gible` 3 (42), `chimchar` 4 (61), `murkrow` 6 (91 → 5, 비행 +1)
  - 사거리: `MOVES['aura-sphere'].range` `[2,3]`, 물리 기본 `[1,1]`
  - text.test 의 기존 키(`infernape`, `thunderbolt`)는 그대로 통과해야 함
- [ ] **Step 4: Rewrite** `species.js`, `moves.js`; delete `tools/check-pokeapi.js`
- [ ] **Step 5: Run** `node --test tests/data.test.js tests/text.test.js` → PASS (다른 테스트는 Task 5 에서 고침)
- [ ] **Step 6: Commit** `feat: PokeAPI data pipeline (Pt learnsets, evolutions)`

---

### Task 5: 전투 유닛이 레벨·능력치·기술을 가진다 + 경험치 기록

**Files:**
- Modify: `src/core/battle.js`, `src/core/damage.js`, `src/core/ai.js`, `src/core/pathfind.js`, `src/data/map.js`, `src/game/states.js`, `src/render/mapAttack.js`
- Create: `src/core/progress.js` (이 Task 에서는 `newParty` 만)
- Test: 기존 `damage|ai|battle|pathfind|game|town.test.js` 갱신 + `tests/battle.test.js` 경험치 케이스

**Interfaces:**
- Consumes: `statsAt`, `expYield`, `startingMoves`, `BALANCE`, `SPECIES`, `MOVES`
- Produces:
  - `MAP = { tiles, allySlots: [{x,y}×4], enemies: [{species, level, x, y}] }` — 1스테이지 적: riolu 8 · gible 9 · murkrow 8 · budew 7 · bronzor 9 (기존 좌표 유지)
  - `newParty() => Member[]`, `Member = { species, level, exp, moves: string[] }` — chimchar · piplup · turtwig · shinx, Lv `BALANCE.startLevel`, `exp = expForLevel(growth, level)`, `moves = startingMoves(...)`
  - `createBattle(mapDef = MAP, party = newParty()) => State` — 유닛 `{ id, species, side, x, y, level, stats, hp, maxHp, moves, moved, acted }`; `state.log = { exp: { [species]: number } }`
  - `applyAttack(...)` 반환에 `expGained: { [species]: number }` 추가. 적이 기절하면: 공격자 `expYield(...)`, 그 순간 살아 있는 다른 아군 `floor(× shareRatio)`; `state.log.exp` 누적
  - damage.js: `sp(unit).stats` → `unit.stats`, 레벨 항 → `attacker.level`
  - ai.js: `SPECIES[...].moves` → `unit.moves`, 정렬 → `unit.stats.spe`
  - pathfind.js: 변화 없음 (`SPECIES[key].move`, `types` 유지)
  - states.js: `createGame({ rng, map, party, onExit })`, `onExit(result, state.log)`; 메뉴·사거리는 `sel.moves` 사용
  - mapAttack.js: `result.expGained` 중 공격자 몫이 있으면 impact 단계에 공격자 위 `+N EXP`(노란색, small)

- [ ] **Step 1: Write the failing tests**
  - battle.test: `createBattle()` 아군 4 · 적 5, 아군 level 8, `unit.stats` = `statsAt(base, level)`, `unit.moves` 1~4개
  - battle.test: 적 hp 1 → 아군 KO 시 `expGained[attacker] === expYield(baseExp, 적Lv, 2)`, 다른 살아 있는 아군 각 `floor(그 값 × 0.5)`, `state.log.exp` 누적
  - **(Review Focus 4)** 다른 아군을 모두 units 에서 제거한 상태에서 KO → 공격자만 받음; KO 한 아군을 이후 기절시켜도 `state.log.exp` 값 유지
  - damage.test: 레벨 반영 — 같은 유닛 Lv8 vs Lv50 기대 데미지 비율이 공식대로(Lv50 이 더 큼), 기존 케이스는 `statsAt(base,50)` 유닛으로 재작성
  - ai/game/town 테스트의 종족·기술 키를 새 키로 (예: garchomp 대신 gible, `'dragon-claw'` 등 실제 learnset 기반), 의미는 유지
- [ ] **Step 2: Run** `npm test` → 새/갱신 케이스 FAIL
- [ ] **Step 3: Implement** 위 Interfaces
- [ ] **Step 4: Run** `npm test` → 전체 PASS
- [ ] **Step 5: Verify** 브라우저: 출격 → 1단계 아군/적이 PMD 스프라이트로 보이고, KO 시 `+N EXP` 표시
- [ ] **Step 6: Commit** `feat: level-based units and battle exp log`

---

### Task 6: 파티 진행 규칙 (레벨업 · 습득 · 진화 이벤트)

**Files:**
- Modify: `src/core/progress.js`
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: Task 1–3, `SPECIES`
- Produces:
  - 이벤트 `Event =`
    `{ type: 'level', species, from, to, before: Stats, after: Stats }` |
    `{ type: 'learned', species, move }` |
    `{ type: 'choose', species, move }` (UI 가 `resolveChoice` 호출) |
    `{ type: 'skip', species, move }` (이미 앎 — UI 표시 없음) |
    `{ type: 'evolve', species, to }`
  - `applyExp(party, expBySpecies) => Event[]` — 각 멤버: exp 더하기 → `levelForExp` → 레벨이 올랐으면 'level' → `movesLearnedBetween(old, new)` 각각 `learnOutcome` 에 따라 learned(즉시 moves 에 추가)/choose/skip → 마지막에 `levelEvolutionReady` 면 'evolve'. 멤버 순서대로 이어 붙임
  - `resolveChoice(member, move, forgetIndex: number|null) => void` — null 이면 배우지 않음
  - `evolveMember(member, to) => Event[]` — species 교체, 새 종족 learnset 에서 **현재 레벨과 같은 레벨** 기술을 같은 방식으로 이벤트화
  - `stoneTargets(party) => Member[]`

- [ ] **Step 1: Write the failing test**
  - chimchar Lv8 에 Lv13 까지 오를 경험치 → `level 8→13` + 해당 구간 learnable 기술 이벤트, evolve 없음
  - **(Review Focus 1)** chimchar Lv8 에 Lv15 경험치 → 이벤트 순서: level → (구간 기술들) → evolve(monferno) 마지막; 이후 `evolveMember` 가 monferno 의 Lv15 기술만 처리
  - 4개 기술 보유 + 새 기술 → 'choose' 이고 moves 는 그대로; `resolveChoice(m,'ember',0)` → 0번 교체; `null` → 변화 없음
  - 이미 아는 기술 → 'skip'
  - Lv100 상한: 막대한 경험치에도 level ≤ 100
  - `stoneTargets` 는 현재 아군 기본 파티에서 빈 배열, roselia 멤버를 넣으면 포함
- [ ] **Step 2: Run** `node --test tests/progress.test.js` → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: party progression events`

---

### Task 7: 저장 / 불러오기

**Files:**
- Create: `src/core/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- Produces:
  - `GameState = { version: 1, party: Member[], cleared: string[], items: { evoStone: number } }`
  - `newGame() => GameState` (party = `newParty()`)
  - `loadGame(storage) => GameState | null` — 없음/JSON 오류/version 불일치/예외 → null (경고 1회). 없는 종족 멤버는 제거, 남은 파티가 0명이면 null. 없는 기술은 제거하고 비면 `startingMoves` 로 보충. level/exp 는 정수로 클램프(1..100, exp 는 해당 레벨 범위)
  - `saveGame(storage, game) => boolean` — 예외 시 false
  - 키 상수 `SAVE_KEY = 'pokemon-tactics-save'`

- [ ] **Step 1: Write the failing test** (메모리 storage `{ data:{}, getItem(k){...}, setItem(k,v){...} }`)
  - 왕복: `saveGame` → `loadGame` 결과가 deepEqual
  - **(Review Focus 3)** 깨진 JSON → null; version 2 → null; 없는 종족 하나 섞임 → 그 멤버만 제거; 알 수 없는 기술 → 제거·보충; getItem 이 throw → null; setItem 이 throw → `saveGame` false
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: save and load game state`

---

### Task 8: 결산 장면

**Files:**
- Create: `src/game/results.js`
- Test: `tests/results.test.js`

**Interfaces:**
- Consumes: `applyExp`, `resolveChoice`, `expForLevel`, ui/font/sprites
- Produces:
  - `createResults({ game: GameState, result: 'win'|'lose', log, firstClear: boolean, onDone: (evolutions: {species, to}[]) => void }) => Scene`
  - 시작 시 `applyExp(game.party, log.exp)` 실행, firstClear && win 이면 `game.items.evoStone += 1`
  - 단계: `bars`(경험치 바 1.2초, Z 로 즉시 완료) → 이벤트를 하나씩 대사로 보여줌 (`level`: "○○의 레벨이 13이 되었다!", `learned`: "○○는 ◇◇를 배웠다!", `choose`: 메뉴[기존 기술 4개 + 배우지 않는다] — 선택 전엔 진행 불가) → 끝나면 `onDone(evolve 이벤트 목록)`
  - `Scene = { handle, update, draw }` + 테스트용 getter `phase`, `pending`

- [ ] **Step 1: Write the failing test**
  - 경험치를 넣고 생성 → `update` 로 bars 끝 → confirm 반복 시 이벤트 순서대로 진행하고 마지막에 onDone 이 evolve 목록과 함께 1회 호출
  - **(Review Focus 5)** choose 이벤트에서 confirm 만 연타(메뉴 커서가 "배우지 않는다" 가 아닌 기존 기술 위) → 선택이 확정되기 전엔 onDone 호출 없음; dir 로 고르고 confirm → resolveChoice 반영 후 진행
  - firstClear win → evoStone +1, lose → 그대로
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** (그리기: 아군 4줄 초상화·이름·Lv·경험치 바, 하단 대사창)
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: post-battle results scene`

---

### Task 9: 진화 연출 장면

**Files:**
- Create: `src/game/evolution.js`

**Interfaces:**
- Consumes: `evolveMember`, `resolveChoice`, `drawUnitSprite`, `drawMessage`
- Produces:
  - `createEvolution({ member, to, onDone }) => Scene` — 대사 "어라…? ○○의 모습이…!" → 두 종족 Idle(Down) 스프라이트를 2배 크기로 번갈아 표시, 전환 간격 0.3→0.05초로 2.5초 → 흰 화면 0.3초 → `evolveMember` → "축하합니다! ○○는 △△로 진화했다!" → 반환 이벤트(learned/choose)를 결산과 같은 방식으로 처리 → `onDone()`
  - 여러 마리면 호출 측이 순서대로 체인

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** 브라우저에서 `__app` 으로 chimchar 에 Lv14 경험치를 주고 결산 → 진화 연출 재생, 이후 마을에서 파이숭이로 걷는지 확인 (스크린샷 또는 캔버스 픽셀)
- [ ] **Step 3: Commit** `feat: evolution sequence scene`

---

### Task 10: 편성소 · 타이틀 메뉴 · 장면 연결 · 저장 시점

**Files:**
- Create: `src/game/party.js`
- Modify: `src/game/title.js`, `src/game/town.js`, `src/data/town.js`, `src/data/stages.js`, `src/main.js`, `README.md`
- Test: `tests/town.test.js` 갱신

**Interfaces:**
- Produces:
  - `createParty({ game, onBack, onEvolve: (member, to) => void }) => Scene` — 목록(초상화·이름·Lv·다음 Lv 까지 경험치·기술 4개·진화 안내 "Lv.14에 진화"/"진화의돌로 진화"/"최종 진화"), 메뉴 "진화의돌 사용 (n개)": 대상 없으면 "진화의돌로 진화할 수 있는 포켓몬이 없다", 있으면 고르고 → `game.items.evoStone -= 1` → `onEvolve`
  - `createTitle({ hasSave, onContinue, onNew })` — 메뉴 [이어하기, 처음부터] / [처음부터]; 저장이 있는데 처음부터 → 확인 대사 [예, 아니요]
  - town.js: `createTown({ onSortie, onParty, message, spawn, leader })` — 'party' action → onParty; leader = 파티 첫 멤버 종족
  - data/town.js: 편성소 표지판 `action: 'party'`, 대사 `['편성소다.', '파티를 확인할까?']`; NPC 종족을 1단계로(piplup, turtwig, shinx)
  - stages.js: `reward: { evoStone: 1 }` (첫 클리어)
  - main.js: `game` 상태 보유; 흐름 `title → town → select → battle → results → (evolution…) → town`; 저장 시점(결산·진화 끝, 편성소 진화 후, 처음부터 직후); storage = localStorage 를 try/catch 로 감싼 어댑터

- [ ] **Step 1: Write the failing test** (town.test)
  - 편성소 표지판을 보고 confirm → 대사 닫힘 시 onParty 1회
  - 리더가 파티 첫 멤버 종족
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** 위 파일들
- [ ] **Step 4: Run** `npm test` → 전체 PASS
- [ ] **Step 5: Verify** 브라우저 전체 흐름: 처음부터 → 마을 → 출격 → 승리 → 결산(바·레벨업·기술 선택) → 마을 → 편성소(돌 1개, 대상 없음 안내) → 새로고침 → 타이틀 "이어하기" → 레벨·기술·★ 유지. `balance.expMultiplier` 를 임시로 크게 해서 진화 연출까지 확인한 뒤 원복
- [ ] **Step 6: README** 성장 루프·편성소·저장·`node tools/fetch-pokeapi.js` 설명 갱신
- [ ] **Step 7: Commit** `feat: party screen, title menu, save points and full growth loop`

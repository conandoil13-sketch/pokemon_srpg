# 2칸 특성 뽑기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 편성소에서 결정 2개로 동료의 2칸 특성을 룰렛으로 굴리고, 그 특성이 전투에서 1칸과 똑같이 작동하게 한다.

**Architecture:** 등급표(`src/data/abilityTiers.js`)와 굴림 규칙(`src/core/extraAbility.js`, 순수·시드 고정)을 먼저 만들고, 저장 v12 로 `extraAbility` 를 싣는다. 전투 유닛에 `ability2` 를 두고 특성 검사를 `has()`/`abilitiesOf()` 로 모아 두 칸을 다 보게 한 뒤, 겹침 규칙(위액·날씨·트레이스·미라·고민씨)을 넣는다. 마지막으로 편성소 룰렛 화면과 표시(자세히 보기·전투 정보창·박스 패널).

**Tech Stack:** vanilla JS (ES modules), canvas 렌더, `node --test` (의존성 없음)

**Spec:** `docs/superpowers/specs/2026-11-24-extra-ability-slot2-design.md` (기반 기획 `docs/design/extra-abilities.md`)

## Global Constraints
- 범위: 2칸만, 내 포켓몬만. 적 유닛의 `ability2` 는 늘 `null`. 3칸·각성의 구슬 없음.
- 비용: 그 동료 계열 결정 2개 (`game.shards[lineRoot(species)]`), 메타몽은 메타몽 결정.
- 등급 확률: C 50% · B 30% · A 15% · S 5%, 등급 안에서 고르게. 낚시: A 30% · B 10%.
- 후보: SS 제외 · `inactive` 제외 · 지금 1칸 특성(`abilityOf(m)`) 제외. 뽑힌 등급에 후보가 없으면 아래 등급 → 위 등급.
- 다시 굴리면 이전 2칸은 사라짐. 같은 특성 재등장 허용.
- 난수: 순수 함수, 시드 = `game.extraSeq` (굴릴 때마다 +1), 상점 `seedOf` 와 같은 꼴에 다른 소금값.
- 전투 겹침: 위액 = 두 칸 다 끔 · 서로 다른 날씨 특성 둘 = 1칸 날씨만 · 트레이스 = 그 칸만 상대 1칸으로 · 미라/고민씨 = 1칸만 바뀌고 2칸 유지.
- 등급 색: S 금 · A 빨강 · B 파랑 · C 회색.
- UI 글은 한국어, 조사는 `josa()`.
- 테스트: `npm test` 전체가 매 Task 끝에 통과.

## Review Focus
1. 1칸 특성이 2칸 특성과 같아진 동료(진화·전환 뒤) — 효과는 한 번만(배율 두 번 곱해지면 안 됨), 화면엔 "1칸과 같음". → Task 3 테스트 `same ability in both slots applies once`.
2. 위액을 맞은 유닛 — `.ability` 를 직접 읽던 곳(해감액·천진·헤비/라이트메탈·발광)까지 두 칸 다 꺼짐. → Task 4 테스트 `gastro acid silences slot 2 everywhere`.
3. 결정이 정확히 2개일 때 / 1개일 때 — 굴림 성공 후 0, 1개면 거절하고 아무것도 안 바뀜(카운터도 그대로). → Task 1 테스트.
4. 메타몽 — 1칸은 빌드 특성, 캡슐로 1칸을 2칸과 같은 특성으로 바꿔도 깨지지 않음. → Task 3 테스트 `ditto build ability plus slot 2`.
5. 옛 저장(v11)·손으로 고친 저장의 이상한 `extraAbility` 값 — null 로 정리, 게임이 뜸. → Task 2 테스트.

---

### Task 1: 등급표와 굴림 규칙

**Files:**
- Create: `src/data/abilityTiers.js`
- Create: `src/core/extraAbility.js`
- Test: `tests/extraAbility.test.js`

**Interfaces:**
- Consumes: `ABILITIES` (`src/data/abilities.js`, `inactive` 플래그), `findMember(game, key)`·`abilityOf(m)` (`src/core/progress.js`), `lineRoot(species)` (`src/core/gacha.js`), `createRng(seed)` (`src/core/rng.js`)
- Produces:
  - `ABILITY_TIERS: { [abilityId]: 'SS'|'S'|'A'|'B'|'C' }`
  - `EXTRA_COST = 2`, `TIER_ODDS = { C: 0.5, B: 0.3, A: 0.15, S: 0.05 }`, `TEASE_ODDS = { A: 0.3, B: 0.1 }`
  - `extraCandidates(tier, excludeId) -> string[]`
  - `rollExtraAbility(seq, excludeId) -> { tier, id, tease: boolean }` (S 는 tease 늘 false — 업그레이드는 S 에서 무조건)
  - `rollExtra(game, key) -> { ok: true, tier, id, tease, prev } | { ok: false, reason: 'missing'|'shards' }` — 결정 차감, `m.extraAbility = id`, `game.extraSeq += 1`
  - `extraTier(id) -> tier | null`

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/extraAbility.test.js`)
  - `every ability has a tier or is inactive`: `ABILITIES` 의 모든 id 가 `ABILITY_TIERS` 에 있거나 `inactive`.
  - `new grades from the spec`: `multiscale`·`sheer-force`·`regenerator` = 'S', `magic-bounce`·`moody` = 'A', `contrary` = 'B', `heavy-metal` = 'C', `defeatist` = 'SS', `wonder-guard` = 'SS'.
  - `candidates skip SS, inactive and the slot-1 ability`: `extraCandidates('S','technician')` 에 `technician`·`huge-power` 없음, 어떤 등급에도 inactive 특성 없음.
  - `roll is seeded`: `rollExtraAbility(7,'blaze')` 두 번이 deepEqual.
  - `tier odds`: seq 0..19999 로 굴린 등급 비율이 각각 ±0.02 안 (C .5 · B .3 · A .15 · S .05), 결과 id 는 늘 `extraTier(id) === tier`, `blaze` 는 안 나옴.
  - `tease only on A/B`: S·C 결과는 `tease === false`; A 결과 중 tease 비율 0.3±0.04, B 0.1±0.03.
  - `rollExtra spends 2 shards and bumps the counter`: 결정 2 → 성공 후 0, `extraSeq` 0→1, `m.extraAbility === r.id`, 다시 굴리면 `prev` 가 이전 id.
  - `rollExtra refuses with 1 shard`: `{ ok:false, reason:'shards' }`, 결정·`extraSeq`·`extraAbility` 그대로.
- [ ] **Step 2: 실행해서 실패 확인** — Run: `node --test tests/extraAbility.test.js` · Expected: FAIL (모듈 없음)
- [ ] **Step 3: `src/data/abilityTiers.js` 작성** — `docs/design/extra-abilities.md` 등급표(SS/S/A/B/C) + 스펙의 34개 새 등급을 id 로 옮김. 효과 없는 14개도 기획서 등급이 있으면 넣어 두되(없으면 생략) 후보 거르기는 `inactive` 로.
- [ ] **Step 4: `src/core/extraAbility.js` 작성** — 소금값 `0x2ca7e5` 의 `seedOf(seq)` 로 rng 하나를 만들어 [등급, 특성, 낚시] 순서로 뽑는다. 빈 등급 대체 순서: 아래(C 쪽) → 위.
- [ ] **Step 5: 통과 확인** — Run: `node --test tests/extraAbility.test.js` 그리고 `npm test` · Expected: PASS
- [ ] **Step 6: 커밋** — `git add src/data/abilityTiers.js src/core/extraAbility.js tests/extraAbility.test.js && git commit -m "feat: ability tier table and seeded slot-2 roll"`

### Task 2: 저장 v12

**Files:**
- Modify: `src/core/save.js` (`VERSION`, 이전 체인, `cleanMember`, 새 게임·불러오기의 `extraSeq`)
- Test: `tests/save.test.js`

**Interfaces:**
- Consumes: `ABILITIES`
- Produces: 동료 `extraAbility: string | null` (늘 존재), `game.extraSeq: number` (≥0 정수)

- [ ] **Step 1: 실패하는 테스트** — `v11 save migrates to v12 with no slot-2 abilities` (모든 동료 `extraAbility === null`, `extraSeq === 0`, `version === 12`); `slot-2 ability survives a save round trip` (`'technician'` 유지, `extraSeq` 5 유지); `unknown slot-2 id is dropped` (`'no-such'`·`42` → null); `bad extraSeq becomes 0` (`-3`·`'x'` → 0).
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/save.test.js` · Expected: 새 테스트 FAIL
- [ ] **Step 3: 구현** — `VERSION = 12`, `v11 → v12` 한 줄(주석: 2칸 특성), `cleanMember` 에 `extraAbility: typeof m.extraAbility === 'string' && own(ABILITIES, m.extraAbility) ? m.extraAbility : null`, 게임에 `extraSeq`. `newMember` 는 `extraAbility: null` 로 시작 (`src/core/progress.js`).
- [ ] **Step 4: 통과 확인** — Run: `npm test` · Expected: PASS (기존 save 테스트 중 버전 숫자를 박은 것은 12로 고침)
- [ ] **Step 5: 커밋** — `git commit -am "feat: save v12 carries the slot-2 ability"`

### Task 3: 전투 유닛 2칸 + 특성 검사 모으기

**Files:**
- Modify: `src/core/abilities.js` (`has`, 새 `abilitiesOf`, `phaseEndHp`, `PINCH` 사용처, `STATUS_IMMUNE` 사용처, 방어 특성 `a = defender.ability` 사용처)
- Modify: `src/core/battle.js` (`makeUnit` 에 `ability2`, 아군 생성 87행에서 `ability2: m.extraAbility`, `.ability` 직접 비교·표 조회 전부)
- Modify: `src/core/ai.js`, `src/core/damage.js`, `src/core/weather.js`, `src/core/individual.js`, `src/core/shapes.js`, `src/render/darkness.js`, `src/render/mapAttack.js`, `src/game/states.js:69` (스킬링크)
- Test: `tests/extraAbilityBattle.test.js`

**Interfaces:**
- Consumes: Task 2 의 `m.extraAbility`
- Produces:
  - 유닛 `ability2: string | null` (적은 null)
  - `abilitiesOf(u) -> string[]` — 켜진 특성 목록 (위액이면 `[]`, 두 칸이 같으면 하나만)
  - `has(u, id)` — `abilitiesOf(u).includes(id)`
  - 표 조회 규칙: `X[u.ability]` 꼴은 `abilitiesOf(u)` 를 돌며 해당하는 것 모두 적용(배율은 곱). 이벤트의 `ability` 필드에는 실제 발동한 특성 id.

- [ ] **Step 1: 실패하는 테스트** (`makeUnit` 으로 아군 하나에 `ability: 'run-away', ability2: X` 를 주고 1칸에 X 를 준 유닛과 결과가 같은지 비교하는 방식)
  - `slot 2 multiplier works like slot 1`: `technician` — 위력 60 기술 피해가 1칸 유닛과 같음.
  - `slot 2 pinch boost`: `blaze` — HP 1/3 이하 불꽃 기술.
  - `slot 2 contact ailment`: `static` 을 2칸에 가진 방어자 — 접촉 시 마비가 1칸과 같은 rng 에서 같게.
  - `slot 2 status immunity`: `insomnia` 2칸 → 잠듦 면역.
  - `slot 2 redirect`: `lightning-rod` 2칸 → 2칸 안 전기 기술을 끌어옴.
  - `slot 2 phase-end`: `rain-dish` 2칸 + 비 → 1/16 회복, `regenerator` 2칸 → 1/4.
  - `slot 2 seen by the attacker`: 2칸 `liquid-ooze` 방어자에게 흡수기 → 피해, 2칸 `unaware` 방어자 → 공격 랭크 무시.
  - `same ability in both slots applies once`: 1칸·2칸 다 `technician` → 1칸만 있는 유닛과 피해 같음.
  - `ditto build ability plus slot 2`: 메타몽 멤버(`build.ability='intimidate'`, `extraAbility:'technician'`) 로 만든 유닛이 둘 다 `has`.
  - `enemies have no slot 2`: 적 유닛 `ability2 === null`.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/extraAbilityBattle.test.js` · Expected: FAIL
- [ ] **Step 3: 구현** — `grep -rn '\.ability\b' src` 로 나오는 모든 읽기를 `has`/`abilitiesOf` 로 바꾼다(쓰기·로그 기록·`m.build.ability` 는 제외). 남겨도 되는 것: 특성을 **바꾸는** 곳(Task 4 가 다룸), 쓰러진 기록 `battle.js:248`, 픽업(`pickupLoot`, 멤버 기준 — 2칸도 보게 `m.extraAbility` 포함).
- [ ] **Step 4: 통과 확인** — Run: `npm test` · Expected: PASS (기존 특성 테스트 회귀 없음)
- [ ] **Step 5: 커밋** — `git commit -am "feat: battle units carry a slot-2 ability; ability checks read both slots"`

### Task 4: 겹침 규칙

**Files:**
- Modify: `src/core/volatile.js` (위액 115~120행, 고민씨 121~125행)
- Modify: `src/core/battle.js` (트레이스·날씨 128~137행, 미라 844행)
- Test: `tests/extraAbilityBattle.test.js`

**Interfaces:**
- Consumes: Task 3 의 `ability2`, `abilitiesOf`
- Produces: 위액 시 `suppressedAbility2` 보관(쓰러진 기록·메타몽 캡슐은 지금처럼 `suppressedAbility` 사용)

- [ ] **Step 1: 실패하는 테스트**
  - `gastro acid silences slot 2 everywhere`: 2칸 `levitate` → 위액 뒤 땅 기술 맞음; 2칸 `liquid-ooze` → 위액 뒤 흡수가 회복; `abilitiesOf(u)` 가 `[]`.
  - `two weather abilities: slot 1 wins`: 1칸 `drought`, 2칸 `drizzle` → 층 시작 날씨 `sun`, 로그에 `drizzle` 없음. 1칸 비날씨·2칸 `drizzle` → `rain`.
  - `trace in slot 2 copies into slot 2`: 1칸 `blaze`, 2칸 `trace`, 가까운 적 1칸 `intimidate` → `ability === 'blaze'`, `ability2 === 'intimidate'`.
  - `mummy keeps slot 2`: 2칸 `technician` 공격자가 미라에 접촉 → `ability === 'mummy'`, `ability2 === 'technician'`.
  - `worry seed keeps slot 2`: 고민씨 → `ability === 'insomnia'`, `ability2` 그대로. 1칸 또는 2칸이 `truant`·`insomnia`·`multitype` 이면 지금처럼 면역 판정은 1칸 기준 유지.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/extraAbilityBattle.test.js` · Expected: 새 테스트 FAIL
- [ ] **Step 3: 구현** — 날씨: 유닛별 날씨 = `WEATHER_SETTER[u.ability] ?? WEATHER_SETTER[u.ability2]`, 로그 특성도 그 칸. 트레이스: 트레이스가 있는 칸만 교체.
- [ ] **Step 4: 통과 확인** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: 커밋** — `git commit -am "feat: slot-2 overlap rules (gastro acid, weather, trace, mummy, worry seed)"`

### Task 5: 편성소 특성 각성 화면 (룰렛)

**Files:**
- Create: `src/game/extraRoll.js` (화면), `src/game/roulette.js` (순수 연출 타임라인)
- Modify: `src/game/box.js` (동료 메뉴 89행: 기술 떠올리기 옆 / 메타몽은 메타몽 빌드 옆에 `특성 각성`, `act: 'extra'` 처리는 `relearn` 처럼 `summary = createExtraRoll(...)`)
- Test: `tests/roulette.test.js`, `tests/box.test.js`

**Interfaces:**
- Consumes: Task 1 `rollExtra`, `extraTier`, `EXTRA_COST`, `TIER_ODDS`; `findMember`, `abilityOf`, `lineRoot`
- Produces:
  - `rouletteTimeline({ tier, tease }) -> { upgrade: boolean, stopTier, steps: [{ t, kind: 'spin'|'upgrade'|'stop'|'reveal', ring: ['C','B','A'] | ['C','B','A','S'] }] }`
  - `createExtraRoll({ game, member, onSave, onClose })` — 편성소 서브 화면(`createRelearn` 과 같은 꼴: `handle(ev)`, `update(dt)`, `draw(ctx)`)

- [ ] **Step 1: 실패하는 테스트**
  - `tests/roulette.test.js`: `S always upgrades` (`upgrade===true`, 업그레이드 전 ring 에 S 없음, 뒤 ring 에 S 있음, `stopTier==='S'`); `tease upgrades then stops below S` (`{tier:'A',tease:true}` → upgrade true, stop 'A'); `plain roll never shows S` (`{tier:'B',tease:false}` → 모든 ring 에 S 없음, stop 'B'); `steps end with stop then reveal` (마지막 두 kind), `t` 증가, 마지막 `t` ≤ 3.5(초).
  - `tests/box.test.js`: `member menu offers 특성 각성` — 결정 2개면 enabled, 1개면 회색 + `why` 에 `결정이 모자라다 (1/2)`; 메타몽 메뉴에도 있음.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/roulette.test.js tests/box.test.js` · Expected: FAIL
- [ ] **Step 3: 구현** — 화면 글(스펙 스케치 그대로): 머리 `특성 각성` + 오른쪽 `○○ 계열 결정 N개`, `1칸 …`, `2칸 … [등급]` + 설명(없으면 `없음`), `확인: 결정 2개로 굴리기 · 취소: 닫기`, `확률  S 5% · A 15% · B 30% · C 50%`. 확인창: 2칸 있으면 `지금 2칸 ${이름}${josa}는 사라진다. 굴릴까?`, 없으면 `결정 2개로 굴릴까?` + `확인: 예 · 취소: 아니오`. 굴림은 **연출 전에** `rollExtra` 를 부르고 `onSave()`, 그 결과로 `rouletteTimeline` 을 재생. 업그레이드 단계: 번쩍임·흔들림 + `고급 룰렛!`. stop 뒤 reveal: 등급 색 칸이 걷히며 특성 이름·설명. 확인으로 건너뛰면 바로 reveal 끝 상태. 1칸과 같으면 2칸 줄 흐리게 + `1칸과 같음`.
- [ ] **Step 4: 통과 확인** — Run: `npm test` · Expected: PASS
- [ ] **Step 5: 커밋** — `git commit -am "feat: 편성소 특성 각성 — slot-2 roulette with S upgrade and teases"`

### Task 6: 2칸 표시 (자세히 보기 · 전투 정보창 · 박스 패널) + 문서

**Files:**
- Modify: `src/game/summary.js` (특성 페이지 행 아래 `2칸` 줄, 보기 전용), `src/render/ui.js:151` (특성 줄 `특성 맹화 · 테크니션`, 길면 도구처럼 다음 줄), `src/game/box.js:296` (왼쪽 패널 특성 아래 2칸)
- Modify: `docs/ROADMAP.md` (완료 항목), `docs/design/extra-abilities.md` (2칸 구현됨 표시)
- Test: 브라우저 확인 (렌더) — 아래 Step

**Interfaces:**
- Consumes: `m.extraAbility`, `unit.ability2`, `extraTier`, 등급 색 상수 (Task 5 의 화면과 같은 것을 `src/game/extraRoll.js` 에서 export: `TIER_COLOR`)

- [ ] **Step 1: 구현** — 자세히 보기: `2칸  테크니션 [S]` / 없으면 `2칸  없음 · 편성소 특성 각성에서`; 위아래 커서는 2칸 줄에 서지 않음. 1칸과 같으면 흐리게 `1칸과 같음`.
- [ ] **Step 2: 브라우저 확인** — 음소거·세이브 스냅샷 규칙대로, 결정을 넉넉히 준 동료로 편성소 → 특성 각성 → 굴림(S·낚시는 `extraSeq` 를 미리 찾아 맞춰 재현) → 자세히 보기 2칸 줄 → 출격해서 전투 정보창 2칸 → 세이브 복원. 스크린샷을 `docs/preview/` 에 모아 사용자에게 보여 주고 커밋 전에 지움.
- [ ] **Step 3: 전체 테스트** — Run: `npm test` · Expected: PASS
- [ ] **Step 4: 커밋** — `git commit -am "feat: show the slot-2 ability in summary, battle info and box; docs"`

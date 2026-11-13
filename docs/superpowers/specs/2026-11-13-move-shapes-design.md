# 기술 구체화 1단계: 범위 모양 — 설계 스펙

- 작성일: 2026-11-13
- 상태: 확정 (2026-11-13)
- 선행: 상태이상 (main `9ce0c12`)

## 0. 전체 흐름 (사용자 결정)

기술 구체화는 오래 걸려도 **여러 단계로 나눠 차근차근** 한다.
1. **범위 모양 시스템 (이 문서)** — 모양을 게임에 넣고 모든 공격기에 기본 모양을 준다.
2. **밸런스 조정 페이지** — 브라우저에서 기술 하나씩 사거리·모양·위력·명중을 바꿔 저장 (이 단계의 예외 표를 고치는 도구).
3. **특수 효과 묶음들** — 밀어내기, 선제공격, 반동, 흡수, 연속 공격 … 묶음별로.

## 1. 목표 · 이유

지금은 물리기 162개가 전부 사거리 1, 특수기 87개가 전부 사거리 1~2, 공격기는 모두 한 마리만 때린다 → 기술 선택에 전술적 차이가 거의 없다. 기술마다 **맞는 모양**을 다르게 해서 위치 선정·대형이 의미 있게 만든다.

### 성공 기준
1. 공격기마다 모양(아래 6종)이 있고, 전투·적 AI·화면 하이라이트·예상 창이 **같은 계산**으로 맞는 칸을 정한다.
2. 범위기는 여러 마리를 한 번에 때리고, 본가에서 아군도 때리는 기술은 범위 안 아군도 맞는다.
3. 플레이어가 방향·착탄 칸을 골라 조준할 수 있고, 맞을 칸·대상·예상 데미지가 미리 보인다.
4. 적 AI 가 범위기를 이해한다 (여러 마리 노림, 아군 휘말림 감점).
5. 예외 표 하나로 기술별 모양을 바꿀 수 있다 (2단계 조정 페이지가 이 표를 고친다).
6. `npm test` 통과, 브라우저에서 6종 모양 확인.

### 범위 밖 / 안티 목표
- 변화기 모양 변경 (지금의 자신/적 하나/주변 적/아군 규칙 유지), 조정 페이지(2단계), 특수 효과(3단계), 대각선 방향, 높이·지형에 따른 사거리 변화.
- **안티 목표**: 범위기가 단일기보다 항상 좋아져 단일기를 안 쓰게 되면 실패 → 다수 명중 ×0.75 와 아군 피격으로 균형. 조준 조작이 번거로워 한 번 쓸 때마다 여러 번 눌러야 하면 실패 → 기본 조준이 "가장 많이 맞는 쪽"을 가리킨다.

## 2. 모양 6종 (사용자 확정)

방향은 상하좌우 4방향. 모든 거리는 맨해튼, 단 "주변"은 대각선 포함.

| 모양 `type` | 맞는 칸 | 조준 | 파라미터 |
|---|---|---|---|
| `single` | 고른 대상 한 칸 | 사거리 안 대상 고르기 (지금과 같음) | `range: [lo, hi]` |
| `single` (원거리) | 같음 | 같음 | `range: [2, 3]` 등 — 모양은 single, 사거리만 다름 |
| `line` | 사용자 앞 직선 `length` 칸 (관통) | 4방향 | `length` (기본 3). **벽 `#` 에서 멈춤** (내 결정) |
| `cone` | 앞 1칸 + 그 양옆 2칸 + 앞앞 1칸 (T 모양 4칸) | 4방향 | 없음 |
| `around` | 사용자 둘레 8칸 (대각선 포함) | 확인 한 번 | `radius` (기본 1) |
| `blast` | 착탄 칸 + 상하좌우 1칸 (십자 5칸) | 사거리 안 착탄 칸 고르기 | `range: [lo, hi]` (기본 [2,3]) |

```
line(→)      cone(→)       around        blast(착탄 X)
@###         .#.           ###           ..#..
             @##  ← 앞1·앞2  #@#           .#X#.
             .#.           ###           ..#..
```
(cone 은 앞1 칸과 그 위아래, 그리고 앞2 칸)

- **아군 피격** `friendlyFire`: PokeAPI target `all-other-pokemon` 인 기술만 true (지진·방전·대폭발·자폭·분연). 그 외 모양은 적만. 사용자 자신은 절대 안 맞는다.
- **다수 명중**: 실제로 맞는 대상(명중 판정 전, 범위 안 유닛 수)이 2 이상이면 각자 데미지 ×0.75 (본가 4세대 규칙).
- 명중·급소·난수·부가효과(랭크·상태이상)는 **대상마다 따로**. 사용자 자신의 부가효과(인파이트류 `damage-raise`)는 한 명이라도 맞으면 **한 번만**.
- 마비 실패·혼란 자해 판정은 기술 사용 전에 한 번 (지금과 같음).

## 3. 기본 규칙 (모든 공격기에 자동 부여)

우선순위: 예외 표 → 아래 규칙.
1. target `all-other-pokemon` → `around` r1, friendlyFire.
2. target `all-opponents` → `cone`.
3. 이름 목록 **BEAM** → `line` 3: hydro-pump, hyper-beam, solar-beam, ice-beam, aurora-beam, psybeam, bubble-beam, signal-beam, charge-beam, flamethrower, thunderbolt, flash-cannon.
4. 이름 목록 **BLAST** → `blast` [2,3]: fire-blast, sludge-bomb, seed-bomb, egg-bomb, mud-bomb, focus-blast.
5. 이름 목록 **SHOT** → `single` [2,3]: shadow-ball, aura-sphere, psychic, energy-ball, dark-pulse, earth-power, air-slash, extrasensory.
6. 나머지: 물리 `single` [1,1], 특수 `single` [1,2] (지금과 같음). `random-opponent`(역린 등)도 단일.
- 기존 `MOVE_RANGES` 예외(razor-leaf [1,2] 등)는 새 예외 표로 옮긴다. razor-leaf 는 규칙 2(cone)가 우선이 되지 않도록 예외 표에서 single [1,2] 로 고정 — 아니면 cone 으로 바뀜. **(빌더: 기존 예외 3개는 그대로 single 사거리로 유지)**
- 목록에 이름이 있어도 학습 불가 기술이면 영향 없음.

예외 표: **`src/data/moveShapes.json`** (순수 데이터, 예외만) `{ [moveId]: { type, range?, length?, radius?, friendlyFire? } }` — 2단계 조정 페이지가 이 파일을 통째로 다시 쓴다. BEAM/BLAST/SHOT 목록과 규칙 코드는 `src/data/moveShapes.js` 에 따로 (내 결정: 도구가 코드 파일을 고치지 않도록). `moveRanges.js` 의 3개는 JSON 으로 옮기고 파일 삭제. 브라우저·Node 양쪽에서 읽도록 JSON 은 `.js` 래퍼 대신 빌더가 고른 방식(import 속성 또는 fetch 없이 쓸 수 있는 형태)으로.

## 3-1. 자폭 계열 (사용자 결정)

- 대폭발·자폭(`explosion`, `self-destruct`)은 본가처럼 **쓴 쪽이 기절**한다 (빗나가거나 맞는 대상이 없어도). 데미지 처리 뒤 사용자 기절 → 아군이면 `log.fainted`(다음 층 HP 50%), 적이면 보상 없음. 쓰러뜨린 상대의 경험치는 사용자(기절했어도) 기준으로 정상 지급.
- **찌리리공·붐볼 계열의 주 기믹**: 적 AI 는 이 두 종(`voltorb`, `electrode`)이면 자폭 계열을 적극적으로 쓴다 — 자기 기절 감점이 작고(자기 남은 가치 × 0.3), 2마리 이상 맞히면 보너스. 그 외 포켓몬은 **신중하게** — 자기 기절 감점이 크고(자기 남은 가치 × 2), 적을 하나 이상 쓰러뜨리면서 순이익이 클 때만.
- **찌리리공·붐볼은 레벨과 상관없이 자폭(`self-destruct`)을 항상 알고 시작**한다 (사용자 결정): 시작 기술(`startingMoves` 결과)에 없으면 가장 오래된 칸을 자폭으로 바꾼다 — 적·뽑기 동료·진화 모두. 대폭발은 원래 습득 레벨 그대로.
- "자기 남은 가치" = 그 유닛이 상대에게 줄 수 있는 최선 기대 데미지 × 3 (약 3턴 몫, 빌더 조정 가능).
- 화면: 연출 끝에 사용자 기절 연출 + "○○는 쓰러졌다!".

## 4. 계산 (순수, `src/core/shapes.js`)

- `aimsOf(state, user, move) => Aim[]` — 가능한 조준 목록. single: 사거리 안 상대 유닛(지금 targetsFor 와 같음) `{ unitId }`; line/cone: `{ dir }` 4개(맵 밖으로만 향하는 방향 제외); around: `[{ self: true }]`; blast: 사거리 안 칸 중 **적이 하나 이상 맞는 칸** `{ x, y }`.
- `tilesOf(state, user, move, aim) => {x,y}[]` — 맞는 칸 (맵 안, line 은 벽에서 멈춤).
- `unitsHit(state, user, move, aim) => Unit[]` — 칸 위 유닛 중 적, friendlyFire 면 아군도 (사용자 제외).
- 전투·AI·화면은 이 세 함수만 쓴다.
- **지형** (내 결정): `line` 만 벽 `#` 에서 멈춘다. cone·around·blast 는 지금의 사거리처럼 지형을 무시한다 (착탄 칸이 벽이어도 됨).
- `coverage(move) => [lo, hi]`: 그 기술이 닿을 수 있는 맨해튼 거리 범위 (single/blast: range 와 착탄 십자 포함 `[lo, hi+1]`, line: `[1, length]`, cone: `[1, 2]`, around: `[1, 2]`). `move.range` 는 호환을 위해 이 값으로 둔다 (single/blast 는 조준 사거리를 `aimRange` 로 따로).

## 5. 전투 (`src/core/battle.js`)

- `applyMove(state, userId, moveId, aim, rng)` — `aim` 이 문자열이면 기존처럼 대상 id(호환). 공격기: `unitsHit` 대상마다 데미지(다수면 ×0.75)·기절·경험치·부가효과. 결과 `{ kind:'attack', hits: [{ unitId, hit, crit, typeMult, damage, fainted, hpBefore }], expGained, stageChanges, statusChanges, thawed }` — **단일 대상이면 기존 최상위 필드(hit, damage, fainted …)도 hits[0] 값으로 유지** (내 결정: 기존 코드·테스트 호환).
- 아군이 아군을 쓰러뜨림: 경험치·코인 없음, `log.fainted` 기록. 적이 적을 쓰러뜨림: 보상 없음.
- 변화기는 지금 그대로 (`kind` 규칙). `aim` 을 `focusId` 자리에서 그대로 받음.

## 6. 적 AI (`src/core/ai.js`)

- 이동 가능 칸 × 공격기 × `aimsOf` 조준마다 점수 = Σ적 `expectedDamage×(다수 0.75)` + 기절 보너스(각) − Σ휘말린 같은 편 기대 데미지 × 1.5 − 위험도.
- 결과 `attack: { moveId, aim }` (기존 `targetId` 는 single 일 때 함께 유지).
- 위협 지도(threatMap)는 상대가 이동 가능한 칸에서 **`coverage` 로 닿을 수 있는 칸**이면 위협 (실제로 무언가를 맞히는지는 보지 않음 — 내 결정: 속도·단순함, 조금 더 조심스러운 적).
- 성능: 칸 수 × 기술 4 × 조준 ≤ 약 15 — 테스트 맵에서 적 1마리 계획 50ms 이하 (내 기준).

## 7. 화면

- 이동 범위 표시의 빨간 "공격 가능 칸"(`attackTilesFrom`)은 `coverage` 기준.
- 행동 메뉴: 기술 활성 = 조준 중 적이 하나 이상 맞는 것이 있음. 메뉴 커서에 있을 때 하이라이트: 가능한 모든 맞는 칸의 합집합(빨강).
- 조준 모드:
  - single: 지금처럼 대상 순환.
  - line/cone: 방향키·클릭으로 4방향, **처음엔 가장 많이 맞는(적 수 − 아군 수) 방향**.
  - blast: 착탄 칸 순환(방향키)·클릭, 처음엔 가장 많이 맞는 칸.
  - around: 확인 한 번.
  - 맞을 칸 빨강, 그 위 아군은 주황 테두리.
- 예상 창: 대상 최대 3줄(이름·명중·데미지 범위·기절 표시), 넘으면 "외 N마리", 아군 피격은 "(아군)" 붉은 글씨.
- 연출: 한 번의 동작(Attack/Shoot) → 모든 대상 동시에 피격 → 대상별 상성·급소 대사(대상 이름 포함) → 기절 → 부가효과 대사. line/blast 는 탄이 끝 칸/착탄 칸까지 날아감.

## 7-1. 정보창
- 기술 정보창 "사거리" 줄을 모양 설명으로: "단일 1", "단일 2~3", "직선 3", "앞 부채꼴", "주변 (아군도)", "착탄 2~3 십자".

## 8. 아키텍처

```
src/data/moveShapes.js   (신규) 예외 표 MOVE_SHAPES, BEAM/BLAST/SHOT 목록
src/data/moves.js        각 공격기에 shape, friendlyFire (규칙 §3), range 는 single/blast 의 조준 사거리
src/core/shapes.js       (신규, 순수) aimsOf, tilesOf, unitsHit
src/core/battle.js       applyMove 다중 대상
src/core/ai.js           조준 단위 점수, 위협 지도 모양 반영
src/game/states.js       조준 모드, 하이라이트, 다중 예상 창
src/render/mapAttack.js  다중 대상 연출
src/render/ui.js         모양 설명
```

## 9. 테스트
- `shapes.test.js`: 6종 칸 모양(방향별), line 벽에서 멈춤, 맵 가장자리 자름, around 대각선 포함, blast 사거리·적 없는 칸 제외, unitsHit 아군 포함 여부, 사용자 제외.
- `data.test.js`: 지진 around+friendlyFire, 열풍 cone, 하이드로펌프 line 3, 대문자 blast [2,3], 섀도볼 single [2,3], 몸통박치기 single [1,1], 잎날가르기 single [1,2] (예외 유지).
- `battle.test.js`: 지진이 적 둘·아군 하나를 ×0.75 로 때림, 사용자 안 맞음, 대상별 명중, 인파이트류 자신 효과 한 번, 아군 기절 보상 없음, 단일 기술 결과 호환 필드.
- `ai.test.js`: 둘을 맞히는 방향 선택, 아군이 휘말리면 지진 안 씀(대안 있을 때), 계획 시간 기준.
- `game.test.js`: 직선 조준 → 방향 전환 → 확인 → 여러 대상 피해, 주변 기술 확인 한 번.
- 브라우저: 6종 하이라이트·연출 스크린샷.

## 10. 빌더 재량
- 탄 연출 세부, 하이라이트 색 농도, 예상 창 줄 배치, AI 아군 감점 계수(1.5 근처), 성능 최적화 방식.

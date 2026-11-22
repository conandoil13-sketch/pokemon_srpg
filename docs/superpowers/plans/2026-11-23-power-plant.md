# 발전소 (7-1) Implementation Plan

**Goal:** 7단계 첫 분기 발전소 — 2×2 발전기의 박자 방출, 전기 강화, 찌리리공 기습, 고철더미·가벽, 전용 그림.
**Architecture:** 발전기는 지형 문자 `G` + 순수 모듈 `src/core/generator.js` (배치는 floorgen, 방출은 battle.endPhase 의 적 페이즈 끝, 예고는 tide 처럼 미리 보기 함수). 기습은 `src/core/ambush.js` (숨음 판정은 stealth.hiddenFrom 에 합류, 행동은 nextEnemy 에서 일반 AI 앞에). 그림 `src/render/powerTiles.js`.
**Spec:** docs/superpowers/specs/2026-11-23-power-plant-design.md

## Global Constraints
- 다른 던전의 층 생성 결과·난수 소비 불변 (새 단계는 `hashSeed(seed, 7000)`/`7100` 별도 난수, `dungeon.power` 일 때만).
- 수치: 발전기 2~3개, 서로 3칸 이상, 범위 맨해튼 2, 피해 1/6 × 전기 상성(최소 1), 강화 ×1.2, 기습 2마리(마지막 두 층·보스 층 3), 레벨 −12, 드러남 3칸.

## Review Focus
- 발전기가 길을 끊음 → 놓을 때마다 도달 칸 수 확인.
- 기습 찌리리공이 출발 구역 근처 → x ≥ 8 칸만.
- 숨은 찌리리공 정보가 예상 창·커서·카메라로 샘 → hiddenFrom 합류로 기존 경로(`seenOnly`, `darkIds`) 재사용.
- 방출로 보스가 기절해도 승리 처리 → 기존 knockOut + checkResult 순서 지킴.
- 직선 기술이 발전기를 뚫음 → shapes 의 벽 판정에 `G` 포함.

### Task 1: 데이터·자리·저장
- Create `src/data/powerPlant.js` (POWER_PLANT: fillerStage(5) 곡선, types electric/steel/dark/fighting, minorTypes dark/fighting, bossTypes electric/steel, fallback magnemite, clusters `{'~':0,'"':0,'#':4,'^':6}`, weather [], piles [2,3], pileSpecies 코일·레어코일·찌리리공·붐볼·동미러, `power: true`, `ambush: { species: 'voltorb', drop: 12 }`).
- `dungeons.js` 5번 자리 `[POWER_PLANT, fillerStage(5)]`; save RENAMED `'trial-5': 'power-plant'`.
- Tests (`tests/powerPlant.test.js`): 데이터·자리(7-1)·저장 이전; branchStages/fillerStages/town 등 하드코딩 인덱스 갱신.

### Task 2: 발전기
- `generator.js`: `GEN='G'`, `genCells(g)`(2×2 칸), `genRange(g)`(맨해튼 1~2, 맵 안, G 아님), `firesAt(g, turn)` = `turn % 2 === g.phase`, `pulsePreview(state)` = 이번 라운드 방출 칸, `shockDamage(unit)` → `{damage}|{heal}|{boost}|null`, `charged(state, unit)` = 상하좌우로 붙음.
- floorgen `powerLayout(g, anchor, rng)` → generators 목록, 층 결과 `generators`. createBattle `state.generators`.
- TILE_COST `G: Infinity`; shapes 직선·벽 판정에 `G`.
- endPhase(적 페이즈 끝) 방출: 이벤트 kind `shock`, 축전 회복·전기엔진/피뢰침 능력치 (abilityLog).
- damage: `terrainCtx.charged` → 전기 타입·전기 기술 ×1.2.
- ai: 위험도에 이번 라운드 방출 피해 더함.
- Tests: 배치·박자·범위·피해·면역·축전·강화·AI 회피·직선 차단.

### Task 3: 찌리리공 기습
- floorgen: 기습 자리(x ≥ 8, 고철더미·가벽 옆 바닥) 별도 난수, enemies 에 `ambush: true`.
- `ambush.js`: `ambushHidden(state, u)` (안 깨어남 + 아군 모두 3칸 밖 + 안 맞음), `ambushPlan(state, u)` (안 깨어나면 제자리, 깨면 자폭 맞힐 자리 있으면 자폭, 없으면 가장 가까운 아군 쪽으로 전력 이동).
- stealth.hiddenFrom 에 합류; states.nextEnemy 에서 ambush 유닛은 ambushPlan.
- Tests: 숨음·3칸 드러남·맞으면 드러남·자폭 강제·이동.

### Task 4: 그림 (powerTiles.js) — ???시티 기준, 브라우저 2~3회
### Task 5: 브라우저 확인(testParty), 문서(dungeon-guide·ROADMAP), 전체 테스트, 커밋

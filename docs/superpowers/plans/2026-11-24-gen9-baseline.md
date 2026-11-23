# 9세대 기준 옮기기 Implementation Plan

> Native execution, one opus review at the end. Spec: `docs/superpowers/specs/2026-11-24-gen9-baseline-design.md`

## Global Constraints
- 도감 1~493 그대로. 기술·특성은 `GEN_LIMIT = 4` 까지 나온 것만 (2단계에서 5).
- 손 조정(`src/data/moves.js` 등)·SRPG 효과·밸런스 숫자는 그대로.

## Review Focus
1. 옛 저장(버전 9)이 버려지지 않고 옮겨짐 — 배운 기술이 사라지지 않음 (예전 습득표 기술은 기술 데이터에 남김).
2. 특성 슬롯 수가 줄거나 바뀐 종의 저장 슬롯·해금이 깨지지 않음.
3. 레벨 0(진화 때 배움) 기술이 배울 수 없게 되지 않음.
4. 페어리로 바뀐 종 때문에 적 풀이 빈 던전이 없음.

### Task 1: 생성 스크립트 (`tools/fetch-pokeapi.js`)
- 타입·종족값 = 지금(9세대) 값. 기술 위력·명중·타입 = 지금 값 (`past_values` 되돌리기 끔).
- 특성: 지금 일반 특성 슬롯, 그 특성이 `GEN_LIMIT` 이후면 `past_abilities` 중 그 슬롯의 가장 최근 `GEN_LIMIT` 이하 특성으로.
- 습득표: 본편 버전 그룹(콜로세움·XD·레츠고·레전드 제외) 중 첫·마지막 그룹의 레벨업 목록 합집합, 겹치면 낮은 레벨, 레벨 0 → 1, `GEN_LIMIT` 이후 기술 제외.
- 기술 데이터에는 예전 습득표(플라티나·HGSS·DP) 기술도 남김 (저장 호환).
- Tests: `tests/gen9.test.js` — 삐삐 페어리, 종족값 샘플, 합집합·낮은 레벨, 5세대 기술·특성 없음.

### Task 2: 저장 버전 10, 9 저장 옮기기 + 기존 테스트 기대값 갱신 + 던전 풀 점검
### Task 3: 전체 테스트, 브라우저(옛 저장 불러오기·전투 한 번), opus 리뷰, 커밋

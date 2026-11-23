# 5세대 포켓몬 추가 Implementation Plan

> Native execution, opus review at the end of this stage. Spec: `docs/superpowers/specs/2026-11-24-gen5-species-design.md`. Branch `feat/gen5` stays open through stages 3·4.

## Global Constraints
- `MAX_DEX` 649, `GEN_LIMIT` 5. 전설·환상 제외 규칙·저장 버전 그대로.

## Review Focus
1. 5세대 특성만 가진 종이 특성 없이 생성되지 않음 (스크립트가 멈춤).
2. 스프라이트 없는 번호가 깨지지 않고 임시 도트로.
3. 1~493 종의 특성 슬롯 수가 줄지 않음 (저장 슬롯 보호) — 5세대 특성이 들어와 바뀌는 슬롯 목록 보고.
4. 큰 종(레시라무 등)·특이 폼 기본값이 데이터·그림을 깨지 않음.

### Task 1: 데이터 — `tools/fetch-pokeapi.js` 숫자 둘, 재생성, `tests/gen5.test.js` (649종, 주리비얀 샘플, 쪼마리 진화, 전설 제외·뽑기 풀), 1단계 테스트의 거르기 기준 갱신(5세대 → 6세대 기술), 골든 값.
### Task 2: 스프라이트 — SpriteCollab 494~649 `sprite/`·`portrait/` 받아 동봉, 없는 번호 목록, README 문구.
### Task 3: 적 풀 변화 보고, 브라우저(5세대 적 던전·뽑기), 전체 테스트, opus 리뷰, 커밋.

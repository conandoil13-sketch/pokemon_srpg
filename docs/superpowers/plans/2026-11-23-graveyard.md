# 9-2 묘지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native).

**Goal:** 9-2 묘지 — 묘비 `T` (고스트 1·비행/드래곤 3 통과, 멈춤 불가), 세로 묘비 줄 층 생성, 혼불 예고 증원.
**Spec:** `docs/superpowers/specs/2026-11-23-graveyard-design.md`

## Review Focus
1. 혼불 칸이 안개·어둠 숨김에 가려지지 않는지, 등장한 고스트가 안개 숨김 규칙을 따르는지.
2. 증원 등장 칸: 유닛·벽·묘비·출발 구역, 밀물·빙판 같은 다른 지형 규칙.
3. 적 전멸 판정 시점과 대기 중 혼불 (층 결과가 두 번 나지 않게).
4. 순간이동·밀어내기·스팀 등 강제 이동이 묘비 위로 내리지 않음.
5. 다른 던전 골든·난수 소비 불변.

### Task 1: 데이터·자리 (`src/data/graveyard.js`, dungeons) — tests/graveyard.test.js
### Task 2: 묘비 길찾기 (`pathfind.js`) — tests/graveyard.test.js
### Task 3: 층 생성 (`floorgen.graveyardLayout`, 난수 7600, 맨 끝, `wisps` 예정표) — tests/graveyard.test.js
### Task 4: 혼불 (`core/wisp.js`, states 적 페이즈 끝) — tests/wisp.test.js
### Task 5: 그림 (`render/graveyardTiles.js`) + 브라우저 2~3회
### Task 6: 문서·전체 테스트·리뷰

# 마을 건물 Implementation Plan

> Native execution, one opus review at the end. Spec: `docs/superpowers/specs/2026-11-23-town-buildings-design.md`

## Global Constraints
- 마을 28×14 그대로. 동료 자리(`npcSpots`)·`start`·`returnSpot`·`partySpot`·`gachaSpot`·`shopSpot`·선물 나무·물속 선물 자리 그대로 비어 있어야 함.
- 건물·빈터 칸은 못 지나감. 상호작용은 지금처럼 문 앞(건물 발판 맨 아래 가운데 칸 = 지금 표지판 칸)에 서서 위를 보고 Z.

## Review Focus
1. 클릭 이동(길찾기)도 건물·빈터를 피함 (같은 `walkable`).
2. 건물 지붕이 위 테두리 밖으로 그려져도 화면이 깨지지 않음 (카메라 맨 위).
3. 켈리몬·동료 NPC가 건물 그림에 가려지지 않음 (y 정렬).

### Task 1: 데이터·걷기
- `TOWN.buildings`: `{ id, kind, x, y, w, h }` — stump(편성소 3..5×1..3), tent(모집소 12..14×1..3), stall(상점 22..24×1..3), lot ×3 (업적 2..3×8..9, 의뢰 19..21×8..9, 도전의 문 24..26×11..12). 건물 자리의 `^` 는 `.` 로.
- 표지판 셋(편성소·모집소·상점)은 `kind: 'door'` (그리지 않음, 같은 자리·대사). 빈터 표지판 3개 `kind: 'sign'`, 대사 "공사 중이다." + 무엇이 들어설지 한 줄.
- `TOWN.paths`: 28×14 문자열, `=` 흙길.
- `town.js` `walkable` 에 건물 칸 막기.
- Tests (`tests/town.test.js`): 건물·빈터 칸 못 감, 문 앞 Z → 같은 화면 콜백, 빈터 표지판 대사, 자리들이 건물과 안 겹침, paths 크기.

### Task 2: 그림 `src/render/townTiles.js`
- `drawTownPaths(ctx, paths, cx, cy, W, H)` 흙길 (가장자리 풀 섞임).
- `drawBuilding(ctx, b, time)` 종류별: stump · tent · stall · lot(+ 도전의 문 빈터는 돌 아치 터) · 게시판(`drawBoard`). 지붕은 발판 위로 한 칸.
- `town.js` draw: 길 → (y 정렬) 건물·표지판·NPC·플레이어.

### Task 3: 브라우저 2~3회, 가이드/ROADMAP, 전체 테스트, opus 리뷰, 커밋

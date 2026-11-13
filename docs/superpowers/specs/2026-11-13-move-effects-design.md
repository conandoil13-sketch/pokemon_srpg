# 기술 이펙트 (pixelfx) — 설계 스펙

- 작성일: 2026-11-13
- 상태: 확정 (2026-11-13)
- 선행: 범위 모양 (main `9ec94bd`), 상태이상, 랭크

## 1. 목표 · 이유

지금 공격 연출은 맞는 순간 점 8개가 퍼지는 것과 단색 탄 하나뿐이다. pixelfx(MIT, `~/Desktop/코딩/pixelfx` 에 받아 둠)의 픽셀 이펙트로 기술마다 **타입 색**과 **모양에 맞는 동작**을 보여 줘서, 화면만 봐도 무슨 기술인지 느껴지게 한다.

사용자 결정:
- 이펙트 = **(모양·물리/특수로 고른 틀) × (타입 팔레트)**. 자폭·대폭발만 전용 이펙트.
- 범위: **공격 연출 + 피격 이펙트 + 변화기 연출 + 상태이상 걸릴 때 + 상태이상 지속 표시**.
- 방식: **실시간 그리기** (pixelfx 코드를 게임에 넣고 매 프레임 그림).

### 성공 기준
1. 공격기마다 §3 표대로 이펙트가 나오고 색이 타입을 따른다.
2. 맞은 쪽에 피격 섬광, 급소·효과 굉장은 더 크게.
3. 변화기: 오르면 밝게 솟는 빛, 내리면 어두운 연기.
4. 상태이상: 걸리는 순간 짧은 이펙트, 걸려 있는 동안 몸 주위에 계속 도는 표시.
5. 전투 템포가 지금보다 크게 느려지지 않는다 (공격 하나 연출 총길이 지금 대비 +0.5초 이내, 자폭 제외).
6. 성능: 유닛 10마리 전원이 상태이상 지속 표시 + 공격 이펙트 1개일 때 프레임당 그리기 4ms 이하 (개발 PC 기준, 테스트로 측정).
7. 라이선스 표시가 게임 안 파일로 함께 배포된다.

### 범위 밖 · 안티 목표
- 새 이펙트 직접 그리기(pixelfx 의 "새로 만들기" 루프) — 이번엔 기존 이펙트의 옵션(팔레트·크기·방향·속도)만. 어색한 것은 2단계 조정 페이지 이후 손본다.
- 기술별 개별 이펙트 지정 UI(→ 2단계 조정 페이지에서 `moveFx.json` 편집).
- 소리.
- **안티 목표**: 이펙트가 화면을 가려 대사·HP 바·유닛이 안 보이면 실패 (이펙트는 대사 창 아래 층, 크기는 타일 2~3칸 안). 연출이 길어 전투가 지루해지면 실패.

## 2. pixelfx 넣기

- `src/vendor/pixelfx/` 에 `src/core/` 전체와 §3 에서 쓰는 이펙트 파일만 복사 + `LICENSE`, `NOTICE.md`(MIT; Hugo Duprez·Patch·Hollow Crown 표기). **`gallery/fonts`(Patch 전용 폰트)는 복사하지 않는다.**
- 복사 스크립트 `tools/vendor-pixelfx.js` (pixelfx 경로를 인자로, 목록에 있는 파일만 복사) — 나중에 이펙트를 늘릴 때 다시 돌린다.
- 그리기: 256×192 `createFrame` 두 장(뒤층·앞층) → `composite(frame, img, null)` → 오프스크린 캔버스 → 게임 캔버스에 `drawImage`. 카메라는 frame 의 `ox, oy`.
  - 뒤층(유닛 밑): 충격파·폭발 바닥, 상태이상 바닥 효과. 앞층(유닛 위, 대사 창 아래): 나머지.
- 좌표: pixelfx 는 옆에서 본 화면(바닥 y=0, 오른쪽 향함). 우리 맵에선 이펙트 원점 = 타일 중심 아래쪽(발밑, 중심 +8px). 방향: 오른쪽 기본, 왼쪽 `flip`, 위/아래는 `angle` ±90°. 위·아래 방향이 어색한 이펙트는 빌더가 대각 회전 대신 오른쪽/왼쪽으로 대체해도 됨.
- 크기: pixelfx 에는 전체 배율이 없다(픽셀 격자 유지 위해 비트맵 확대도 안 함). 이펙트 고유 옵션(`reach`, `size`, `radius`, `height` 등)이 있으면 타일 2~3칸(48~72px) 안에 맞추고, 없는데 너무 크면(ground-slam·thunderclap·frost-nova·plasma-explosion 등) 작은 후보로 바꾼다 (빌더 재량, ledger 기록). **자폭·대폭발은 예외 — 화면을 크게 채워도 됨** (찌리리공 기믹의 하이라이트, 내 결정).
- "효과 굉장 ×1.3" 은 확대 대신 **light 1.5 + 맞을 때 이펙트를 한 번 더(다른 seed, 0.08초 뒤)** 로 대신한다 (내 결정).
- 속도: 래퍼는 `dt × timeScale` 로 돌린다 (createFx 옵션의 `speed` 와 이름이 겹치지 않게 `timeScale`). 배속은 **최대 2배**. 길이 제한(공격 0.4~0.8초, 자폭 1.6초)은 **주된 폭발·타격 부분** 기준이고, 연기·잔해 같은 꼬리는 연출 단계가 끝난 뒤에도 이어서 재생하되 **공격 연출이 끝나고 1초 뒤 `stop()`** 으로 정리한다. 2배로도 주된 부분이 너무 길면 `stop()` 으로 끊는다 (내 결정).
- 직선 빔(`arcane-beam`)은 길이가 168px 로 고정 → 직선 끝 칸까지만 보이도록 **잘라서**(클립) 그린다. 끝의 불꽃은 잘려도 됨, 끝 칸에 hit-spark 가 따로 나온다 (내 결정).
- 원거리 판정은 **이번 대상과의 실제 거리**(2 이상이면 투사체). `fxForMove(move, { distance })` (내 결정).
- 팔레트는 주 색 묶음(`palette`)만 타입을 따르고, 연기·먼지 같은 보조 색은 그대로 둔다. 단, 보조 색이 그 이펙트의 주인공처럼 보이는 경우(plasma-explosion 의 보라 `accent`, thunderclap 의 `sparks`)는 타입 팔레트의 밝은 쪽으로 바꾼다 (내 결정, 빌더가 렌더해 보고 조정).
- **actor 이펙트**(몸에 붙는 것: 상태이상 지속 표시, 랭크, thunderclap 등)는 몸을 다시 칠하기도 하므로(poisoned·frozen 은 몸 픽셀 전체를 물들임), pixelfx 기본 캐릭터 대신 **우리 유닛 스프라이트로 만든 actor**(`{ mask, pixels, x, y, w, h, head, chest }`)를 넘긴다 (내 결정). 스프라이트의 **Idle 첫 프레임(정면)** 에서 한 번 만들어 종족별로 캐시 — 매 프레임 새로 만들지 않는다(pixelfx 캐시·성능). 그래서 몸 위 효과는 유닛 몸 모양을 따라 칠해지고, 머리 위 아이콘(잠듦 Z·혼란·별)은 그 종족 머리 높이에 뜬다. 임시 도트(스프라이트 없는 종)도 같은 방식.

## 3. 이펙트 고르기 (`src/data/moveFx.js` 규칙 + `moveFx.json` 예외)

### 3-1. 공격기 틀 (모양 × 분류)
| 경우 | 시전(사용자) | 이동 | 맞을 때(칸마다) |
|---|---|---|---|
| single 사거리 1 (물리·특수) | — | — | `impacts/hit-spark` (타입 팔레트) |
| single 원거리 (사거리 2 이상) 특수 | `arcane/spell-charge` 짧게 | `projectiles/plasma-shot` 이 대상까지 | `impacts/blunt-hit` |
| single 원거리 물리 | — | `projectiles/energy-disc` | `impacts/hit-spark` |
| line | — | `arcane/arcane-beam` 끝 칸까지 (0.4초 유지) | 대상마다 `impacts/hit-spark` |
| cone | 불꽃 `fire/fire-breath`, 얼음 `ice/frost-breath`, 그 외 `fire/fire-breath` 를 타입 팔레트로 | — | 대상마다 `impacts/hit-spark` |
| around | 땅·바위 `impacts/ground-slam`(작게), 그 외 `lightning/thunderclap` (타입 팔레트) | — | 대상마다 `impacts/blunt-hit` |
| blast | — | `projectiles/plasma-shot` 착탄 칸까지 | 착탄 칸 `explosions/plasma-explosion`(작게, 타입 팔레트) |
| **자폭·대폭발** | — | — | 사용자 칸 `explosions/small-explosion`(자폭) / `explosions/big-explosion`(대폭발), 원래 색, 화면 흔들림 |

### 3-2. 타입 → 팔레트 (pixelfx `PAL`)
노말 bone · 불꽃 fire · 물 water · 전기 volt · 풀 leaf · 얼음 ice · 격투 ember · 독 poison · 땅 earth · 비행 smoke · 에스퍼 neon · 벌레 matrix · 바위 stone · 고스트 shadow · 드래곤 arcane · 악 night · 강철 metal.

### 3-3. 피격
- 기본: 위 표의 "맞을 때".
- 급소: 추가로 `impacts/crit-hit`.
- 효과 굉장: 맞을 때 이펙트 크기 ×1.3 + `light` 1.5.
- 빗나감·면역: 이펙트 없음 (지금처럼 글자만).

### 3-4. 변화기
- **색은 능력치 종류와 상관없이 오르면 빨강, 내리면 파랑** (사용자 결정). 빨강 = `PAL.blood` 계열 밝은 빨강, 파랑 = `PAL.water`.
- 랭크 상승(대상마다): `ui/level-up` 짧게, 빨강.
- 랭크 하락: `status/cursed` 를 한 번만 (0.6초), 파랑.
- 지금의 ▲▼ 숫자 팝업은 유지.

### 3-5. 상태이상
| 상태 | 걸릴 때(한 번) | 지속 표시(루프) |
|---|---|---|
| 마비 | `impacts/hit-spark` volt | `status/stunned` |
| 화상 | `status/burning` 0.6초 강하게 | `status/burning` (약하게: light 0.5) |
| 독 / 맹독 | `nature/acid-splash` 작게 | `status/poisoned` (맹독은 진하게) |
| 잠듦 | — | `status/sleep` |
| 얼음 | `ice/frost-nova` 작게 | `status/frozen` |
| 혼란 | — | `status/confused` |
- 지속 표시는 유닛이 움직이면 따라가고, 풀리면 `stop()` 으로 사라진다. 기절하면 즉시 제거.
- 주 상태이상과 혼란이 같이면 둘 다.

## 4. 연출 타이밍

- 지금의 단계(`act → travel → impact → msg …`)를 유지하고, 각 단계에서 이펙트를 시작한다. impact 시각은 이펙트 길이가 아니라 **지금의 단계 시간**을 따른다 (템포 유지). 이펙트는 단계가 끝나도 남은 부분을 계속 재생하다 스스로 끝남.
- 자폭·대폭발만 impact 단계를 1.2초로 늘리고 화면 흔들림(±2px, 0.4초).
- 지금의 점 8개 스파크와 단색 탄은 이펙트로 대체한다(이펙트를 못 만들면 — 예: 파일 누락 — 지금 그림으로 대체).

## 5. 아키텍처
```
tools/vendor-pixelfx.js     pixelfx 에서 필요한 파일만 src/vendor/pixelfx 로 복사
src/vendor/pixelfx/         core + 쓰는 이펙트 + LICENSE + NOTICE.md
src/data/moveFx.js          §3 규칙: fxForMove(move) → { cast?, travel?, hit, selfKO? }, TYPE_PALETTE, STATUS_FX, STAGE_FX
src/data/moveFx.json        기술별 예외 (지금은 빈 객체, 2단계 조정 페이지가 고침)
src/render/fx.js            이펙트 관리자: spawn(id, {x,y,dir,palette,scale,speed,layer}), follow(unitId,…), update(dt), draw(ctx, layer, cam), stopFor(unitId)
src/render/mapAttack.js     단계마다 fx.spawn
src/game/states.js          지속 표시 동기화(상태 바뀔 때), 층 시작 시 초기화, 그리기 순서(뒤층→유닛→앞층→UI)
```

## 6. 테스트
- `moveFx.test.js`: 기술별 틀 고르기(몸통박치기 hit-spark, 섀도볼 투사체+blunt-hit, 하이드로펌프 빔, 열풍 fire-breath, 지진 ground-slam, 방전 thunderclap, 불대문자 plasma-explosion, 자폭 small-explosion, 대폭발 big-explosion), 17타입 팔레트 존재, 예외 JSON 우선.
- `fx.test.js`(Node, 캔버스 없이 frame 만): spawn → update → 끝나면 목록에서 제거, follow 루프는 stop 전까지 유지, 이펙트 파일 import 전부 성공(복사 누락 감지), 성능 기준(§1-6) 측정.
- `game.test.js`: 상태이상 걸림/풀림/기절에 따라 지속 표시 개수 변화, 층 새로 시작하면 0.
- 브라우저: 기술 6종 + 자폭 + 변화기 + 상태이상 스크린샷 (창이 숨겨져 있으면 오프스크린 캔버스로 그려 PNG 로 저장해 확인).

## 7. 빌더 재량
- 각 이펙트의 정확한 옵션값(size·speed·light·seed), 위/아래 방향 처리, 후보가 화면에 너무 크거나 actor 문제로 못 쓸 때의 대체 이펙트 — 렌더해서 보고 결정, ledger 에 기록.

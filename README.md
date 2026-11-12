# Pokémon Tactics — Sinnoh Skirmish (비공식 팬 데모)

브라우저에서 바로 플레이하는 포켓몬 SRPG 전투 데모입니다.
4~5세대(DS) 해상도 256×192 도트 화면, 18타입 상성, 적 AI, 5세대풍 배틀 컷인을 갖추고 있습니다.

> 비영리 팬 프로젝트입니다. Pokémon 및 관련 명칭의 권리는 Nintendo / Creatures / GAME FREAK 에 있습니다.

## 실행

ES 모듈을 쓰므로 `file://` 로 `index.html` 을 직접 열면 동작하지 않습니다. 로컬 서버로 여세요.

```bash
node tools/serve.js 8000
```

브라우저에서 <http://localhost:8000> 접속. (Node 18 이상, 외부 패키지 없음)

## 조작

| 동작 | 키보드 | 마우스 |
|---|---|---|
| 커서 이동 | 방향키 | 마우스 이동 |
| 결정 | Z / Enter / Space | 왼쪽 클릭 |
| 취소 (이동 후 취소 시 원위치) | X / Esc / Backspace | 오른쪽 클릭 |
| 턴 종료 | E | 빈 칸 클릭 → End Turn |

- 아군 유닛 선택 → 파란 칸으로 이동 → 기술 선택 → 대상 선택. 대상 선택 중에는 명중률·데미지 범위·KO 여부가 미리 표시됩니다.
- 지형: 수풀(회피 +15%), 바위산(이동 비용 2, 방어·특방 ×1.2), 물(물·비행 타입만 진입), 나무(진입 불가).
- 적을 모두 쓰러뜨리면 승리, 아군이 전멸하면 패배.

## 스프라이트 팩 넣기

저장소에는 공식 스프라이트가 **포함되어 있지 않습니다**. 파일이 없으면 코드로 그린 오리지널 임시 도트가 표시됩니다.
가지고 있는 스프라이트 팩을 아래 폴더에 넣으면 해당 포켓몬만 자동으로 교체됩니다.

| 경로 | 용도 | 기대 규격 |
|---|---|---|
| `assets/sprites/icons/{dex}.png` | 맵 위 유닛 | 가로 2프레임 시트 (예: 64×32 = 32×32 ×2, 128×64 = 64×64 ×2). 프레임 크기 = 높이 |
| `assets/sprites/front/{dex}.png` | 컷인 (상대 측 앞모습) | 단일 이미지, 예: 96×96 |
| `assets/sprites/back/{dex}.png` | 컷인 (아군 측 뒷모습) | 단일 이미지, 예: 96×96 |

`{dex}` 는 전국도감 번호 정수입니다 (`392.png`, 0 패딩 없음). 데모에 쓰이는 번호:
392 Infernape · 395 Empoleon · 389 Torterra · 405 Luxray · 448 Lucario · 445 Garchomp · 430 Honchkrow · 407 Roserade · 437 Bronzong

일부만 넣어도 됩니다. 넣은 파일은 공개 저장소에 커밋하지 마세요.

## 테스트

```bash
npm test
```

`src/core/` 의 규칙(데미지·상성·이동 범위·AI·전투 상태)을 `node:test` 로 검증합니다.

## 구조

```
src/data/    타입표 · 기술 · 종족 · 맵 (정적 데이터)
src/core/    규칙 (순수 함수, DOM 없음)
src/render/  캔버스 그리기 (폰트 · 타일 · 스프라이트 · UI · 컷인)
src/game/    상태 머신 · 입력
tools/       개발용 정적 서버
```

설계 문서: `docs/superpowers/specs/`, 구현 계획: `docs/superpowers/plans/`

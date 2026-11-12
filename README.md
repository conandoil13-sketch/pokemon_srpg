# 포켓몬 택틱스 — 신오 대결전 (비공식 팬 데모)

브라우저에서 바로 플레이하는 포켓몬 SRPG 전투 데모입니다.
DS 해상도 256×192, 24px 타일 + 카메라 스크롤, 18타입 상성, 적 AI, PMD(불가사의 던전)식 맵 위 전투 연출, 갈무리 픽셀 폰트 한글 UI.

> 비영리 팬 프로젝트입니다. Pokémon 및 관련 명칭의 권리는 Nintendo / Creatures / GAME FREAK 에 있습니다.

## 실행

ES 모듈을 쓰므로 `file://` 로 `index.html` 을 직접 열면 동작하지 않습니다. 로컬 서버로 여세요.

```bash
node tools/serve.js 8000
```

브라우저에서 <http://localhost:8000> 접속. (Node 18 이상, 외부 패키지 없음. 서버는 이 컴퓨터에서만 접속 가능)

## 조작

| 동작 | 키보드 | 마우스 |
|---|---|---|
| 커서 이동 (카메라가 따라감) | 방향키 | 마우스 이동 |
| 결정 | Z / Enter / Space | 왼쪽 클릭 |
| 취소 (이동 후 취소 시 원위치) | X / Esc / Backspace | 오른쪽 클릭 |
| 턴 종료 | E | 빈 칸 클릭 → 턴 종료 |

- 아군 선택 → 파란 칸으로 이동 → 기술 선택 → 대상 선택. 대상 선택 중에는 명중률·데미지 범위·기절 여부가 미리 표시됩니다.
- 지형: 수풀(회피 +15%), 바위산(이동 비용 2, 방어·특방 ×1.2), 물(물·비행 타입만 진입), 나무(진입 불가).

## 스프라이트 (PMD Sprite Collab)

저장소에는 스프라이트가 **포함되어 있지 않습니다**. 없으면 코드로 그린 오리지널 임시 도트가 표시됩니다.
<https://sprites.pmdcollab.org> 에서 포켓몬별 스프라이트·초상화 폴더를 받아 그대로 넣으면 자동으로 적용됩니다.

```
assets/sprites/pmd/sprite/0392/AnimData.xml, Idle-Anim.png, Walk-Anim.png, Attack-Anim.png, Shoot-Anim.png, Hurt-Anim.png …
assets/sprites/pmd/portrait/0392/Normal.png  (선택: Determined.png, Pain.png)
```

- 폴더 이름은 전국도감 번호 4자리: 0392 초염몽 · 0395 엠페르트 · 0389 토대부기 · 0405 렌트라 · 0448 루카리오 · 0445 한카리아스 · 0430 돈크로우 · 0407 로즈레이드 · 0437 동탁군
- 쓰는 애니메이션: Idle(대기) · Walk(이동, 8방향) · Attack(물리) · Shoot(특수) · Hurt(피격). 없는 동작은 비슷한 동작으로 대체합니다.
- 초상화는 정보창과 대사창에 쓰입니다 (공격 시 Determined, 피격 시 Pain).
- **라이선스**: 커뮤니티 제작분은 CC BY-NC 4.0 (비상업 + 출처 표기, 각 폴더의 `credits.txt`). `CHUNSOFT` 로 표기된 부분은 원작 게임 스프라이트입니다. 이 폴더는 git 에 올라가지 않도록 설정되어 있습니다.

## 폰트

[갈무리(Galmuri)](https://github.com/quiple/galmuri) © Lee Minseo — SIL Open Font License 1.1 (`assets/fonts/galmuri/LICENSE.txt`).
Galmuri11(12px) / Galmuri9(10px) 를 256×192 화면에 그대로 찍고, 안티에일리어싱을 잘라 도트로 렌더링합니다.

## 테스트

```bash
npm test
```

`node:test` 로 규칙(데미지·상성·이동·AI·전투 상태), 상태 머신, 한글 조사, PMD 데이터 파서, 개발 서버를 검증합니다.

## 구조

```
src/data/    타입표 · 기술 · 종족 · 맵 · 한글 표기
src/core/    규칙 (순수 함수, DOM 없음)
src/render/  폰트 · 타일 · 스프라이트(PMD) · UI · 맵 위 공격 연출
src/game/    상태 머신 · 입력 · 카메라
tools/       개발용 정적 서버
```

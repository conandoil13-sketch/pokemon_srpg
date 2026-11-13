# 기술 이펙트 (pixelfx) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pixelfx 이펙트로 공격·피격·변화기·상태이상(걸림·지속) 연출을 타입 팔레트로 보여 준다.

**Architecture:** pixelfx core 와 쓰는 이펙트만 `src/vendor/pixelfx/` 로 복사(스크립트). 이펙트 선택은 순수 데이터 규칙 `src/data/moveFx.js`. 재생·그리기는 `src/render/fx.js` 관리자(256×192 frame 두 장 → 오프스크린 캔버스). 연출 단계가 관리자에 spawn 한다.

**Tech Stack:** vanilla ES modules, Canvas 2D, `node --test`. pixelfx(MIT) API: `createFrame(w,h,ox,oy)`, `clearFrame`, `createFx(mod, opts)` → `{ update(dt), draw(frame, 'back'|'front'), stop(), done(), meta }`, `composite(frame, rgbaBytes, null)`, `PAL`, actor = `{ mask:{w,h,data:Uint8Array}, pixels:Uint32Array, x, y, w, h, head:[x,y], chest:[x,y] }` (발밑 원점).

**Spec:** `docs/superpowers/specs/2026-11-13-move-effects-design.md`

## Global Constraints

- 원본 pixelfx: `/Users/alltimesuho/Desktop/코딩/pixelfx` (게임 저장소 밖). 복사본에 `LICENSE`, `NOTICE.md` 포함, `gallery/fonts` 제외, 각 카테고리 `_lib.js` 함께 복사.
- 타입 팔레트: 노말 bone · 불꽃 fire · 물 water · 전기 volt · 풀 leaf · 얼음 ice · 격투 ember · 독 poison · 땅 earth · 비행 smoke · 에스퍼 neon · 벌레 matrix · 바위 stone · 고스트 shadow · 드래곤 arcane · 악 night · 강철 metal.
- 랭크: 오르면 빨강(`PAL.blood` 밝은 쪽), 내리면 파랑(`PAL.water`). 종류별 색 없음.
- 배속 `timeScale` ≤ 2 (createFx 옵션 이름 `speed` 와 분리). 주된 부분 길이: 공격 0.4~0.8초, 자폭·대폭발 1.6초. 꼬리는 연출 끝 +1초에 `stop()`.
- 크기: 타일 2~3칸(48~72px) 안. 자폭·대폭발만 예외(크게). 비트맵 확대 금지.
- 효과 굉장: light 1.5 + 맞을 때 이펙트 0.08초 뒤 한 번 더(seed 다르게). 급소: `impacts/crit-hit` 추가. 빗나감·면역: 없음.
- 원거리 판정: 대상과 실제 거리 ≥ 2.
- 직선 빔은 끝 칸까지 클립.
- actor 이펙트는 우리 스프라이트 Idle 첫 프레임(정면)으로 만든 actor 를 종족별 캐시해서 넘김. 호스트는 pixelfx 기본 캐릭터를 그리지 않는다.
- 성능: 유닛 10마리 상태 지속 표시 + 공격 이펙트 1개 → 프레임당 update+draw+composite 4ms 이하.
- 이펙트 실패(파일 없음·예외) 시 지금의 기존 그림(점 8개·단색 탄)으로 대체, 게임은 멈추지 않음.

## Review Focus

1. **스프라이트가 아직 로드되지 않은 종의 actor** — 타원 마스크로 임시 actor, 로드되면 캐시 갱신. 화면이 깨지거나 예외가 나면 안 됨. → Task 3 fx.test.
2. **층 이동·결과 화면·마을 복귀 시 남은 이펙트** — 새 전투(createGame/reset) 때 관리자 비움, 지속 표시가 다음 층으로 새어 나가지 않음. → Task 5 game.test.
3. **연출 중 기절·자폭으로 사라진 유닛을 따라가던 지속 표시** — 즉시 제거, 사라진 유닛 좌표 참조로 예외 없음. → Task 5 game.test.
4. **카메라가 움직이는 중의 이펙트 위치** — 월드 좌표 고정(frame ox/oy), 화면 밖 이펙트도 예외 없이 그려지고 잘림. → Task 3 fx.test.
5. **연타로 연출 단계를 넘길 때(advance)** — 이펙트는 남은 부분만 재생하고 쌓이지 않음(같은 단계 이펙트 중복 spawn 금지). → Task 4 game.test.

---

### Task 1: pixelfx 복사 · 로드 확인

**Files:** Create `tools/vendor-pixelfx.js`, `src/vendor/pixelfx/**`, `tests/vendor.test.js`

**Interfaces — Produces:** `FX_FILES` 목록(스펙 §3 의 모든 이펙트 id) in `tools/vendor-pixelfx.js`; `node tools/vendor-pixelfx.js <pixelfx경로>` 가 `src/core/*`, `src/fx/<cat>/_lib.js`(있으면), 목록 파일, `LICENSE`, `NOTICE.md` 를 `src/vendor/pixelfx/` 로 복사. `src/vendor/pixelfx/fx-index.js`: `export const FX = { 'impacts/hit-spark': mod, … }` (스크립트가 생성).

- [ ] **Step 1: tests** — vendor.test: `FX` 의 모든 id import 성공, 각 `meta.duration` 존재, `LICENSE`·`NOTICE.md` 존재, `gallery` 폴더 없음, `createFx(FX['impacts/hit-spark'], { palette: PAL.fire })` 를 0.5초 update 후 `done()` true
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** + 스크립트 실행 · **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Commit** `feat: vendor pixelfx effects (MIT)`

---

### Task 2: 이펙트 고르기 규칙

**Files:** Create `src/data/moveFx.js`, `src/data/moveFx.json`(`{}`), `tests/moveFx.test.js`

**Interfaces — Produces:**
- `TYPE_PALETTE: { [type]: PAL name }`, `RANK_UP_PAL`, `RANK_DOWN_PAL`
- `fxForMove(move, { distance }) => { cast?: FxSpec, travel?: FxSpec, hit: FxSpec, selfKO?: FxSpec }` — `FxSpec = { id, opts, timeScale, layer: 'back'|'front' }` (opts 에 palette 포함)
- `fxForStage(applied) => FxSpec` (applied > 0 상승), `fxForAilment(ailment) => { inflict?: FxSpec, loop: FxSpec }`
- 예외: `moveFx.json[moveId]` 의 필드가 규칙 결과를 덮어씀.

- [ ] **Step 1: tests** — 스펙 §6 목록: tackle hit-spark(bone) · shadow-ball distance 2 → travel plasma-shot + hit blunt-hit(shadow), distance 1 → travel 없음 · hydro-pump travel arcane-beam(water) · heat-wave cast fire-breath(fire) · earthquake cast ground-slam · discharge cast thunderclap(volt) · fire-blast hit plasma-explosion · self-destruct selfKO small-explosion · explosion big-explosion · 17타입 TYPE_PALETTE 가 모두 `PAL` 에 있음 · fxForStage(+2) 빨강 / (−1) 파랑 · fxForAilment 6종 loop id(스펙 §3-5) · json 예외 우선 · 모든 FxSpec 의 id 가 vendor `FX` 에 있음 · timeScale ≤ 2
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: move effect selection rules`

---

### Task 3: 이펙트 관리자 · 유닛 actor

**Files:** Create `src/render/fx.js`, `src/render/fxActor.js`, `tests/fx.test.js`

**Interfaces — Produces:**
- `createFxManager({ w = 256, h = 192, makeCanvas })` → `{ spawn(spec, at, { dir?, actor?, delay? }) => handle, follow(key, spec, getPos, actor) , unfollow(key), sync(keysWanted), stopAll(), clear(), update(dt), draw(ctx, layer, cam), count }`
  - `at`: 월드 픽셀 `{x, y}` (발밑). dir → flip/angle (오른쪽 0, 왼쪽 flip, 위 −π/2, 아래 +π/2).
  - update: 각 이펙트 `fx.update(dt × timeScale)`, 끝난 것 제거, `delay` 처리, 클립(빔) 정보 유지.
  - draw: layer 별 frame 에 그리기 → composite → 오프스크린 → `ctx.drawImage`. Node 테스트에선 `makeCanvas` 없이 frame 까지만(그리기 함수는 frame 반환).
  - 예외는 잡아서 그 이펙트만 제거 + `failed` 카운트.
- `actorFor(species, image | null) => actor` (fxActor.js): 이미지가 있으면 Idle 첫 프레임 정면에서 mask·pixels, 없으면 지름 16×20 타원. 종족+로드 여부로 캐시.

- [ ] **Step 1: tests** — spawn → update(2초) → count 0; follow 는 unfollow 전까지 유지, unfollow 후 페이드 뒤 0; delay 0.08 은 그 전엔 그리지 않음; timeScale 2 면 절반 시간에 끝; **(RF4)** cam 이 이펙트를 화면 밖으로 밀어도 draw 예외 없음; 깨진 spec(id 없음) spawn → 예외 없이 failed 1; **(RF1)** actorFor(species, null) 타원 actor 형태(mask.data 길이 = w*h), 같은 인자 두 번이면 같은 객체; 성능: follow 10개(상태 6종 섞어) + spawn 1개, 60프레임 평균 update+draw(frame) < 4ms
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: pixelfx effect manager and unit actors`

---

### Task 4: 공격·피격·변화기·상태이상 걸림 연출 연결

**Files:** Modify `src/render/mapAttack.js`, `src/game/states.js`(관리자 생성·그리기 순서·`update`), `src/main.js`(필요 시 makeCanvas 주입) · Test `tests/game.test.js`

**Interfaces:** `createMapAttack({ …, fx })` — 단계 시작 시: act → `cast`; travel → `travel`(빔은 끝 칸 클립); impact → 대상마다 `hit`(급소 crit-hit 추가, 효과 굉장 light 1.5 + 0.08초 뒤 한 번 더); stage → 대상마다 `fxForStage`; status pop → `fxForAilment().inflict`; selffaint/자폭 impact → `selfKO` + 화면 흔들림(±2px, 0.4초, `anim.shake` 값을 states 가 카메라에 더함). 자폭·대폭발 impact 단계 1.2초. 이펙트 실패 시 기존 그림(점·탄) 그대로. 단계마다 spawn 은 한 번만.

- [ ] **Step 1: tests** — 몸통박치기 연출 중 관리자에 hit-spark 1개 spawn; 지진 대상 3 → hit 3개 + cast 1개; **(RF5)** 연출 중 confirm 연타해도 같은 단계 이펙트가 두 번 생기지 않음(spawn 총수 확인); 칼춤 → 상승 이펙트 1; 자폭 → selfKO 이펙트 + shake > 0 순간 존재; 관리자 spawn 이 예외를 던지게 만들어도 연출이 끝나 idle 로 돌아옴
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat: attack, hit, stage and ailment effects`

---

### Task 5: 상태이상 지속 표시

**Files:** Modify `src/game/states.js` · Test `tests/game.test.js`

**Interfaces:** 매 update 끝에 `fx.sync(wanted)` — wanted = 살아 있는 유닛마다 `${unitId}:${status}`, `${unitId}:confusion` → `fxForAilment(...).loop`, 위치는 `unitWorld(u)` 발밑(걷는 중 따라감), actor 는 `actorFor(species, 이미지)`. 맹독은 poisoned light 1.5. 화상 지속은 light 0.5. reset() 에서 `fx.clear()`.

- [ ] **Step 1: tests** — 유닛에 화상 → 다음 update 후 follow 1; 풀리면 0(페이드 후); 혼란+마비 → 2; **(RF3)** 지속 표시 중인 유닛이 기절해 사라지면 다음 update 에 제거, 예외 없음; **(RF2)** 새 전투(createGame 다시) → count 0
- [ ] **Step 2: Run** → FAIL · **Step 3: Implement** · **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Verify** 브라우저: 기술 6종 + 자폭 + 칼춤/울음소리 + 상태이상 6종 (창이 숨겨져 있으면 오프스크린 캔버스에 그려 PNG 로 저장 → 이미지 확인). 너무 크거나 어색한 이펙트는 스펙 §7 재량으로 교체하고 ledger 기록. 저장 데이터 백업·복원.
- [ ] **Step 6: Commit** `feat: lingering status effects`

---

### Task 6: 문서

**Files:** Modify `README.md`(이펙트: pixelfx MIT 크레딧, `tools/vendor-pixelfx.js` 사용법), `docs/ROADMAP.md`
- [ ] **Step 1:** 작성 · **Step 2:** `npm test` → PASS · **Step 3: Commit** `docs: move effects`

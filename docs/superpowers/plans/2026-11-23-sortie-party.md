# 출격 게시판 · 편성소 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native).

**Goal:** 출전 확인창 + 주 타입 배지, 기술 다시 떠올리기, 메타몽 캡슐 설명 미리보기.
**Spec:** `docs/superpowers/specs/2026-11-23-sortie-party-design.md`

## Review Focus
1. 같은 종 두 마리(uid)·메타몽·출전 0~최대 수일 때 확인창.
2. 이력 없는 옛 저장 멤버의 떠올리기 후보.
3. 진화 직후(습득표가 바뀜) 진화 전 기술이 이력으로 남는지.
4. 설명 단계·칸 고르기에서 취소하면 아무것도 안 바뀜 (기술·캡슐).
5. 진행 중 탐험 + 새 출전: 확정할 때만 포기.

### Task 1: 기술 이력·후보 (`core/relearn.js`, progress) — tests/relearn.test.js
- `remember(member, move)`, `relearnCandidates(member) → string[]`, `relearn(member, move, slot|null) → {ok, reason?}`. progress 의 newMember·learnEvents·resolveChoice 가 remember.
### Task 2: 출격 게시판 (`dungeonSelect.js`, desert `shownTypes`) — tests/sortieBoard.test.js
- `mainTypes(d)`, 확인창 상태(`confirm = { id, cursor }` → 멤버 표시), 문구.
### Task 3: 기술 떠올리기 화면 (`game/relearn.js`, box 메뉴, summary 의 기술 설명 공용화 `drawMoveInfo`) — scene 테스트
### Task 4: 메타몽 캡슐 설명 (`dittoBuild.js`) — 테스트: 설명 단계 취소 시 캡슐 그대로
### Task 5: 브라우저 2~3회, 문서, 전체 테스트, 리뷰

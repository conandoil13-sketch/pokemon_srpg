// 임시 스테이지 (난이도 곡선만, 기믹 없음): 신오 동굴 뒤에 8개. 들판·동굴 번갈아.
// 진짜 새 맵을 만들면 REPLACED 에 { 번호: 던전 } 으로 넣어 그 자리를 대체한다 (해금 사슬은 순서대로 다시 이어짐).
// 스펙 docs/superpowers/specs/2026-11-17-filler-stages-design.md
import { SINNOH_DUNGEONS } from './sinnohDungeons.js';
import { mapSizeFor } from './mapSize.js';

export const FILLER_COUNT = 8;
export const REPLACED = {}; // 예: { 1: myNewDungeon }

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];
const TEMPLATE = { field: SINNOH_DUNGEONS.find((d) => d.theme === 'field'), cave: SINNOH_DUNGEONS.find((d) => d.theme === 'cave') };
const FLOORS = (n) => (n <= 2 ? 7 : n <= 5 ? 8 : 9);
const START = (n) => 23 + 7 * (n - 1); // 시작 레벨 (단계마다 +7)
const SPAN = 5; // 한 단계 안의 레벨 폭
const BUDGET_PER_LEVEL = 9, BUDGET_STEP = 0.02; // 위협도 예산 ≈ 레벨 × 9 (신오 동굴 끝 층과 비슷한 비율), 층마다 +2%

// n 번째 임시 단계 (1..8). unlock 은 stageSlots 가 순서대로 채운다
export function fillerStage(n) {
  const theme = n % 2 === 1 ? 'field' : 'cave', t = TEMPLATE[theme], floors = FLOORS(n), s = START(n);
  const lv = Array.from({ length: floors }, (_, f) => s + (SPAN * f) / (floors - 1)); // 층별 연속 레벨
  const third = Math.ceil(floors / 3);
  return {
    id: `trial-${n}`,
    name: `시련의 ${theme === 'field' ? '들판' : '동굴'} ${ROMAN[Math.ceil(n / 2) - 1]}`,
    floors,
    unlock: null,
    theme,
    baseLevel: lv.map((l) => Math.round(l)),
    budget: lv.map((l, f) => Math.round(BUDGET_PER_LEVEL * l * (1 + BUDGET_STEP * f))), // 층마다 2% 더 (같은 레벨 층에서도 적이 세지게)
    levelCap: Math.round(lv[floors - 1]) + 3,
    early: [], // 초반 종(캐터피·주뱃 등) 없이 1층부터 타입·종족값 규칙대로 (Lv 23+ 에 첫 풀숲 벌레가 나오지 않게)
    types: t.types,
    bstCap: Math.min(670, 470 + 25 * n),
    stageCap: (f) => (f <= third ? 0 : f <= floors - 2 ? 1 : 2), // 마지막 두 층은 최종 진화까지
    fallback: t.fallback,
    boss: { levelBonus: 3 },
    clusters: t.clusters,
    weather: t.weather,
    size: mapSizeFor(s), // 후반 단계는 맵이 넓음
    filler: true, // 임시 단계 표시 (나중에 진짜 맵으로 대체)
  };
}

// 분기 해금 (스펙 docs/superpowers/specs/2026-11-22-branch-stages-design.md): 앞 단계 맵 id 들 → 이번 단계 k 개 맵 각각의 해금 목록(하나라도 돌파하면 열림)
// 1 → 여러 개: 다 열림 · 여러 개 → 1: 아무거나 · 같은 수: 순서대로 짝 · 적은 수 → 많은 수: 첫 맵은 공통(아무거나), 나머지는 순서대로 짝 · 많은 수 → 적은 수: 짝, 남는 앞 맵은 마지막에
export function branchUnlocks(prev, k) {
  if (prev.length === 1 || k === 1) return Array.from({ length: k }, () => [...prev]);
  if (prev.length === k) return prev.map((id) => [id]);
  if (prev.length < k) return Array.from({ length: k }, (_, i) => (i === 0 || i > prev.length ? [...prev] : [prev[i - 1]]));
  return Array.from({ length: k }, (_, i) => (i === k - 1 ? prev.slice(i) : [prev[i]]));
}

// d 가 cleared(돌파한 던전 id 들)로 열렸나. unlock: null(처음부터) · 'id' · ['id', …](하나라도)
export function unlockedBy(d, cleared) {
  if (!d.unlock) return false;
  return Array.isArray(d.unlock) ? d.unlock.some((id) => cleared.includes(id)) : cleared.includes(d.unlock);
}

// 신오 뒤에 붙는 8개 자리(6~10단계 포함 3~10단계): 임시 단계 또는 진짜 맵(배열이면 분기). 진짜 맵이 하나라도 있으면 그 자리 임시 단계는 빠짐
export function stageSlots(replaced = REPLACED) {
  let prev = [SINNOH_DUNGEONS[SINNOH_DUNGEONS.length - 1].id];
  const out = [];
  for (let i = 0; i < FILLER_COUNT; i++) {
    const n = i + 1, r = replaced[n], group = r ? (Array.isArray(r) ? r : [r]) : [fillerStage(n)];
    const unlocks = branchUnlocks(prev, group.length);
    group.forEach((d, j) => out.push({ ...d, stage: n + 2, ...(group.length > 1 ? { branch: j + 1 } : {}), unlock: unlocks[j].length === 1 ? unlocks[j][0] : unlocks[j] }));
    prev = group.map((d) => d.id);
  }
  return out;
}

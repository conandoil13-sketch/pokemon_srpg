// 맵 크기 (의존 없음 — 층 생성기와 던전 표가 같이 씀)
export const DEFAULT_SIZE = [16, 12]; // 던전에 size 가 없으면
// 시작 레벨로 맵 크기: 40 미만 16×12 · 40~59 18×13 · 60 이상 20×14 (2026-11-18)
export const mapSizeFor = (startLevel) => (startLevel < 40 ? [16, 12] : startLevel < 60 ? [18, 13] : [20, 14]);

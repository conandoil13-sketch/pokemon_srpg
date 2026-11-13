// 밸런스 값 (숫자만 바꿔서 조정)
export const BALANCE = {
  startLevel: 8,          // 아군 시작 레벨
  // 전투 HP 배율: 레벨이 올라도 한 방 데미지 비율이 일정하도록 (시뮬레이션: 보통 ~15%, 효과 굉장 ~30%)
  hpScale: (level) => Math.round((1.4 + level / 100) * 1000) / 1000,
  expMultiplier: 2,       // 경험치 배율
  shareRatio: 0.5,        // KO 순간 살아 있는 다른 아군이 받는 비율
  secondStageMinGap: 8,   // 3단 계열 2차 대체 레벨 ≥ 1차 레벨 + 이 값
  // 친밀도·교환·기타 진화를 레벨 진화로 바꿀 때의 레벨
  evoMatrix: {
    two: { friendship: 20, trade: 30, other: 25 },     // 2단 계열
    three1: { friendship: 16, trade: 20, other: 18 },  // 3단 계열 1차
    three2: { friendship: 32, trade: 36, other: 34 },  // 3단 계열 2차
  },
};

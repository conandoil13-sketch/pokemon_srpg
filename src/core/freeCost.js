// 비용 계산: 슈퍼계정(game.superActive)이면 0. 의존성 없음 (어느 모듈에서나 import)
export const free = (game, cost) => (game?.superActive ? 0 : cost);

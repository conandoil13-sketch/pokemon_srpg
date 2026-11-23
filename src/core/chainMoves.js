// 이어 쓰는 기술 (순수, 5세대 · codex-reviews/2026-11-20-gen5-moves-abilities.md)
// 돌림노래: 같은 페이즈에 우리 편이 먼저 썼으면 120
// 에코보이스: 양 진영 공유. 라운드(state.turn)가 이어질 때마다 +40 (최대 200), 한 라운드에 여러 번 써도 한 번만, 한 라운드 쉬면 40
// 크로스플레임·크로스썬더: 바로 앞 공격이 다른 쪽 크로스 기술로 적중했으면 200
const FUSION = { 'fusion-flare': 'fusion-bolt', 'fusion-bolt': 'fusion-flare' };
const phaseKey = (state) => `${state.turn}:${state.phase}`;
const echoStep = (state) => {
  const e = state.echo;
  return !e ? 1 : e.turn === state.turn ? e.n : e.turn === state.turn - 1 ? e.n + 1 : 1;
};

export function chainPower(state, a, move) {
  if (move.id === 'round') return state.roundUsed?.side === a.side && state.roundUsed.phase === phaseKey(state) ? 120 : move.power;
  if (move.id === 'echoed-voice') return Math.min(200, 40 * echoStep(state));
  if (FUSION[move.id]) return state.lastLanded === FUSION[move.id] ? 200 : move.power;
  return move.power;
}

// 기술을 쓴 뒤 기록 (변화기·막힌 기술도 크로스 연계는 끊음)
export function noteChain(state, a, move, landed) {
  if (move.id === 'round') state.roundUsed = { side: a.side, phase: phaseKey(state) };
  if (move.id === 'echoed-voice') state.echo = { turn: state.turn, n: echoStep(state) };
  state.lastLanded = landed ? move.id : null;
}

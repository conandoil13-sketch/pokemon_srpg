// 2칸 특성 등급 슬롯 (릴 1개) 순수 타임라인. 결과는 미리 정해져 있고, 릴은 그 등급에 멈출 뿐이다.
// 릴: 살짝 위로 튕김 → 빠르게 굴러감 → (S·낚시면) "고급 슬롯!" 으로 S 칸 추가 → 감속해 결과 칸에 정확히 멈춤 → 튕김
// 낚시: S 칸에서 멈칫했다가 한두 칸 더 미끄러져 A/B 로. 가운데 줄 칸은 pos 가 커지는 순서로 S → A → B → C → S …
export const BASE_RING = ['A', 'B', 'C'];
export const HIGH_RING = ['S', 'A', 'B', 'C'];
const SPEED = 18; // 빠를 때 칸/초
const KICK = 0.12, KICK_DIP = 0.3; // 시작 때 위로 튕김
const UPGRADE_AT = 0.8, UPGRADE_HOLD = 0.6;
const DECEL_PLAIN = 0.9, DECEL_HIGH = 1.4; // 감속 시작
const MIN_DECEL = { plain: 1.0, high: 0.8, tease: 0.65 }; // 최소 감속 시간(초)
const TEASE_HOLD = 0.45, NUDGE_PER_CELL = 0.25; // 낚시 멈칫 · 한 칸 미끄러지는 시간
const BOUNCE = 0.3, BOUNCE_AMP = 0.18;
const REVEAL_AFTER = 0.45, END_AFTER = 0.5;

const mod = (a, n) => ((a % n) + n) % n;
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

export function reelTimeline({ tier, tease = false }) {
  const upgrade = tier === 'S' || !!tease;
  const ring = upgrade ? HIGH_RING : BASE_RING;
  const td = upgrade ? DECEL_HIGH : DECEL_PLAIN;
  const p0 = SPEED * (td - KICK);
  const first = tease ? 'S' : tier; // 감속해서 처음 멈추는 칸
  const minD = (SPEED * MIN_DECEL[tease ? 'tease' : upgrade ? 'high' : 'plain']) / 2;
  let P = Math.ceil(p0 + minD);
  while (ring[mod(P, ring.length)] !== first) P++;
  const T = (2 * (P - p0)) / SPEED;
  const t1 = td + T;
  let cells = 0, stopT = t1;
  if (tease) {
    while (ring[mod(P + cells, ring.length)] !== tier) cells++;
    stopT = t1 + TEASE_HOLD + cells * NUDGE_PER_CELL;
  }
  const steps = [
    { t: 0, kind: 'spin' },
    ...(upgrade ? [{ t: UPGRADE_AT, kind: 'upgrade' }] : []),
    ...(tease ? [{ t: t1 + 0.001, kind: 'tease' }] : []),
    { t: stopT + 0.001, kind: 'stop' },
    { t: stopT + REVEAL_AFTER, kind: 'reveal' },
  ];
  const end = stopT + REVEAL_AFTER + END_AFTER;
  return { upgrade, stopTier: tier, steps, end, _: { ring, td, p0, P, T, t1, cells, stopT } };
}

// t 초의 릴: { ring, pos(가운데 줄 칸, 실수), speed(칸/초), symbol, phase, since }
export function reelAt(tl, t) {
  const { td, p0, P, T, t1, cells, stopT } = tl._;
  const ring = tl.upgrade && t >= UPGRADE_AT ? HIGH_RING : BASE_RING;
  let pos, speed;
  if (t < KICK) { pos = -KICK_DIP * Math.sin((Math.PI * t) / KICK); speed = 0; }
  else if (t < td) { pos = SPEED * (t - KICK); speed = SPEED; }
  else if (t < t1) { const d = t - td; pos = p0 + SPEED * d - (SPEED * d * d) / (2 * T); speed = SPEED * (1 - d / T); }
  else if (t < t1 + (cells ? TEASE_HOLD : 0)) { pos = P; speed = 0; }
  else if (t < stopT) { const dur = stopT - (t1 + TEASE_HOLD), u = (t - (t1 + TEASE_HOLD)) / dur; pos = P + cells * easeInOut(u); speed = cells / dur; }
  else {
    const u = Math.min(1, (t - stopT) / BOUNCE);
    pos = P + cells + BOUNCE_AMP * Math.sin(2 * Math.PI * u) * (1 - u); speed = 0;
  }
  const step = [...tl.steps].reverse().find((s) => s.t <= t) ?? tl.steps[0];
  let phase = step.kind;
  if (phase === 'upgrade' && t >= step.t + UPGRADE_HOLD) phase = 'spin';
  return { ring, pos, speed, symbol: ring[mod(Math.round(pos), ring.length)], phase, since: t - step.t };
}
export const REEL_UPGRADE_HOLD = UPGRADE_HOLD;

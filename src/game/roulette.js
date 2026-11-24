// 2칸 특성 등급 룰렛 연출 (순수 타임라인). 결과는 미리 정해져 있고, 연출은 그 등급에 멈출 뿐이다.
// 기본 룰렛 C·B·A → (S 이거나 낚시면) 중간에 "고급 룰렛!" 업그레이드로 S 칸 추가 → 결과 칸에 멈춤 → 등급이 걷히며 특성 공개
export const BASE_RING = ['C', 'B', 'A'];
export const HIGH_RING = ['C', 'B', 'A', 'S'];
const FAST = 0.05; // 빠르게 돌 때 칸 간격(초)
const UPGRADE_AT = 0.9, UPGRADE_HOLD = 0.6; // 업그레이드 번쩍임 시간
const PLAIN_STOP = 1.7, HIGH_STOP = 2.9; // 멈추는 대략의 시각
const REVEAL_AFTER = 0.5;

// from 부터 slowStop 근처까지 점점 느려지는 칸 시각들
function slowingTicks(from, until) {
  const out = [];
  for (let t = from, dt = FAST; t <= until; t += dt, dt *= 1.13) out.push(t);
  return out;
}
// 시각들에 칸 번호를 붙여, 마지막 칸이 target 이 되게
const landOn = (times, ring, target, ringName) => {
  const goal = ring.indexOf(target), n = times.length, start = (((goal - (n - 1)) % ring.length) + ring.length) % ring.length;
  return times.map((t, k) => ({ t, ring: ringName, index: (start + k) % ring.length }));
};

export function rouletteTimeline({ tier, tease = false }) {
  const upgrade = tier === 'S' || !!tease;
  let ticks, stopT;
  if (!upgrade) {
    const times = slowingTicks(0, PLAIN_STOP);
    ticks = landOn(times, BASE_RING, tier, 'base');
    stopT = times.at(-1);
  } else {
    const fast = [];
    for (let t = 0; t < UPGRADE_AT; t += FAST) fast.push({ t, ring: 'base', index: fast.length % BASE_RING.length });
    const times = slowingTicks(UPGRADE_AT + UPGRADE_HOLD, HIGH_STOP);
    ticks = [...fast, ...landOn(times, HIGH_RING, tier, 'high')];
    stopT = times.at(-1);
  }
  const ringOf = (name) => (name === 'high' ? HIGH_RING : BASE_RING);
  const endRing = upgrade ? HIGH_RING : BASE_RING;
  const steps = [
    { t: 0, kind: 'spin', ring: BASE_RING },
    ...(upgrade ? [{ t: UPGRADE_AT, kind: 'upgrade', ring: HIGH_RING }] : []),
    { t: stopT + 0.001, kind: 'stop', ring: endRing },
    { t: stopT + REVEAL_AFTER, kind: 'reveal', ring: endRing },
  ];
  return { upgrade, stopTier: tier, steps, ticks: ticks.map((k) => ({ ...k, ring: ringOf(k.ring) })) };
}

// t 초에 보이는 룰렛: { ring, index(빛나는 칸), phase: 'spin'|'upgrade'|'stop'|'reveal', since(그 단계 시작부터 초) }
export function rouletteAt(tl, t) {
  const step = [...tl.steps].reverse().find((s) => s.t <= t) ?? tl.steps[0];
  let phase = step.kind;
  if (phase === 'upgrade' && t >= step.t + UPGRADE_HOLD) phase = 'spin';
  const tick = [...tl.ticks].reverse().find((k) => k.t <= t) ?? tl.ticks[0];
  const ring = phase === 'upgrade' ? HIGH_RING : tick.ring;
  return { ring, index: phase === 'upgrade' ? -1 : tick.index, phase, since: t - step.t };
}
export const ROULETTE_UPGRADE_HOLD = UPGRADE_HOLD;

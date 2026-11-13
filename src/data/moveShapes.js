// 공격기 범위 모양 규칙 (스펙 §3). 예외는 moveShapes.json (2단계 조정 페이지가 고친다)
export const BEAM = ['hydro-pump', 'hyper-beam', 'solar-beam', 'ice-beam', 'aurora-beam', 'psybeam', 'bubble-beam', 'signal-beam', 'charge-beam', 'flamethrower', 'thunderbolt', 'flash-cannon'];
export const BLAST = ['fire-blast', 'sludge-bomb', 'seed-bomb', 'egg-bomb', 'mud-bomb', 'focus-blast'];
export const SHOT = ['shadow-ball', 'aura-sphere', 'psychic', 'energy-ball', 'dark-pulse', 'earth-power', 'air-slash', 'extrasensory'];

// raw: 생성 데이터 기술, overrides: { [id]: { type, range?, length?, radius?, friendlyFire? } }
export function shapeFor(raw, overrides = {}) {
  const friendly = raw.target === 'all-other-pokemon';
  const o = overrides[raw.api];
  if (o) {
    const { friendlyFire, ...shape } = o;
    return { shape, friendlyFire: friendlyFire ?? friendly };
  }
  if (friendly) return { shape: { type: 'around', radius: 1 }, friendlyFire: true };
  if (raw.target === 'all-opponents') return { shape: { type: 'cone' }, friendlyFire: false };
  if (BEAM.includes(raw.api)) return { shape: { type: 'line', length: 3 }, friendlyFire: false };
  if (BLAST.includes(raw.api)) return { shape: { type: 'blast', range: [2, 3] }, friendlyFire: false };
  if (SHOT.includes(raw.api)) return { shape: { type: 'single', range: [2, 3] }, friendlyFire: false };
  return { shape: { type: 'single', range: raw.category === 'physical' ? [1, 1] : [1, 2] }, friendlyFire: false };
}

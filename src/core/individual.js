// 개체 차이 (순수): 개체값 · 성별 · 몸무게
import { SPECIES } from '../data/species.js';

// 안다리걸기·풀묶기: 상대 몸무게(kg)로 위력 (4세대)
export function weightPower(kg) {
  return kg < 10 ? 20 : kg < 25 ? 40 : kg < 50 ? 60 : kg < 100 ? 80 : kg < 200 ? 100 : 120;
}
export const weightOf = (unit) => unit.weight ?? SPECIES[unit.species]?.weight ?? 50;

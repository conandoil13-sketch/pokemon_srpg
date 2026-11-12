import { TYPES } from './types.js';
import { MOVES } from './moves.js';

// key dex types 종족값(hp-atk-def-spa-spd-spe) 이동력 moves
const RAW = `
infernape|392|Infernape|fire,fighting|76-104-71-104-71-108|5|flamethrower,closecombat,machpunch
empoleon|395|Empoleon|water,steel|84-86-88-111-101-60|4|surf,flashcannon,drillpeck
torterra|389|Torterra|grass,ground|95-109-105-75-85-56|3|woodhammer,earthquake,razorleaf
luxray|405|Luxray|electric|80-120-79-95-79-70|5|thunderbolt,crunch,spark
lucario|448|Lucario|fighting,steel|70-110-70-115-70-90|5|aurasphere,flashcannon,closecombat
garchomp|445|Garchomp|dragon,ground|108-130-95-80-85-102|5|earthquake,dragonclaw,crunch
honchkrow|430|Honchkrow|dark,flying|100-125-52-105-52-71|6|nightslash,drillpeck,darkpulse
roserade|407|Roserade|grass,poison|60-70-65-125-105-90|4|energyball,sludgebomb,shadowball
bronzong|437|Bronzong|steel,psychic|67-89-116-79-116-33|3|flashcannon,psychic,earthquake
`;

// 레벨 50, IV31/EV0 근사: HP = 종족값+75, 그 외 = 종족값+20
function realStats([hp, atk, def, spa, spd, spe]) {
  return { hp: hp + 75, atk: atk + 20, def: def + 20, spa: spa + 20, spd: spd + 20, spe: spe + 20 };
}

export const SPECIES = Object.fromEntries(
  RAW.trim().split('\n').map((line) => {
    const [key, dex, name, types, base, move, moves] = line.split('|');
    return [key, {
      key, dex: +dex, name,
      types: types.split(','),
      stats: realStats(base.split('-').map(Number)),
      move: +move,
      moves: moves.split(','),
    }];
  }),
);

export function validateData() {
  for (const s of Object.values(SPECIES)) {
    for (const t of s.types) if (!TYPES.includes(t)) throw new Error(`${s.key}: unknown type ${t}`);
    for (const m of s.moves) if (!MOVES[m]) throw new Error(`${s.key}: unknown move ${m}`);
  }
  for (const m of Object.values(MOVES)) {
    if (!TYPES.includes(m.type)) throw new Error(`${m.id}: unknown type ${m.type}`);
  }
}

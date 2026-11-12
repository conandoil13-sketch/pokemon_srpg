// 18타입 상성표 (6세대 이후 기준)

export const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

export const TYPE_COLORS = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', electric: '#f8d030',
  grass: '#78c850', ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0',
  ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', dark: '#705848',
  steel: '#b8b8d0', fairy: '#ee99ac',
};

// 공격 타입 → { 2배: [...], 0.5배: [...], 0배: [...] }
const CHART = {
  normal:   { s: [], h: ['rock', 'steel'], z: ['ghost'] },
  fire:     { s: ['grass', 'ice', 'bug', 'steel'], h: ['fire', 'water', 'rock', 'dragon'], z: [] },
  water:    { s: ['fire', 'ground', 'rock'], h: ['water', 'grass', 'dragon'], z: [] },
  electric: { s: ['water', 'flying'], h: ['electric', 'grass', 'dragon'], z: ['ground'] },
  grass:    { s: ['water', 'ground', 'rock'], h: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'], z: [] },
  ice:      { s: ['grass', 'ground', 'flying', 'dragon'], h: ['fire', 'water', 'ice', 'steel'], z: [] },
  fighting: { s: ['normal', 'ice', 'rock', 'dark', 'steel'], h: ['poison', 'flying', 'psychic', 'bug', 'fairy'], z: ['ghost'] },
  poison:   { s: ['grass', 'fairy'], h: ['poison', 'ground', 'rock', 'ghost'], z: ['steel'] },
  ground:   { s: ['fire', 'electric', 'poison', 'rock', 'steel'], h: ['grass', 'bug'], z: ['flying'] },
  flying:   { s: ['grass', 'fighting', 'bug'], h: ['electric', 'rock', 'steel'], z: [] },
  psychic:  { s: ['fighting', 'poison'], h: ['psychic', 'steel'], z: ['dark'] },
  bug:      { s: ['grass', 'psychic', 'dark'], h: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'], z: [] },
  rock:     { s: ['fire', 'ice', 'flying', 'bug'], h: ['fighting', 'ground', 'steel'], z: [] },
  ghost:    { s: ['psychic', 'ghost'], h: ['dark'], z: ['normal'] },
  dragon:   { s: ['dragon'], h: ['steel'], z: ['fairy'] },
  dark:     { s: ['psychic', 'ghost'], h: ['fighting', 'dark', 'fairy'], z: [] },
  steel:    { s: ['ice', 'rock', 'fairy'], h: ['fire', 'water', 'electric', 'steel'], z: [] },
  fairy:    { s: ['fighting', 'dragon', 'dark'], h: ['fire', 'poison', 'steel'], z: [] },
};

function single(atk, def) {
  const row = CHART[atk];
  if (row.z.includes(def)) return 0;
  if (row.s.includes(def)) return 2;
  if (row.h.includes(def)) return 0.5;
  return 1;
}

export function typeMultiplier(atkType, defTypes) {
  return defTypes.reduce((m, d) => m * single(atkType, d), 1);
}

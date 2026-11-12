// 저장 / 불러오기 (순수 + 주입한 storage). storage = { getItem(key), setItem(key, value) }
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { expForLevel, MAX_LEVEL } from './stats.js';
import { startingMoves } from './learn.js';
import { newParty } from './progress.js';

export const SAVE_KEY = 'pokemon-tactics-save';
const VERSION = 1;
let warned = false;
const warn = (msg) => { if (!warned) { warned = true; console.warn(`[save] ${msg}`); } };

// GameState = { version, party: Member[], cleared: string[], items: { evoStone } }
export const newGame = () => ({ version: VERSION, party: newParty(), cleared: [], items: { evoStone: 0 } });

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(v) || 0)));

function cleanMember(m) {
  const s = SPECIES[m?.species];
  if (!s) return null;
  const level = clampInt(m.level, 1, MAX_LEVEL);
  const lo = expForLevel(s.growth, level);
  const hi = level >= MAX_LEVEL ? lo : expForLevel(s.growth, level + 1) - 1;
  let moves = (Array.isArray(m.moves) ? m.moves : []).filter((mv) => MOVES[mv]?.learnable || mv === 'tackle');
  moves = [...new Set(moves)].slice(0, 4);
  if (!moves.length) moves = startingMoves(s.learnset, level, MOVES);
  return { species: m.species, level, exp: clampInt(m.exp, lo, hi), moves };
}

export function loadGame(storage) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (e) {
    warn(`read failed: ${e.message}`);
    return null;
  }
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    warn('corrupted save ignored');
    return null;
  }
  if (data?.version !== VERSION) { warn('save version mismatch ignored'); return null; }
  const party = (Array.isArray(data.party) ? data.party : []).map(cleanMember).filter(Boolean);
  if (!party.length) return null;
  return {
    version: VERSION,
    party,
    cleared: (Array.isArray(data.cleared) ? data.cleared : []).filter((x) => typeof x === 'string'),
    items: { evoStone: clampInt(data.items?.evoStone, 0, 999) },
  };
}

export function saveGame(storage, game) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(game));
    return true;
  } catch (e) {
    warn(`write failed: ${e.message}`);
    return false;
  }
}

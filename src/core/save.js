// 저장 / 불러오기 (순수 + 주입한 storage). storage = { getItem(key), setItem(key, value) }
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { expForLevel, MAX_LEVEL } from './stats.js';
import { startingMoves } from './learn.js';
import { newParty, newMember } from './progress.js';
import { DUNGEONS, dungeonById } from '../data/dungeons.js';

export const SAVE_KEY = 'pokemon-tactics-save';
const VERSION = 3;
const FIRST_DUNGEON = DUNGEONS[0].id;
let warned = false;
const warn = (msg) => { if (!warned) { warned = true; console.warn(`[save] ${msg}`); } };

// GameState = { version, party, items: { evoStone }, unlocked: string[], best: { [dungeonId]: floor }, cleared: string[], run: Run|null }
export const newGame = () => ({ version: VERSION, party: newParty(), items: { evoStone: 0 }, unlocked: [FIRST_DUNGEON], best: {}, cleared: [], run: null });

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(v) || 0)));

const own = (obj, k) => typeof k === 'string' && Object.hasOwn(obj, k);

function cleanMember(m) {
  if (!m || typeof m !== 'object' || !own(SPECIES, m.species)) return null;
  const s = SPECIES[m.species];
  const level = clampInt(m.level, 1, MAX_LEVEL);
  const lo = expForLevel(s.growth, level);
  const hi = level >= MAX_LEVEL ? lo : expForLevel(s.growth, level + 1) - 1;
  let moves = (Array.isArray(m.moves) ? m.moves : []).filter((mv) => own(MOVES, mv) && (MOVES[mv].learnable || mv === 'tackle'));
  moves = [...new Set(moves)].slice(0, 4);
  if (!moves.length) moves = startingMoves(s.learnset, level, MOVES);
  return { species: m.species, level, exp: clampInt(m.exp, lo, hi), moves };
}

const isDungeon = (id) => typeof id === 'string' && DUNGEONS.some((d) => d.id === id);
const dungeonIds = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter(isDungeon))];

function cleanRun(r) {
  if (!r || typeof r !== 'object' || !isDungeon(r.dungeonId)) return null;
  const d = dungeonById(r.dungeonId);
  if (!Number.isInteger(r.floor) || r.floor < 1 || r.floor > d.floors || !Number.isInteger(r.seed)) return null;
  return {
    dungeonId: r.dungeonId,
    floor: r.floor,
    seed: r.seed >>> 0,
    faintedLast: (Array.isArray(r.faintedLast) ? r.faintedLast : []).filter((sp) => own(SPECIES, sp)),
    loot: {
      evoStone: clampInt(r.loot?.evoStone, 0, 99),
      candy: (Array.isArray(r.loot?.candy) ? r.loot.candy : []).map((f) => clampInt(f, 1, d.floors)),
    },
  };
}

// 메타몽(주인공)은 항상 파티 맨 앞에 정확히 하나
export function ensureDitto(party) {
  const ditto = party.find((m) => m.species === 'ditto') ?? newMember('ditto');
  return [ditto, ...party.filter((m) => m.species !== 'ditto')];
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
  if (data?.version === 1) data = { ...data, version: 2, cleared: [], unlocked: [], best: {}, run: null }; // v1 → v2: 고정 스테이지 기록은 버림
  if (data?.version === 2) data = { ...data, version: 3 }; // v2 → v3: 메타몽은 아래 ensureDitto 가 넣는다
  if (data?.version !== VERSION) { warn('save version mismatch ignored'); return null; }
  try {
    const cleaned = (Array.isArray(data.party) ? data.party : []).map(cleanMember).filter(Boolean);
    if (!cleaned.length) return null;
    const party = ensureDitto(cleaned);
    return {
      version: VERSION,
      party,
      items: { evoStone: clampInt(data.items?.evoStone, 0, 999) },
      unlocked: [...new Set([FIRST_DUNGEON, ...dungeonIds(data.unlocked)])],
      best: Object.fromEntries(Object.entries(data.best && typeof data.best === 'object' ? data.best : {})
        .filter(([id]) => isDungeon(id)).map(([id, f]) => [id, clampInt(f, 0, dungeonById(id).floors)])),
      cleared: dungeonIds(data.cleared),
      run: cleanRun(data.run),
    };
  } catch (e) {
    warn(`invalid save ignored: ${e.message}`); // 어떤 이상한 형태든 부팅을 막지 않는다
    return null;
  }
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

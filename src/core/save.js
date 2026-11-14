// 저장 / 불러오기 (순수 + 주입한 storage). storage = { getItem(key), setItem(key, value) }
import { IV_KEYS, IV_MAX, maxIvs, hashIvs, hashGender, genderFits } from './individual.js';
import { cleanBuild, cleanCapsule, cleanPowders, emptyPowders, CAPSULE_BAG_MAX } from './dittoBuild.js';
import { SPECIES } from '../data/species.js';
import { defaultSlot } from './progress.js';
import { MOVES } from '../data/moves.js';
import { expForLevel, MAX_LEVEL } from './stats.js';
import { startingMoves } from './learn.js';
import { newParty, newMember } from './progress.js';
import { DUNGEONS, dungeonById } from '../data/dungeons.js';

export const SAVE_KEY = 'pokemon-tactics-save';
const VERSION = 8;
const FIRST_DUNGEON = DUNGEONS[0].id;
let warned = false;
const warn = (msg) => { if (!warned) { warned = true; console.warn(`[save] ${msg}`); } };

// GameState = { version, party, items: { evoStone }, unlocked: string[], best: { [dungeonId]: floor }, cleared: string[], run: Run|null }
export const newGame = () => {
  const party = newParty();
  return { version: VERSION, party, items: { evoStone: 0, powders: emptyPowders(), capsules: [] }, unlocked: [FIRST_DUNGEON], best: {}, cleared: [], run: null, coins: 0, shards: {}, sortie: cleanSortie([], party), eggs: {} };
};

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(v) || 0)));

const own = (obj, k) => typeof k === 'string' && Object.hasOwn(obj, k);

// 개체값·성별 정리: 없으면 종 이름으로 고정값, 범위 밖이면 가두기. 메타몽은 31·성별 없음
function cleanIndividual(m) {
  if (m.species === 'ditto') return { ivs: maxIvs(), gender: null, genders: [] };
  const src = m.ivs && typeof m.ivs === 'object' ? m.ivs : hashIvs(m.species);
  const ivs = Object.fromEntries(IV_KEYS.map((k) => [k, clampInt(src[k] ?? 0, 0, IV_MAX)]));
  const gender = genderFits(m.species, m.gender ?? null) ? m.gender ?? null : hashGender(m.species);
  const genders = [...new Set([gender, ...(Array.isArray(m.genders) ? m.genders : [])].filter((g) => g && genderFits(m.species, g)))];
  return { ivs, gender, genders };
}

function cleanMember(m) {
  if (!m || typeof m !== 'object' || !own(SPECIES, m.species)) return null;
  const s = SPECIES[m.species];
  const level = clampInt(m.level, 1, MAX_LEVEL);
  const lo = expForLevel(s.growth, level);
  const hi = level >= MAX_LEVEL ? lo : expForLevel(s.growth, level + 1) - 1;
  let moves = (Array.isArray(m.moves) ? m.moves : []).filter((mv) => own(MOVES, mv) && (MOVES[mv].learnable || mv === 'tackle'));
  moves = [...new Set(moves)].slice(0, 4);
  if (!moves.length) moves = startingMoves(s.learnset, level, MOVES, m.species);
  const slot = Number.isInteger(m.abilitySlot) && m.abilitySlot >= 0 && m.abilitySlot < s.abilities.length ? m.abilitySlot : m.abilitySlot === undefined ? defaultSlot(m.species) : 0;
  const abilityUnlocked = m.abilityUnlocked === true && s.abilities.length > 1; // 잠김 = 지금 슬롯 특성만
  const out = { species: m.species, level, exp: clampInt(m.exp, lo, hi), moves, abilitySlot: slot, abilityUnlocked };
  if (m.species === 'ditto') out.build = cleanBuild(m.build, level); // 메타몽만 빌드
  Object.assign(out, cleanIndividual(m));
  return out;
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
      coins: clampInt(r.loot?.coins, 0, 9999999),
      capsules: (Array.isArray(r.loot?.capsules) ? r.loot.capsules : []).map(cleanCapsule).filter(Boolean).slice(-CAPSULE_BAG_MAX),
      powders: cleanPowders(r.loot?.powders),
    },
  };
}

// 출전 목록: 파티에 있는 종족만, 메타몽 제외, 중복 제거, 최대 4. 비면 파티 앞에서 채운다
export const SORTIE_SIZE = 4;
export function cleanSortie(sortie, party) {
  const inParty = new Set(party.map((m) => m.species));
  const list = [...new Set((Array.isArray(sortie) ? sortie : []).filter((k) => typeof k === 'string' && k !== 'ditto' && inParty.has(k)))].slice(0, SORTIE_SIZE);
  return list.length ? list : party.filter((m) => m.species !== 'ditto').slice(0, SORTIE_SIZE).map((m) => m.species);
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
  if (data?.version === 3) data = { ...data, version: 4, coins: 0, shards: {}, sortie: [] }; // v3 → v4: 출전은 아래에서 파티 앞으로 채움
  if (data?.version === 4) data = { ...data, version: 5 }; // v4 → v5: 특성 슬롯은 cleanMember 가 채운다
  if (data?.version === 5) data = { ...data, version: 6 }; // v5 → v6: 특성 해금(없으면 잠김)은 cleanMember 가 채운다
  if (data?.version === 6) data = { ...data, version: 7 }; // v6 → v7: 메타몽 빌드·가방은 아래 정리에서 기본값
  if (data?.version === 7) data = { ...data, version: 8 }; // v7 → v8: 개체값·성별은 cleanMember 가 채운다
  if (data?.version !== VERSION) { warn('save version mismatch ignored'); return null; }
  try {
    const cleaned = (Array.isArray(data.party) ? data.party : []).map(cleanMember).filter(Boolean);
    if (!cleaned.length) return null;
    const party = ensureDitto(cleaned);
    return {
      version: VERSION,
      party,
      items: {
        evoStone: clampInt(data.items?.evoStone, 0, 999),
        powders: cleanPowders(data.items?.powders),
        capsules: (Array.isArray(data.items?.capsules) ? data.items.capsules : []).map(cleanCapsule).filter(Boolean).slice(-CAPSULE_BAG_MAX),
      },
      unlocked: [...new Set([FIRST_DUNGEON, ...dungeonIds(data.unlocked)])],
      best: Object.fromEntries(Object.entries(data.best && typeof data.best === 'object' ? data.best : {})
        .filter(([id]) => isDungeon(id)).map(([id, f]) => [id, clampInt(f, 0, dungeonById(id).floors)])),
      cleared: dungeonIds(data.cleared),
      run: cleanRun(data.run),
      coins: clampInt(data.coins, 0, 9999999),
      shards: Object.fromEntries(Object.entries(data.shards && typeof data.shards === 'object' ? data.shards : {})
        .filter(([k]) => own(SPECIES, k)).map(([k, n]) => [k, clampInt(n, 0, 9999)]).filter(([, n]) => n > 0)),
      sortie: cleanSortie(data.sortie, party),
      eggs: data.eggs?.turtwig === true ? { turtwig: true } : {}, // 이스터에그 받은 기록
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

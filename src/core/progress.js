// 파티 진행 (순수): 새 파티, 경험치 적용 → 레벨업·기술·진화 이벤트
import { SPECIES } from '../data/species.js';
import { hash } from '../render/pixels.js';
import { DEFAULT_BUILD, effectiveBase } from './dittoBuild.js';
import { rollIvs, hashIvs, maxIvs, rollGender, hashGender, genderFits } from './individual.js';

// 개체값·성별: rng 가 있으면 무작위, 없으면 종 이름으로 고정. 메타몽은 개체값 31·성별 없음
function individualOf(species, rng) {
  if (species === 'ditto') return { ivs: maxIvs(), gender: null, genders: [] };
  const ivs = rng ? rollIvs(rng) : hashIvs(species);
  const gender = rng ? rollGender(species, rng) : hashGender(species);
  return { ivs, gender, genders: gender ? [gender] : [] };
}
import { lineRoot } from './gacha.js';
import { MOVES } from '../data/moves.js';
import { BALANCE } from '../data/balance.js';
import { expForLevel, levelForExp, statsAt, MAX_LEVEL } from './stats.js';
import { startingMoves, movesLearnedBetween, learnOutcome } from './learn.js';
import { levelEvolutionOptions, stoneEvolutionOptions, pickEvolution } from './evolution.js';

export const STARTERS = ['ditto', 'chimchar', 'piplup', 'turtwig', 'shinx']; // 메타몽 = 주인공 (항상 맨 앞)

// Member = { species, level, exp, moves }
// 특성 슬롯: 합류할 때 무작위(rng 가 없으면 종 이름으로 고정). 진화해도 같은 슬롯
export const defaultSlot = (species) => (SPECIES[species].abilities.length > 1 ? hash(species, 'ability') < 0.5 ? 0 : 1 : 0);
export function newMember(species, level = BALANCE.startLevel, rng = null) {
  const s = SPECIES[species];
  const abilitySlot = s.abilities.length > 1 ? (rng ? Math.floor(rng() * s.abilities.length) : defaultSlot(species)) : 0;
  return { species, level, exp: expForLevel(s.growth, level), moves: startingMoves(s.learnset, level, MOVES, species), abilitySlot, abilityUnlocked: false, ...individualOf(species, rng), ...(species === 'ditto' ? { build: DEFAULT_BUILD() } : {}) };
}

// 멤버의 특성 id (진화형에 그 슬롯이 없으면 첫 번째)
export const abilityOf = (m) => { if (m.build) return m.build.ability; const a = SPECIES[m.species].abilities; return a[m.abilitySlot ?? 0] ?? a[0]; }; // 메타몽은 빌드
export const typesOfMember = (m) => m.build?.types ?? SPECIES[m.species].types;

// 특성 해금: 계열 뿌리 결정 3개를 한 번 쓰면 다른 특성이 열리고 바로 바뀐다. 그 뒤 전환은 공짜
export const ABILITY_UNLOCK_COST = 3;
export function unlockAbility(game, species) {
  const m = game.party.find((x) => x.species === species);
  if (!m) return { ok: false, reason: 'missing' };
  if (SPECIES[species].abilities.length < 2) return { ok: false, reason: 'single' };
  if (m.abilityUnlocked) return { ok: false, reason: 'already' };
  const root = lineRoot(species);
  if ((game.shards[root] ?? 0) < ABILITY_UNLOCK_COST) return { ok: false, reason: 'shards' };
  game.shards[root] -= ABILITY_UNLOCK_COST;
  m.abilityUnlocked = true;
  m.abilitySlot = (m.abilitySlot ?? 0) === 0 ? 1 : 0;
  return { ok: true };
}

// 특성 슬롯 고르기: 잠겨 있으면 지금 슬롯만
export function setAbilitySlot(game, species, slot) {
  const m = game.party.find((x) => x.species === species);
  if (!m) return { ok: false, reason: 'missing' };
  if (!Number.isInteger(slot) || slot < 0 || slot >= SPECIES[species].abilities.length) return { ok: false, reason: 'slot' };
  if (slot !== (m.abilitySlot ?? 0) && !m.abilityUnlocked) return { ok: false, reason: 'locked' };
  m.abilitySlot = slot;
  return { ok: true };
}

export const newParty = () => STARTERS.map((sp) => newMember(sp));

// 기술 목록을 멤버에게 적용: 4개 미만이면 바로 배움, 이미 알면 skip, 꽉 차면 choose(UI 가 resolveChoice)
function learnEvents(member, moves) {
  return moves.map((move) => {
    const outcome = learnOutcome(member.moves, move);
    if (outcome === 'known') return { type: 'skip', species: member.species, move };
    if (outcome === 'learn') { member.moves.push(move); return { type: 'learned', species: member.species, move }; }
    return { type: 'choose', species: member.species, move };
  });
}

// expBySpecies: 전투 로그 { [species]: exp }. 파티 순서대로 이벤트를 만든다 (멤버를 직접 갱신)
// cap: 레벨 상한 (던전 돌파로 열림). 상한을 넘는 경험치는 버린다, 이미 넘은 멤버는 그대로
export function applyExp(party, expBySpecies, rng = Math.random, cap = MAX_LEVEL) {
  const events = [];
  for (const m of party) {
    const gain = expBySpecies[m.species];
    if (!gain) continue;
    const s = SPECIES[m.species];
    const ceiling = Math.max(m.exp, expForLevel(s.growth, Math.min(cap, MAX_LEVEL)));
    const capped = cap < MAX_LEVEL && m.exp + gain > ceiling;
    m.exp = Math.min(m.exp + gain, ceiling);
    const cappedEvent = capped ? { type: 'capped', species: m.species, capped: true, cap } : null; // 레벨 상한: 넘친 경험치 버림
    const to = levelForExp(s.growth, m.exp);
    if (to <= m.level) { if (cappedEvent) events.push(cappedEvent); continue; }
    const from = m.level;
    const base = m.build ? effectiveBase(m.build) : s.base; // 메타몽은 빌드 종족값
    events.push({ type: 'level', species: m.species, from, to, before: statsAt(base, from, m.ivs), after: statsAt(base, to, m.ivs) });
    m.level = to;
    events.push(...learnEvents(m, movesLearnedBetween(s.learnset, from, to, MOVES)));
    // 진화: 갈래 1개면 그대로, 원작이 무작위면 rng, 그 외는 플레이어가 고름 (UI 가 options 로 선택 창)
    const pick = pickEvolution(levelEvolutionOptions(s, to, m.gender ?? null), s, rng); // 성별 진화
    if (pick) events.push({ type: 'evolve', species: m.species, options: pick.auto ? [pick.auto] : pick.choose, random: !!pick.auto && levelEvolutionOptions(s, to, m.gender ?? null).length > 1 });
    if (cappedEvent) events.push(cappedEvent);
  }
  return events;
}

// forgetIndex: 잊을 기술 위치, null 이면 배우지 않음
export function resolveChoice(member, move, forgetIndex) {
  if (forgetIndex === null || forgetIndex === undefined) return;
  member.moves[forgetIndex] = move;
}

// 진화: 종족 교체 후 새 종족이 '현재 레벨'에 배우는 기술 처리
export function evolveMember(member, to) {
  member.species = to;
  // 새 종의 성별 비율과 안 맞으면(예: 껍데기몬 — 성별 없음) 고친다
  if (!genderFits(to, member.gender ?? null)) member.gender = hashGender(to);
  member.genders = (member.genders ?? []).filter((g) => genderFits(to, g));
  if (member.gender && !member.genders.includes(member.gender)) member.genders.push(member.gender);
  const s = SPECIES[to];
  const moves = s.learnset.filter(([lv, mv]) => lv === member.level && MOVES[mv]?.learnable).map(([, mv]) => mv);
  return learnEvents(member, moves);
}

export const stoneTargets = (party) => party.filter((m) => stoneEvolutionOptions(SPECIES[m.species], m.gender ?? null).length > 0);

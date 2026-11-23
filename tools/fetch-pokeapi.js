// PokeAPI → src/data/generated/pokedex.js (전국도감 1~493, 9세대 값 · 기술·특성은 GEN_LIMIT 세대까지 — 2026-11-24)
// 실행: node tools/fetch-pokeapi.js   (첫 실행 수 분, 응답은 tools/.cache/ 에 저장되어 다음엔 빠름)
// 게임 실행 중에는 API 를 호출하지 않는다.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { classifyBranches } from '../src/core/evolution.js';
import { TARGET_KIND } from '../src/data/moveTargets.js';

const MAX_DEX = 493;
const EXTRA_MOVES = ['tackle', 'grass-knot']; // tackle: 기술이 없을 때 대체 / grass-knot: 몸무게 기술(기술머신 전용, 나중 획득)
const OLD_GROUPS = ['platinum', 'heartgold-soulsilver', 'diamond-pearl']; // 예전(4세대) 습득표 — 그 기술은 기술 데이터에 남김 (저장 호환)
const GEN_LIMIT = 4; // 이 세대까지 나온 기술·특성만 (세대를 넣을 때 올림)
const SIDE_GROUPS = ['colosseum', 'xd', 'lets-go-pikachu-eevee', 'legends-arceus', 'legends-za']; // 습득표 첫·마지막을 고를 때 빼는 외전
const CONCURRENCY = 8;
const API = 'https://pokeapi.co/api/v2';
const AILMENTS = ['paralysis', 'burn', 'poison', 'sleep', 'freeze', 'confusion'];
const BAD_POISON = ['toxic', 'poison-fang'];
const OUT = fileURLToPath(new URL('../src/data/generated/pokedex.js', import.meta.url));
const CACHE = fileURLToPath(new URL('./.cache/', import.meta.url));

// ---- 요청: 디스크 캐시 + 재시도 1회 + 동시성 제한 ----
let active = 0;
const waiting = [];
const slot = () => (active < CONCURRENCY ? (active++, Promise.resolve()) : new Promise((r) => waiting.push(r)));
const release = () => { const next = waiting.shift(); if (next) next(); else active--; };
const memo = new Map();

function get(url) {
  const full = url.startsWith('http') ? url : `${API}/${url}`;
  if (!memo.has(full)) memo.set(full, fetchCached(full));
  return memo.get(full);
}

async function fetchCached(full) {
  const file = `${CACHE}${createHash('sha1').update(full).digest('hex')}.json`;
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { /* 캐시 없음 */ }
  await slot();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(full);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        await writeFile(file, JSON.stringify(json));
        return json;
      } catch (e) {
        if (attempt === 1) throw new Error(`${full}: ${e.message}`);
      }
    }
  } finally { release(); }
}

const idFromUrl = (u) => Number(u.match(/\/(\d+)\/?$/)[1]);
const ko = (names) => names.find((n) => n.language.name === 'ko')?.name;
const genNum = (name) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'].indexOf(name.replace('generation-', '')) + 1;

const typesOf = (pokemon) => [...pokemon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name); // 9세대 (페어리 포함)

// 특성 후보: 지금(9세대) 일반 특성 슬롯. 그 특성이 GEN_LIMIT 이후 것이면 past_abilities 중 그 슬롯의 가장 최근 허용 특성으로, 없으면 슬롯을 뺀다
function abilityCandidates(pokemon, genOf) {
  const out = [];
  for (const a of pokemon.abilities.filter((x) => !x.is_hidden).sort((x, y) => x.slot - y.slot)) {
    if (genOf[a.ability.name] <= GEN_LIMIT) { out.push(a.ability.name); continue; }
    const past = (pokemon.past_abilities ?? []).sort((x, y) => genNum(y.generation.name) - genNum(x.generation.name))
      .map((p) => p.abilities.find((pa) => pa.slot === a.slot && !pa.is_hidden && pa.ability))
      .find((pa) => pa && genOf[pa.ability.name] <= GEN_LIMIT);
    if (past) out.push(past.ability.name);
  }
  return out;
}

const EXTRA_KEYS = ['held_item', 'known_move', 'known_move_type', 'location', 'min_affection', 'min_beauty', 'party_species', 'party_type', 'relative_physical_stats', 'trade_species', 'gender'];
const toDetail = (x) => ({
  trigger: x.trigger.name,
  minLevel: x.min_level ?? null,
  minHappiness: x.min_happiness ?? null,
  item: x.item?.name ?? null,
  extra: EXTRA_KEYS.some((k) => x[k] !== null && x[k] !== undefined) || x.needs_overworld_rain === true || x.turn_upside_down === true || !['level-up', 'use-item', 'trade'].includes(x.trigger.name),
  gender: x.gender === 1 ? 'female' : x.gender === 2 ? 'male' : null, // 성별 진화 (분류에는 쓰지 않고 규칙에 덧붙임)
});
// 분류 결과 규칙에 성별 조건을 덧붙인다 (레벨·종류 분류는 그대로)
const withGender = (branch, details) => { const g = details.find((d) => d.gender)?.gender; return g ? { ...branch, rule: { ...branch.rule, gender: g } } : branch; };

// 진화 사슬 전체를 훑어 종족별 { stage, evolutions[] } 계산 (494 이후 종족은 버림)
function walkChain(chain) {
  const info = {};
  const inRange = (n) => idFromUrl(n.species.url) <= MAX_DEX;
  const height = (n) => 1 + Math.max(0, ...n.evolves_to.filter(inRange).map(height));
  const visit = (node, depth, prevLevel) => {
    const kids = node.evolves_to.filter(inRange);
    const evolutions = kids.length
      ? classifyBranches(node.species.name, kids.map((k) => ({ to: k.species.name, details: k.evolution_details.map(toDetail) })),
        { length: depth + 1 + Math.max(...kids.map(height)), order: depth + 1, prevLevel })
      : [];
    // 계열 단수는 갈래마다 다를 수 있다 → 갈래별로 다시 계산
    if (kids.length > 1) {
      kids.forEach((k, i) => {
        const [one] = classifyBranches(node.species.name, [{ to: k.species.name, details: k.evolution_details.map(toDetail) }], { length: depth + 1 + height(k), order: depth + 1, prevLevel });
        evolutions[i] = { ...one, rule: { ...one.rule, ...(evolutions[i].rule.random ? { random: true } : {}) } };
      });
    }
    kids.forEach((k, i) => { evolutions[i] = withGender(evolutions[i], k.evolution_details.map(toDetail)); }); // 성별 진화
    info[node.species.name] = { stage: depth, evolutions };
    kids.forEach((k, i) => visit(k, depth + 1, evolutions[i].rule.kind === 'level' ? evolutions[i].rule.level : null));
  };
  visit(chain, 0, null);
  return info;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const vgList = (await get('version-group?limit=100')).results;
  const vgOrder = new Map(await Promise.all(vgList.map(async (vg) => [vg.name, (await get(vg.url)).order])));

  const dexes = Array.from({ length: MAX_DEX }, (_, i) => i + 1);
  const species = {};
  const moveNames = new Set(EXTRA_MOVES);
  const oldMoves = new Set();
  const chains = new Map();
  await Promise.all(dexes.map(async (n) => {
    const [sp, pk] = await Promise.all([get(`pokemon-species/${n}`), get(`pokemon/${n}`)]);
    if (!chains.has(sp.evolution_chain.url)) chains.set(sp.evolution_chain.url, get(sp.evolution_chain.url).then((c) => walkChain(c.chain)));
    const evo = (await chains.get(sp.evolution_chain.url))[sp.name] ?? { stage: 0, evolutions: [] };
    // 습득표: 본편 버전 그룹 중 레벨업 목록이 있는 첫·마지막 그룹의 합집합, 겹치면 낮은 레벨, 레벨 0(진화 때) → 1
    const byGroup = new Map();
    for (const m of pk.moves) for (const v of m.version_group_details) {
      if (v.move_learn_method.name !== 'level-up' || SIDE_GROUPS.includes(v.version_group.name)) continue;
      if (!byGroup.has(v.version_group.name)) byGroup.set(v.version_group.name, []);
      byGroup.get(v.version_group.name).push([Math.max(1, v.level_learned_at), m.move.name]);
    }
    const groups = [...byGroup.keys()].sort((a, b) => vgOrder.get(a) - vgOrder.get(b));
    const lowest = new Map();
    for (const g of new Set([groups[0], groups.at(-1)])) for (const [lv, mv] of byGroup.get(g) ?? []) lowest.set(mv, Math.min(lv, lowest.get(mv) ?? 99));
    const learnset = [...lowest].map(([mv, lv]) => [lv, mv]);
    for (const g of OLD_GROUPS) for (const [, mv] of byGroup.get(g) ?? []) oldMoves.add(mv);
    const st = Object.fromEntries(pk.stats.map((s) => [s.stat.name, s.base_stat]));
    const base = { hp: st.hp, atk: st.attack, def: st.defense, spa: st['special-attack'], spd: st['special-defense'], spe: st.speed };
    species[sp.name] = {
      api: sp.name, dex: sp.id, name: ko(sp.names) ?? sp.name, types: typesOf(pk), base,
      baseExp: pk.base_experience ?? 50, growth: sp.growth_rate.name, learnset,
      stage: evo.stage, bst: Object.values(base).reduce((a, b) => a + b, 0),
      legendary: !!(sp.is_legendary || sp.is_mythical), evolutions: evo.evolutions,
      pk, // 특성은 아래에서 (특성 세대를 알아야 함)
      genderRate: sp.gender_rate, weight: pk.weight / 10, // 성별 비율(-1 없음, ♀ = rate/8), 몸무게 kg
    };
  }));

  for (const m of oldMoves) moveNames.add(m);
  const moves = {};
  const moveGen = {};
  await Promise.all([...moveNames].map(async (name) => {
    const mv = await get(`move/${name}`);
    moveGen[name] = genNum(mv.generation.name);
    if (moveGen[name] > GEN_LIMIT) return; // 아직 안 넣은 세대
    const { power, accuracy } = mv; // 9세대 값
    const type = mv.type.name;
    const category = mv.damage_class.name;
    const statChanges = (mv.stat_changes ?? []).map((c) => ({ stat: c.stat.name, change: c.change }));
    const target = mv.target.name;
    // 상태이상: 지원하는 것만, 맹독(맹독·독독니)은 따로 구분
    const rawAilment = mv.meta?.ailment?.name;
    const ailment = BAD_POISON.includes(name) ? 'toxic' : AILMENTS.includes(rawAilment) ? rawAilment : null;
    const effectKind = mv.meta?.category?.name ?? null;
    // 배울 수 있는 기술: 위력 있는 공격기, 또는 지원하는 대상을 가진 변화기 중
    //  순수 능력치 변화(net-good-stats) 또는 순수 상태이상(ailment)
    //  — 뻐기기·부추기기(혼란+강화), 추억의선물(기절), 비축하기(토해내기 연계)는 제외
    const learnable = category === 'status'
      ? !!TARGET_KIND[target] && ((effectKind === 'net-good-stats' && statChanges.length > 0) || (effectKind === 'ailment' && !!ailment))
      : power !== null;
    moves[name] = {
      api: name, name: ko(mv.names) ?? name, type, category, power, accuracy: accuracy ?? 100, learnable,
      target, statChanges, statChance: mv.meta?.stat_chance ?? 0, effectKind, ailment, ailmentChance: mv.meta?.ailment_chance ?? 0,
      // 특수 효과 메타: 흡수(+)·반동(−) %, 회복 %, 연속 타수, 급소 단계, 풀죽음 %, 우선도
      drain: mv.meta?.drain ?? 0, healing: mv.meta?.healing ?? 0, minHits: mv.meta?.min_hits ?? null, maxHits: mv.meta?.max_hits ?? null,
      critRate: mv.meta?.crit_rate ?? 0, flinchChance: mv.meta?.flinch_chance ?? 0, priority: mv.priority ?? 0,
    };
  }));

  for (const sp of Object.values(species)) sp.learnset = sp.learnset.filter(([, m]) => moves[m]);

  // 특성: GEN_LIMIT 세대까지 나온 것만 (슬롯별로 되돌림, abilityCandidates)
  const abilities = {};
  const abilityGen = {};
  const allNames = new Set(Object.values(species).flatMap((s) => [...s.pk.abilities, ...(s.pk.past_abilities ?? []).flatMap((p) => p.abilities)].filter((a) => a.ability).map((a) => a.ability.name)));
  await Promise.all([...allNames].map(async (name) => {
    const ab = await get(`ability/${name}`);
    abilityGen[name] = genNum(ab.generation.name);
    const flavor = ab.flavor_text_entries.filter((f) => f.language.name === 'ko').at(-1)?.flavor_text;
    const en = ab.effect_entries.find((e) => e.language.name === 'en')?.short_effect ?? '';
    abilities[name] = { id: name, name: ko(ab.names) ?? name, desc: (flavor ?? en).replace(/\s+/g, ' ').trim() };
  }));
  for (const s of Object.values(species)) {
    s.abilities = abilityCandidates(s.pk, abilityGen);
    if (!s.abilities.length) throw new Error(`${s.api}: no ability within gen ${GEN_LIMIT}`);
    delete s.pk;
  }
  const used = new Set(Object.values(species).flatMap((s) => s.abilities));
  for (const name of Object.keys(abilities)) if (!used.has(name)) delete abilities[name];

  // 결정적 출력 (키 정렬)
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  const body = `// 자동 생성 — node tools/fetch-pokeapi.js (PokeAPI, 1~${MAX_DEX}, 9세대 값, 기술·특성 ${GEN_LIMIT}세대까지, 습득표 = 첫·마지막 게임 합집합). 직접 고치지 말 것\nexport default ${JSON.stringify({ species: sorted(species), moves: sorted(moves), abilities: sorted(abilities) })};\n`;
  await writeFile(OUT, body);
  console.log(`${Object.keys(species).length} species, ${Object.keys(moves).length} moves → ${OUT}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

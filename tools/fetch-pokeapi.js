// PokeAPI → src/data/generated/pokedex.js (전국도감 1~493, 4세대 기준)
// 실행: node tools/fetch-pokeapi.js   (첫 실행 수 분, 응답은 tools/.cache/ 에 저장되어 다음엔 빠름)
// 게임 실행 중에는 API 를 호출하지 않는다.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { classifyBranches } from '../src/core/evolution.js';
import { TARGET_KIND } from '../src/data/moveTargets.js';

const MAX_DEX = 493;
const EXTRA_MOVES = ['tackle']; // 기술이 하나도 없을 때의 대체 기술
const VERSION_GROUPS = ['platinum', 'heartgold-soulsilver', 'diamond-pearl']; // 습득표 우선순위
const GENERATION = 4;
const CONCURRENCY = 8;
const API = 'https://pokeapi.co/api/v2';
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

// past_types: "이 세대까지는 이 타입" → 4세대 이상인 항목 중 가장 이른 것
function gen4Types(pokemon) {
  const past = (pokemon.past_types ?? []).filter((p) => genNum(p.generation.name) >= GENERATION).sort((a, b) => genNum(a.generation.name) - genNum(b.generation.name));
  const types = past.length ? past[0].types : pokemon.types;
  return [...types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
}

const EXTRA_KEYS = ['held_item', 'known_move', 'known_move_type', 'location', 'min_affection', 'min_beauty', 'party_species', 'party_type', 'relative_physical_stats', 'trade_species', 'gender'];
const toDetail = (x) => ({
  trigger: x.trigger.name,
  minLevel: x.min_level ?? null,
  minHappiness: x.min_happiness ?? null,
  item: x.item?.name ?? null,
  extra: EXTRA_KEYS.some((k) => x[k] !== null && x[k] !== undefined) || x.needs_overworld_rain === true || x.turn_upside_down === true || !['level-up', 'use-item', 'trade'].includes(x.trigger.name),
});

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
  const ptOrder = vgOrder.get('platinum');

  const dexes = Array.from({ length: MAX_DEX }, (_, i) => i + 1);
  const species = {};
  const moveNames = new Set(EXTRA_MOVES);
  const chains = new Map();
  await Promise.all(dexes.map(async (n) => {
    const [sp, pk] = await Promise.all([get(`pokemon-species/${n}`), get(`pokemon/${n}`)]);
    if (!chains.has(sp.evolution_chain.url)) chains.set(sp.evolution_chain.url, get(sp.evolution_chain.url).then((c) => walkChain(c.chain)));
    const evo = (await chains.get(sp.evolution_chain.url))[sp.name] ?? { stage: 0, evolutions: [] };
    let learnset = [];
    for (const vgName of VERSION_GROUPS) {
      learnset = [];
      for (const m of pk.moves) for (const v of m.version_group_details) {
        if (v.version_group.name === vgName && v.move_learn_method.name === 'level-up') learnset.push([v.level_learned_at, m.move.name]);
      }
      if (learnset.length) break;
    }
    learnset.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    learnset.forEach(([, m]) => moveNames.add(m));
    const st = Object.fromEntries(pk.stats.map((s) => [s.stat.name, s.base_stat]));
    const base = { hp: st.hp, atk: st.attack, def: st.defense, spa: st['special-attack'], spd: st['special-defense'], spe: st.speed };
    species[sp.name] = {
      api: sp.name, dex: sp.id, name: ko(sp.names) ?? sp.name, types: gen4Types(pk), base,
      baseExp: pk.base_experience ?? 50, growth: sp.growth_rate.name, learnset,
      stage: evo.stage, bst: Object.values(base).reduce((a, b) => a + b, 0),
      legendary: !!(sp.is_legendary || sp.is_mythical), evolutions: evo.evolutions,
    };
  }));

  const moves = {};
  await Promise.all([...moveNames].map(async (name) => {
    const mv = await get(`move/${name}`);
    // past_values: 그 버전 그룹에서 바뀌기 전 값 → Pt 이후 변경 중 가장 이른 것을 적용
    const later = (mv.past_values ?? []).filter((p) => vgOrder.get(p.version_group.name) > ptOrder).sort((a, b) => vgOrder.get(a.version_group.name) - vgOrder.get(b.version_group.name));
    let { power, accuracy } = mv;
    let type = mv.type.name;
    for (const p of [...later].reverse()) {
      if (p.power !== null) power = p.power;
      if (p.accuracy !== null) accuracy = p.accuracy;
      if (p.type) type = p.type.name;
    }
    const category = mv.damage_class.name;
    const statChanges = (mv.stat_changes ?? []).map((c) => ({ stat: c.stat.name, change: c.change }));
    const target = mv.target.name;
    // 배울 수 있는 기술: 위력 있는 공격기, 또는 능력치를 바꾸고 지원하는 대상을 가진 변화기
    // 변화기는 순수 능력치 변화(net-good-stats)만 — 뻐기기·부추기기(혼란), 추억의선물(기절), 비축하기(토해내기 연계)는 제외
    const learnable = category === 'status' ? statChanges.length > 0 && !!TARGET_KIND[target] && mv.meta?.category?.name === 'net-good-stats' : power !== null;
    moves[name] = {
      api: name, name: ko(mv.names) ?? name, type, category, power, accuracy: accuracy ?? 100, learnable,
      target, statChanges, statChance: mv.meta?.stat_chance ?? 0, effectKind: mv.meta?.category?.name ?? null,
    };
  }));

  // 결정적 출력 (키 정렬)
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  const body = `// 자동 생성 — node tools/fetch-pokeapi.js (PokeAPI, 1~${MAX_DEX}, 습득표 ${VERSION_GROUPS.join(' → ')}). 직접 고치지 말 것\nexport default ${JSON.stringify({ species: sorted(species), moves: sorted(moves) })};\n`;
  await writeFile(OUT, body);
  console.log(`${Object.keys(species).length} species, ${Object.keys(moves).length} moves → ${OUT}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

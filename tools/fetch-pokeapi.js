// PokeAPI → src/data/generated/pokedex.js (4세대 Pt 기준)
// 실행: node tools/fetch-pokeapi.js   (게임 실행 중에는 API 를 호출하지 않는다)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { classifyEvolution } from '../src/core/evolution.js';

const SPECIES = [
  'chimchar', 'monferno', 'infernape', 'piplup', 'prinplup', 'empoleon',
  'turtwig', 'grotle', 'torterra', 'shinx', 'luxio', 'luxray',
  'riolu', 'lucario', 'gible', 'gabite', 'garchomp', 'murkrow', 'honchkrow',
  'budew', 'roselia', 'roserade', 'bronzor', 'bronzong',
];
const EXTRA_MOVES = ['tackle']; // 기술이 하나도 없을 때의 대체 기술
const VERSION_GROUP = 'platinum';
const GENERATION = 4;
const API = 'https://pokeapi.co/api/v2';
const OUT = fileURLToPath(new URL('../src/data/generated/pokedex.js', import.meta.url));

const cache = new Map();
async function get(url) {
  const full = url.startsWith('http') ? url : `${API}/${url}`;
  if (cache.has(full)) return cache.get(full);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(full);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      cache.set(full, json);
      return json;
    } catch (e) {
      if (attempt === 1) throw new Error(`${full}: ${e.message}`);
    }
  }
}

const ko = (names) => names.find((n) => n.language.name === 'ko')?.name;
const genNum = (name) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'].indexOf(name.replace('generation-', '')) + 1;

// past_types: "이 세대까지는 이 타입" → 4세대 이상인 항목 중 가장 이른 것
function gen4Types(pokemon) {
  const past = (pokemon.past_types ?? []).filter((p) => genNum(p.generation.name) >= GENERATION).sort((a, b) => genNum(a.generation.name) - genNum(b.generation.name));
  const types = past.length ? past[0].types : pokemon.types;
  return types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
}

const EXTRA_KEYS = ['held_item', 'known_move', 'known_move_type', 'location', 'min_affection', 'min_beauty', 'party_species', 'party_type', 'relative_physical_stats', 'trade_species', 'gender'];
const toDetail = (x) => ({
  trigger: x.trigger.name,
  minLevel: x.min_level ?? null,
  minHappiness: x.min_happiness ?? null,
  item: x.item?.name ?? null,
  extra: EXTRA_KEYS.some((k) => x[k] !== null && x[k] !== undefined) || x.needs_overworld_rain === true || x.turn_upside_down === true,
});

// 진화 사슬을 따라 각 종족의 { to, rule } 계산 (계열은 일직선이라고 가정, 첫 갈래 사용)
function evolutionsFromChain(chain) {
  const path = [];
  for (let n = chain; n; n = n.evolves_to[0]) path.push(n);
  const out = {};
  let prevLevel = null;
  path.forEach((node, i) => {
    const next = path[i + 1];
    if (!next) { out[node.species.name] = null; return; }
    const rule = classifyEvolution(next.evolution_details.map(toDetail), { length: path.length, order: i + 1, prevLevel });
    prevLevel = rule.kind === 'level' ? rule.level : null;
    out[node.species.name] = { to: next.species.name, rule };
  });
  return out;
}

async function main() {
  const vgOrder = new Map();
  for (const vg of (await get('version-group?limit=100')).results) vgOrder.set(vg.name, (await get(vg.url)).order);
  const ptOrder = vgOrder.get(VERSION_GROUP);

  const species = {};
  const moveNames = new Set(EXTRA_MOVES);
  for (const name of SPECIES) {
    const [sp, pk] = await Promise.all([get(`pokemon-species/${name}`), get(`pokemon/${name}`)]);
    const evo = evolutionsFromChain((await get(sp.evolution_chain.url)).chain);
    const learnset = [];
    for (const m of pk.moves) {
      for (const v of m.version_group_details) {
        if (v.version_group.name === VERSION_GROUP && v.move_learn_method.name === 'level-up') learnset.push([v.level_learned_at, m.move.name]);
      }
    }
    learnset.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    learnset.forEach(([, m]) => moveNames.add(m));
    const st = Object.fromEntries(pk.stats.map((s) => [s.stat.name, s.base_stat]));
    species[name] = {
      api: name,
      dex: sp.id,
      name: ko(sp.names),
      types: gen4Types(pk),
      base: { hp: st.hp, atk: st.attack, def: st.defense, spa: st['special-attack'], spd: st['special-defense'], spe: st.speed },
      baseExp: pk.base_experience,
      growth: sp.growth_rate.name,
      learnset,
      evolution: evo[name] ?? null,
    };
  }

  const moves = {};
  for (const name of [...moveNames].sort()) {
    const mv = await get(`move/${name}`);
    // past_values: 그 버전 그룹에서 바뀌기 전 값 → Pt 이후 변경 중 가장 이른 것을 적용
    const later = (mv.past_values ?? []).filter((p) => vgOrder.get(p.version_group.name) > ptOrder).sort((a, b) => vgOrder.get(a.version_group.name) - vgOrder.get(b.version_group.name));
    let { power, accuracy } = mv;
    let type = mv.type.name;
    for (const p of [...later].reverse()) { // 가장 이른 변경이 마지막에 덮어쓰도록
      if (p.power !== null) power = p.power;
      if (p.accuracy !== null) accuracy = p.accuracy;
      if (p.type) type = p.type.name;
    }
    const category = mv.damage_class.name;
    moves[name] = { api: name, name: ko(mv.names) ?? name, type, category, power, accuracy: accuracy ?? 100, learnable: category !== 'status' && power !== null };
  }

  const body = `// 자동 생성 — node tools/fetch-pokeapi.js (PokeAPI, version group ${VERSION_GROUP}). 직접 고치지 말 것\nexport default ${JSON.stringify({ species, moves }, null, 1)};\n`;
  await writeFile(OUT, body);
  console.log(`${Object.keys(species).length} species, ${Object.keys(moves).length} moves → ${OUT}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

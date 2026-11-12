// 게임 데이터와 PokeAPI 대조: node tools/check-pokeapi.js
// 기술의 한국어 이름·타입·물리/특수·위력·명중, 포켓몬의 한국어 이름이 같은지 확인한다.
// 다르면 목록을 출력하고 종료 코드 1. (사거리는 SRPG 전용 값이라 비교하지 않음)
//
// 나중에 레벨업 습득 기술을 붙일 때는 같은 식별자(MOVES[id].api, SPECIES[key].api)로
// https://pokeapi.co/api/v2/pokemon/<api> 의 moves[].version_group_details 를 조회하면 된다.
import { MOVES } from '../src/data/moves.js';
import { SPECIES } from '../src/data/species.js';

const API = 'https://pokeapi.co/api/v2';
const ko = (d) => d.names.find((n) => n.language.name === 'ko')?.name;

async function get(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const problems = [];
for (const m of Object.values(MOVES)) {
  const d = await get(`move/${m.api}`);
  const want = { name: ko(d), type: d.type.name, category: d.damage_class.name, power: d.power, accuracy: d.accuracy ?? 100 };
  for (const [k, v] of Object.entries(want)) if (m[k] !== v) problems.push(`move ${m.id}.${k}: game=${m[k]} api=${v}`);
}
for (const s of Object.values(SPECIES)) {
  const d = await get(`pokemon-species/${s.api}`);
  if (s.name !== ko(d)) problems.push(`species ${s.key}.name: game=${s.name} api=${ko(d)}`);
}

if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log(`OK: 기술 ${Object.keys(MOVES).length}개, 포켓몬 ${Object.keys(SPECIES).length}마리 모두 PokeAPI 와 일치`);

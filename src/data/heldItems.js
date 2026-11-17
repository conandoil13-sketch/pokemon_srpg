// 지니는 도구 1차 (나무열매 제외). 스펙 docs/superpowers/specs/2026-11-17-held-items-design.md
// 효과 필드는 core/items.js 가 읽는다. rare: 상자에서 드물게
import { createRng } from '../core/rng.js';

const TYPE_KO = { fire: '불꽃', water: '물', grass: '풀', electric: '전기', ice: '얼음', fighting: '격투', poison: '독', ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레', rock: '바위', ghost: '고스트', dragon: '드래곤', dark: '악', steel: '강철', normal: '노말' };
const boost = (name, type) => ({ name, desc: `${TYPE_KO[type]} 타입 기술 위력 1.2배`, typeBoost: type });

export const HELD_ITEMS = {
  charcoal: boost('목탄', 'fire'), 'mystic-water': boost('신비의물방울', 'water'), 'miracle-seed': boost('기적의씨', 'grass'),
  magnet: boost('자석', 'electric'), 'never-melt-ice': boost('녹지않는얼음', 'ice'), 'black-belt': boost('검은띠', 'fighting'),
  'poison-barb': boost('독바늘', 'poison'), 'soft-sand': boost('부드러운모래', 'ground'), 'sharp-beak': boost('예리한부리', 'flying'),
  'twisted-spoon': boost('휘어진스푼', 'psychic'), 'silver-powder': boost('은빛가루', 'bug'), 'hard-stone': boost('딱딱한돌', 'rock'),
  'spell-tag': boost('저주의부적', 'ghost'), 'dragon-fang': boost('용의이빨', 'dragon'), 'black-glasses': boost('검은안경', 'dark'),
  'metal-coat': boost('금속코트', 'steel'), 'silk-scarf': boost('실크스카프', 'normal'),
  'muscle-band': { name: '힘의머리띠', desc: '물리 기술 위력 1.1배', physMult: 1.1 },
  'wise-glasses': { name: '박식안경', desc: '특수 기술 위력 1.1배', specMult: 1.1 },
  'expert-belt': { name: '달인의띠', desc: '효과가 굉장한 기술 위력 1.2배', seMult: 1.2 },
  'life-orb': { name: '생명의구슬', desc: '공격 기술 위력 1.3배, 맞히면 최대 HP 1/10 잃음', lifeOrb: 1.3, rare: true },
  'choice-band': { name: '구애머리띠', desc: '물리 기술 1.5배, 그 층에서 처음 쓴 기술만 쓸 수 있음', choice: 'physical', rare: true },
  'choice-specs': { name: '구애안경', desc: '특수 기술 1.5배, 그 층에서 처음 쓴 기술만 쓸 수 있음', choice: 'special', rare: true },
  leftovers: { name: '먹다남은음식', desc: '자기 차례 끝에 최대 HP 1/16 회복', endHeal: 1 / 16 },
  'black-sludge': { name: '검은진흙', desc: '독 타입은 차례 끝 1/16 회복, 아니면 1/8 피해', blackSludge: true },
  'shell-bell': { name: '조개껍질방울', desc: '준 피해의 1/8 만큼 회복', shellBell: 1 / 8 },
  'focus-sash': { name: '기합의띠', desc: 'HP 가 가득일 때 쓰러질 공격을 HP 1 로 버팀 (층마다 1번)', sash: true, rare: true },
  'focus-band': { name: '기합의머리띠', desc: '10% 확률로 쓰러질 공격을 HP 1 로 버팀', band: 0.1 },
  'scope-lens': { name: '초점렌즈', desc: '급소에 맞히기 쉬워짐', crit: 1 },
  'razor-claw': { name: '예리한손톱', desc: '급소에 맞히기 쉬워짐', crit: 1 },
  'wide-lens': { name: '광각렌즈', desc: '명중률 1.1배', accMult: 1.1 },
  'bright-powder': { name: '빛의가루', desc: '상대 명중률 0.9배', foeAccMult: 0.9 },
  'lax-incense': { name: '느긋한향로', desc: '상대 명중률 0.9배', foeAccMult: 0.9 },
  'flame-orb': { name: '화염구슬', desc: '자기 차례 끝에 화상', orb: 'burn' },
  'toxic-orb': { name: '독독구슬', desc: '자기 차례 끝에 맹독', orb: 'toxic' },
  'white-herb': { name: '하얀허브', desc: '떨어진 능력을 바로 되돌림 (층마다 1번)', whiteHerb: true },
  'mental-herb': { name: '멘탈허브', desc: '헤롱헤롱을 바로 풂 (층마다 1번)', mentalHerb: true },
  'destiny-knot': { name: '붉은실', desc: '헤롱헤롱에 걸리면 건 쪽도 헤롱헤롱', destinyKnot: true },
  'sticky-barb': { name: '끈적끈적바늘', desc: '자기 차례 끝에 최대 HP 1/8 피해', stickyBarb: 1 / 8 },
  'light-clay': { name: '빛의점토', desc: '리플렉터·빛의장막 3턴 더', screenTurns: 3 },
  'damp-rock': { name: '축축한바위', desc: '비바라기 3턴 더', weatherTurns: 'rain' },
  'heat-rock': { name: '뜨거운바위', desc: '쾌청 3턴 더', weatherTurns: 'sun' },
  'smooth-rock': { name: '보송보송바위', desc: '모래바람 3턴 더', weatherTurns: 'sand' },
  'icy-rock': { name: '차가운바위', desc: '싸라기눈 3턴 더', weatherTurns: 'hail' },
  'grip-claw': { name: '끈기갈고리', desc: '속박 2턴 더', bindTurns: 2 },
  'light-ball': { name: '전기구슬', desc: '피카츄의 공격·특공 2배', species: ['pikachu'], statMult: { atk: 2, spa: 2 } },
  'thick-club': { name: '굵은뼈', desc: '탕구리·텅구리의 공격 2배', species: ['cubone', 'marowak'], statMult: { atk: 2 } },
  'deep-sea-tooth': { name: '심해의이빨', desc: '진주몽의 특공 2배', species: ['clamperl'], statMult: { spa: 2 } },
  'deep-sea-scale': { name: '심해의비늘', desc: '진주몽의 특방 2배', species: ['clamperl'], statMult: { spd: 2 } },
  'metal-powder': { name: '메탈파우더', desc: '변신하지 않은 메타몽의 방어 2배', species: ['ditto'], statMult: { def: 2 }, plainDitto: true },
  'lucky-punch': { name: '럭키펀치', desc: '럭키의 급소율이 크게 오름', species: ['chansey'], crit: 2 },
  stick: { name: '대파', desc: '파오리의 급소율이 크게 오름', species: ['farfetchd'], crit: 2 },
  // ---- 2차 (2026-11-17) ----
  'kings-rock': { name: '왕의징표석', desc: '공격이 맞으면 10% 로 상대가 풀죽음', flinch: 10 }, // 확률 % (기술 풀죽음과 같은 단위)
  'razor-fang': { name: '예리한이빨', desc: '공격이 맞으면 10% 로 상대가 풀죽음', flinch: 10 },
  'big-root': { name: '큰뿌리', desc: '흡수·씨뿌리기·아쿠아링·뿌리박기 회복 1.3배', healMult: 1.3 },
  metronome: { name: '메트로놈', desc: '같은 기술을 연달아 쓸수록 위력 +20% (최대 2배)', metronome: 0.2 },
  'zoom-lens': { name: '줌렌즈', desc: '이동하지 않고 공격하면 명중 1.2배', still: 1.2 },
  'choice-scarf': { name: '구애스카프', desc: '스피드 1.5배·이동력 +1, 그 층에서 처음 쓴 기술만 쓸 수 있음', choice: 'any', speedMult: 1.5, move: 1 },
  'iron-ball': { name: '검은철구', desc: '스피드 절반·이동력 −1, 땅에 붙음', speedMult: 0.5, move: -1, grounded: true },
  'smoke-ball': { name: '연기구슬', desc: '이동을 막는 효과(검은눈빛·속박·개미지옥 등)를 무시', escape: true },
  'quick-claw': { name: '선제공격손톱', desc: '차례 끝에 20% 로 한 번 더 움직임', quickClaw: 0.2 },
  'lucky-egg': { name: '행복의알', desc: '받는 경험치 1.5배', expMult: 1.5 },
  'amulet-coin': { name: '부적금화', desc: '출전하면 전투·층 돌파 코인 2배', coins: 2 },
};

// 상점 가격 (SRPG 가치 기준 · 스펙 2026-11-17-town-shop-design.md)
const PRICES = {
  150: ['flame-orb', 'toxic-orb', 'sticky-barb', 'destiny-knot', 'grip-claw', 'damp-rock', 'heat-rock', 'smooth-rock', 'icy-rock', 'iron-ball', 'smoke-ball'],
  500: ['light-ball', 'thick-club', 'deep-sea-tooth', 'deep-sea-scale', 'lucky-punch', 'stick'],
  600: ['kings-rock', 'razor-fang', 'metronome', 'choice-scarf', 'quick-claw', 'scope-lens', 'razor-claw', 'wide-lens', 'bright-powder', 'lax-incense', 'expert-belt', 'white-herb', 'black-sludge', 'shell-bell', 'focus-band', 'choice-band', 'choice-specs'],
  1200: ['leftovers', 'life-orb', 'focus-sash', 'metal-powder', 'lucky-egg', 'amulet-coin'],
};
for (const [p, ids] of Object.entries(PRICES)) for (const id of ids) HELD_ITEMS[id].price = Number(p);
for (const it of Object.values(HELD_ITEMS)) it.price ??= 300; // 나머지 = 타입 강화 17 · 힘의머리띠 · 박식안경 · 빛의점토 · 멘탈허브

export const HELD_IDS = Object.keys(HELD_ITEMS);
export const isHeldItem = (id) => typeof id === 'string' && Object.hasOwn(HELD_ITEMS, id);
export const CHEST_HELD_CHANCE = 0.2;
const POOL = HELD_IDS.flatMap((id) => Array(HELD_ITEMS[id].rare ? 1 : 4).fill(id)); // 희귀는 가중치 1, 나머지 4

// 상자 하나가 도구로 바뀌는지 (별도 난수: 기존 상자 굴림과 섞이지 않음)
export function rollChestHeld(rngSeed) {
  const r = createRng(rngSeed);
  if (r() >= CHEST_HELD_CHANCE) return null;
  return POOL[Math.floor(r() * POOL.length)];
}

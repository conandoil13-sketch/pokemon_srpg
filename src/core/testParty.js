// 테스트용 파티 (역 레벨 스케일): 파티 전원을 던전 권장 레벨 평균으로 맞추고(위·아래 모두) 갈 수 있는 끝까지 진화시킨다.
// 그 던전 앞 단계는 모두 돌파·해금 처리, 진행 중인 던전은 지움. 브라우저 테스트 전용 (__app.testParty).
import { SPECIES } from '../data/species.js';
import { DUNGEONS } from '../data/dungeons.js';
import { newMember } from './progress.js';
import { levelEvolutionOptions, stoneEvolutionOptions } from './evolution.js';

function finalForm(species, level, gender) {
  for (let i = 0; i < 5; i++) {
    const sp = SPECIES[species], next = levelEvolutionOptions(sp, level, gender)[0] ?? stoneEvolutionOptions(sp, gender)[0];
    if (!next || !SPECIES[next]) break;
    species = next;
  }
  return species;
}

export function scaleTestParty(game, dungeonId) {
  const d = DUNGEONS.find((x) => x.id === dungeonId);
  if (!d) throw new Error(`no dungeon ${dungeonId}`);
  const level = Math.round(d.baseLevel.reduce((a, b) => a + b) / d.baseLevel.length);
  game.party = game.party.map((m) => {
    const to = finalForm(m.species, level, m.gender ?? null), n = newMember(to, level);
    const abilitySlot = m.abilitySlot < SPECIES[to].abilities.length ? m.abilitySlot : n.abilitySlot;
    return { ...n, abilitySlot, uid: m.uid, gender: m.gender ?? n.gender, genders: m.genders ?? n.genders, ...(m.build ? { build: m.build } : {}) };
  });
  const before = DUNGEONS.filter((x) => x.stage < d.stage).map((x) => x.id);
  game.cleared = [...new Set([...game.cleared, ...before])];
  game.unlocked = [...new Set([...game.unlocked, ...before, d.id])];
  game.run = null;
  return level;
}

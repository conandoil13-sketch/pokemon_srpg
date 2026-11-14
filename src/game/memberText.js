// 동료 설명 글 (박스·자세히 보기 공용)
import { SPECIES } from '../data/species.js';
import { textWidth } from '../render/font.js';

export function evolutionHint(member) {
  const evos = SPECIES[member.species].evolutions;
  if (!evos.length) return '최종 진화';
  const levels = evos.filter((e) => e.rule.kind === 'level').map((e) => e.rule.level);
  const stone = evos.some((e) => e.rule.kind === 'stone');
  if (levels.length && stone) return `Lv.${Math.min(...levels)} 또는 진화의돌`;
  return levels.length ? `Lv.${Math.min(...levels)}에 진화` : '진화의돌로 진화';
}

// 작은 글씨 줄바꿈 (폭 기준)
export function fitLines(text, width, font = 'small') {
  const out = [];
  let cur = '';
  for (const ch of text) {
    if (textWidth(cur + ch, font) > width && cur) { out.push(cur); cur = ch.trim() ? ch : ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

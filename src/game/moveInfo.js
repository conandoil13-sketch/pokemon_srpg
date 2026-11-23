// 기술 설명 (요약·떠올리기·메타몽 캡슐 공용): 이름·타입·분류 + 위력·명중·범위·부가효과
import { MOVES } from '../data/moves.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { moveEffectTags, effectSummary } from './states.js';
import { fitLines } from './memberText.js';

export const CATEGORY_KO = { physical: '물리', special: '특수', status: '변화' };
const SELF = ['user', 'user-or-ally', 'user-and-allies', 'users-field'];

// 위력·명중·범위·태그 한 줄
export const moveStatLine = (mv) => [mv.weightPower ? '위력 몸무게' : mv.fixedDamage ? '위력 고정' : `위력 ${mv.power ?? '-'}`, `명중 ${mv.accuracy ?? '-'}`, ui.shapeLabel(mv), ...moveEffectTags(mv)].filter(Boolean).join(' · ');

// 능력 변화·상태이상 (확률이 있으면 확률, 자신에게 거는 변화는 '자신')
export function moveEffectLine(mv) {
  const eff = effectSummary(mv);
  if (!eff) return '';
  const chance = mv.ailment ? mv.ailmentChance : mv.statChance;
  return `${SELF.includes(mv.target) && !mv.ailment ? '자신 ' : ''}${eff}${chance > 0 && chance < 100 ? ` (${chance}%)` : ''}`;
}

export const moveDetailLines = (id, width) => { const mv = MOVES[id]; return fitLines([moveStatLine(mv), moveEffectLine(mv)].filter(Boolean).join(' · '), width); };

// 카드: 1줄 이름 | 타입 배지, 2줄 분류(· 꼬리표), 그 아래 설명 (최대 maxLines 줄)
export function drawMoveCard(ctx, id, x, y, w, { label = null, labelColor = '#c06010', maxLines = 3 } = {}) {
  const mv = MOVES[id];
  if (!mv) return;
  drawText(ctx, mv.name, x, y);
  ui.drawTypeBadge(ctx, mv.type, x + w - 32, y + 1);
  drawText(ctx, CATEGORY_KO[mv.category] ?? '', x, y + 14, '#585858', null, 'small');
  if (label) drawText(ctx, label, x + textWidth(CATEGORY_KO[mv.category] ?? '', 'small') + 6, y + 14, labelColor, null, 'small');
  moveDetailLines(id, w).slice(0, maxLines).forEach((l, k) => drawText(ctx, l, x, y + 26 + k * 10, '#606060', null, 'small'));
}

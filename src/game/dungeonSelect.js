// 던전 선택: (진행 중 탐험 이어하기) + 던전 목록. 잠긴 던전은 해금 조건 표시
import { recommendedLevel } from '../core/difficulty.js';
import { DUNGEONS, dungeonById } from '../data/dungeons.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';
import { deployed } from '../core/roster.js';
import { typesOfMember, abilityOf } from '../core/progress.js';
import { ABILITIES } from '../data/abilities.js';
import { drawPortrait } from '../render/sprites.js';

const ROW = 18, LIST_X = 8, LIST_Y = 30, LIST_W = 120;
const VISIBLE = 7; // 한 번에 보이는 줄 (넘치면 커서를 따라 스크롤)
const GO_BACK = ['출전한다', '돌아간다'];
const CARD_W = 124, CARD_H = 44, MSG_Y = H - 50, CHOICE_X = W - 64, CHOICE_Y = MSG_Y + 18, CHOICE_ROW = 14;

// 게시판에 보이는 주 타입: 보조 타입이 아닌 앞의 둘 (데이터의 shownTypes 가 있으면 그것)
export const mainTypes = (d) => d.shownTypes ?? d.types.filter((t) => !(d.minorTypes ?? []).includes(t)).slice(0, 2);

// 잠긴 던전 설명 (줄 배열): ["시티 돌파 시 해금"] / 분기: ["하수도 또는 깊은 동굴", "돌파 시 해금"]
export function unlockHint(d) {
  const ids = Array.isArray(d.unlock) ? d.unlock : [d.unlock];
  const names = ids.map((id) => dungeonById(id)?.name ?? '???').join(' 또는 ');
  return ids.length > 1 ? [names, '돌파 시 해금'] : [`${names} 돌파 시 해금`];
}

export function createDungeonSelect({ game, onStart, onResume, onBack }) {
  const run = game.run;
  const items = [
    ...(run ? [{ kind: 'resume', label: `이어하기 B${run.floor}F` }] : []),
    ...DUNGEONS.map((d) => ({ kind: 'dungeon', d, label: d.branch ? `${d.stage}-${d.branch} ${d.name}` : d.name, locked: !game.unlocked.includes(d.id) })), // 분기: 6-1 하수도
  ];
  let idx = 0, top = 0, confirm = null, t = 0; // confirm = { id, cursor, info }, top = 맨 위에 보이는 줄
  const follow = () => { if (idx < top) top = idx; if (idx >= top + VISIBLE) top = idx - VISIBLE + 1; };

  function pick() {
    const it = items[idx];
    if (it.kind === 'resume') { onResume(); return; }
    if (it.locked) return;
    confirm = { id: it.d.id, cursor: run ? 1 : 0, info: sortieInfo(it.d) }; t = 0; // 진행 중 탐험이 있으면 기본 '돌아간다'
  }

  // 출전 확인창 내용: 편성 순서대로 지금 타입·특성 (메타몽은 빌드)
  function sortieInfo(d) {
    const members = deployed(game).map((m) => ({ member: m, types: typesOfMember(m), ability: abilityOf(m) }));
    const lines = [`이 멤버로 ${d.name}에 출전할까?`, ...(run ? ['새로 출전하면 진행 중인 탐험에서', '모은 보물을 잃는다.'] : [])];
    return { dungeon: d.id, members, lines, warn: !!run };
  }
  const choose = () => { const c = confirm; confirm = null; if (c.cursor === 0) onStart(c.id); };

  return {
    get confirming() { return !!confirm; },
    get confirmInfo() { return confirm?.info ?? null; },
    get visibleTop() { return top; },
    handle(ev) {
      const yes = ev.type === 'confirm' || ev.type === 'click';
      if (confirm) {
        if (ev.type === 'dir' && ev.dy) confirm.cursor = 1 - confirm.cursor;
        else if (ev.type === 'cancel') confirm = null;
        else if (ev.type === 'cursor' || ev.type === 'click') {
          const row = Math.floor((ev.py - CHOICE_Y + 1) / CHOICE_ROW);
          if (ev.px >= CHOICE_X - 10 && row >= 0 && row < 2) { confirm.cursor = row; if (ev.type === 'click' && t >= CHOICE_LOCK) choose(); }
        } else if (yes && t >= CHOICE_LOCK) choose();
        return;
      }
      if (ev.type === 'dir' && ev.dy) { idx = (idx + ev.dy + items.length) % items.length; follow(); }
      else if (ev.type === 'confirm') pick();
      else if (ev.type === 'cancel') onBack();
      else if ((ev.type === 'cursor' || ev.type === 'click') && ev.px >= LIST_X && ev.px < LIST_X + LIST_W) {
        const row = Math.floor((ev.py - LIST_Y - 4) / ROW), i = top + row;
        if (row >= 0 && row < VISIBLE && i < items.length) { idx = i; if (ev.type === 'click') pick(); }
      }
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#283858'); g.addColorStop(1, '#101828');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, '던전 선택', 10, 8, '#f8f8f8', '#384868');
      const back = 'X: 마을로';
      drawText(ctx, back, W - 10 - textWidth(back, 'small'), 10, '#a8b8d8', null, 'small');

      const shown = Math.min(items.length, VISIBLE);
      ui.drawWindow(ctx, LIST_X, LIST_Y, LIST_W, shown * ROW + 8);
      if (top > 0) drawText(ctx, '▲', LIST_X + LIST_W / 2 - 4, LIST_Y - 9, '#f8f8f8', '#384868', 'small'); // 위에 더 있음
      if (top + VISIBLE < items.length) drawText(ctx, '▼', LIST_X + LIST_W / 2 - 4, LIST_Y + shown * ROW + 8, '#f8f8f8', '#384868', 'small'); // 아래에 더 있음
      items.forEach((it, i) => {
        if (i < top || i >= top + VISIBLE) return;
        const y = LIST_Y + 5 + (i - top) * ROW;
        const dim = it.locked;
        drawText(ctx, it.locked ? (it.d?.branch ? `${it.d.stage}-${it.d.branch} 잠김` : '잠김') : it.label, LIST_X + 14, y, dim ? '#a8a8a8' : it.kind === 'resume' ? '#c04040' : '#383838', dim ? null : '#d8d8d0');
        if (it.kind === 'dungeon' && game.cleared.includes(it.d.id)) drawText(ctx, '★', LIST_X + LIST_W - 18, y, '#e0a000', '#d8d8d0');
        if (i === idx && Math.floor(time * 3) % 3 !== 2) {
          ctx.fillStyle = '#e04040';
          for (let k = 0; k < 4; k++) ctx.fillRect(LIST_X + 5 + k, y + 3 + k, 1, 7 - k * 2);
        }
      });

      const it = items[idx];
      const d = it.kind === 'resume' ? dungeonById(run.dungeonId) : it.d;
      const dx = LIST_X + LIST_W + 6, dw = W - dx - 8;
      ui.drawWindow(ctx, dx, LIST_Y, dw, 100);
      drawText(ctx, it.locked ? '???' : d.name, dx + 8, LIST_Y + 6);
      drawText(ctx, `전 ${d.floors}층 · 최고 B${game.best[d.id] ?? 0}F`, dx + 8, LIST_Y + 24, '#585858', null, 'small');
      if (it.locked) unlockHint(d).forEach((line, k) => drawText(ctx, line, dx + 8, LIST_Y + 40 + k * 14, '#a8a8a8', null, 'small'));
      else mainTypes(d).forEach((ty, k) => ui.drawTypeBadge(ctx, ty, dx + 8 + k * 34, LIST_Y + 39)); // 주 타입 (보조 타입은 숨김)
      if (it.kind === 'resume') drawText(ctx, `B${run.floor}F 부터 이어서`, dx + 8, LIST_Y + 56, '#c04040', null, 'small');
      if (!it.locked) drawText(ctx, it.kind === 'resume' ? `권장 Lv${recommendedLevel(d, run.floor)}` : `권장 Lv${d.baseLevel[0]}~${d.baseLevel.at(-1)}`, dx + 8, LIST_Y + (it.kind === 'resume' ? 69 : 56), '#3868a8', null, 'small');
      drawText(ctx, it.locked ? '잠겨 있다' : 'Z: 출발!', dx + 8, LIST_Y + 82, it.locked ? '#a8a8a8' : '#e04040');

      if (confirm) drawConfirm(ctx, time);
    },
  };

  // 출전 확인창: 위 = 멤버 카드 2열 (초상화·이름·Lv·타입·특성), 아래 = 문구 + 출전한다/돌아간다
  function drawConfirm(ctx, time) {
    const { members, lines } = confirm.info;
    ctx.fillStyle = 'rgba(8,12,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    const rows = Math.ceil(members.length / 2);
    const gh = rows * CARD_H + 6, gy = Math.max(2, Math.floor((MSG_Y - 2 - gh) / 2));
    ui.drawWindow(ctx, 2, gy, W - 4, gh);
    members.forEach((c, i) => {
      const x = 6 + (i % 2) * CARD_W, y = gy + 4 + Math.floor(i / 2) * CARD_H;
      drawPortrait(ctx, c.member.species, 'Normal', x, y + 1);
      ui.drawNameWithGender(ctx, c.member.species, c.member.gender, x + 44, y + 1);
      const lv = `Lv${c.member.level}`;
      drawText(ctx, lv, x + CARD_W - 6 - textWidth(lv, 'small'), y + 3, '#585858', null, 'small');
      c.types.forEach((ty, k) => ui.drawTypeBadge(ctx, ty, x + 44 + k * 34, y + 15));
      drawText(ctx, ABILITIES[c.ability]?.name ?? '-', x + 44, y + 30, '#506080', null, 'small');
    });
    ui.drawWindow(ctx, 2, MSG_Y, W - 4, 48);
    drawText(ctx, lines[0], 12, MSG_Y + 6);
    lines.slice(1).forEach((l, k) => drawText(ctx, l, 12, MSG_Y + 22 + k * 11, '#c04040', null, 'small'));
    GO_BACK.forEach((label, k) => {
      const y = CHOICE_Y + k * CHOICE_ROW;
      drawText(ctx, label, CHOICE_X, y);
      if (k === confirm.cursor && Math.floor(time * 3) % 3 !== 2) { ctx.fillStyle = '#e04040'; for (let j = 0; j < 4; j++) ctx.fillRect(CHOICE_X - 9 + j, y + 3 + j, 1, 7 - j * 2); }
    });
  }
}

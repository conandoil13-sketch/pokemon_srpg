// 메시지 + "어떤 기술을 잊게 할까?" 선택을 차례로 진행하는 공용 흐름 (결산·진화에서 사용)
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { josa } from '../data/text.js';
import { resolveChoice } from '../core/progress.js';
import * as ui from '../render/ui.js';
import { W, H } from '../render/screen.js';

export const CHOICE_LOCK = 0.4; // 선택 메뉴가 뜬 직후 연타 방지(초)

export const nameOf = (sp) => SPECIES[sp].name;
export const moveName = (mv) => MOVES[mv]?.name ?? mv;
// 숫자 뒤 조사: 끝자리 읽기의 받침 (0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔)
export const numJosa = (n, pair) => { const [b, nb] = pair.split('/'); return `${n}${[0, 1, 3, 6, 7, 8].includes(n % 10) ? b : nb}`; };

// progress 이벤트 → 표시 단계 (skip·evolve 는 표시하지 않음)
export function stepsFromEvents(events) {
  const steps = [];
  for (const e of events) {
    const n = nameOf(e.species);
    if (e.type === 'level') steps.push({ kind: 'msg', text: [`${n}의 레벨이 ${numJosa(e.to, '이/가')} 되었다!`, `HP ${e.before.hp}→${e.after.hp}  공격 ${e.before.atk}→${e.after.atk}`] });
    else if (e.type === 'learned') steps.push({ kind: 'msg', text: [`${josa(n, '은/는')} ${josa(moveName(e.move), '을/를')} 배웠다!`] });
    else if (e.type === 'choose') steps.push({ kind: 'choose', event: e });
  }
  return steps;
}

// 메뉴 위치 (그리기와 클릭 판정이 같은 값을 쓰도록)
function chooseMenu(m) {
  const items = [...m.moves.map((mv) => ({ label: moveName(mv), enabled: true })), { label: '배우지 않는다', enabled: true }];
  const r = ui.menuRect(items, 0, 0);
  return { items, x: W - r.w - 4, y: H - 54 - r.h, r };
}
const YES_NO = [{ label: '예', enabled: true }, { label: '아니요', enabled: true }];
function confirmMenu() {
  const r = ui.menuRect(YES_NO, 0, 0);
  return { items: YES_NO, x: W - r.w - 4, y: H - 54 - r.h, r };
}
function hit(menu, ev) {
  const { x, y } = menu, { w, h } = menu.r;
  if (ev.px === undefined || ev.px < x || ev.px >= x + w || ev.py < y || ev.py >= y + h) return -1;
  const i = ui.menuIndexAt(menu.items, x, y, ev.py);
  return i >= 0 && i < menu.items.length ? i : -1;
}

// member(e): 이벤트의 멤버를 찾는 함수 (진화 중엔 종족이 바뀌므로 호출 측이 결정)
// 기술 선택: 커서는 '배우지 않는다'에서 시작, 무엇을 고르든 예/아니요 확인(기본 아니요) → 연타로는 아무것도 잃지 않는다
export function createLearnFlow({ steps, member, onFinish }) {
  let i = 0, cursor = null, t = 0, finished = false, confirm = null; // confirm = { cursor: 0 예 | 1 아니요 }
  const step = () => steps[i];
  const finish = () => { if (!finished) { finished = true; onFinish(); } };
  const next = () => { i++; t = 0; cursor = null; confirm = null; if (i >= steps.length) finish(); };

  function apply(e) {
    const m = member(e);
    const n = nameOf(m.species);
    if (cursor >= m.moves.length) {
      resolveChoice(m, e.move, null);
      steps.splice(i + 1, 0, { kind: 'msg', text: [`${josa(n, '은/는')} ${josa(moveName(e.move), '을/를')} 배우지 않았다.`] });
    } else {
      const old = m.moves[cursor];
      resolveChoice(m, e.move, cursor);
      steps.splice(i + 1, 0, { kind: 'msg', text: [`${josa(n, '은/는')} ${josa(moveName(old), '을/를')} 잊고`, `${josa(moveName(e.move), '을/를')} 배웠다!`] });
    }
    next();
  }

  return {
    get done() { return finished; },
    get pending() {
      const s = step();
      if (!s || finished) return null;
      return s.kind === 'choose' ? { type: 'choose', ...s.event, confirming: !!confirm } : { type: 'msg', text: s.text };
    },
    start() { t = 0; if (!steps.length) finish(); },
    handle(ev) {
      const s = step();
      if (!s || finished) return;
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (s.kind === 'msg') { if (pick) next(); return; }
      const m = member(s.event);
      cursor ??= m.moves.length; // 기본: 배우지 않는다
      if (confirm) {
        if (ev.type === 'dir' && ev.dy) confirm.cursor = 1 - confirm.cursor;
        if (ev.type === 'cancel') { confirm = null; t = 0; return; }
        let choice = confirm.cursor;
        if (ev.type === 'click') { const h = hit(confirmMenu(), ev); if (h < 0) return; choice = h; }
        if (!pick || t < CHOICE_LOCK) return;
        if (choice === 0) apply(s.event);
        else { confirm = null; t = 0; }
        return;
      }
      const n = m.moves.length + 1;
      if (ev.type === 'dir' && ev.dy) cursor = (cursor + ev.dy + n) % n;
      if (ev.type === 'click') { const h = hit(chooseMenu(m), ev); if (h < 0) return; cursor = h; }
      if (pick && t >= CHOICE_LOCK) { confirm = { cursor: 1 }; t = 0; }
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      const s = step();
      if (!s || finished) return;
      if (s.kind === 'msg') { ui.drawMessage(ctx, s.text, null, Math.floor(time * 3) % 2 === 0); return; }
      const e = s.event, m = member(e), n = nameOf(m.species);
      const c = cursor ?? m.moves.length;
      if (confirm) {
        const q = c >= m.moves.length
          ? [`${josa(moveName(e.move), '을/를')} 배우는 것을`, '포기할까?']
          : [`${josa(moveName(m.moves[c]), '을/를')} 잊고`, `${josa(moveName(e.move), '을/를')} 배울까?`];
        ui.drawMessage(ctx, q, null, false);
        const cm = confirmMenu();
        ui.drawMenu(ctx, cm.items, confirm.cursor, cm.x, cm.y);
        return;
      }
      ui.drawMessage(ctx, [`${josa(n, '은/는')} ${josa(moveName(e.move), '을/를')} 배우고 싶다...`, '어떤 기술을 잊게 할까?'], null, false);
      const cm = chooseMenu(m);
      ui.drawMenu(ctx, cm.items, c, cm.x, cm.y);
    },
  };
}

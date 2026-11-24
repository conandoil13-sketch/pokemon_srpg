// 자세히 보기: 정보 · 능력치 · 기술 · 특성 4페이지 (좌우 = 페이지, 위아래 = 다른 동료, 취소 = 닫기)
import { HELD_ITEMS } from '../data/heldItems.js';
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { ABILITIES } from '../data/abilities.js';
import { josa } from '../data/text.js';
import { statsAt, expForLevel, MAX_LEVEL } from '../core/stats.js';
import { typesOfMember, abilityOf, unlockAbility, setAbilitySlot, ABILITY_UNLOCK_COST, unlockHidden, hiddenPending, HIDDEN_UNLOCK_COST } from '../core/progress.js';
import { lineRoot } from '../core/gacha.js';
import { memberKey } from '../core/members.js';
import { effectiveBase } from '../core/dittoBuild.js';
import { genderFixed, setGender, ivGrade, usableGenders } from '../core/individual.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { drawPortrait } from '../render/sprites.js';
import { W, H } from '../render/screen.js';
import { evolutionHint, fitLines } from './memberText.js';
import { CATEGORY_KO, moveStatLine } from './moveInfo.js';
import { CHOICE_LOCK } from './learnFlow.js';

export const PAGES = ['정보', '능력치', '기술', '특성'];
const TAB_W = Math.floor((W - 4) / PAGES.length);
const STAT_ROWS = [['hp', 'HP'], ['atk', '공격'], ['def', '방어'], ['spa', '특공'], ['spd', '특방'], ['spe', '스피드']];

export function createSummary({ game, list, index = 0, page = 0, onSave = () => {}, onClose }) {
  let i = Math.max(0, Math.min(list.length - 1, index)), pg = page, msg = null, t = 0;
  const member = () => list[i];
  const shards = (m) => game.shards?.[lineRoot(m.species)] ?? 0;
  const say = (lines) => { msg = lines; t = 0; };

  // 특성 페이지: 행 = 일반 특성들 + 숨겨진 특성. 위아래로 고르고 확인 = 그 특성으로 (잠겼으면 해금)
  const ROW_Y = 84, ROW_H = 15;
  const abilityRows = (m) => [...SPECIES[m.species].abilities.map((id, slot) => ({ id, slot })), ...(SPECIES[m.species].hidden ? [{ id: SPECIES[m.species].hidden, slot: 'hidden' }] : [])];
  const hiddenUsed = (m) => !!m.hiddenOn && !!SPECIES[m.species].hidden; // 지금 모습에 숨겨진 특성이 없으면 일반 칸이 쓰임
  const isCurrent = (m, row) => (row.slot === 'hidden' ? hiddenUsed(m) : !hiddenUsed(m) && row.slot === (m.abilitySlot ?? 0));
  const defaultRow = (m) => Math.max(0, abilityRows(m).findIndex((r) => !isCurrent(m, r)));
  let ac = null; // 특성 커서 (null = 기본: 지금 것이 아닌 첫 행)
  const abilityCursor = () => { const n = abilityRows(member()).length; return ac === null || ac >= n ? defaultRow(member()) : ac; };
  function abilityAction() {
    const m = member(), name = SPECIES[m.species].name, key = memberKey(m);
    if (m.build) { say(['메타몽의 특성은', '박스 메뉴의 메타몽 빌드에서 바꾼다.']); return; }
    const rows = abilityRows(m);
    if (rows.length < 2) { say([`${name}의 특성은 하나뿐이다.`]); return; }
    const row = rows[abilityCursor()];
    if (isCurrent(m, row)) { say([`이미 ${josa(ABILITIES[row.id].name, '이다/다')}.`]); return; }
    if (row.slot === 'hidden') {
      if (!m.hiddenUnlocked) {
        const r = unlockHidden(game, key);
        if (r.reason === 'pending') { say(['아직 이 게임에서 효과가 없어', '해금할 수 없다.']); return; }
        if (!r.ok) { say([`${name}의 결정이 모자란다.`, `(${shards(m)}/${HIDDEN_UNLOCK_COST})`]); return; }
      } else setAbilitySlot(game, key, 'hidden');
    } else if (row.slot !== (m.abilitySlot ?? 0) && !m.abilityUnlocked) {
      const r = unlockAbility(game, key);
      if (!r.ok) { say([`${name}의 결정이 모자란다.`, `(${shards(m)}/${ABILITY_UNLOCK_COST})`]); return; }
      setAbilitySlot(game, key, row.slot);
    } else setAbilitySlot(game, key, row.slot);
    onSave();
    ac = null; // 연타하면 다음 특성으로 (왕복)
    say([`${name}의 특성이`, `${josa(ABILITIES[abilityOf(m)].name, '으로/로')} 바뀌었다!`]);
  }

  // 정보 페이지 확인: 성별 전환 (뽑기에서 얻은 적 있는 성별로만, 비용 없음)
  function genderAction() {
    const m = member(), name = SPECIES[m.species].name;
    if (genderFixed(m.species)) { say([`${name}의 성별은 바꿀 수 없다.`]); return; }
    const other = m.gender === 'male' ? 'female' : 'male';
    if (!usableGenders(m).includes(other)) { say(['다른 성별을 얻은 적이 없다.', '뽑기에서 다른 성별이 나오면 고를 수 있다.']); return; }
    setGender(game, memberKey(m), other);
    onSave();
    say([`${name}의 성별을 ${other === 'male' ? '♂' : '♀'}로 바꿨다.`]);
  }

  return {
    get page() { return pg; },
    get member() { return member(); },
    get mode() { return msg ? 'msg' : 'page'; },
    get message() { return msg; },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (msg) { if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) msg = null; return; }
      if (ev.type === 'cancel') { onClose(member()); return; }
      if (ev.type === 'dir' && ev.dx) pg = (pg + ev.dx + PAGES.length) % PAGES.length;
      if (ev.type === 'dir' && ev.dx) ac = null;
      if (ev.type === 'dir' && ev.dy && pg === 3 && !member().build && abilityRows(member()).length > 1) { const n = abilityRows(member()).length; ac = (abilityCursor() + ev.dy + n) % n; return; } // 특성 페이지: 위아래 = 특성 고르기
      if (ev.type === 'dir' && ev.dy && list.length) { i = (i + ev.dy + list.length) % list.length; ac = null; }
      if (ev.type === 'click' && ev.py !== undefined && ev.py < 16) { pg = Math.max(0, Math.min(PAGES.length - 1, Math.floor((ev.px - 2) / TAB_W))); return; } // 탭
      if (ev.type === 'click' && pg === 3 && ev.py !== undefined) { // 특성 행을 누르면 그 행을 고르고 실행
        const k = Math.floor((ev.py - ROW_Y) / ROW_H);
        if (k < 0 || k >= abilityRows(member()).length) return;
        ac = k;
      }
      if (pick && pg === 3) abilityAction();
      if (ev.type === 'confirm' && pg === 0) genderAction();
      if (ev.type === 'click' && pg === 0 && !genderFixed(member().species) && ev.py >= 146 && ev.py < 160) genderAction(); // 성별 줄을 눌렀을 때만
    },
    update(dt) { t += dt; },
    draw(ctx, time) {
      ctx.fillStyle = '#1c2840';
      ctx.fillRect(0, 0, W, H);
      PAGES.forEach((p, k) => {
        const x = 2 + k * TAB_W;
        ui.drawWindow(ctx, x, 1, TAB_W - 2, 16, k === pg ? '#fff8d8' : '#b8c0d0');
        drawText(ctx, p, x + Math.floor((TAB_W - 2 - textWidth(p, 'small')) / 2), 4, k === pg ? '#383838' : '#606870', null, 'small');
      });
      const m = member(), s = SPECIES[m.species];
      ui.drawWindow(ctx, 2, 18, W - 4, H - 20);
      drawPortrait(ctx, m.species, 'Normal', 8, 23);
      const nameEnd = ui.drawNameWithGender(ctx, m.species, m.gender, 54, 23);
      drawText(ctx, `Lv.${m.level}`, nameEnd + 8, 23);
      typesOfMember(m).forEach((ty, k) => ui.drawTypeBadge(ctx, ty, 54 + k * 34, 39)); // 메타몽은 빌드 타입
      const sub = pg === 3 && !m.build && abilityRows(m).length > 1 ? `${i + 1}/${list.length}` : `${i + 1}/${list.length}  ▲▼ 다른 동료`; // 특성 페이지에선 위아래 = 특성
      drawText(ctx, sub, W - 10 - textWidth(sub, 'small'), 52, '#909090', null, 'small');
      const y0 = 68, small = (text, x, y, c = '#383838') => drawText(ctx, text, x, y, c, null, 'small');
      if (pg === 0) {
        const lo = expForLevel(s.growth, m.level), hi = m.level >= MAX_LEVEL ? lo + 1 : expForLevel(s.growth, m.level + 1);
        const r = Math.max(0, Math.min(1, (m.exp - lo) / (hi - lo)));
        small(m.level >= MAX_LEVEL ? '최대 레벨' : `다음 Lv까지 ${hi - m.exp}`, 10, y0);
        ctx.fillStyle = '#404040'; ctx.fillRect(10, y0 + 13, 160, 5);
        ctx.fillStyle = '#58b8f8'; ctx.fillRect(11, y0 + 14, Math.round(158 * r), 3);
        small(`진화: ${evolutionHint(m)}`, 10, y0 + 24);
        small(`${SPECIES[lineRoot(m.species)].name} 계열 결정: ${shards(m)}개`, 10, y0 + 38);
        const out = m.species === 'ditto' || game.sortie.some((k) => String(k) === String(memberKey(m)));
        small(out ? '출전 중' : '대기 중', 10, y0 + 52, out ? '#2860c8' : '#808080');
        small(`도구: ${m.held ? HELD_ITEMS[m.held].name : '없음'}`, 90, y0 + 52, m.held ? '#383838' : '#a0a0a0'); // 지닌 도구
        small(`특성: ${ABILITIES[abilityOf(m)]?.name ?? '-'} · 몸무게 ${m.build?.weight ?? s.weight}kg`, 10, y0 + 66);
        if (!genderFixed(m.species)) small(`확인: 성별 바꾸기 (${usableGenders(m).length > 1 ? '♂/♀' : '다른 성별 없음'})`, 10, y0 + 80, usableGenders(m).length > 1 ? '#c06010' : '#a0a0a0');
      } else if (pg === 1) {
        const st = statsAt(m.build ? effectiveBase(m.build) : s.base, m.level, m.ivs), top = Math.max(...Object.values(st)) * 1.1; // 가장 큰 값 기준
        STAT_ROWS.forEach(([k, label], r) => {
          const y = y0 + r * 14;
          small(label, 10, y);
          small(String(st[k]), 50, y);
          ctx.fillStyle = '#d8d8d0'; ctx.fillRect(80, y + 4, 90, 5);
          ctx.fillStyle = k === 'hp' ? '#58c060' : '#e0a040'; ctx.fillRect(80, y + 4, Math.round(90 * st[k] / top), 5);
          const iv = m.ivs?.[k] ?? 31;
          small(`IV ${iv} ${ivGrade(iv)}`, 174, y, iv >= 31 ? '#c06010' : '#707070'); // 본가식 판정
        });
        small(`이동력 ${s.move}`, 10, y0 + 86);
      } else if (pg === 2) {
        m.moves.forEach((id, r) => {
          const mv = MOVES[id], y = y0 + r * 28;
          drawText(ctx, mv.name, 10, y);
          ui.drawTypeBadge(ctx, mv.type, 120, y + 1);
          small(CATEGORY_KO[mv.category] ?? '', 158, y + 2);
          small(moveStatLine(mv), 10, y + 13, '#606060'); // 흡수·반동·연속 등
        });
      } else {
        const cur = ABILITIES[abilityOf(m)];
        drawText(ctx, `특성 ${cur?.name ?? '-'}`, 10, y0, cur?.inactive ? '#909090' : '#305830');
        if (m.build) { fitLines(cur?.desc ?? '', W - 24).slice(0, 2).forEach((l, k) => small(l, 10, y0 + 14 + k * 11, '#505050')); small('메타몽 빌드에서 특성 캡슐로 바꾼다.', 10, y0 + 46, '#808080'); }
        else {
          const rows = abilityRows(m), cursor = abilityCursor();
          rows.forEach((row, k) => {
            const y = ROW_Y + k * ROW_H, a = ABILITIES[row.id], here = isCurrent(m, row), hidden = row.slot === 'hidden';
            if (rows.length > 1 && k === cursor) small('▶', 10, y, '#c06010');
            small(`${a?.name ?? '-'}${hidden ? ' (숨겨진)' : ''}`, 20, y, here ? '#305830' : '#383838');
            const pend = hidden && !m.hiddenUnlocked && hiddenPending(m.species);
            const state = here ? '사용 중' : hidden ? (m.hiddenUnlocked ? '' : pend ? '준비 중' : `해금 결정 ${shards(m)}/${HIDDEN_UNLOCK_COST}`)
              : row.slot !== (m.abilitySlot ?? 0) && !m.abilityUnlocked ? `해금 결정 ${shards(m)}/${ABILITY_UNLOCK_COST}` : '';
            if (state) small(state, W - 14 - textWidth(state, 'small'), y, here ? '#2860c8' : pend ? '#a0a0a0' : '#c06010');
          });
          const pick = ABILITIES[rows[rows.length > 1 ? cursor : 0].id];
          fitLines(pick?.desc ?? '', W - 24).slice(0, 3).forEach((l, k) => small(l, 10, ROW_Y + rows.length * ROW_H + 6 + k * 11, '#505050'));
          small(rows.length > 1 ? '▲▼ 특성 고르기 · 확인: 바꾸기/해금' : '특성은 하나뿐이다.', 10, H - 18, '#808080');
        }
      }
      if (msg) ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
    },
  };
}

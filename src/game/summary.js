// 자세히 보기: 정보 · 능력치 · 기술 · 특성 4페이지 (좌우 = 페이지, 위아래 = 다른 동료, 취소 = 닫기)
import { SPECIES } from '../data/species.js';
import { MOVES } from '../data/moves.js';
import { ABILITIES } from '../data/abilities.js';
import { josa } from '../data/text.js';
import { statsAt, expForLevel, MAX_LEVEL } from '../core/stats.js';
import { typesOfMember, abilityOf, unlockAbility, setAbilitySlot, ABILITY_UNLOCK_COST } from '../core/progress.js';
import { lineRoot } from '../core/gacha.js';
import { memberKey } from '../core/members.js';
import { effectiveBase } from '../core/dittoBuild.js';
import { genderFixed, setGender, ivGrade } from '../core/individual.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { drawPortrait } from '../render/sprites.js';
import { W, H } from '../render/screen.js';
import { evolutionHint, fitLines } from './memberText.js';
import { moveEffectTags } from './states.js';
import { CHOICE_LOCK } from './learnFlow.js';

export const PAGES = ['정보', '능력치', '기술', '특성'];
const TAB_W = Math.floor((W - 4) / PAGES.length);
const CATEGORY_KO = { physical: '물리', special: '특수', status: '변화' };
const STAT_ROWS = [['hp', 'HP'], ['atk', '공격'], ['def', '방어'], ['spa', '특공'], ['spd', '특방'], ['spe', '스피드']];

export function createSummary({ game, list, index = 0, page = 0, onSave = () => {}, onClose }) {
  let i = Math.max(0, Math.min(list.length - 1, index)), pg = page, msg = null, t = 0;
  const member = () => list[i];
  const shards = (m) => game.shards?.[lineRoot(m.species)] ?? 0;
  const say = (lines) => { msg = lines; t = 0; };

  // 특성 페이지 확인: 잠김 → 해금(바로 바뀜), 해금됨 → 공짜로 다른 특성
  function abilityAction() {
    const m = member(), name = SPECIES[m.species].name;
    if (m.build) { say(['메타몽의 특성은', '박스 메뉴의 메타몽 빌드에서 바꾼다.']); return; }
    if (SPECIES[m.species].abilities.length < 2) { say([`${name}의 특성은 하나뿐이다.`]); return; }
    if (!m.abilityUnlocked) {
      const r = unlockAbility(game, m.species);
      if (!r.ok) { say([`${name}의 결정이 모자란다.`, `(${shards(m)}/${ABILITY_UNLOCK_COST})`]); return; }
    } else setAbilitySlot(game, m.species, (m.abilitySlot ?? 0) === 0 ? 1 : 0);
    onSave();
    say([`${name}의 특성이`, `${josa(ABILITIES[abilityOf(m)].name, '으로/로')} 바뀌었다!`]);
  }

  // 정보 페이지 확인: 성별 전환 (뽑기에서 얻은 적 있는 성별로만, 비용 없음)
  function genderAction() {
    const m = member(), name = SPECIES[m.species].name;
    if (genderFixed(m.species)) { say([`${name}의 성별은 바꿀 수 없다.`]); return; }
    const other = m.gender === 'male' ? 'female' : 'male';
    if (!(m.genders ?? []).includes(other)) { say(['다른 성별을 얻은 적이 없다.', '뽑기에서 다른 성별이 나오면 고를 수 있다.']); return; }
    setGender(game, m.species, other);
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
      if (ev.type === 'dir' && ev.dy && list.length) i = (i + ev.dy + list.length) % list.length;
      if (ev.type === 'click' && ev.py !== undefined && ev.py < 16) { pg = Math.max(0, Math.min(PAGES.length - 1, Math.floor((ev.px - 2) / TAB_W))); return; } // 탭
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
      const sub = `${i + 1}/${list.length}  ▲▼ 다른 동료`;
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
        small(`특성: ${ABILITIES[abilityOf(m)]?.name ?? '-'} · 몸무게 ${m.build?.weight ?? s.weight}kg`, 10, y0 + 66);
        if (!genderFixed(m.species)) small(`확인: 성별 바꾸기 (${(m.genders ?? []).length > 1 ? '♂/♀' : '다른 성별 없음'})`, 10, y0 + 80, (m.genders ?? []).length > 1 ? '#c06010' : '#a0a0a0');
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
          small([mv.weightPower ? '위력 몸무게' : mv.fixedDamage ? '위력 고정' : `위력 ${mv.power ?? '-'}`, `명중 ${mv.accuracy ?? '-'}`, ui.shapeLabel(mv), ...moveEffectTags(mv)].filter(Boolean).join(' · '), 10, y + 13, '#606060'); // 흡수·반동·연속 등
        });
      } else {
        const cur = ABILITIES[abilityOf(m)], slots = s.abilities;
        drawText(ctx, `특성 ${cur?.name ?? '-'}`, 10, y0, cur?.inactive ? '#909090' : '#305830');
        fitLines(cur?.desc ?? '', W - 24).slice(0, 2).forEach((l, k) => small(l, 10, y0 + 14 + k * 11, '#505050'));
        if (m.build) small('메타몽 빌드에서 특성 캡슐로 바꾼다.', 10, y0 + 46, '#808080');
        else if (slots.length < 2) small('특성은 하나뿐이다.', 10, y0 + 46, '#808080');
        else {
          const other = ABILITIES[slots[(m.abilitySlot ?? 0) === 0 ? 1 : 0]];
          drawText(ctx, `다른 특성 ${other?.name ?? '-'}`, 10, y0 + 42, m.abilityUnlocked ? '#305830' : '#808080');
          fitLines(other?.desc ?? '', W - 24).slice(0, 2).forEach((l, k) => small(l, 10, y0 + 56 + k * 11, '#707070'));
          const action = m.abilityUnlocked ? '확인: 이 특성으로 바꾸기' : `확인: 해금 (결정 ${shards(m)}/${ABILITY_UNLOCK_COST})`;
          const ok = m.abilityUnlocked || shards(m) >= ABILITY_UNLOCK_COST;
          small(action, 10, y0 + 82, ok ? '#c06010' : '#a0a0a0');
        }
      }
      if (msg) ui.drawMessage(ctx, msg, null, Math.floor(time * 3) % 2 === 0);
    },
  };
}

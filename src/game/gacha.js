// 모집소: 1회(100코인) = 볼 3개 중 하나 고르기, 10연속(900코인) = 볼 10개 전부 내 것.
// 볼은 클릭마다 몬스터 → 슈퍼(희귀) → 하이퍼(매우 희귀)로 바뀐 뒤 열린다. 결제·저장은 고르는(나오는) 순간
import { SPECIES } from '../data/species.js';
import { josa } from '../data/text.js';
import { rollBalls, claimBall, claimBalls, BALL_OF, GACHA_COST, GACHA_TEN_COST } from '../core/gacha.js';
import * as ui from '../render/ui.js';
import { drawText, textWidth } from '../render/font.js';
import { drawUnitSprite, requestSprites, DIR } from '../render/sprites.js';
import { drawBall, nextBall } from '../render/balls.js';
import { createFxManager } from '../render/fx.js';
import { W, H } from '../render/screen.js';
import { CHOICE_LOCK } from './learnFlow.js';

const RARITY = { common: { name: '평범', color: '#f8f8f8' }, rare: { name: '희귀', color: '#58a8f8' }, epic: { name: '매우 희귀', color: '#f8c830' } };
const STEP_LOCK = 0.25;   // 볼 한 단계 뒤 연타 방지
const AUTO_STEP = 0.4;    // 안 고른 볼 자동 공개 간격
const TEN_AUTO = 0.12;    // 10연속 모두 열기 간격
const SHAKE = 0.45;
const RETURN_LOCK = 1.0; // 뽑기를 마치고 메뉴로 돌아온 뒤 연타로 다시 사지 않게
const THREE_X = [W / 2 - 72, W / 2, W / 2 + 72];
const TEN_POS = Array.from({ length: 10 }, (_, i) => ({ x: 28 + (i % 5) * 50, y: i < 5 ? 40 : 94 })); // 둘째 줄 이름이 대사 창에 안 가리게

// 중복 대사: 결정 + 오른 개체값 + 새로 고를 수 있게 된 성별
const IV_KO = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' };
export function duplicateLines(r) {
  const name = SPECIES[r.species].name;
  const extra = [r.ivUp?.length ? `${r.ivUp.map((k) => IV_KO[k]).join('·')} 개체값이 올랐다!` : '', r.newGender ? `${r.newGender === 'male' ? '♂' : '♀'} 해금!` : ''].filter(Boolean).join(' ');
  return extra ? [`이미 ${name} 계열! 결정 +1`, extra] : [`이미 ${name} 계열이 있다!`, `${name}의 결정을 얻었다.`];
}

export function createGachaScene({ game, rng, onBack, onPulled }) {
  let mode = 'menu', cursor = 0, menuCursor = 0, t = 0, clock = 0, msg = null;
  let balls = [], chosen = -1, result = null, results = null, auto = 0, autoOn = false;
  const fxm = createFxManager({ makeCanvas: typeof document !== 'undefined' ? (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) : null });
  const items = () => [
    { label: `뽑기 (${GACHA_COST}코인)`, enabled: true },
    { label: `10연속 (${GACHA_TEN_COST}코인)`, enabled: true },
    { label: '돌아가기', enabled: true },
  ];
  const menuBox = () => { const r = ui.menuRect(items(), 0, 0); return { x: W - r.w - 4, y: H - 54 - r.h, w: r.w, h: r.h }; };
  const say = (lines) => { msg = lines; mode = 'msg'; t = 0; };
  let menuLock = CHOICE_LOCK;
  const toMenu = (lock = CHOICE_LOCK) => { mode = 'menu'; t = 0; menuLock = lock; balls = []; chosen = -1; cursor = menuCursor; }; // 메뉴는 마지막 고른 줄로

  const makeBalls = (list) => list.map((b) => ({ ...b, kind: 'poke', target: BALL_OF[b.rarity], opened: false, shake: 0 }));
  // 볼 한 단계: 목표 볼보다 낮으면 바뀌고, 같으면 열림
  function step(b, at) {
    if (b.kind !== b.target) {
      b.kind = nextBall(b.kind); b.shake = SHAKE;
      fxm.spawn({ id: 'pickups/collect-burst' }, at);
    } else {
      b.opened = true; b.shake = 0;
      if (b.rarity === 'epic') fxm.spawn({ id: 'ui/level-up' }, at);
    }
  }

  function startOne() {
    if ((game.coins ?? 0) < GACHA_COST) { say(['코인이 부족하다.', `(${GACHA_COST}코인 필요)`]); return; }
    balls = makeBalls(rollBalls(rng)); // 결과는 아직 안 보임 (모두 몬스터볼), 코인도 그대로
    requestSprites(balls.map((b) => b.species));
    cursor = 1; mode = 'choose'; t = 0;
  }
  function choose(i) {
    const r = claimBall(game, balls[i], rng);
    if (!r.ok) { say(['코인이 부족하다.', `(${GACHA_COST}코인 필요)`]); return; }
    result = r; chosen = i;
    onPulled(r); // 고르는 순간 저장
    mode = 'open'; t = 0;
  }
  function startTen() {
    if ((game.coins ?? 0) < GACHA_TEN_COST) { say(['코인이 부족하다.', `(${GACHA_TEN_COST}코인 필요)`]); return; }
    balls = makeBalls(rollBalls(rng, 10));
    requestSprites(balls.map((b) => b.species));
    const r = claimBalls(game, balls, rng);
    results = r.results;
    onPulled(r);
    mode = 'ten'; t = 0; autoOn = false; auto = 0;
  }

  return {
    get mode() { return mode; },
    get cursor() { return cursor; },
    get balls() { return balls.map(({ kind, opened }, i) => ({ kind, opened, chosen: i === chosen })); },
    handle(ev) {
      const pick = ev.type === 'confirm' || ev.type === 'click';
      if (mode === 'msg') { if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) toMenu(); return; }
      if (mode === 'menu') {
        if (ev.type === 'cancel') { onBack(); return; }
        if (ev.type === 'dir' && ev.dy) cursor = (cursor + ev.dy + 3) % 3;
        if (ev.type === 'click') { // 누른 줄만 (메뉴 밖 클릭은 무시)
          const r = menuBox();
          if (ev.px < r.x || ev.px >= r.x + r.w || ev.py < r.y || ev.py >= r.y + r.h) return;
          const i = ui.menuIndexAt(items(), r.x, r.y, ev.py);
          if (i < 0 || i >= 3) return;
          cursor = i;
        }
        if (pick && t >= menuLock) {
          menuCursor = cursor === 1 ? 0 : cursor; // 10연속 뒤엔 1회 줄로 (연타 재구매 방지)
          if (cursor === 0) startOne(); else if (cursor === 1) startTen(); else onBack();
        }
        return;
      }
      if (mode === 'choose') {
        if (ev.type === 'cancel') { toMenu(); return; } // 고르기 전 취소: 코인 그대로
        if (ev.type === 'dir' && ev.dx) cursor = (cursor + ev.dx + 3) % 3;
        if (ev.type === 'click' && ev.px !== undefined) { // 볼 위를 누른 경우만 그 볼, 그 밖은 지금 커서 볼
          const hit = THREE_X.findIndex((x) => Math.abs(ev.px - x) <= 18 && ev.py >= 54 && ev.py <= 100);
          if (hit >= 0) cursor = hit;
        }
        if (ev.type === 'cursor' && ev.px !== undefined) { // 마우스를 올리면 그 볼로
          const hit = THREE_X.findIndex((x) => Math.abs(ev.px - x) <= 18 && ev.py >= 54 && ev.py <= 100);
          if (hit >= 0) cursor = hit;
        }
        if (pick && t >= CHOICE_LOCK) choose(cursor);
        return;
      }
      if (mode === 'open') {
        const b = balls[chosen];
        if (!pick) return;
        if (!b.opened) { if (t >= STEP_LOCK) { step(b, { x: W / 2, y: 72 }); t = 0; } }
        else if (t >= CHOICE_LOCK) { mode = 'others'; t = 0; auto = 0; }
        return;
      }
      if (mode === 'others') { if (pick && t >= CHOICE_LOCK && balls.every((b) => b.opened)) toMenu(RETURN_LOCK); return; }
      if (mode === 'ten') {
        const next = balls.findIndex((b) => !b.opened);
        if (next < 0) { if (pick && t >= CHOICE_LOCK) { mode = 'tenList'; t = 0; } return; }
        if (ev.type === 'cancel') { autoOn = true; return; } // 모두 열기
        if (pick && t >= STEP_LOCK && !autoOn) { step(balls[next], TEN_POS[next]); t = 0; }
        return;
      }
      if (mode === 'tenList') { if ((pick || ev.type === 'cancel') && t >= CHOICE_LOCK) toMenu(RETURN_LOCK); }
    },
    update(dt) {
      t += dt; clock += dt;
      fxm.update(dt);
      for (const b of balls) b.shake = Math.max(0, b.shake - dt);
      const autoStep = (list, gap, posOf) => {
        auto += dt;
        if (auto < gap) return;
        auto = 0;
        const i = list.find((k) => !balls[k].opened);
        if (i !== undefined) { step(balls[i], posOf(i)); t = 0; }
      };
      if (mode === 'others') autoStep([0, 1, 2].filter((i) => i !== chosen), AUTO_STEP, (i) => ({ x: THREE_X[i], y: 72 }));
      if (mode === 'ten' && autoOn) autoStep(balls.map((_, i) => i), TEN_AUTO, (i) => TEN_POS[i]);
    },
    draw(ctx, time) {
      const g = ctx.createRadialGradient(W / 2, 80, 10, W / 2, 80, 170);
      g.addColorStop(0, '#3a4a78'); g.addColorStop(1, '#141a30');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, '모집소', 10, 6, '#f8f8f8', '#384868');
      const coins = `코인 ${game.coins ?? 0}`;
      drawText(ctx, coins, W - 10 - textWidth(coins), 6, '#f8d050', '#384868');
      const blink = Math.floor(time * 3) % 2 === 0;
      const wobble = (b) => (b.shake > 0 ? Math.sin(b.shake * 40) * 3 : 0);
      const sprite = (species, x, y, scale) => {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        drawUnitSprite(ctx, species, 'Idle', DIR.Down, clock, 0, 0);
        ctx.restore();
      };
      const label = (text, x, y, color) => drawText(ctx, text, Math.round(x - textWidth(text, 'small') / 2), y, color, '#202838', 'small');

      if (mode === 'menu') {
        drawBall(ctx, 'poke', W / 2, 74);
        ui.drawMessage(ctx, ['동료를 모집할까?', '볼 3개 중 하나를 고른다 · 10연속은 10% 할인'], null, false);
        const r = menuBox();
        ui.drawMenu(ctx, items(), cursor, r.x, r.y);
      } else if (mode === 'choose') {
        balls.forEach((b, i) => {
          const bob = i === cursor ? Math.round(Math.sin(clock * 6) * 2) - 3 : 0;
          drawBall(ctx, 'poke', THREE_X[i], 76 + bob);
          if (i === cursor) { ctx.fillStyle = '#f8d050'; ctx.fillRect(THREE_X[i] - 3, 98, 6, 3); ctx.fillRect(THREE_X[i] - 1, 96, 2, 2); }
        });
        ui.drawMessage(ctx, ['어느 볼을 열까?', '좌우로 고르고 확인'], null, blink);
      } else if (mode === 'open') {
        const b = balls[chosen];
        [0, 1, 2].filter((i) => i !== chosen).forEach((i, k) => drawBall(ctx, 'poke', k === 0 ? 24 : W - 24, 74, { r: 8 })); // 옆 볼은 작게 양쪽에서 대기
        if (!b.opened) {
          drawBall(ctx, b.kind, W / 2, 72, { r: 18, dx: wobble(b) });
          ui.drawMessage(ctx, ['클릭해서 열자!', ''], null, blink);
        } else {
          const rr = RARITY[b.rarity], name = SPECIES[b.species].name;
          drawBall(ctx, b.kind, W / 2, 98, { r: 10, open: 1 });
          sprite(b.species, W / 2, 70, 2);
          drawText(ctx, rr.name, Math.floor((W - textWidth(rr.name)) / 2), 112, rr.color, '#202838');
          ui.drawMessage(ctx, result.duplicate ? duplicateLines(result)
            : [`${josa(name, '이/가')} 동료가 되었다!`, `Lv.${result.member.level}로 합류`], null, blink);
        }
      } else if (mode === 'others') {
        balls.forEach((b, i) => {
          const x = THREE_X[i];
          if (i === chosen) { ctx.fillStyle = 'rgba(248,208,80,0.18)'; ctx.fillRect(x - 32, 30, 64, 92); label('내 볼', x, 32, '#f8d050'); }
          if (b.opened) {
            drawBall(ctx, b.kind, x, 104, { r: 8, open: 1 });
            sprite(b.species, x, 80, 1);
            label(SPECIES[b.species].name, x, 112, RARITY[b.rarity].color);
          } else drawBall(ctx, b.kind, x, 80, { dx: wobble(b) });
        });
        ui.drawMessage(ctx, balls.every((b) => b.opened) ? ['다른 볼에는 이런 포켓몬이 있었다!', ''] : ['다른 볼에는…', ''], null, blink);
      } else if (mode === 'ten') {
        balls.forEach((b, i) => {
          const { x, y } = TEN_POS[i];
          if (b.opened) {
            drawBall(ctx, b.kind, x, y + 22, { r: 6, open: 1 });
            sprite(b.species, x, y + 8, 1);
            label(SPECIES[b.species].name, x, y + 30, RARITY[b.rarity].color);
          } else drawBall(ctx, b.kind, x, y + 10, { r: 11, dx: wobble(b) });
        });
        ui.drawMessage(ctx, balls.every((b) => b.opened) ? ['모두 열었다!', '확인: 결과 보기'] : ['확인: 하나씩 열기', '취소: 모두 열기'], null, blink);
      } else if (mode === 'tenList') {
        ui.drawWindow(ctx, 4, 22, W - 8, H - 26);
        results.forEach((r, i) => {
          const x = i < 5 ? 10 : W / 2 + 4, y = 28 + (i % 5) * 30, name = SPECIES[r.species].name;
          drawText(ctx, name, x, y, RARITY[r.rarity].color === '#f8f8f8' ? '#383838' : RARITY[r.rarity].color, null);
          drawText(ctx, r.duplicate ? ['결정 +1', r.ivUp?.length ? '개체값↑' : '', r.newGender ? `${r.newGender === 'male' ? '♂' : '♀'} 해금` : ''].filter(Boolean).join(' ') : `새 동료 Lv.${r.member.level}`, x, y + 13, r.duplicate ? '#808080' : '#2f8a3a', null, 'small');
        });
      } else if (mode === 'msg') {
        ui.drawMessage(ctx, msg, null, blink);
      }
      fxm.draw(ctx, 'front', { x: 0, y: 0 });
    },
  };
}

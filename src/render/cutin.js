// 5세대풍 배틀 컷인 (spec §6). 로직 결과(result)를 재생만 한다.
import { SPECIES } from '../data/species.js';
import { TYPE_COLORS } from '../data/types.js';
import { drawBattleSprite } from './sprites.js';
import { drawWindow, drawHpBar } from './ui.js';
import { drawText, textWidth } from './font.js';
import { shade } from './pixels.js';
import { W, H } from './screen.js';

const AUTO = 1.2; // 메시지 자동 넘김(초)
const ALLY = { cx: 68, base: 146, pcx: 68, pcy: 140, prx: 54, pry: 10 };
const FOE = { cx: 188, base: 90, pcx: 188, pcy: 86, prx: 46, pry: 9 };

const nameOf = (u) => (u.side === 'enemy' ? `The foe's ${SPECIES[u.species].name}` : SPECIES[u.species].name);

function midMessages(defender, result) {
  const d = SPECIES[defender.species].name;
  if (!result.hit) return ['The attack missed!'];
  if (result.typeMult === 0) return [`It doesn't affect ${d}...`];
  const out = [];
  if (result.crit) out.push('A critical hit!');
  if (result.typeMult > 1) out.push("It's super effective!");
  else if (result.typeMult < 1) out.push("It's not very effective...");
  return out;
}

function ellipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(1 - (y / ry) ** 2));
    ctx.fillRect(cx - w, cy + y, w * 2, 1);
  }
}

function platform(ctx, p) {
  ellipse(ctx, p.pcx, p.pcy + 2, p.prx, p.pry, '#689850');
  ellipse(ctx, p.pcx, p.pcy, p.prx, p.pry, '#a8d880');
  ellipse(ctx, p.pcx - 4, p.pcy - 2, p.prx - 14, p.pry - 4, '#c8eca0');
}

function background(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#a8d8f8');
  g.addColorStop(0.45, '#e8f4f0');
  g.addColorStop(0.46, '#d8ecb8');
  g.addColorStop(1, '#b8dc98');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 먼 언덕 실루엣
  ctx.fillStyle = '#c8e4b0';
  for (let x = 0; x < W; x++) {
    const h = 6 + Math.round(4 * Math.sin(x / 23) + 3 * Math.sin(x / 9));
    ctx.fillRect(x, 86 - h, 1, h);
  }
}

function statusBox(ctx, unit, hp, x, y, showNumbers) {
  const s = SPECIES[unit.species];
  const h = showNumbers ? 40 : 30;
  drawWindow(ctx, x, y, 116, h, '#f8f8e8');
  drawText(ctx, s.name, x + 8, y + 6);
  drawText(ctx, 'Lv50', x + 116 - 8 - textWidth('Lv50'), y + 6);
  drawText(ctx, 'HP', x + 8, y + 18, '#f8a000', '#d0d0d0');
  drawHpBar(ctx, x + 22, y + 19, 86, Math.round(hp), unit.maxHp);
  if (showNumbers) {
    const t = `${Math.round(hp)}/${unit.maxHp}`;
    drawText(ctx, t, x + 116 - 8 - textWidth(t), y + 28);
  }
}

export function createCutin({ attacker, defender, move, result, hpBefore }) {
  const ally = attacker.side === 'ally' ? attacker : defender;
  const foe = ally === attacker ? defender : attacker;
  const pos = (u) => (u === ally ? ALLY : FOE);
  const kind = (u) => (u === ally ? 'back' : 'front');
  const landed = result.hit && result.typeMult > 0;

  const used = `${nameOf(attacker)} used ${move.name}!`;
  const steps = [
    { k: 'in', d: 0.3 },
    { k: 'lunge', d: 0.35, text: used },
    ...(landed ? [{ k: 'flash', d: 0.4, text: used }, { k: 'drain', d: 0.6, text: used }] : [{ k: 'wait', d: 0.3, text: used }]),
    ...midMessages(defender, result).map((text) => ({ k: 'msg', d: AUTO, text })),
    ...(result.fainted ? [{ k: 'faint', d: 0.4, text: '' }, { k: 'msg', d: AUTO, text: `${nameOf(defender)} fainted!` }] : []),
    { k: 'out', d: 0.25 },
  ];
  let i = 0, t = 0;
  let shownText = '';

  const hpAt = (u) => {
    if (u !== defender) return u.hp;
    const s = steps[i]?.k;
    const before = steps.slice(0, i).some((x) => x.k === 'drain');
    if (s === 'drain') return hpBefore + (defender.hp - hpBefore) * Math.min(1, t / steps[i].d);
    return before ? defender.hp : hpBefore;
  };

  function drawMon(ctx, u) {
    const p = pos(u);
    const step = steps[i] ?? steps.at(-1);
    let dx = 0, dy = 0;
    if (u === attacker && step.k === 'lunge' && move.category === 'physical') {
      const k = Math.sin(Math.PI * Math.min(1, t / step.d));
      dx = (u === ally ? 14 : -14) * k;
      dy = (u === ally ? -8 : 8) * k;
    }
    if (u === defender) {
      if (step.k === 'flash' && Math.floor(t / 0.07) % 2 === 0) return;
      const fainted = steps.slice(0, i).some((x) => x.k === 'faint');
      if (fainted) return;
      if (step.k === 'faint') {
        dy = 70 * Math.min(1, t / step.d);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, p.base);
        ctx.clip();
        drawBattleSprite(ctx, u.species, kind(u), p.cx, p.base - 4 + dy);
        ctx.restore();
        return;
      }
    }
    drawBattleSprite(ctx, u.species, kind(u), p.cx + dx, p.base - 4 + dy);
  }

  function drawEffect(ctx) {
    const step = steps[i];
    if (!step) return;
    const color = TYPE_COLORS[move.type];
    const from = pos(attacker), to = pos(defender);
    const tx = to.cx, ty = to.base - 30;
    if (step.k === 'lunge' && move.category === 'special') {
      const k = Math.min(1, t / step.d);
      const x = from.cx + (tx - from.cx) * k, y = from.base - 30 + (ty - from.base + 30) * k;
      ellipse(ctx, Math.round(x), Math.round(y), 6, 6, shade(color, 0.6));
      ellipse(ctx, Math.round(x), Math.round(y), 4, 4, color);
      ellipse(ctx, Math.round(x) - 1, Math.round(y) - 1, 2, 2, '#ffffff');
    }
    if (step.k === 'flash') {
      const k = t / step.d;
      for (let n = 0; n < 10; n++) {
        const a = (n / 10) * Math.PI * 2;
        const r = 6 + k * 26;
        ctx.fillStyle = n % 2 ? color : '#ffffff';
        ctx.fillRect(Math.round(tx + Math.cos(a) * r) - 2, Math.round(ty + Math.sin(a) * r) - 2, 4, 4);
      }
    }
  }

  return {
    defender,
    get done() { return i >= steps.length; },
    update(dt) {
      if (i >= steps.length) return;
      t += dt;
      if (t >= steps[i].d) { t = 0; i++; }
    },
    advance() {
      const s = steps[i];
      if (s && s.k === 'msg') { t = 0; i++; }
    },
    draw(ctx) {
      const step = steps[i];
      if (!step) return;
      // 열림/닫힘: 가운데서 펼쳐지는 띠
      let open = 1;
      if (step.k === 'in') open = t / step.d;
      if (step.k === 'out') open = 1 - t / step.d;
      const bandH = Math.round(H * open);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, Math.round((H - bandH) / 2), W, bandH);
      ctx.clip();

      background(ctx);
      platform(ctx, FOE);
      platform(ctx, ALLY);
      drawMon(ctx, foe);
      drawMon(ctx, ally);
      drawEffect(ctx);
      statusBox(ctx, foe, hpAt(foe), 6, 8, false);
      statusBox(ctx, ally, hpAt(ally), W - 122, 98, true);

      if (step.text !== undefined) shownText = step.text || shownText;
      drawWindow(ctx, 2, 144, W - 4, 46, '#f8f8f8');
      if (step.k !== 'in' && step.k !== 'out') {
        drawText(ctx, shownText, 12, 156);
        if (step.k === 'msg' && Math.floor(t * 3) % 2 === 0) {
          ctx.fillStyle = '#e04040';
          ctx.fillRect(W - 18, 176, 5, 1); ctx.fillRect(W - 17, 177, 3, 1); ctx.fillRect(W - 16, 178, 1, 1);
        }
      }
      ctx.restore();
    },
  };
}

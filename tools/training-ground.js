// 훈련장은 본편 전투 화면에 배치와 기술만 전달한다. 조준·턴·판정·연출은 createGame이 처리한다.
import { createGame } from '../src/game/states.js';
import { newMember } from '../src/core/progress.js';
import { SPECIES } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';
import { requestSprites } from '../src/render/sprites.js';
import { shapeLabel } from '../src/render/ui.js';

export const startingCast = ['lucario', 'pikachu', 'bulbasaur', 'eevee', 'psyduck', 'sandshrew', 'machop', 'pidgey'];
export function trainingBattle(moveId, roster = startingCast, diagonal = false) {
  const party = roster.slice(0, 4).map((sp, i) => {
    const m = newMember(sp, 40);
    if (!i) m.moves = [moveId];
    return m;
  });
  const map = {
    tiles: Array.from({ length: 8 }, () => '..........'),
    allySlots: party.map((_, i) => ({ x: 4 - i, y: 3 })),
    enemies: roster.slice(4).map((species, i) => ({
      species, level: 40, x: diagonal ? 5 + Math.floor(i / 2) : 5 + i,
      y: diagonal ? 3 + Math.ceil(i / 2) : 3,
    })),
  };
  const hpRatio = Object.fromEntries(party.map(m => [m.species, 0.75]));
  return createGame({ rng: Math.random, map, party, hpRatio });
}

export function mountTraining(canvas, info, rosterBox) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let game, roster = startingCast, moveId, opening, lastRoster, previewActive = true;
  const hint = {
    target: '대상·방향·착탄 칸을 선택한 뒤 기술 사용',
    idle: '아군을 선택해 이동하거나 턴을 종료하세요.',
    selected: '이동할 칸을 고르세요. 현재 칸을 고르면 제자리에서 행동합니다.',
    action: '행동을 선택하세요.', retreat: '추가 이동할 칸을 고르거나 취소하세요.',
    anim: '전투 연출 · 확인으로 다음 대사', notice: '확인으로 계속',
    enemy: '상대 행동 중', banner: '턴 전환', result: '훈련 종료 · 배치 초기화로 다시 시작',
  };
  function restart(id = moveId) {
    moveId = id;
    requestSprites(roster);
    game = trainingBattle(id, roster, document.getElementById('formation').value === 'diagonal');
    opening = true;
    lastRoster = '';
  }
  function input(ev) { if (game && previewActive) game.handle(ev); }
  function frame(dt, time) {
    if (!previewActive || !game) return;
    game.update(dt);
    // 처음 한 번만 시전자의 제자리 행동 메뉴를 연다. 이후에는 일반 전투 입력 그대로.
    if (opening && game.mode === 'idle') {
      game.handle({ type: 'confirm' });
      if (game.mode === 'selected') game.handle({ type: 'confirm' });
      if (game.mode !== 'walking') opening = false;
    } else if (opening && game.mode === 'action') {
      opening = false;
      if (game.menu[0]?.enabled) game.handle({ type: 'confirm' });
    }
    game.draw(ctx, time);
    document.getElementById('end').disabled = game.mode !== 'idle';
    document.getElementById('cancel').disabled = !['target', 'action', 'selected', 'retreat', 'endMenu'].includes(game.mode);
    const st = game.state, mv = MOVES[moveId];
    const text = [mv.name, shapeLabel(mv), st.turn + '턴', hint[game.mode] ?? '진행 중'].filter(Boolean).join(' · ');
    if (info.textContent !== text) info.textContent = text;
    const caster = st.units.find(u => u.side === 'ally' && u.species === roster[0]);
    const rows = st.units.map(u => {
      const role = u === caster ? '시전자' : u.side === 'ally' ? '아군' : '적';
      const distance = caster && u !== caster ? ` · ${Math.abs(u.x - caster.x) + Math.abs(u.y - caster.y)}칸` : '';
      return `${role} ${SPECIES[u.species].name}${distance} · HP ${u.hp}/${u.maxHp}`;
    });
    if (rows.join('|') !== lastRoster) {
      lastRoster = rows.join('|');
      rosterBox.replaceChildren(...rows.map((s, i) => {
        const item = document.createElement('span'); item.textContent = s;
        item.className = st.units[i].side; return item;
      }));
    }
  }
  function pointer(e, type) {
    const r = canvas.getBoundingClientRect();
    input({ type, px: (e.clientX - r.left) * canvas.width / r.width, py: (e.clientY - r.top) * canvas.height / r.height, touch: e.pointerType !== 'mouse' });
  }
  canvas.onpointermove = e => { if (e.pointerType === 'mouse') pointer(e, 'cursor'); };
  canvas.onpointerup = e => { if (e.button === 0) { canvas.focus(); pointer(e, 'click'); } };
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  canvas.onkeydown = e => {
    const dir = arrows[e.key];
    const type = ({ Enter: 'confirm', ' ': 'confirm', z: 'confirm', Escape: 'cancel', x: 'cancel', e: 'endTurn' })[e.key];
    if (!dir && !type) return;
    e.preventDefault();
    input(dir ? { type: 'dir', dx: dir[0], dy: dir[1] } : { type });
  };
  return { restart, input, frame, setActive(value) { previewActive = value; },
    reroll() {
      const keys = Object.keys(SPECIES).filter(k => k !== 'ditto');
      roster = startingCast.map(() => keys.splice(Math.floor(Math.random() * keys.length), 1)[0]);
      restart();
    },
  };
}

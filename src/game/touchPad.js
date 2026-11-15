// 터치 기기용 게임기 버튼: 십자키 · A · B · START · SELECT → 키보드와 같은 게임 이벤트
// 순수 부분(대응표·누르고 있기 반복)과 화면에 붙이는 부분(mountPad)으로 나눈다.
export const PAD_EVENTS = {
  up: { type: 'dir', dx: 0, dy: -1 }, down: { type: 'dir', dx: 0, dy: 1 },
  left: { type: 'dir', dx: -1, dy: 0 }, right: { type: 'dir', dx: 1, dy: 0 },
  a: { type: 'confirm' }, b: { type: 'cancel' }, start: { type: 'endTurn' }, select: { type: 'sort' },
};
export const REPEAT_DELAY = 300, REPEAT_EVERY = 90; // ms — 키보드 반복과 비슷하게

// 누르고 있기: 십자키만 반복, 떼면 release (마을 계속 걷기 멈춤). 여러 버튼 동시 누름 가능
export function createRepeater() {
  const held = new Map(); // name → 다음 반복 시각
  const rel = (name) => { const e = PAD_EVENTS[name]; return { type: 'release', dx: e.dx, dy: e.dy }; };
  return {
    press(name, now) {
      const ev = PAD_EVENTS[name];
      if (!ev) return [];
      if (ev.type === 'dir') held.set(name, now + REPEAT_DELAY);
      return [ev];
    },
    release(name) {
      if (!held.has(name)) return [];
      held.delete(name);
      return [rel(name)];
    },
    tick(now) { // 한 번에 하나씩만 (오래 멈췄다 와도 몰아서 보내지 않음)
      const out = [];
      for (const [name, next] of held) {
        if (now < next) continue;
        out.push({ ...PAD_EVENTS[name], repeat: true });
        held.set(name, now + REPEAT_EVERY);
      }
      return out;
    },
    cancelAll() {
      const out = [...held.keys()].map(rel);
      held.clear();
      return out;
    },
  };
}

// ---- 화면에 붙이기 ----
export const isTouchDevice = () => typeof window !== 'undefined'
  && ((window.matchMedia?.('(pointer: coarse)').matches ?? false) || 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);

const buzz = () => { try { navigator.vibrate?.(10); } catch { /* 무시 */ } };

// 십자키는 한 덩어리: 누른 자리에서 가운데 기준 방향을 정하고, 엄지를 굴리면 방향이 바뀐다
const DEAD = 0.2; // 가운데 이만큼은 방향 없음
function dirAt(el, e) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
  if (Math.hypot(x, y) < DEAD / 2) return null;
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
}

export function mountPad(root, onEvent) {
  root.innerHTML = `
    <div class="pad-dpad" aria-label="십자키">
      <span class="arm up"></span><span class="arm down"></span><span class="arm left"></span><span class="arm right"></span><span class="hub"></span>
    </div>
    <div class="pad-ab"><button class="pad-b" data-k="b" aria-label="B 취소">B</button><button class="pad-a" data-k="a" aria-label="A 확인">A</button></div>
    <div class="pad-sys"><button data-k="select" aria-label="SELECT 정렬">SELECT</button><button data-k="start" aria-label="START 턴 종료">START</button></div>`;
  const rep = createRepeater();
  const send = (evs) => { for (const ev of evs) onEvent(ev); };
  const now = () => performance.now();
  const stop = (e) => e.preventDefault();

  // 십자키
  const dpad = root.querySelector('.pad-dpad');
  let dpadId = null, cur = null;
  const setDir = (d) => {
    if (d === cur) return;
    if (cur) { send(rep.release(cur)); dpad.classList.remove(`on-${cur}`); }
    cur = d;
    if (cur) { buzz(); send(rep.press(cur, now())); dpad.classList.add(`on-${cur}`); }
  };
  dpad.addEventListener('pointerdown', (e) => { stop(e); dpadId = e.pointerId; try { dpad.setPointerCapture(e.pointerId); } catch { /* 무시 */ } setDir(dirAt(dpad, e)); });
  dpad.addEventListener('pointermove', (e) => { if (e.pointerId === dpadId) setDir(dirAt(dpad, e)); });
  const dpadUp = (e) => { if (e.pointerId !== dpadId) return; dpadId = null; setDir(null); };
  dpad.addEventListener('pointerup', dpadUp);
  dpad.addEventListener('pointercancel', dpadUp);

  // A · B · START · SELECT
  for (const btn of root.querySelectorAll('button[data-k]')) {
    const k = btn.dataset.k;
    btn.addEventListener('pointerdown', (e) => { stop(e); btn.classList.add('on'); buzz(); send(rep.press(k, now())); });
    const up = () => { btn.classList.remove('on'); send(rep.release(k)); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }
  root.addEventListener('contextmenu', stop);

  // 반복 · 화면이 꺼지거나 다른 앱으로 가면 모두 뗀다 (마을에서 계속 걷지 않게)
  let raf = 0;
  const loop = () => { send(rep.tick(now())); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  const releaseAll = () => { cur = null; dpad.className = 'pad-dpad'; send(rep.cancelAll()); };
  const onVis = () => { if (document.hidden) releaseAll(); };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('blur', releaseAll);
  return { destroy() { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); removeEventListener('blur', releaseAll); root.innerHTML = ''; } };
}

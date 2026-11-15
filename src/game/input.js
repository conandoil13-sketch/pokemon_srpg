// 마우스/키보드 → 게임 이벤트
import { W, H } from '../render/screen.js';

const KEYS = {
  ArrowUp: { type: 'dir', dx: 0, dy: -1 }, ArrowDown: { type: 'dir', dx: 0, dy: 1 },
  ArrowLeft: { type: 'dir', dx: -1, dy: 0 }, ArrowRight: { type: 'dir', dx: 1, dy: 0 },
  z: { type: 'confirm' }, Z: { type: 'confirm' }, Enter: { type: 'confirm' }, ' ': { type: 'confirm' },
  x: { type: 'cancel' }, X: { type: 'cancel' }, Escape: { type: 'cancel' }, Backspace: { type: 'cancel' },
  e: { type: 'endTurn' }, E: { type: 'endTurn' },
  s: { type: 'sort' }, S: { type: 'sort' }, // 편성소 박스 정렬
};

// 화면 터치 (순수): 닿으면 그 칸으로 커서 + 클릭, 누른 채 끌면 커서만. 화면 밖이면 아무것도
export function touchToEvents(kind, p) {
  if (!p) return [];
  return kind === 'down' ? [{ type: 'cursor', ...p }, { type: 'click', ...p }] : [{ type: 'cursor', ...p }];
}

// getScale 은 인터페이스 호환용 (좌표는 실제 렌더 크기로 계산)
export function bindInput(canvas, getScale, onEvent) {
  const toPixel = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) / r.width * W);
    const py = Math.floor((e.clientY - r.top) / r.height * H);
    if (px < 0 || py < 0 || px >= W || py >= H) return null;
    return { px, py };
  };
  let last = '';
  canvas.addEventListener('mousemove', (e) => {
    const p = toPixel(e);
    if (!p) return;
    const k = `${p.px},${p.py}`;
    if (k === last) return;
    last = k;
    onEvent({ type: 'cursor', ...p });
  });
  canvas.addEventListener('mousedown', (e) => {
    const p = toPixel(e);
    if (!p) return;
    if (e.button === 2) { onEvent({ type: 'cancel' }); return; }
    if (e.button !== 0) return;
    onEvent({ type: 'cursor', ...p });
    onEvent({ type: 'click', ...p });
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // 터치: 따로 받아서 브라우저의 마우스 흉내(늦은 클릭·두 번 눌림)를 막는다. 마우스는 위 그대로
  let touchId = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    touchId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    const p = toPixel(e);
    if (p) last = `${p.px},${p.py}`;
    for (const ev of touchToEvents('down', p)) onEvent(ev);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || e.pointerId !== touchId) return;
    const p = toPixel(e);
    if (!p || `${p.px},${p.py}` === last) return;
    last = `${p.px},${p.py}`;
    for (const ev of touchToEvents('move', p)) onEvent(ev);
  });
  const lift = (e) => { if (e.pointerId === touchId) touchId = null; };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  addEventListener('keydown', (e) => {
    const ev = KEYS[e.key];
    if (!ev) return;
    e.preventDefault();
    if (e.repeat && ev.type !== 'dir') return;
    onEvent(e.repeat ? { ...ev, repeat: true } : ev); // 마을은 repeat 대신 release 로 '계속 누름'을 판단
  });
  addEventListener('keyup', (e) => {
    const ev = KEYS[e.key];
    if (ev?.type === 'dir') onEvent({ type: 'release', dx: ev.dx, dy: ev.dy });
  });
}

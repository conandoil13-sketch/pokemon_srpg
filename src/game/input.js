// 마우스/키보드 → 게임 이벤트
import { W, H } from '../render/screen.js';

const KEYS = {
  ArrowUp: { type: 'dir', dx: 0, dy: -1 }, ArrowDown: { type: 'dir', dx: 0, dy: 1 },
  ArrowLeft: { type: 'dir', dx: -1, dy: 0 }, ArrowRight: { type: 'dir', dx: 1, dy: 0 },
  z: { type: 'confirm' }, Z: { type: 'confirm' }, Enter: { type: 'confirm' }, ' ': { type: 'confirm' },
  x: { type: 'cancel' }, X: { type: 'cancel' }, Escape: { type: 'cancel' }, Backspace: { type: 'cancel' },
  e: { type: 'endTurn' }, E: { type: 'endTurn' },
};

// getScale 은 인터페이스 호환용 (좌표는 실제 렌더 크기로 계산)
export function bindInput(canvas, getScale, onEvent) {
  const toPixel = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) / r.width * W);
    const py = Math.floor((e.clientY - r.top) / r.height * H);
    if (px < 0 || py < 0 || px >= W || py >= H) return null;
    return { px, py, x: Math.floor(px / 16), y: Math.floor(py / 16) };
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
  addEventListener('keydown', (e) => {
    const ev = KEYS[e.key];
    if (!ev) return;
    e.preventDefault();
    if (e.repeat && ev.type !== 'dir') return;
    onEvent(ev);
  });
}

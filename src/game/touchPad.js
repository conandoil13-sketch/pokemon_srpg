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

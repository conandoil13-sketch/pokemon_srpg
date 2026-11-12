// PMD Sprite Collab 형식 (AnimData.xml + <Name>-Anim.png) 의 순수 데이터 처리. DOM 없음.
// 시트: 가로 = 프레임, 세로 = 8방향 (Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft)

export const DIR = { Down: 0, DownRight: 1, Right: 2, UpRight: 3, Up: 4, UpLeft: 5, Left: 6, DownLeft: 7 };

const tag = (src, name) => {
  const m = src.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
};

export function parseAnimData(xml) {
  const raw = {};
  for (const [, body] of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const name = tag(body, 'Name');
    raw[name] = {
      name,
      copyOf: tag(body, 'CopyOf'),
      frameW: Number(tag(body, 'FrameWidth')),
      frameH: Number(tag(body, 'FrameHeight')),
      hitFrame: tag(body, 'HitFrame') === null ? null : Number(tag(body, 'HitFrame')),
      durations: [...body.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1])),
    };
  }
  const resolve = (name, seen = new Set()) => {
    const a = raw[name];
    if (!a) return null;
    if (a.copyOf && !seen.has(name)) {
      seen.add(name);
      const base = resolve(a.copyOf, seen);
      return base && { ...base, name };
    }
    return { name, sheet: name, frameW: a.frameW, frameH: a.frameH, durations: a.durations, hitFrame: a.hitFrame };
  };
  const anims = {};
  for (const name of Object.keys(raw)) {
    const r = resolve(name);
    if (r) anims[name] = r;
  }
  return { shadowSize: Number(tag(xml, 'ShadowSize') ?? 1), anims };
}

const SECTOR_TO_DIR = { 0: DIR.Right, 1: DIR.DownRight, 2: DIR.Down, 3: DIR.DownLeft, 4: DIR.Left, '-4': DIR.Left, '-3': DIR.UpLeft, '-2': DIR.Up, '-1': DIR.UpRight };

export function dirFromDelta(dx, dy) {
  if (dx === 0 && dy === 0) return DIR.Down;
  const s = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return SECTOR_TO_DIR[s];
}

export const animLength = (a) => a.durations.reduce((s, d) => s + d, 0);

// ticks: 1/60초 단위 경과
export function frameAt(a, ticks, loop) {
  const len = animLength(a);
  let t = loop ? ((ticks % len) + len) % len : Math.min(ticks, len - 1);
  for (let i = 0; i < a.durations.length; i++) {
    if (t < a.durations[i]) return i;
    t -= a.durations[i];
  }
  return a.durations.length - 1;
}

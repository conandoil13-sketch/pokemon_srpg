// 아이언비즈 도안(nayakoko.com 걷기 도안: 앞·왼·오른·뒤 × 2프레임)으로 PMD 시트를 만든다
// 도안 사이트 조건: 도안으로 만든 작품은 공개 가능, 판매 금지 — credits.txt 에 출처·조건을 남긴다
//   node tools/bead-sprite.js fetch 564 tirtouga   도안을 받아 칸마다 색을 읽고 tools/sprite-art/beads/0564.json 에 저장
//   node tools/bead-sprite.js build 0564           저장된 도안으로 assets/sprites/pmd/sprite/0564/ (Idle 1 · Walk 2 · 공격=걷기)
//   node tools/bead-sprite.js build                저장된 도안 전부
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { readPng, writePng } from './png.js';

const BEADS = new URL('./sprite-art/beads/', import.meta.url);
const SPRITES = new URL('../assets/sprites/pmd/sprite/', import.meta.url);
const VIEWS = { front: 'mae', left: 'hidari', right: 'migi', back: 'ushiro' };
const CELL = 22; // 도안 한 칸 (px), 0번 줄·칸은 번호 머리
const SYM = 'abcdefghijklmnopqrstuvwxyz';

// 도안 그림 → 칸 색 (흰 칸 null). 오른쪽 색 범례는 그 앞의 빈 세로줄에서 자른다
export function readGrid(img) {
  const cols = Math.floor(img.w / CELL), rows = Math.floor(img.h / CELL), cells = [];
  for (let j = 1; j < rows; j++) {
    const row = [];
    for (let i = 1; i < cols; i++) {
      const q = ((CELL * j + 11) * img.w + CELL * i + 11) * 4, [r, g, b] = img.data.subarray(q, q + 3);
      row.push(r > 240 && g > 240 && b > 240 ? null : [r, g, b]);
    }
    cells.push(row);
  }
  const n = cells[0].length, blank = (c) => cells.every((row) => row[c] === null);
  let gap = -1;
  for (let c = n - 2; c >= Math.max(0, n - 4); c--) if (blank(c) && !blank(c + 1)) { gap = c; break; }
  if (gap < 0) throw new Error('색 범례 앞 빈 줄을 못 찾음');
  const grid = cells.map((row) => row.slice(0, gap));
  while (grid.length && grid[grid.length - 1].every((c) => c === null)) grid.pop();
  return grid;
}

export async function fetchBeads(dex, slug) {
  const page = `https://nayakoko.com/pokemon-perler-beads-${dex}-${slug}/`;
  const html = await (await fetch(page)).text();
  const urls = {};
  for (const [view, jp] of Object.entries(VIEWS)) for (const f of [1, 2]) {
    const m = html.match(new RegExp(`https://nayakoko\\.com/wp-content/uploads/\\d+/\\d+/0*${dex}(?:_\\d)+_${jp}_${f}\\.png`));
    if (!m) throw new Error(`${dex} ${jp}_${f} 도안 없음`);
    urls[`${view}${f}`] = m[0];
  }
  const palette = [], views = {};
  const sym = ([r, g, b]) => {
    let k = palette.findIndex(([R, G, B]) => Math.abs(R - r) + Math.abs(G - g) + Math.abs(B - b) < 24);
    if (k < 0) { k = palette.length; palette.push([r, g, b]); }
    return SYM[k];
  };
  for (const view of Object.keys(VIEWS)) {
    views[view] = [];
    for (const f of [1, 2]) {
      const img = readPng(Buffer.from(await (await fetch(urls[`${view}${f}`])).arrayBuffer()));
      views[view].push(readGrid(img).map((row) => row.map((c) => (c ? sym(c) : '.')).join('')));
    }
  }
  const hex = (c) => c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const data = { dex: String(dex).padStart(4, '0'), source: page, palette: Object.fromEntries(palette.map((c, k) => [SYM[k], hex(c)])), views };
  mkdirSync(BEADS, { recursive: true });
  writeFileSync(new URL(`${data.dex}.json`, BEADS), `${JSON.stringify(data, null, 1)}\n`);
  return data;
}

// 시트 줄: 0 아래 · 1 오른아래 · 2 오른 · 3 오른위 · 4 위 · 5 왼위 · 6 왼 · 7 왼아래 (대각은 옆모습으로)
const ROWS = ['front', 'right', 'right', 'right', 'back', 'left', 'left', 'left'];

export function buildSheets(data) {
  const all = Object.values(data.views).flat();
  const maxW = Math.max(...all.flatMap((f) => f.map((r) => r.length))), maxH = Math.max(...all.map((f) => f.length));
  const FW = Math.max(24, Math.ceil((maxW + 4) / 8) * 8);
  let FH = Math.max(24, Math.ceil((maxH + 2) / 8) * 8);
  while (FH / 2 + 5 + 2 < maxH) FH += 8; // 바닥(중심 +5) 위로 다 들어가게
  const FOOT = FH / 2 + 5;
  const sheet = (frames) => {
    const out = { w: FW * frames.length, h: FH * 8, data: Buffer.alloc(FW * frames.length * FH * 8 * 4) };
    ROWS.forEach((view, row) => {
      const views = data.views[view], first = views[0];
      const bottom = first.reduce((b, r, i) => (/[^.]/.test(r) ? i : b), 0);
      const cols = first.flatMap((r) => [...r].map((c, x) => (c !== '.' ? x : -1))).filter((x) => x >= 0);
      const ox = Math.round(FW / 2 - (Math.min(...cols) + Math.max(...cols) + 1) / 2), oy = FOOT - bottom;
      frames.forEach((fi, col) => views[fi].forEach((r, y) => [...r].forEach((c, x) => {
        if (c === '.' || oy + y < 0 || oy + y >= FH) return;
        const hex = data.palette[c], i = ((row * FH + oy + y) * out.w + col * FW + ox + x) * 4;
        for (let k = 0; k < 3; k++) out.data[i + k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
        out.data[i + 3] = 255;
      })));
    });
    return out;
  };
  const dir = new URL(`${data.dex}/`, SPRITES);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('Idle-Anim.png', dir), writePng(sheet([0])));
  writeFileSync(new URL('Walk-Anim.png', dir), writePng(sheet([0, 1])));
  const anim = (name, n, dur) => `    <Anim>\n      <Name>${name}</Name>\n      <FrameWidth>${FW}</FrameWidth>\n      <FrameHeight>${FH}</FrameHeight>\n      <Durations>\n${Array(n).fill(`        <Duration>${dur}</Duration>`).join('\n')}\n      </Durations>\n    </Anim>`;
  writeFileSync(new URL('AnimData.xml', dir), `<?xml version="1.0"?>\n<AnimData>\n  <ShadowSize>1</ShadowSize>\n  <Anims>\n${anim('Idle', 1, 40)}\n${anim('Walk', 2, 8)}\n    <Anim>\n      <Name>Attack</Name>\n      <CopyOf>Walk</CopyOf>\n    </Anim>\n  </Anims>\n</AnimData>\n`);
  writeFileSync(new URL('credits.txt', dir), `# nayakoko.com 아이언비즈 걷기 도안(앞·왼·오른·뒤)을 옮김 — ${data.source} (작품 공개 허용, 판매 금지). 대각 방향은 옆모습 재사용. 도구 tools/bead-sprite.js\n`);
  return { FW, FH };
}

if (process.argv[1]?.endsWith('bead-sprite.js')) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'fetch') { const d = await fetchBeads(args[0], args[1]); console.log(`${d.dex} 도안 저장 (색 ${Object.keys(d.palette).length}개)`); }
  else if (cmd === 'build') {
    const list = args.length ? args.map((a) => a.padStart(4, '0')) : readdirSync(BEADS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 4));
    for (const dex of list) { const s = buildSheets(JSON.parse(readFileSync(new URL(`${dex}.json`, BEADS), 'utf8'))); console.log(`${dex} 시트 ${s.FW}×${s.FH}`); }
  } else console.log('사용법: fetch <도감번호> <영문이름> | build [도감번호...]');
}

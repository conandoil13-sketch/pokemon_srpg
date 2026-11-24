// PMD 스프라이트가 없는 종을, 몸이 같은 종의 시트에서 색을 바꾸거나(art 가 있으면 그 위에 새로 그려) 만든다 (원본 CC BY-NC 4.0 — 크레딧을 그대로 두고 파생 표기)
// 실행: node tools/derive-sprite.js            (아래 DERIVED 전부)
//       node tools/derive-sprite.js 0514       (하나만)
// *-Anim.png 는 색(+머리 모양)을 바꾸고, 체형을 넓히면 Offsets·Shadow·AnimData.xml 프레임 폭도 같이 넓힌다. 나머지는 그대로 복사.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { readPng, writePng } from './png.js';
import { reshapeCrest, widen } from './sprite-shape.js';
import * as BOUFFALANT from './sprite-art/0626.js';

const ROOT = new URL('../assets/sprites/pmd/sprite/', import.meta.url);

// 색 → 색 (정확히 같은 색만). 표에 없는 색은 그대로
export const DERIVED = {
  '0514': { from: '0512', name: '바오키 (야나키 색 바꿈 → 바오프 빨강)', map: { // 초록 털 → 빨강·주황
    '017d35': 'bd4139', '2fbd6a': 'e65241', '95d7ae': 'f89018', '8b6b1a': '805818',
  }, crest: { hair: ['e65241', 'bd4139', 'f89018', '680800'], keepRows: 10, fill: 'e65241', light: 'f89018', dark: 'bd4139', // 뾰족한 볏 → 둥글게 부푼 불꽃 머리
    circles: [[-2.5, 3, 3], [2.5, 3, 3], [0, 5.5, 4.5], [-4.5, 7, 3], [4.5, 7, 3]],
    tips: [[-2.5, 1, 'f8e088'], [2.5, 1, 'f8e088'], [-1, 3, 'f89018'], [0, 4, 'f89018'], [1, 3, 'f89018']] } },
  '0516': { from: '0512', name: '앗차키 (야나키 색 바꿈 → 앗차프 파랑)', map: { // 초록 털 → 파랑
    '017d35': '04657a', '2fbd6a': '45beda', '95d7ae': '8ad3da', '8b6b1a': '805818',
  }, crest: { hair: ['45beda', '04657a', '8ad3da', '034c5c'], keepRows: 10, fill: '45beda', light: '8ad3da', dark: '04657a', // 뾰족한 볏 → 옆으로 퍼진 물 머리
    circles: [[0, 2.5, 3.2], [-3, 4, 3.2], [3, 4, 3.2], [-5.5, 7.5, 2.4], [5.5, 7.5, 2.4], [0, 6, 4]],
    tips: [[-3, 2, 'e8fbff'], [-2, 3, 'e8fbff'], [2, 1, 'e8fbff']] } },
  '0538': { from: '0539', name: '던지미 (타격귀 색 바꿈 → 빨간 몸·흰 도복)', map: { // 파란 몸 → 빨강, 민트 도복 → 흰색
    '1f77af': 'c83c34', '174f76': '7c2020', '67a7c7': 'e8705c', 'afd7ff': 'ffc0a8',
    'a4ccc0': 'd8d8d0', '679f8f': '98988e', 'c1f7ef': 'f8f8f0',
  } },
  '0626': { from: '0128', name: '버프론 (켄타로스 대기·걷기를 뼈대로 몸 색·아프로·뿔·얼굴을 새로 그림)', map: {}, art: BOUFFALANT, anims: ['Idle', 'Walk'], copies: { Attack: 'Walk' } }, // 공격 = 걷기(돌진) 재사용, 나머지는 게임이 대기로 대신
};

const hex = (d, i) => [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
export function recolor(img, map) {
  const out = Buffer.from(img.data);
  for (let i = 0; i < out.length; i += 4) {
    if (!out[i + 3]) continue;
    const to = map[hex(out, i)];
    if (to) for (let k = 0; k < 3; k++) out[i + k] = parseInt(to.slice(k * 2, k * 2 + 2), 16);
  }
  return { ...img, data: out };
}

// AnimData.xml 의 애니메이션별 프레임 크기 { Idle: [w, h], ... } (CopyOf 는 빠짐)
const frameSizes = (xml) => Object.fromEntries([...xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)].map(([, b]) => [b.match(/<Name>(\w+)/)[1], b.match(/<FrameWidth>(\d+)<\/FrameWidth>\s*<FrameHeight>(\d+)/)?.slice(1).map(Number)]).filter(([, v]) => v));

export function derive(dex) {
  const { from, name, map, crest, widen: wide, headRows = 0, art, anims, copies } = DERIVED[dex];
  const src = new URL(`${from}/`, ROOT), dst = new URL(`${dex}/`, ROOT);
  mkdirSync(dst, { recursive: true });
  let xml = readFileSync(new URL('AnimData.xml', src), 'utf8');
  if (anims) xml = xml.replace(/\s*<Anim>[\s\S]*?<\/Anim>/g, (b) => (anims.includes(b.match(/<Name>(\w+)/)[1]) ? b : ''));
  if (copies) xml = xml.replace(/(\s*)<\/Anims>/, (_, ws) => `${Object.entries(copies).map(([a, b]) => `${ws}\t<Anim>${ws}\t\t<Name>${a}</Name>${ws}\t\t<CopyOf>${b}</CopyOf>${ws}\t</Anim>`).join('')}${ws}</Anims>`);
  const sizes = frameSizes(xml);
  art?.reference(readPng(readFileSync(new URL('Idle-Anim.png', src))));
  for (const f of readdirSync(src)) {
    const m = f.match(/^(\w+)-(Anim|Offsets|Shadow)\.png$/), size = m && sizes[m[1]];
    if (m && anims && !anims.includes(m[1])) continue;
    if (m) {
      let img = readPng(readFileSync(new URL(f, src)));
      if (m[2] === 'Anim') { img = recolor(img, map); if (art && size) art.paint(img, size[0], size[1]); if (crest && size) reshapeCrest(img, size[0], size[1], crest); }
      if (wide && size) img = widen(img, size[0], wide, m[2] === 'Anim' ? headRows : 0, size[1]);
      writeFileSync(new URL(f, dst), writePng(img));
    } else if (f === 'AnimData.xml' && (wide || anims || copies)) writeFileSync(new URL(f, dst), xml.replace(/<FrameWidth>(\d+)<\/FrameWidth>/g, (_, w) => `<FrameWidth>${+w + (wide ?? 0)}</FrameWidth>`));
    else if (f === 'credits.txt') writeFileSync(new URL(f, dst), `${readFileSync(new URL(f, src), 'utf8').trimEnd()}\n# 파생: ${name} — 원본 ${from} 시트에서 ${art ? '그림을 새로 그림' : `색${crest ? '·머리 모양' : ''}${wide ? '·체형' : ''}을 바꿈`} (포켓몬 택틱스 도구 tools/derive-sprite.js)\n`);
    else if (!f.includes('.')) continue; // 하위 폼 폴더는 건너뜀
    else copyFileSync(new URL(f, src), new URL(f, dst));
  }
}
if (process.argv[1]?.endsWith('derive-sprite.js')) {
  const only = process.argv.slice(2);
  for (const dex of only.length ? only : Object.keys(DERIVED)) { derive(dex); console.log(`${dex} ← ${DERIVED[dex].from}`); }
}

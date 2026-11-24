// 쪼마리 (616) — 아이언비즈 도안(nayakoko.com 「チョボマキ」 걷기 도안, 앞·왼·오른·뒤 × 2프레임)을 PMD 시트로 옮긴다
// 출처: https://nayakoko.com/pokemon-perler-beads-616-shelmet/ — 도안으로 만든 작품은 공개 가능, 판매 금지 (출처 안내)
// 실행: node tools/sprite-art/0616.js   → assets/sprites/pmd/sprite/0616/ (Idle·Walk, 공격은 걷기 재사용)
import { writeFileSync, mkdirSync } from 'node:fs';
import { writePng } from '../png.js';

// 도안 번호별 색 (1~9)
const PAL = { a: '5b5a7d', b: 'c6c6d3', g: '2b325b', k: '0f1112', e: '9693b0', n: '640021', u: 'b4204d', p: 'ff4a7f', o: '388544', m: '303641' }; // m: 입 안쪽 어두운 색 (범례 밖)

const FRONT = [[
  '...aa...', '..abba..', '.aeebea.', '.aeeeea.', 'aegggga.', 'agebbeg.', 'kegeegek', 'kegeegek', 'gkebbekg', 'angeegna', 'abkggkba', 'akoppoka', 'gekmmkeg', '.g.kk.g.',
], [
  '...aa...', '..abba..', '.aebeea.', '.aeeeea.', '.aggggea', '.gebbega', 'kegeegek', 'kegeegek', 'gkebbekg', 'angeegna', 'abkggkba', 'akoppoka', '.gkmmkg.', '..gkkg..',
]];
const LEFT = [[
  '..........aaaaa...', '.........abbbbba..', 'ag......abbbbbbba.', 'gbag..aggebaaabbbk', 'gebbagbbbggeeeabbk', '.geebbagbbbgbegbek', '..kgeebbbbegeegbek', '.knnkgeeeeegagbeek', '.kppubkkkggbbbeea.', '..knpk.obbeeeeeek.', '....noobeeeeeekk..', '...gbeaeeakkkk....', '....gkaekk........', '......kk..........',
], [
  '..........aaaaa...', '.........abbbbba..', '........abbbbbbba.', 'ag......gebaaabbbk', 'gbag..aggeaeeeabbk', 'gebbagbbbggebegbek', '.geebbagbbbgeegbek', '..kgeebbbbegagbeek', '.knnkgeeeeegbbeea.', '.kppubkkkggbeeeek.', '..knpk.obbeeeeek..', '....noobeeeaekk...', '...gbbeeaeekk.....', '....gggkaek.......', '........kk........',
]];
const RIGHT = [[
  '...aaaaa..........', '..abbbbba.........', '.abbbbbbba......ga', 'kbbbaaabegga..gabg', 'kbbaeeeggbbbgabbeg', 'kebgebgbbbgabbeeg.', 'kebgeegebbbbeegk..', 'keebgageeeeegknnk.', '.aeebbbggkkkbuppk.', '.keeeeeebbo.kpnk..', '..kkeeeeeeboon....', '....kkkkaeeaebg...', '........kkeakg....', '..........kk......',
], [
  '...aaaaa..........', '..abbbbba.........', '.abbbbbbba........', 'kbbbaaabeg......ga', 'kbbaeeeaegga..gabg', 'kebgebeggbbbgabbeg', 'kebgeegbbbgabbeeg.', 'keebgagebbbbeegk..', '.aeebbgeeeeegknnk.', '.keeeebggkkkbuppk.', '..keeeeebbo.kpnk..', '...kkeaeeeboon....', '.....kkeeaeebbg...', '.......keakggg....', '........kk........',
]];
const BACK = [[
  '....aa...', '...abba..', '..abbbba.', '..gbbbba.', 'akgbbbba.', 'kagbbbba.', 'kgebbbbbg', 'ugebbbbbg', 'kgeebbbeg', 'kgeeeeeeg', '.geeeeeeg', '.geeeeaeg', '.kekkkkek', '..kg..gk.',
], [
  '...aa....', '..abba...', '.abbbba..', '.abbbbg..', '.abbbbgka', 'gbbbbbgak', 'gbbbbbegk', 'gbbbbbegu', 'gebbbeegk', 'geeeeeegk', 'geeeeeeg.', 'keaeeeek.', '.kekkek..', '..kggk...',
]];

// 시트 줄: 0 아래 · 1 오른아래 · 2 오른 · 3 오른위 · 4 위 · 5 왼위 · 6 왼 · 7 왼아래 (대각은 옆모습으로)
const DIRS = [FRONT, RIGHT, RIGHT, RIGHT, BACK, LEFT, LEFT, LEFT];
const FW = 24, FH = 24, FOOT = 17; // 첫 프레임 바닥을 17줄에 (다른 작은 종들과 같이 중심 +5)

function sheet(frames) { // frames: 줄마다 쓸 프레임 번호 목록
  const out = { w: FW * frames.length, h: FH * 8, data: Buffer.alloc(FW * frames.length * FH * 8 * 4) };
  DIRS.forEach((views, row) => {
    const first = views[0], bottom = first.reduce((b, r, i) => (/[^.]/.test(r) ? i : b), 0);
    const cols = first.flatMap((r) => [...r].map((c, x) => (c !== '.' ? x : -1))).filter((x) => x >= 0);
    const ox = Math.round(FW / 2 - (Math.min(...cols) + Math.max(...cols) + 1) / 2), oy = FOOT - bottom;
    frames.forEach((fi, col) => views[fi].forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return;
      const hex = PAL[c], i = ((row * FH + oy + y) * out.w + col * FW + ox + x) * 4;
      for (let k = 0; k < 3; k++) out.data[i + k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
      out.data[i + 3] = 255;
    })));
  });
  return out;
}

export function build() {
  const dir = new URL('../../assets/sprites/pmd/sprite/0616/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('Idle-Anim.png', dir), writePng(sheet([0])));
  writeFileSync(new URL('Walk-Anim.png', dir), writePng(sheet([0, 1])));
  const anim = (name, n, dur) => `    <Anim>\n      <Name>${name}</Name>\n      <FrameWidth>${FW}</FrameWidth>\n      <FrameHeight>${FH}</FrameHeight>\n      <Durations>\n${Array(n).fill(`        <Duration>${dur}</Duration>`).join('\n')}\n      </Durations>\n    </Anim>`;
  writeFileSync(new URL('AnimData.xml', dir), `<?xml version="1.0"?>\n<AnimData>\n  <ShadowSize>1</ShadowSize>\n  <Anims>\n${anim('Idle', 1, 40)}\n${anim('Walk', 2, 8)}\n    <Anim>\n      <Name>Attack</Name>\n      <CopyOf>Walk</CopyOf>\n    </Anim>\n  </Anims>\n</AnimData>\n`);
  writeFileSync(new URL('credits.txt', dir), '# 쪼마리: nayakoko.com 아이언비즈 도안(チョボマキ 걷기 앞·왼·오른·뒤)을 옮김 — https://nayakoko.com/pokemon-perler-beads-616-shelmet/ (작품 공개 허용, 판매 금지). 대각 방향은 옆모습 재사용. 도구 tools/sprite-art/0616.js\n');
}

if (process.argv[1]?.endsWith('0616.js')) { build(); console.log('0616 쪼마리 시트 생성'); }

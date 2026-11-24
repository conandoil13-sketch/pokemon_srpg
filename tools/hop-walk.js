// 걷기 동작이 없는 종에 "제자리에서 위아래로 들썩이는" 걷기를 만든다: 대기 첫 프레임을 0·1·2·1 칸 올려 4프레임
// 실행: node tools/hop-walk.js 0618   (Walk-Anim.png 를 만들고 AnimData.xml 에 Walk 를 넣는다 — 다시 돌려도 같은 결과)
import { readFileSync, writeFileSync } from 'node:fs';
import { readPng, writePng } from './png.js';

const LIFT = [0, 1, 2, 1], DURATION = 4;

export function hopWalk(dex) {
  const dir = new URL(`../assets/sprites/pmd/sprite/${dex}/`, import.meta.url);
  let xml = readFileSync(new URL('AnimData.xml', dir), 'utf8');
  const idle = xml.match(/<Anim>\s*<Name>Idle<\/Name>[\s\S]*?<\/Anim>/)[0];
  const fw = +idle.match(/<FrameWidth>(\d+)/)[1], fh = +idle.match(/<FrameHeight>(\d+)/)[1];
  const src = readPng(readFileSync(new URL('Idle-Anim.png', dir))), rows = src.h / fh;
  const out = { w: fw * LIFT.length, h: src.h, data: Buffer.alloc(fw * LIFT.length * src.h * 4) };
  LIFT.forEach((lift, f) => {
    for (let r = 0; r < rows; r++) for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const ty = y - lift; if (ty < 0) continue;
      const s = ((r * fh + y) * src.w + x) * 4; // 대기 첫 프레임
      src.data.copy(out.data, ((r * fh + ty) * out.w + f * fw + x) * 4, s, s + 4);
    }
  });
  writeFileSync(new URL('Walk-Anim.png', dir), writePng(out));
  const walk = `<Anim>\n      <Name>Walk</Name>\n      <FrameWidth>${fw}</FrameWidth>\n      <FrameHeight>${fh}</FrameHeight>\n      <Durations>\n${LIFT.map(() => `        <Duration>${DURATION}</Duration>`).join('\n')}\n      </Durations>\n    </Anim>`;
  xml = xml.replace(/\s*<Anim>\s*<Name>Walk<\/Name>[\s\S]*?<\/Anim>/, '');
  xml = xml.replace(/(\s*)<\/Anims>/, (_, ws) => `${ws}  ${walk}${ws}</Anims>`);
  writeFileSync(new URL('AnimData.xml', dir), xml);
  const credits = readFileSync(new URL('credits.txt', dir), 'utf8');
  if (!credits.includes('hop-walk')) writeFileSync(new URL('credits.txt', dir), `${credits.trimEnd()}\n# 걷기: 대기 프레임을 위아래로 옮겨 만듦 (포켓몬 택틱스 도구 tools/hop-walk.js)\n`);
}

if (process.argv[1]?.endsWith('hop-walk.js')) for (const dex of process.argv.slice(2)) { hopWalk(dex); console.log(`${dex} Walk 추가`); }

// pixelfx(MIT, github.com/patch-gg/pixelfx) 에서 게임이 쓰는 이펙트만 src/vendor/pixelfx 로 복사한다.
// 사용: node tools/vendor-pixelfx.js <pixelfx 경로>   (이펙트를 늘리면 FX_FILES 에 추가하고 다시 실행)
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FX_FILES = [
  'impacts/hit-spark', 'impacts/blunt-hit', 'impacts/crit-hit', 'impacts/ground-slam',
  'projectiles/plasma-shot', 'projectiles/energy-disc',
  'arcane/arcane-beam', 'arcane/spell-charge',
  'fire/fire-breath', 'ice/frost-breath', 'ice/frost-nova',
  'lightning/thunderclap',
  'explosions/plasma-explosion', 'explosions/small-explosion', 'explosions/big-explosion',
  'ui/level-up',
  'status/cursed', 'status/stunned', 'status/burning', 'status/poisoned', 'status/sleep', 'status/frozen', 'status/confused',
  'nature/acid-splash',
  'pickups/collect-burst',
  // 기술 이펙트 다양화 (2026-11-15): 특수 탄 · 물리 타격 · 흡수 · 회복 · 헤롱헤롱
  'fire/fireball', 'water/water-orb', 'lightning/ball-lightning', 'ice/ice-lance', 'arcane/arcane-orb', 'shadow/void-orb', 'projectiles/magic-missile',
  'melee/uppercut', 'melee/claw-swipe', 'melee/double-slash', 'melee/thrust', 'melee/hammer-smash',
  'shadow/life-steal', 'holy/heal', 'status/charmed',
];

const OUT = fileURLToPath(new URL('../src/vendor/pixelfx/', import.meta.url));

function vendor(src) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'fx'), { recursive: true });
  cpSync(join(src, 'src/core'), join(OUT, 'core'), { recursive: true });
  for (const f of ['LICENSE', 'NOTICE.md']) cpSync(join(src, f), join(OUT, f));
  const cats = new Set(FX_FILES.map((id) => id.split('/')[0]));
  for (const c of cats) {
    const lib = join(src, 'src/fx', c, '_lib.js');
    if (existsSync(lib)) { mkdirSync(join(OUT, 'fx', c), { recursive: true }); cpSync(lib, join(OUT, 'fx', c, '_lib.js')); }
  }
  for (const id of FX_FILES) {
    mkdirSync(dirname(join(OUT, 'fx', id)), { recursive: true });
    cpSync(join(src, 'src/fx', `${id}.js`), join(OUT, 'fx', `${id}.js`));
  }
  const name = (id) => id.replace(/[^a-z0-9]/gi, '_');
  const index = ['// 자동 생성 — node tools/vendor-pixelfx.js. 직접 고치지 말 것',
    ...FX_FILES.map((id) => `import * as ${name(id)} from './fx/${id}.js';`),
    `export const FX = {`, ...FX_FILES.map((id) => `  '${id}': ${name(id)},`), `};`, ''].join('\n');
  writeFileSync(join(OUT, 'fx-index.js'), index);
  console.log(`vendored ${FX_FILES.length} effects → ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/vendor-pixelfx.js <pixelfx path>'); process.exit(1); }
  vendor(src);
}

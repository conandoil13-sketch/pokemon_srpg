// 맵 타일 도트 (16×16)
import { patternCanvas, hash } from './pixels.js';

export const TILE = 16;
const GRASS = '#88d070', GRASS_D = '#68b050', GRASS_L = '#b0e890';

let cache = null;

function grassVariant(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  g.fillStyle = GRASS;
  g.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(hash(seed, i, 'x') * 14) + 1;
    const y = Math.floor(hash(seed, i, 'y') * 13) + 2;
    g.fillStyle = GRASS_D;
    g.fillRect(x, y, 1, 2);
    g.fillRect(x + 2, y + 1, 1, 1);
    if (i % 2 === 0) { g.fillStyle = GRASS_L; g.fillRect(x + 1, y - 1, 1, 1); }
  }
  return c;
}

function overlay(base, top) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.drawImage(top, 0, 0);
  return c;
}

const TUFT = ['........', '.l...l..', '.ml.lm..', 'lmmlmml.', 'bmmmmmb.', 'bbmmmbb.', '.bbbbb..', '........'];

function tallGrass() {
  const tuft = patternCanvas(TUFT, { b: '#307020', m: '#50a030', l: '#98e068' });
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  g.fillStyle = '#60b048';
  g.fillRect(0, 0, TILE, TILE);
  for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) g.drawImage(tuft, x, y);
  return c;
}

const ROCK = [
  '................', '................', '................',
  '......oooo......', '.....ohhhro.....', '....ohhhrrro....', '...ohhhrrrrso...',
  '...ohhrrrrrso...', '..ohhrrrrrrsso..', '..ohrrrrrrsssso.', '.ohhrrrrrssssso.',
  '.ohrrrrrrsssssso', 'ohrrrrrrssssssso', 'orrrrrrsssssssso', 'oooooooooooooooo', '................',
];

const TREE = [
  '....kkkkkkkk....', '..kkddgggggdkk..', '.kddgglllllgddk.', '.kdggllllllggdk.',
  'kddgglllllggggdk', 'kdgggglllgggggdk', 'kdggggggggggdddk', 'kddggggggggddddk',
  'kdddddgggdddddk.', '.kddddddddddddk.', '..kkddddddddkk..', '....kkkTTkkk....',
  '......kTtk......', '......kTtk......', '.....kkTtkk.....', '....ss.kk.ss....',
];

function water(frame) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  g.fillStyle = '#4888e8';
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = '#80b8f8';
  const o = frame * 4;
  for (const [y, off] of [[4, 0], [11, 8]]) {
    const x = (off + o) % TILE;
    g.fillRect(x, y, 4, 1);
    g.fillRect((x + 4) % TILE, y - 1, 2, 1);
  }
  g.fillStyle = '#d8f0ff';
  g.fillRect((3 + o) % TILE, 4, 1, 1);
  return c;
}

function build() {
  const grass = [0, 1, 2, 3].map(grassVariant);
  return {
    grass,
    tall: tallGrass(),
    rock: overlay(grass[0], patternCanvas(ROCK, { o: '#504030', h: '#d0b088', r: '#a88860', s: '#786048' })),
    tree: overlay(grass[1], patternCanvas(TREE, { k: '#183818', d: '#287030', g: '#48a048', l: '#78c858', T: '#583818', t: '#885828', s: '#58a040' })),
    water: [water(0), water(1)],
  };
}

export function drawMap(ctx, grid, time) {
  cache ??= build();
  const wf = Math.floor(time / 0.6) % 2;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const t = grid[y][x], px = x * TILE, py = y * TILE;
      if (t === '~') {
        ctx.drawImage(cache.water[wf], px, py);
        // 물가 테두리
        ctx.fillStyle = '#e8e0a8';
        if (grid[y - 1]?.[x] !== undefined && grid[y - 1][x] !== '~') ctx.fillRect(px, py, TILE, 2);
        if (grid[y + 1]?.[x] !== undefined && grid[y + 1][x] !== '~') ctx.fillRect(px, py + 14, TILE, 2);
        if (grid[y][x - 1] !== undefined && grid[y][x - 1] !== '~') ctx.fillRect(px, py, 2, TILE);
        if (grid[y][x + 1] !== undefined && grid[y][x + 1] !== '~') ctx.fillRect(px + 14, py, 2, TILE);
      } else if (t === '"') ctx.drawImage(cache.tall, px, py);
      else if (t === '^') ctx.drawImage(cache.rock, px, py);
      else if (t === '#') ctx.drawImage(cache.tree, px, py);
      else ctx.drawImage(cache.grass[Math.floor(hash(x, y) * 4)], px, py);
    }
  }
}

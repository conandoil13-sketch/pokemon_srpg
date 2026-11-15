// 이 게임 전용으로 만든 이펙트 (pixelfx 방식, MIT). 팔레트(palette) 옵션으로 타입 색을 입혀 쓴다
import * as bite from './pokemon/bite.js';
import * as kick from './pokemon/kick.js';
import * as soundWave from './pokemon/sound-wave.js';
import * as silkWrap from './pokemon/silk-wrap.js';
import * as brickStack from './pokemon/brick-stack.js';
import * as aquaRing from './pokemon/aqua-ring.js';
import * as seedScatter from './pokemon/seed-scatter.js';
import * as angerMark from './pokemon/anger-mark.js';
import * as chainBind from './pokemon/chain-bind.js';
import * as smallSigil from './pokemon/small-sigil.js';
import * as healGlow from './pokemon/heal-glow.js';
import * as drainOrbs from './pokemon/drain-orbs.js';

export const CUSTOM_FX = { 'pokemon/bite': bite, 'pokemon/kick': kick, 'pokemon/sound-wave': soundWave, 'pokemon/silk-wrap': silkWrap, 'pokemon/brick-stack': brickStack, 'pokemon/aqua-ring': aquaRing, 'pokemon/seed-scatter': seedScatter, 'pokemon/anger-mark': angerMark, 'pokemon/chain-bind': chainBind, 'pokemon/small-sigil': smallSigil, 'pokemon/heal-glow': healGlow, 'pokemon/drain-orbs': drainOrbs };

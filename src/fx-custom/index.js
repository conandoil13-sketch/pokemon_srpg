// 이 게임 전용으로 만든 이펙트 (pixelfx 방식, MIT). 팔레트(palette) 옵션으로 타입 색을 입혀 쓴다
import * as bite from './pokemon/bite.js';
import * as kick from './pokemon/kick.js';
import * as soundWave from './pokemon/sound-wave.js';

export const CUSTOM_FX = { 'pokemon/bite': bite, 'pokemon/kick': kick, 'pokemon/sound-wave': soundWave };

// 기술 모양 계열 (이펙트 고르기용). 철주먹·방음 특성의 PUNCH·SOUND 목록을 그대로 쓰고, 나머지는 여기서
import { PUNCH, SOUND } from '../core/abilities.js';

export const BITE = ['bite', 'crunch', 'hyper-fang', 'super-fang', 'fire-fang', 'thunder-fang', 'ice-fang', 'poison-fang'];
export const KICK = ['double-kick', 'low-kick', 'rolling-kick', 'jump-kick', 'hi-jump-kick', 'mega-kick', 'triple-kick', 'blaze-kick', 'brick-break', 'stomp', 'trop-kick'];
export const SLASH = ['scratch', 'slash', 'fury-swipes', 'cut', 'x-scissor', 'night-slash', 'leaf-blade', 'false-swipe', 'crush-claw', 'shadow-claw', 'dragon-claw', 'metal-claw', 'aerial-ace', 'air-cutter', 'psycho-cut', 'razor-leaf', 'fury-cutter'];
export const STAB = ['peck', 'drill-peck', 'horn-attack', 'fury-attack', 'horn-drill', 'poison-sting', 'pin-missile', 'twineedle', 'pluck', 'megahorn', 'poison-jab', 'drill-run'];

export function familyOf(move) {
  const id = move.id;
  if (SOUND.includes(id)) return 'sound';
  if (BITE.includes(id)) return 'bite';
  if (KICK.includes(id)) return 'kick';
  if (PUNCH.includes(id)) return 'punch';
  if (SLASH.includes(id)) return 'slash';
  if (STAB.includes(id)) return 'stab';
  return null;
}

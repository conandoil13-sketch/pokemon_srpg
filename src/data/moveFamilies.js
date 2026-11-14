// 기술 모양 계열 (이펙트 고르기용). 철주먹·방음 특성의 PUNCH·SOUND 목록을 그대로 쓰고, 나머지는 여기서
import { PUNCH, SOUND } from '../core/abilities.js';

export const BITE = ['bite', 'crunch', 'hyper-fang', 'fire-fang', 'thunder-fang', 'ice-fang', 'poison-fang'];
export const KICK = ['double-kick', 'low-kick', 'rolling-kick', 'jump-kick', 'high-jump-kick', 'mega-kick', 'triple-kick', 'blaze-kick', 'brick-break', 'stomp'];
export const SLASH = ['scratch', 'slash', 'fury-swipes', 'x-scissor', 'night-slash', 'leaf-blade', 'false-swipe', 'crush-claw', 'shadow-claw', 'dragon-claw', 'metal-claw', 'aerial-ace', 'psycho-cut', 'fury-cutter'];
export const STAB = ['peck', 'drill-peck', 'horn-attack', 'fury-attack', 'poison-sting', 'pin-missile', 'twineedle', 'pluck', 'megahorn', 'poison-jab'];

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

// 스테이지 목록. map 이 없는 스테이지는 아직 잠긴 자리(더미)
import { MAP } from './map.js';

export const STAGES = [
  { id: 'sinnoh-field', name: '신오 들판', desc: '강을 사이에 둔 첫 전투. 적 5마리.', map: MAP },
  { id: 'stage-2', name: '???', desc: '아직 열리지 않았다.', map: null },
  { id: 'stage-3', name: '???', desc: '아직 열리지 않았다.', map: null },
];

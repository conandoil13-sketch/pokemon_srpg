// 던전 표. 층 f = 1..floors
// 신오 2개(sinnohDungeons.js) + 임시 스테이지 8개(fillerStages.js). 진짜 새 맵은 fillerStages.REPLACED 로 그 자리를 대체한다
import { SINNOH_DUNGEONS } from './sinnohDungeons.js';
import { stageSlots, fillerStage } from './fillerStages.js';
import { POWER_PLANT } from './powerPlant.js';
import { DESERT } from './desert.js';
import { VOLCANO } from './volcano.js';
import { AUTUMN_FOREST } from './autumnForest.js';
import { BEACH } from './beach.js';
import { CITY } from './city.js';
import { SEWER } from './sewer.js';
import { DEEP_CAVE } from './deepCave.js';

export const DUNGEONS = [...SINNOH_DUNGEONS.map((d, i) => ({ ...d, stage: i + 1 })), ...stageSlots({ 1: AUTUMN_FOREST, 2: BEACH, 3: CITY, 4: [SEWER, DEEP_CAVE], 5: [POWER_PLANT, DESERT], 6: [fillerStage(6), VOLCANO] })]; // 진짜 맵이 생긴 자리

export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id);

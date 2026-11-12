// 한국어 표기: 타입명, 조사
export const TYPE_KO = {
  normal: '노말', fire: '불꽃', water: '물', electric: '전기', grass: '풀', ice: '얼음',
  fighting: '격투', poison: '독', ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레',
  rock: '바위', ghost: '고스트', dragon: '드래곤', dark: '악', steel: '강철', fairy: '페어리',
};

// 마지막 글자 받침 유무로 조사 선택. pair = '은/는' | '이/가' | '을/를' | '와/과'
export function josa(word, pair) {
  const [withBatchim, without] = pair.split('/');
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const has = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (has ? withBatchim : without);
}

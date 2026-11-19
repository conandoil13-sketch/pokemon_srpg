// 소리: 배경음악(반복) 하나 + 짧은 효과음. 효과음이 나오는 동안 배경음악은 잠깐 멈췄다가 끝나면 이어진다.
// 브라우저는 사용자가 한 번 누르기 전엔 소리를 못 내므로, 첫 터치·키 입력 때 unlock() 으로 시작한다.
export const SOUNDS = {
  route1: 'assets/sounds/route1.mp3',       // 기본 배경음악 (계속 반복)
  victory: 'assets/sounds/victory.mp3',     // 전투 승리·층 돌파 결산
  evolution: 'assets/sounds/evolution.mp3', // 진화 장면
  levelUp: 'assets/sounds/level-up.mp3',    // 레벨업 (효과음)
  item: 'assets/sounds/item.mp3',           // 보물상자·뽑기 (효과음)
  healed: 'assets/sounds/healed.mp3',       // 탐험을 마치고 마을로 (효과음)
};
const BGM_VOLUME = 0.45, JINGLE_VOLUME = 0.6;

const SETTINGS_KEY = 'pokemon-tactics-sound'; // 설정: { muted, volume } (저장 데이터와 따로)
const browserStorage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

// AudioCtor: 테스트용 주입 (없으면 아무 소리도 내지 않음). storage: 설정 저장소 (localStorage 모양)
export function createSound(AudioCtor = typeof Audio !== 'undefined' ? Audio : undefined, storage = browserStorage()) {
  const cache = new Map();
  let unlocked = false, muted = false, current = null, jingleOn = null, volume = 1;
  try { const s = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null'); if (s) { muted = !!s.muted; volume = Math.min(1, Math.max(0, Number(s.volume ?? 1))); } } catch { /* 무시 */ }
  const persist = () => { try { storage?.setItem(SETTINGS_KEY, JSON.stringify({ muted, volume })); } catch { /* 무시 */ } };
  const applyVolume = (a) => { a.volume = (a.loop ? BGM_VOLUME : JINGLE_VOLUME) * volume; };
  const get = (name, loop) => {
    if (!AudioCtor) return null;
    if (!cache.has(name)) {
      const a = new AudioCtor(SOUNDS[name]);
      a.loop = loop; applyVolume(a);
      cache.set(name, a);
    }
    return cache.get(name);
  };
  const play = (a) => { try { const p = a.play(); p?.catch?.(() => {}); } catch { /* 무시 */ } };
  const resumeBgm = () => { const a = current && get(current, true); if (a && unlocked && !muted && !jingleOn) play(a); };
  return {
    unlock() { if (unlocked) return; unlocked = true; resumeBgm(); },
    bgm(name) {
      if (name === current) return;
      const old = current && get(current, true);
      if (old) old.pause();
      current = name;
      const a = get(name, true);
      if (a) a.currentTime = 0;
      resumeBgm();
    },
    jingle(name) {
      if (!unlocked || muted || !AudioCtor) return;
      const bg = current && get(current, true);
      if (bg) bg.pause();
      if (jingleOn && jingleOn !== name) get(jingleOn, false)?.pause();
      const a = get(name, false);
      a.currentTime = 0;
      if (!a.endBound) { a.addEventListener('ended', () => { if (jingleOn === name) { jingleOn = null; resumeBgm(); } }); a.endBound = true; }
      jingleOn = name;
      play(a);
    },
    setMuted(on) {
      muted = on;
      persist();
      if (on) { for (const a of cache.values()) a.pause(); jingleOn = null; } else resumeBgm();
    },
    get muted() { return muted; },
    setVolume(v) { volume = Math.round(Math.min(1, Math.max(0, v)) * 10) / 10; for (const a of cache.values()) applyVolume(a); persist(); },
    get volume() { return volume; },
  };
}

export const sound = createSound(); // 게임 전체가 같이 쓴다

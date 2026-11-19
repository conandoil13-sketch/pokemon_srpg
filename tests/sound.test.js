import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound, SOUNDS } from '../src/audio/sound.js';

// 가짜 Audio: play/pause/ended 를 기록
function fakeAudio() {
  const made = [];
  const Audio = function (src) {
    const a = { src, loop: false, volume: 1, paused: true, currentTime: 0, listeners: {},
      play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; },
      addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }, end() { this.paused = true; for (const f of this.listeners.ended ?? []) f(); } };
    made.push(a);
    return a;
  };
  return { Audio, made, by: (name) => made.find((a) => a.src === SOUNDS[name]) };
}

test('every sound file is under assets/sounds', () => {
  for (const name of ['route1', 'victory', 'levelUp', 'evolution', 'item', 'healed']) assert.match(SOUNDS[name], /^assets\/sounds\/[a-z0-9-]+\.mp3$/);
});

test('bgm loops, waits for the first touch or key, and switches tracks', () => {
  const f = fakeAudio(), s = createSound(f.Audio);
  s.bgm('route1');
  assert.equal(f.by('route1')?.paused ?? true, true); // 아직 사용자 입력 전
  s.unlock();
  assert.equal(f.by('route1').paused, false);
  assert.equal(f.by('route1').loop, true);
  s.bgm('victory');
  assert.equal(f.by('route1').paused, true);
  assert.equal(f.by('victory').paused, false);
  s.bgm('victory'); // 같은 곡이면 처음부터 다시 틀지 않음
  assert.equal(f.made.filter((a) => a.src === SOUNDS.victory).length, 1);
});

test('a jingle pauses the bgm and resumes it when done', () => {
  const f = fakeAudio(), s = createSound(f.Audio);
  s.unlock(); s.bgm('route1');
  s.jingle('levelUp');
  assert.equal(f.by('route1').paused, true);
  assert.equal(f.by('levelUp').paused, false);
  f.by('levelUp').end();
  assert.equal(f.by('route1').paused, false);
});

test('muting stops everything; without Audio (tests, old browsers) it does nothing', () => {
  const f = fakeAudio(), s = createSound(f.Audio);
  s.unlock(); s.bgm('route1');
  s.setMuted(true);
  assert.equal(f.by('route1').paused, true);
  s.jingle('item');
  assert.equal(f.by('item'), undefined);
  s.setMuted(false);
  assert.equal(f.by('route1').paused, false);
  const none = createSound(undefined);
  assert.doesNotThrow(() => { none.unlock(); none.bgm('route1'); none.jingle('item'); });
});

test('volume scales every sound and is remembered in storage', () => {
  const f = fakeAudio(), store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = createSound(f.Audio, storage);
  assert.equal(s.volume, 1);
  s.unlock(); s.bgm('route1');
  s.setVolume(0.5);
  assert.equal(f.by('route1').volume, 0.45 * 0.5);
  s.setMuted(true);
  const again = createSound(f.Audio, storage);
  assert.equal(again.volume, 0.5);
  assert.equal(again.muted, true);
  s.setVolume(3); assert.equal(s.volume, 1); s.setVolume(-1); assert.equal(s.volume, 0);
});

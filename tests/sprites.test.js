import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestSprites, setSpriteLoader } from '../src/render/sprites.js';

test('each species is requested once, failures resolve, only requested species load', async () => {
  const calls = [];
  setSpriteLoader(async (key) => { calls.push(key); if (key === 'pidgey') throw new Error('404'); });
  await requestSprites(['bulbasaur', 'pidgey']);
  await requestSprites(['bulbasaur', 'pidgey', 'ditto']);
  await Promise.all([requestSprites(['eevee']), requestSprites(['eevee'])]); // 동시에 두 번
  assert.deepEqual(calls.sort(), ['bulbasaur', 'ditto', 'eevee', 'pidgey']);
});

import { hasAnim } from '../src/render/sprites.js';
test('hasAnim is false for sprites that are not loaded', () => {
  assert.equal(hasAnim('no-such-mon', 'Sleep'), false);
});

test('a load that failed on the network is retried on the next request, up to 3 tries', async () => {
  const calls = [];
  setSpriteLoader(async (key) => { calls.push(key); return 'retry'; }); // 데이터는 있는데 내려받기 실패
  await requestSprites(['combee']);
  await requestSprites(['combee']);
  await requestSprites(['combee']);
  await requestSprites(['combee']); // 세 번 실패 뒤엔 더 묻지 않음
  assert.equal(calls.length, 3);
  let n = 0;
  setSpriteLoader(async () => { n++; return n === 1 ? 'retry' : 'ok'; });
  await requestSprites(['vespiquen']); await requestSprites(['vespiquen']); await requestSprites(['vespiquen']);
  assert.equal(n, 2); // 두 번째에 성공하면 그 뒤로는 안 물음
});

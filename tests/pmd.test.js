import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnimData, dirFromDelta, frameAt, animLength, DIR } from '../src/render/pmdData.js';

const XML = `<?xml version="1.0"?>
<AnimData>
  <ShadowSize>1</ShadowSize>
  <Anims>
    <Anim>
      <Name>Walk</Name><Index>0</Index>
      <FrameWidth>40</FrameWidth><FrameHeight>56</FrameHeight>
      <Durations><Duration>6</Duration><Duration>6</Duration><Duration>8</Duration></Durations>
    </Anim>
    <Anim>
      <Name>Attack</Name><Index>1</Index>
      <FrameWidth>72</FrameWidth><FrameHeight>88</FrameHeight>
      <HitFrame>3</HitFrame>
      <Durations><Duration>2</Duration><Duration>4</Duration></Durations>
    </Anim>
    <Anim>
      <Name>Idle</Name>
      <CopyOf>Walk</CopyOf>
    </Anim>
  </Anims>
</AnimData>`;

test('parseAnimData reads frames, durations, hit frame and resolves CopyOf', () => {
  const d = parseAnimData(XML);
  assert.equal(d.shadowSize, 1);
  assert.deepEqual(d.anims.Walk, { name: 'Walk', sheet: 'Walk', frameW: 40, frameH: 56, durations: [6, 6, 8], hitFrame: null });
  assert.equal(d.anims.Attack.hitFrame, 3);
  assert.equal(d.anims.Idle.sheet, 'Walk');
  assert.equal(d.anims.Idle.frameW, 40);
  assert.deepEqual(d.anims.Idle.durations, [6, 6, 8]);
});

test('dirFromDelta maps to PMD sheet rows', () => {
  assert.equal(dirFromDelta(0, 1), DIR.Down);
  assert.equal(dirFromDelta(1, 0), DIR.Right);
  assert.equal(dirFromDelta(-1, 0), DIR.Left);
  assert.equal(dirFromDelta(0, -1), DIR.Up);
  assert.equal(dirFromDelta(2, -2), DIR.UpRight);
  assert.equal(dirFromDelta(-3, 1), DIR.Left); // 가로가 훨씬 크면 정방향
  assert.equal(DIR.Down, 0);
  assert.equal(DIR.DownLeft, 7);
});

test('frameAt walks durations (ticks at 60fps), looping or clamping', () => {
  const a = { durations: [6, 6, 8] };
  assert.equal(animLength(a), 20);
  assert.equal(frameAt(a, 0, true), 0);
  assert.equal(frameAt(a, 6, true), 1);
  assert.equal(frameAt(a, 12, true), 2);
  assert.equal(frameAt(a, 20, true), 0);   // loop
  assert.equal(frameAt(a, 25, false), 2);  // clamp
});

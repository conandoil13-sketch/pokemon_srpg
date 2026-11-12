import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('dev server survives a malformed URL and binds to localhost only', async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const p = spawn(process.execPath, ['tools/serve.js', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const line = await new Promise((res) => p.stdout.once('data', (d) => res(String(d))));
    assert.match(line, /127\.0\.0\.1/);
    const bad = await fetch(`http://127.0.0.1:${port}/%`);
    assert.equal(bad.status, 400);
    const ok = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(ok.status, 200);
  } finally {
    p.kill();
  }
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { startupRoutes, warmLocalRuntime } from './warm-local-runtime.mjs';

async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('warms all startup routes without credentials or mutations', async t => {
  const requests = [];
  const origin = await serve(t, (req, res) => {
    requests.push({ path: req.url, method: req.method, auth: req.headers.authorization, cookie: req.headers.cookie });
    res.writeHead(req.url === startupRoutes[0] ? 200 : 401).end();
  });
  const results = await warmLocalRuntime(`${origin}/irrelevant?secret=not-forwarded`, { report() {} });
  assert.deepEqual(requests, startupRoutes.map(path => ({ path, method: 'GET', auth: undefined, cookie: undefined })));
  assert.equal(results.length, startupRoutes.length);
});

test('never contacts remote or non-HTTP origins', async () => {
  for (const origin of ['https://nest.quipsly.com', 'http://localhost.example.com', 'http://192.168.1.2', 'https://127.0.0.1']) {
    assert.deepEqual(await warmLocalRuntime(origin, { fetchImpl() { assert.fail('Unexpected request'); }, report() {} }), []);
  }
  await assert.rejects(warmLocalRuntime('http://user:password@127.0.0.1'), /credentials/);
});

for (const status of [302, 404, 429, 500, 503]) {
  test(`fails early on HTTP ${status} without following redirects`, async t => {
    let requests = 0;
    const origin = await serve(t, (_req, res) => {
      requests += 1;
      res.writeHead(status, { Location: '/should-not-follow' }).end();
    });
    await assert.rejects(warmLocalRuntime(origin, { report() {} }), new RegExp(`HTTP ${status}`));
    assert.equal(requests, 1);
  });
}

test('does not accept an authorization failure on the public configuration route', async t => {
  const origin = await serve(t, (_req, res) => res.writeHead(401).end());
  await assert.rejects(warmLocalRuntime(origin, { report() {} }), /HTTP 401/);
});

test('bounds stalled requests', async t => {
  const origin = await serve(t, () => {});
  const progress = [];
  await assert.rejects(warmLocalRuntime(origin, { timeoutMs: 30, report: message => progress.push(message) }), error => {
    assert.equal(error.name, 'TimeoutError');
    assert.match(error.message, /Local startup route \/api\/mac\/firebase-client-config did not respond after \d+ms/);
    assert.match(error.message, /Native tests have not started/);
    return true;
  });
  assert.deepEqual(progress, [`Warming local route: ${startupRoutes[0]}`]);
});

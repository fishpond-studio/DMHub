import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as zlib from 'node:zlib';
import test from 'node:test';
import { requestPinnedAddress } from '../src/lib/pinned-request.ts';

test('pinned requests use the chosen socket address while preserving Host and compressed responses', async (t) => {
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = { host: request.headers.host, method: request.method, body: Buffer.concat(chunks).toString() };
    const body = zlib.gzipSync(JSON.stringify(result));
    response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json', 'Content-Length': body.length });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const port = (server.address() as AddressInfo).port;
  const url = new URL(`http://deliberately-unresolvable.invalid:${port}/`);
  const response = await requestPinnedAddress(url, '127.0.0.1', { method: 'POST', body: 'payload=fixture' });
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('content-length'), null);
  assert.deepEqual(await response.json(), { host: `deliberately-unresolvable.invalid:${port}`, method: 'POST', body: 'payload=fixture' });
});

async function serve(t: test.TestContext, handler: http.RequestListener): Promise<URL> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  return new URL(`http://public.invalid:${(server.address() as AddressInfo).port}/`);
}

test('content codings are decoded in reverse order, including repeated codings', async (t) => {
  const value = '{"decoded":true}';
  const fixtures = [
    { encoding: 'deflate', body: zlib.deflateSync(value) },
    { encoding: 'br', body: zlib.brotliCompressSync(value) },
    { encoding: 'GZIP, br', body: zlib.brotliCompressSync(zlib.gzipSync(value)) },
    { encoding: 'gzip, gzip', body: zlib.gzipSync(zlib.gzipSync(value)) },
    { encoding: 'gzip, identity', body: zlib.gzipSync(value) },
  ];
  const url = await serve(t, (_request, response) => {
    const fixture = fixtures.shift()!;
    response.writeHead(200, { 'Content-Encoding': fixture.encoding, 'Content-Length': fixture.body.length });
    response.end(fixture.body);
  });
  while (fixtures.length > 0) {
    const response = await requestPinnedAddress(url, '127.0.0.1');
    assert.deepEqual(await response.json(), { decoded: true });
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('content-length'), null);
  }
});

test('zstd is decoded when available and rejected clearly on older Node versions', async (t) => {
  // A zstd frame for {"decoded":true}, so this test also runs on Node 20.
  const body = Buffer.from('KLUv/SAQgQAAeyJkZWNvZGVkIjp0cnVlfQ==', 'base64');
  const url = await serve(t, (_request, response) => {
    response.writeHead(200, { 'Content-Encoding': 'zstd', 'Content-Length': body.length });
    response.end(body);
  });
  if (typeof zlib.createZstdDecompress === 'function') {
    const response = await requestPinnedAddress(url, '127.0.0.1');
    assert.deepEqual(await response.json(), { decoded: true });
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('content-length'), null);
  } else {
    await assert.rejects(requestPinnedAddress(url, '127.0.0.1'), /不支持的 Content-Encoding: zstd/);
  }
});

test('unsupported codings reject before exposing a compressed response', async (t) => {
  const url = await serve(t, (_request, response) => {
    response.writeHead(200, { 'Content-Encoding': 'gzip, unknown' });
    response.write('unfinished');
  });
  await assert.rejects(requestPinnedAddress(url, '127.0.0.1'), /不支持的 Content-Encoding: unknown/);
});

test('HEAD and no-content responses preserve representation headers without decoding', async (t) => {
  const fixtures = [200, 204, 205, 304];
  const url = await serve(t, (_request, response) => {
    response.writeHead(fixtures.shift()!, { 'Content-Encoding': 'unknown', 'Content-Length': '10' });
    response.end();
  });
  for (const method of ['HEAD', 'GET', 'GET', 'GET']) {
    const response = await requestPinnedAddress(url, '127.0.0.1', { method });
    assert.equal(response.body, null);
    assert.equal(response.headers.get('content-encoding'), 'unknown');
    assert.equal(response.headers.get('content-length'), '10');
  }
});

test('a failure in a multi-stage decoder rejects body consumption and closes the socket', async (t) => {
  let closeResponse!: () => void;
  const closed = new Promise<void>((resolve) => { closeResponse = resolve; });
  const url = await serve(t, (_request, response) => {
    response.on('close', closeResponse);
    response.writeHead(200, { 'Content-Encoding': 'gzip, br' });
    response.write(zlib.brotliCompressSync('not a gzip stream'));
  });
  const response = await requestPinnedAddress(url, '127.0.0.1');
  await assert.rejects(response.text());
  await closed;
});

test('cancelling a multi-stage response closes its unfinished socket', async (t) => {
  let closeResponse!: () => void;
  const closed = new Promise<void>((resolve) => { closeResponse = resolve; });
  const url = await serve(t, (_request, response) => {
    response.on('close', closeResponse);
    response.writeHead(200, { 'Content-Encoding': 'gzip, br' });
    response.flushHeaders();
  });
  const response = await requestPinnedAddress(url, '127.0.0.1');
  await response.body?.cancel();
  await closed;
});

test('aborting after headers closes an unfinished response body', async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200);
    response.write('partial');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const port = (server.address() as AddressInfo).port;
  const controller = new AbortController();
  const response = await requestPinnedAddress(new URL(`http://public.invalid:${port}/`), '127.0.0.1', { signal: controller.signal });
  controller.abort();
  await assert.rejects(response.text());
});

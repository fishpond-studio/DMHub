import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { requestPinnedAddress } from '../src/lib/pinned-request.ts';

test('pinned requests use the chosen socket address while preserving Host and compressed responses', async (t) => {
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = { host: request.headers.host, method: request.method, body: Buffer.concat(chunks).toString() };
    response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' });
    response.end(gzipSync(JSON.stringify(result)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const port = (server.address() as AddressInfo).port;
  const url = new URL(`http://deliberately-unresolvable.invalid:${port}/`);
  const response = await requestPinnedAddress(url, '127.0.0.1', { method: 'POST', body: 'payload=fixture' });
  assert.deepEqual(await response.json(), { host: `deliberately-unresolvable.invalid:${port}`, method: 'POST', body: 'payload=fixture' });
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

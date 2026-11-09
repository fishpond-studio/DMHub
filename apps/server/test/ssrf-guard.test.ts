import assert from 'node:assert/strict';
import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { isPrivateOrReservedIP, safeFetch, safeValidateUrl } from '../src/lib/ssrf-guard.ts';

const publicAddress = '93.184.215.14';

function publicDns(t: test.TestContext) {
  t.mock.method(dns, 'lookup', (_host: unknown, _options: unknown, callback: (error: null, addresses: Array<{ address: string; family: number }>) => void) => {
    callback(null, [{ address: publicAddress, family: 4 }]);
  });
  t.mock.method(dns.promises, 'lookup', async () => [{ address: publicAddress, family: 4 }]);
}

function fakeTransport(t: test.TestContext, responses: Array<{ status?: number; headers?: string[]; body?: Buffer | string }> = [{}]) {
  const calls: Array<{ url: URL; options: http.RequestOptions; body?: Buffer }> = [];
  t.mock.method(http, 'request', (url: URL, options: http.RequestOptions, callback: (response: unknown) => void) => {
    const call = { url, options, body: undefined as Buffer | undefined };
    calls.push(call);
    const outgoing = new EventEmitter() as EventEmitter & { end(body?: Buffer): void; destroy(): void };
    outgoing.destroy = () => {};
    outgoing.end = (body?: Buffer) => {
      call.body = body;
      const fixture = responses.shift();
      assert.ok(fixture, 'unexpected request');
      const incoming = Object.assign(Readable.from([Buffer.from(fixture.body ?? 'ok')]), {
        statusCode: fixture.status ?? 200,
        statusMessage: 'OK',
        rawHeaders: fixture.headers ?? [],
      });
      queueMicrotask(() => callback(incoming));
    };
    return outgoing;
  });
  return calls;
}

test('reserved IPv6 forms cannot disguise loopback or IPv4 private destinations', () => {
  for (const address of ['::', '::1', '0:0:0:0::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1', '::ffff:a00:1', '::ffff:a9fe:a9fe', '::127.0.0.1',
    'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::', '64:ff9b::7f00:1']) {
    assert.equal(isPrivateOrReservedIP(address), true, address);
  }
  for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:808:808']) {
    assert.equal(isPrivateOrReservedIP(address), false, address);
  }
});

test('benchmarking and ORCHID prefixes are excluded at their CIDR boundaries', () => {
  for (const address of ['2001:2::', '2001:2:0:ffff:ffff:ffff:ffff:ffff',
    '2001:10::', '2001:1f:ffff:ffff:ffff:ffff:ffff:ffff',
    '2001:20::', '2001:2f:ffff:ffff:ffff:ffff:ffff:ffff']) {
    assert.equal(isPrivateOrReservedIP(address), true, address);
  }
  for (const address of ['2001:2:1::', '2001:f:ffff::', '2001:30::', '2001:4860:4860::8888']) {
    assert.equal(isPrivateOrReservedIP(address), false, address);
  }
});

test('safeFetch pins the connection to a checked IP and preserves the original host', async (t) => {
  publicDns(t);
  const calls = fakeTransport(t);
  const response = await safeFetch('http://public.example/path');
  assert.equal(await response.text(), 'ok');
  assert.equal(calls[0].url.hostname, 'public.example');
  assert.equal((calls[0].options.headers as Record<string, string>).host, 'public.example');
  const lookup = calls[0].options.lookup!;
  lookup('public.example', { all: true }, (_error, addresses) => {
    assert.deepEqual(addresses, [{ address: publicAddress, family: 4 }]);
  });
  assert.equal(calls[0].options.agent, false);
});

test('a DNS answer that switches to private is rejected before connecting', async (t) => {
  publicDns(t);
  t.mock.method(dns.promises, 'lookup', async () => [{ address: '127.0.0.1', family: 4 }]);
  const calls = fakeTransport(t);
  await assert.rejects(safeFetch('http://public.example'), /SSRF/);
  assert.equal(calls.length, 0);
});

test('redirect targets are checked and credentials and POST body are not sent cross-origin', async (t) => {
  publicDns(t);
  const calls = fakeTransport(t, [
    { status: 302, headers: ['Location', 'http://other.example/target'] }, {},
  ]);
  const response = await safeFetch('http://public.example', {
    method: 'POST', headers: { Authorization: 'Bearer fixture', Cookie: 'fixture=yes' }, body: 'secret=fixture',
  });
  await response.text();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'GET');
  assert.equal(calls[1].body, undefined);
  assert.equal((calls[1].options.headers as Record<string, string>).authorization, undefined);
  assert.equal((calls[1].options.headers as Record<string, string>).cookie, undefined);
});

test('redirects to private addresses and disabled redirects are rejected', async (t) => {
  publicDns(t);
  const calls = fakeTransport(t, [
    { status: 302, headers: ['Location', 'http://127.0.0.1/secret'] },
    { status: 302, headers: ['Location', 'http://other.example'] },
  ]);
  await assert.rejects(safeFetch('http://public.example'), /SSRF/);
  await assert.rejects(safeFetch('http://public.example', undefined, 0), /不允许跟随重定向/);
  assert.equal(calls.length, 2);
});

test('compressed JSON remains consumable and HEAD responses have no body', async (t) => {
  publicDns(t);
  fakeTransport(t, [
    { headers: ['Content-Encoding', 'gzip', 'Content-Type', 'application/json'], body: gzipSync('{"ok":true}') },
    { body: '' },
  ]);
  assert.deepEqual(await (await safeFetch('http://public.example')).json(), { ok: true });
  assert.equal((await safeFetch('http://public.example', { method: 'HEAD' })).body, null);
});

test('URL credentials are rejected and an aborted request never connects', async (t) => {
  publicDns(t);
  assert.equal((await safeValidateUrl('http://user:password@public.example')).safe, false);
  const calls = fakeTransport(t);
  await assert.rejects(safeFetch('http://public.example', { signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('an invalid remote status rejects the request without an uncaught callback error', async (t) => {
  publicDns(t);
  fakeTransport(t, [{ status: 600 }]);
  await assert.rejects(safeFetch('http://public.example'), RangeError);
});

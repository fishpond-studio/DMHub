import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUptimePushUrl } from '../src/lib/uptime-push.ts';

test('uptime pushes keep the full endpoint without duplicating its path', () => {
  const url = buildUptimePushUrl('https://monitor.example/prefix/api/push/token_abc-123?status=up&msg=OK&ping=1', 'down', 'Connection failed & retry');
  assert.equal(url.pathname, '/prefix/api/push/token_abc-123');
  assert.equal(url.searchParams.get('status'), 'down');
  assert.equal(url.searchParams.get('msg'), 'Connection failed & retry');
  assert.equal(url.searchParams.get('ping'), '1');
  assert.equal(url.searchParams.getAll('status').length, 1);
});

test('uptime configuration requires an HTTP endpoint with a push token', () => {
  for (const url of ['ftp://monitor.example/api/push/abc', 'https://monitor.example', 'https://monitor.example/api/push/', 'https://user:password@monitor.example/api/push/abc']) {
    assert.throws(() => buildUptimePushUrl(url, 'up', 'OK'), /无效/);
  }
});

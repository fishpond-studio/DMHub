import assert from 'node:assert/strict';
import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { webhookChannel } from '../src/lib/notifications/webhook.ts';
import { feishuChannel } from '../src/lib/notifications/feishu.ts';
import { dingtalkChannel } from '../src/lib/notifications/dingtalk.ts';

for (const channel of [webhookChannel, feishuChannel, dingtalkChannel]) {
  for (const status of [200, 500]) {
    test(`${channel.id} releases an unfinished HTTP ${status} response`, async (t) => {
      const address = { address: '93.184.215.14', family: 4 };
      t.mock.method(dns, 'lookup', (_host: unknown, _options: unknown, callback: (error: null, addresses: typeof address[]) => void) => {
        callback(null, [address]);
      });
      t.mock.method(dns.promises, 'lookup', async () => [address]);
      const incoming = Object.assign(new Readable({ read() {} }), {
        statusCode: status,
        statusMessage: 'fixture',
        rawHeaders: [],
      });
      t.mock.method(http, 'request', (_url: URL, _options: http.RequestOptions, callback: (response: unknown) => void) => {
        const outgoing = Object.assign(new EventEmitter(), {
          destroy() {},
          end() { queueMicrotask(() => callback(incoming)); },
        });
        return outgoing;
      });
      const sent = channel.send({ title: 'fixture', content: 'fixture', level: 'info' }, { webhookUrl: 'http://public.example/hook' });
      if (status === 200) await sent;
      else await assert.rejects(sent, /failed: 500/);
      assert.equal(incoming.destroyed, true);
    });
  }
}

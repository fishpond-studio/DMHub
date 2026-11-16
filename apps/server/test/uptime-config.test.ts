import assert from 'node:assert/strict';
import test, { after } from 'node:test';

process.env.JWT_SECRET = 'fixture-jwt-secret-'.repeat(3);
process.env.ENCRYPTION_KEY = 'fixture-encryption-key-'.repeat(3);
process.env.DB_TYPE = 'postgresql';
const { createDbClient, closeDb } = await import('../src/db/index.ts');
const { configureUptimePushUrl } = await import('../src/services/uptime.ts');
const db = createDbClient('postgres://fixture:fixture@127.0.0.1:1/fixture');
after(closeDb);

test('saving a legacy base URL preserves the actionable validation message', async (t) => {
  t.mock.method(db, 'update', () => assert.fail('invalid configuration must not be saved'));
  await assert.rejects(
    configureUptimePushUrl('https://monitor.example'),
    /完整 Push URL.*\/api\/push\/<token>/,
  );
});

test('malformed push URLs keep a sanitized validation error', async (t) => {
  t.mock.method(db, 'update', () => assert.fail('invalid configuration must not be saved'));
  await assert.rejects(configureUptimePushUrl('not-a-url'), { message: '无效的 Push URL' });
});

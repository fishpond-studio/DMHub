import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, mock } from 'node:test';
import type { BackupPayload } from '../src/services/backup.js';

process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.DB_TYPE = 'postgresql';

const { createDbClient, closeDb } = await import('../src/db/index.js');
const { dnsRecords, domains } = await import('../src/db/schema.js');
const { importBackup, exportBackup } = await import('../src/services/backup.js');

type RecordRow = BackupPayload['domains'][number]['records'][number];
const storedRecords: RecordRow[] = [];
const domain = {
  id: 'domain-1', name: 'example.com', status: 'active', groupName: null, tags: [],
  notes: null, expiresAt: null, autoCheckExpiry: true, expiryRemindDays: [30, 7],
};
const db = createDbClient('postgresql://unused:unused@127.0.0.1:1/unused', 'postgresql');
const select = mock.method(db, 'select', () => ({
  from(table: unknown) {
    const rows = table === domains ? [domain] : table === dnsRecords ? storedRecords : [];
    return {
      where() { return this; },
      limit() { return Promise.resolve(rows); },
      then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(rows).then(resolve); },
    };
  },
}));
const insert = mock.method(db, 'insert', (table: unknown) => ({
  async values(row: RecordRow) {
    if (table === dnsRecords) storedRecords.push({ ...row });
  },
}));

after(async () => {
  select.mock.restore();
  insert.mock.restore();
  await closeDb();
});

test('backup restore preserves DNS record sets and remains idempotent', async () => {
  const records: RecordRow[] = [
    { recordType: 'A', name: '@', value: '192.0.2.1', ttl: 3600, priority: null, proxied: false, notes: null },
    { recordType: 'A', name: '@', value: '192.0.2.2', ttl: 3600, priority: null, proxied: false, notes: null },
    { recordType: 'TXT', name: '@', value: 'verification-one', ttl: 3600, priority: null, proxied: false, notes: null },
    { recordType: 'TXT', name: '@', value: 'verification-two', ttl: 3600, priority: null, proxied: false, notes: null },
    { recordType: 'MX', name: '@', value: 'mail.example.com', ttl: 3600, priority: 10, proxied: false, notes: null },
    { recordType: 'MX', name: '@', value: 'mail.example.com', ttl: 3600, priority: 20, proxied: false, notes: null },
  ];
  const payload: BackupPayload = {
    app: 'dmhub', version: 1, exportedAt: new Date().toISOString(),
    domains: [{ ...domain, records }],
  };
  const first = await importBackup('admin-1', payload);
  assert.equal(first.recordsImported, records.length);
  assert.equal(first.recordsSkipped, 0);
  const exported = await exportBackup('admin-1');
  assert.deepEqual(exported.domains[0].records, records);
  const second = await importBackup('admin-1', payload);
  assert.equal(second.recordsImported, 0);
  assert.equal(second.recordsSkipped, records.length);
  assert.equal(storedRecords.length, records.length);
});

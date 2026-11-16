import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, mock } from 'node:test';

process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.DB_TYPE = 'postgresql';

const { createDbClient, closeDb } = await import('../src/db/index.js');
const { dnsRecords, domains, dnsSnapshots } = await import('../src/db/schema.js');
const { importRecordsCsv } = await import('../src/services/import.js');

const storedRecords: Array<Record<string, unknown>> = [];
const domain = { id: 'domain-1', name: 'example.com', providerConfigId: null };
const db = createDbClient('postgresql://unused:unused@127.0.0.1:1/unused', 'postgresql');
const select = mock.method(db, 'select', () => ({
  from(table: unknown) {
    const rows = table === domains ? [domain]
      : table === dnsRecords ? storedRecords
        : table === dnsSnapshots ? [{ version: 0 }] : [];
    return {
      where() { return this; },
      limit() { return Promise.resolve(rows); },
      then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(rows).then(resolve); },
    };
  },
}));
const insert = mock.method(db, 'insert', (table: unknown) => ({
  values(row: Record<string, unknown>) {
    const inserted = { ...row, id: `row-${storedRecords.length + 1}` };
    if (table === dnsRecords) storedRecords.push(inserted);
    return {
      returning() { return Promise.resolve([inserted]); },
      then(resolve: () => unknown) { return Promise.resolve().then(resolve); },
    };
  },
}));

after(async () => {
  select.mock.restore();
  insert.mock.restore();
  await closeDb();
});

test('CSV import preserves multi-value DNS records and skips only exact duplicates', async () => {
  const csv = [
    'type,name,value,ttl,priority,proxied',
    'A,@,192.0.2.1,3600,,false',
    'A,@,192.0.2.2,3600,,false',
    'TXT,@,verification-one,3600,,false',
    'TXT,@,verification-two,3600,,false',
    'MX,@,mail.example.com,3600,10,false',
    'MX,@,mail.example.com,3600,20,false',
    'A,@,192.0.2.1,3600,,false',
  ].join('\n');
  const first = await importRecordsCsv('admin-1', domain.id, csv, undefined, undefined, 'admin');
  assert.deepEqual(first, { imported: 6, skipped: 1, errors: [] });
  assert.deepEqual(storedRecords.map((record) => record.value), [
    '192.0.2.1', '192.0.2.2', 'verification-one', 'verification-two',
    'mail.example.com', 'mail.example.com',
  ]);
  assert.deepEqual(storedRecords.filter((record) => record.recordType === 'MX').map((record) => record.priority), [10, 20]);
  const second = await importRecordsCsv('admin-1', domain.id, csv, undefined, undefined, 'admin');
  assert.deepEqual(second, { imported: 0, skipped: 7, errors: [] });
  assert.equal(storedRecords.length, 6);
});

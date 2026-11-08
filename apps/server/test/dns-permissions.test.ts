import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, mock } from 'node:test';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.DB_TYPE = 'postgresql';

const { createDbClient, closeDb } = await import('../src/db/index.js');
const { domains, dnsRecords, domainAssignments } = await import('../src/db/schema.js');
const { authenticate } = await import('../src/middleware/auth.js');
const { requireRecordWriteAccess } = await import('../src/middleware/domain-permission.js');
const { exportRoutes } = await import('../src/routes/export.js');

const records = [
  { domainId: 'domain-1', recordType: 'TXT', name: 'blog', value: 'allowed-value', ttl: 3600, priority: null },
  { domainId: 'domain-1', recordType: 'TXT', name: 'private', value: 'private-value', ttl: 3600, priority: null },
  { domainId: 'domain-1', recordType: 'TXT', name: 'api.dev', value: 'nested-value', ttl: 3600, priority: null },
];
let assignments = [{ subdomainPattern: 'blog', permission: 'dns_read' }];

// No database connection is opened: the real routes and middleware receive fixture rows.
const db = createDbClient('postgresql://unused:unused@127.0.0.1:1/unused', 'postgresql');
const select = mock.method(db, 'select', () => ({
  from(table: unknown) {
    const rows = table === dnsRecords
      ? records
      : table === domainAssignments
        ? assignments
        : table === domains ? [{ name: 'example.com' }] : [];
    return {
      where() { return this; },
      limit() { return Promise.resolve(rows); },
      then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(rows).then(resolve); },
    };
  },
}));

after(async () => {
  select.mock.restore();
  await closeDb();
});

async function exportRecords(format: string, role = 'user') {
  const app = Fastify();
  app.addHook('onRoute', (route) => {
    if (Array.isArray(route.preHandler)) {
      route.preHandler = route.preHandler.filter((handler) => handler !== authenticate);
    }
  });
  app.addHook('onRequest', async (request) => {
    request.user = { userId: 'user-1', role };
  });
  await app.register(exportRoutes);
  try {
    return await app.inject({ method: 'GET', url: `/dns-records/domain-1?format=${format}` });
  } finally {
    await app.close();
  }
}

for (const format of ['json', 'csv', 'zone', 'bind']) {
  test(`${format} export contains only records in the user's assigned subdomains`, async () => {
    assignments = [{ subdomainPattern: 'blog', permission: 'dns_read' }];
    const result = await exportRecords(format);
    assert.equal(result.statusCode, 200);
    assert.ok(result.body.includes('allowed-value'));
    assert.ok(!result.body.includes('private-value'));
    assert.ok(!result.body.includes('nested-value'));
  });
}

test('export combines exact and wildcard assignments', async () => {
  assignments = [
    { subdomainPattern: 'blog', permission: 'dns_read' },
    { subdomainPattern: '*.dev', permission: 'dns_edit' },
  ];
  const result = await exportRecords('json');
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json().map((record: { name: string }) => record.name), ['blog', 'api.dev']);
});

test('export without an assignment is forbidden and admin export retains every record', async () => {
  assignments = [];
  assert.equal((await exportRecords('json')).statusCode, 403);
  const adminResult = await exportRecords('json', 'admin');
  assert.equal(adminResult.statusCode, 200);
  assert.equal(adminResult.json().length, records.length);
});

async function authorizeBulk(body: unknown) {
  let status: number | undefined;
  const reply = {
    status(code: number) { status = code; return this; },
    send() { return this; },
  } as unknown as FastifyReply;
  await requireRecordWriteAccess({ domainIdParam: 'id' })({
    user: { userId: 'user-1', role: 'user' },
    params: { id: 'domain-1' },
    domainAssignments: [
      { subdomainPattern: 'blog', permission: 'dns_edit' },
      { subdomainPattern: '*.dev', permission: 'dns_edit' },
    ],
    body,
  } as FastifyRequest, reply);
  return status;
}

test('bulk creation allows all records within the assigned scope without a top-level name', async () => {
  assert.equal(await authorizeBulk({ records: [{ name: 'blog' }, { name: 'api.dev' }] }), undefined);
});

test('a top-level authorized name cannot bypass the scope of a bulk-created record', async () => {
  assert.equal(await authorizeBulk({ name: 'blog', records: [{ name: 'private' }] }), 403);
  assert.equal(await authorizeBulk({ records: [{ name: 'blog' }, { name: 'private' }] }), 403);
});

test('malformed bulk entries are rejected before the write handler runs', async () => {
  assert.equal(await authorizeBulk({ name: 'blog', records: [null] }), 400);
  assert.equal(await authorizeBulk({ name: 'blog', records: [{ name: 123 }] }), 400);
});

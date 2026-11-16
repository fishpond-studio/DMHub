import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, type TestContext } from 'node:test';
import Fastify from 'fastify';
import { PgDialect } from 'drizzle-orm/pg-core';

process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.DB_TYPE = 'postgresql';

const { createDbClient, closeDb } = await import('../src/db/index.js');
const { domains, dnsRecords, domainAssignments } = await import('../src/db/schema.js');
const { searchDnsRecords } = await import('../src/services/domain.js');
const { domainRoutes } = await import('../src/routes/domains.js');
const { authenticate } = await import('../src/middleware/auth.js');
const db = createDbClient('postgresql://unused:unused@127.0.0.1:1/unused', 'postgresql');
after(closeDb);

const assignments = [
  { domainId: 'domain-1', subdomainPattern: 'blog' },
  { domainId: 'domain-1', subdomainPattern: '*.dev' },
  { domainId: 'domain-2', subdomainPattern: '@' },
];
const fixture = [
  ...Array.from({ length: 120 }, (_, i) => ({ id: `private-${i}`, domainId: 'domain-1', domainName: 'example.com', name: 'private', value: 'private-secret', notes: 'private-note' })),
  { id: 'blog', domainId: 'domain-1', domainName: 'example.com', name: 'blog', value: 'public', notes: null },
  { id: 'nested', domainId: 'domain-1', domainName: 'example.com', name: 'api.dev', value: 'public', notes: null },
  { id: 'wrong-domain', domainId: 'domain-2', domainName: 'other.example.com', name: 'blog', value: 'private-secret', notes: 'private-note' },
  { id: 'root', domainId: 'domain-2', domainName: 'other.example.com', name: '@', value: 'public', notes: null },
];

function mockSearch(t: TestContext, ownAssignments = assignments, records = fixture) {
  const pages: Array<{ take: number; offset: number }> = [];
  t.mock.method(db, 'select', () => ({
    from(table: unknown) {
      if (table === domainAssignments) return { where: async () => ownAssignments };
      assert.equal(table, dnsRecords);
      let take = Infinity;
      let offset = 0;
      return {
        innerJoin() { return this; },
        where() { return this; },
        orderBy() { return this; },
        limit(value: number) { take = value; return this; },
        offset(value: number) { offset = value; return this; },
        then(resolve: (rows: typeof fixture) => unknown) {
          pages.push({ take, offset });
          return Promise.resolve(records.slice(offset, offset + take)).then(resolve);
        },
      };
    },
  }));
  return pages;
}

test('search filters sibling records by their own domain scope before limiting results', async (t) => {
  mockSearch(t);
  const result = await searchDnsRecords('user-1', 'user', 'example.com', 3);
  assert.deepEqual(result.results.map((row) => row.id), ['blog', 'nested', 'root']);
  assert.deepEqual(result.results.map((row) => row.fqdn), ['blog.example.com', 'api.dev.example.com', 'other.example.com']);
  assert.ok(!JSON.stringify(result).includes('private-secret'));
  assert.ok(!JSON.stringify(result).includes('private-note'));
  assert.equal(result.truncated, false);
});

test('search preserves administrator access and returns no results without assignments', async (t) => {
  mockSearch(t, []);
  assert.equal((await searchDnsRecords('admin-1', 'admin', 'example.com', 2)).results.length, 2);
  assert.deepEqual(await searchDnsRecords('user-1', 'user', 'example.com', 10), { results: [], truncated: false });
});

test('search uses a finite default for an invalid result limit', async (t) => {
  mockSearch(t);
  assert.equal((await searchDnsRecords('admin-1', 'admin', 'example.com', NaN)).results.length, 50);
});

test('search stops after 1000 candidates even when no record is authorized', async (t) => {
  const records = Array.from({ length: 5000 }, (_, i) => ({ ...fixture[0], id: `private-${i}` }));
  const pages = mockSearch(t, assignments, records);
  const result = await searchDnsRecords('user-1', 'user', 'example.com', 50);
  assert.deepEqual(result, { results: [], truncated: true });
  assert.deepEqual(pages, Array.from({ length: 10 }, (_, i) => ({ take: 100, offset: i * 100 })));
});

test('search returns authorized partial results and marks the scan cap', async (t) => {
  const records = Array.from({ length: 1001 }, (_, i) => ({ ...fixture[0], id: `private-${i}` }));
  records[0] = fixture[120];
  records[999] = fixture[121];
  records[1000] = fixture[123];
  const pages = mockSearch(t, assignments, records);
  const result = await searchDnsRecords('user-1', 'user', 'example.com', 50);
  assert.deepEqual(result.results.map((row) => row.id), ['blog', 'nested']);
  assert.equal(result.truncated, true);
  assert.equal(pages.length, 10);
  assert.ok(!JSON.stringify(result).includes('private-secret'));
});

test('search reports complete results when candidates run out before the scan cap', async (t) => {
  const pages = mockSearch(t);
  const result = await searchDnsRecords('user-1', 'user', 'example.com', 50);
  assert.equal(result.results.length, 3);
  assert.equal(result.truncated, false);
  assert.equal(pages.length, 2);
  assert.deepEqual(await searchDnsRecords('user-1', 'user', ' '), { results: [], truncated: false });
  assert.equal(pages.length, 2);
});

test('the search API exposes truncation even with no authorized matches', async (t) => {
  const records = Array.from({ length: 1001 }, (_, i) => ({ ...fixture[0], id: `private-${i}` }));
  mockSearch(t, assignments, records);
  const app = Fastify();
  app.addHook('onRoute', (route) => {
    if (Array.isArray(route.preHandler)) route.preHandler = route.preHandler.filter((handler) => handler !== authenticate);
  });
  app.addHook('onRequest', async (request) => { request.user = { userId: 'user-1', role: 'user' }; });
  await app.register(domainRoutes);
  try {
    const response = await app.inject({ method: 'GET', url: '/search/records?q=example.com&limit=50' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { results: [], truncated: true });
  } finally {
    await app.close();
  }
});

async function readMetadata(t: TestContext, path: string, role: string) {
  const originalSelect = db.select.bind(db);
  let whereSql = '';
  let parameters: unknown[] = [];
  t.mock.method(db, 'select', (fields: Record<string, unknown>) => {
    // Keep the assignment subquery real so both SQL correlation and user binding are checked.
    if (fields.domainId) return originalSelect(fields);
    return {
      from(table: unknown) {
        assert.equal(table, domains);
        return {
          where(condition: Parameters<PgDialect['sqlToQuery']>[0] | undefined) {
            if (condition) {
              const built = new PgDialect().sqlToQuery(condition);
              whereSql = built.sql;
              parameters = built.params;
            }
            return this;
          },
          groupBy() { return this; },
          then(resolve: (rows: unknown[]) => unknown) {
            const restricted = whereSql.includes('"domain_assignments"');
            const rows = fields.tags
              ? [{ tags: ['visible'] }, ...(!restricted ? [{ tags: ['private'] }] : [])]
              : [{ name: 'visible', count: 1 }, ...(!restricted ? [{ name: 'private', count: 1 }] : [])];
            return Promise.resolve(rows).then(resolve);
          },
        };
      },
    };
  });
  const app = Fastify();
  app.addHook('onRoute', (route) => {
    if (Array.isArray(route.preHandler)) route.preHandler = route.preHandler.filter((handler) => handler !== authenticate);
  });
  app.addHook('onRequest', async (request) => { request.user = { userId: 'user-1', role }; });
  await app.register(domainRoutes);
  try {
    const response = await app.inject({ method: 'GET', url: path });
    assert.equal(response.statusCode, 200);
    return { body: response.json(), whereSql, parameters };
  } finally {
    await app.close();
  }
}

for (const resource of ['groups', 'tags']) {
  test(`${resource} only expose metadata from the current user's assigned domains`, async (t) => {
    const result = await readMetadata(t, `/${resource}`, 'user');
    assert.deepEqual(result.body[resource], [{ name: 'visible', count: 1 }]);
    assert.match(result.whereSql, /"domains"\."id" in \(select "domain_id" from "domain_assignments" where "domain_assignments"\."user_id" = \$1\)/);
    assert.deepEqual(result.parameters, ['user-1']);
  });
  test(`${resource} preserve administrator access to all metadata`, async (t) => {
    const result = await readMetadata(t, `/${resource}`, 'admin');
    assert.equal(result.body[resource].length, 2);
    assert.ok(!result.whereSql.includes('domain_assignments'));
  });
}

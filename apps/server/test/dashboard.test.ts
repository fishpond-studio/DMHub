import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after } from 'node:test';
import Fastify from 'fastify';

process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.DB_TYPE = 'mysql';

const { createDbClient, getMysqlPool, closeDb } = await import('../src/db/index.js');
const { dashboardRoutes } = await import('../src/routes/dashboard.js');
const { authenticate } = await import('../src/middleware/auth.js');

// Exercise the real MySQL Drizzle result mapper without opening a connection.
createDbClient('mysql://unused:unused@127.0.0.1:1/unused', 'mysql');
const pool = getMysqlPool()!;
after(closeDb);

async function requestDashboard(path: string, role = 'user') {
  const app = Fastify();
  app.addHook('onRoute', (route) => {
    if (Array.isArray(route.preHandler)) {
      route.preHandler = route.preHandler.filter((handler) => handler !== authenticate);
    }
  });
  app.addHook('onRequest', async (request) => {
    request.user = { userId: 'user-1', role };
  });
  await app.register(dashboardRoutes);
  try {
    return await app.inject({ method: 'GET', url: path });
  } finally {
    await app.close();
  }
}

for (const path of ['/expiring', '/activity']) {
  test(`${path} returns an empty list for users with no assigned domains`, async (t) => {
    let queries = 0;
    t.mock.method(pool, 'query', async (options: { sql: string }) => {
      queries++;
      assert.ok(options.sql.includes('domain_assignments'), 'unassigned users must not query domain data');
      return [[], []];
    });
    const response = await requestDashboard(path);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
    assert.equal(queries, 1);
  });
}

for (const path of ['/stats', '/records-distribution']) {
  test(`${path} maps MySQL result tuples into numeric record-type counts`, async (t) => {
    t.mock.method(pool, 'query', async (options: { sql: string; rowsAsArray?: boolean }) => {
      if (/group by/i.test(options.sql)) {
        return options.rowsAsArray
          ? [[['A', '3'], ['TXT', '2']], []]
          : [[{ record_type: 'A', count: '3' }, { record_type: 'TXT', count: '2' }], []];
      }
      return [[['5']], []];
    });
    const response = await requestDashboard(path, 'admin');
    assert.equal(response.statusCode, 200);
    if (path === '/stats') assert.deepEqual(response.json().recordsByType, { A: 3, TXT: 2 });
    else assert.deepEqual(response.json(), { labels: ['A', 'TXT'], data: [3, 2] });
  });
}

test('record distribution retains the assigned-domain filter', async (t) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pool, 'query', async (options: { sql: string; rowsAsArray?: boolean }, params: unknown[]) => {
    queries.push({ sql: options.sql, params });
    if (options.sql.includes('domain_assignments')) return [[['assigned-domain']], []];
    return [[['A', '2']], []];
  });
  const response = await requestDashboard('/records-distribution');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { labels: ['A'], data: [2] });
  assert.equal(queries.length, 2);
  assert.ok(/where.*domain_id/i.test(queries[1].sql));
  assert.deepEqual(queries[1].params, ['assigned-domain']);
});


test('activity for a partial-domain assignee does not expose other actors logs', async (t) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pool, 'query', async (options: { sql: string }, params: unknown[]) => {
    queries.push({ sql: options.sql, params });
    if (options.sql.includes('domain_assignments')) return [[['assigned-domain', 'blog']], []];
    return [[], []];
  });
  const response = await requestDashboard('/activity');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), []);
  assert.match(queries[1].sql, /`operation_logs`\.`user_id` =/);
  assert.deepEqual(queries[1].params, ['assigned-domain', 'user-1', 20]);
});

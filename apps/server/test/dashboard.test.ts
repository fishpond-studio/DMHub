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

function withoutTrimPatterns(params: unknown[]) {
  return params.filter((value) => !(typeof value === 'string' && value.startsWith('\\A[')));
}

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
    if (options.sql.includes('domain_assignments')) return [[['assigned-domain', '*']], []];
    return [[['A', '2']], []];
  });
  const response = await requestDashboard('/records-distribution');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { labels: ['A'], data: [2] });
  assert.equal(queries.length, 2);
  assert.ok(/where.*domain_id/i.test(queries[1].sql));
  assert.deepEqual(queries[1].params, ['assigned-domain']);
});

for (const path of ['/stats', '/records-distribution', '/health']) {
  test(`${path} returns empty aggregates without querying private records for unassigned users`, async (t) => {
    let queries = 0;
    t.mock.method(pool, 'query', async (options: { sql: string }) => {
      queries++;
      assert.match(options.sql, /domain_assignments/);
      return [[], []];
    });
    const response = await requestDashboard(path);
    assert.equal(response.statusCode, 200);
    if (path === '/stats') {
      assert.equal(response.json().totalRecords, 0);
      assert.equal(response.json().recentChanges, 0);
      assert.deepEqual(response.json().recordsByType, {});
    } else if (path === '/health') {
      assert.equal(response.json().summary.total, 0);
      assert.deepEqual(response.json().domains, []);
    } else assert.deepEqual(response.json(), { labels: [], data: [] });
    assert.equal(queries, 1);
  });
}

test('stats applies record scope to both counts and types and actor scope to recent changes', async (t) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pool, 'query', async (options: { sql: string }, params: unknown[]) => {
    queries.push({ sql: options.sql, params });
    if (options.sql.includes('domain_assignments')) return [[['assigned-domain', 'blog']], []];
    if (/group by/i.test(options.sql)) return [[['A', '1']], []];
    return [[['1']], []];
  });
  const response = await requestDashboard('/stats');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().totalRecords, 1);
  assert.equal(response.json().recentChanges, 1);
  const recordQueries = queries.filter((query) => /from `dns_records`/.test(query.sql));
  assert.equal(recordQueries.length, 2);
  for (const query of recordQueries) {
    assert.match(query.sql, /where.*`dns_records`\.`domain_id`/s);
    assert.match(query.sql, /`dns_records`\.`name`/);
    assert.match(query.sql, /BINARY \(CASE/);
    assert.deepEqual(withoutTrimPatterns(query.params), ['assigned-domain', 'blog']);
  }
  const logQuery = queries.find((query) => /from `operation_logs`/.test(query.sql))!;
  assert.match(logQuery.sql, /`operation_logs`\.`user_id` =/);
  assert.deepEqual(logQuery.params.slice(1), ['assigned-domain', 'user-1']);
});

test('stats preserves other actors logs for full-domain assignments', async (t) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pool, 'query', async (options: { sql: string }, params: unknown[]) => {
    queries.push({ sql: options.sql, params });
    if (options.sql.includes('domain_assignments')) return [[['assigned-domain', '*']], []];
    if (/group by/i.test(options.sql)) return [[['A', '2']], []];
    return [[['2']], []];
  });
  const response = await requestDashboard('/stats');
  assert.equal(response.statusCode, 200);
  const logQuery = queries.find((query) => /from `operation_logs`/.test(query.sql))!;
  assert.match(logQuery.sql, / or /);
  assert.deepEqual(logQuery.params.slice(1), ['assigned-domain', 'assigned-domain', 'user-1']);
  for (const query of queries.filter((query) => /from `dns_records`/.test(query.sql))) {
    assert.doesNotMatch(query.sql, /`dns_records`\.`name`/);
    assert.deepEqual(query.params, ['assigned-domain']);
  }
});

test('record distribution includes only the granted exact and wildcard subdomains', async (t) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pool, 'query', async (options: { sql: string }, params: unknown[]) => {
    queries.push({ sql: options.sql, params });
    if (options.sql.includes('domain_assignments')) {
      return [[['assigned-domain', 'blog'], ['assigned-domain', '*.dev']], []];
    }
    return [[['A', '2']], []];
  });
  const response = await requestDashboard('/records-distribution');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { labels: ['A'], data: [2] });
  assert.match(queries[1].sql, /`dns_records`\.`name`/);
  assert.match(queries[1].sql, /LIKE \? ESCAPE '!'/);
  assert.deepEqual(withoutTrimPatterns(queries[1].params), ['assigned-domain', 'blog', 'assigned-domain', '%.dev']);
});

test('health scopes both record counts and NS-derived scores to assigned subdomains', async (t) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pool, 'query', async (options: { sql: string }, params: unknown[]) => {
    queries.push({ sql: options.sql, params });
    if (options.sql.includes('domain_assignments')) return [[['assigned-domain', 'blog']], []];
    return [[['assigned-domain', 'example.com', 'active', null, 'provider-1', '1', '0']], []];
  });
  const response = await requestDashboard('/health');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().domains[0].recordCount, 1);
  assert.ok(response.json().domains[0].issues.includes('未见 NS 记录（可能未同步）'));
  assert.equal(queries.length, 2);
  assert.equal((queries[1].sql.match(/BINARY \(CASE/g) ?? []).length, 2);
  assert.deepEqual(withoutTrimPatterns(queries[1].params), ['assigned-domain', 'blog', 'assigned-domain', 'blog', 'assigned-domain', 200]);
});

test('MySQL record normalization binds JavaScript whitespace with absolute regex anchors', async (t) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  t.mock.method(pool, 'query', async (options: { sql: string }, params: unknown[]) => {
    queries.push({ sql: options.sql, params });
    if (options.sql.includes('domain_assignments')) {
      return [[['assigned-domain', '\tBLOG.\n'], ['assigned-domain', '\u00a0*.DEV.\ufeff']], []];
    }
    return [[['A', '2']], []];
  });
  const response = await requestDashboard('/records-distribution');
  assert.equal(response.statusCode, 200);
  const query = queries[1];
  assert.match(query.sql, /LOWER\(REGEXP_REPLACE\(`dns_records`\.`name`, \?, ''\)\)/);
  assert.deepEqual(withoutTrimPatterns(query.params), ['assigned-domain', 'blog', 'assigned-domain', '%.dev']);
  const patterns = query.params.filter((value): value is string => typeof value === 'string' && value.startsWith('\\A['));
  assert.ok(patterns.length > 0);
  const whitespace = Array.from({ length: 0x10000 }, (_, code) => String.fromCharCode(code))
    .filter((character) => character.trim() === '').join('');
  for (const pattern of patterns) {
    const [leading, trailing] = pattern.split(']+|[');
    assert.ok(leading.startsWith('\\A['));
    assert.ok(trailing.endsWith(']+\\z'));
    assert.deepEqual([...leading.slice(3)].sort(), [...whitespace].sort());
    assert.deepEqual([...trailing.slice(0, -4)].sort(), [...whitespace].sort());
  }
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

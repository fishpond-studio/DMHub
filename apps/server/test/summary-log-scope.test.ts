import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

process.env.JWT_SECRET = 'fixture-jwt-secret-'.repeat(3);
process.env.ENCRYPTION_KEY = 'fixture-encryption-key-'.repeat(3);
process.env.DB_TYPE = 'postgresql';
const { createDbClient, closeDb } = await import('../src/db/index.ts');
const { domains, domainAssignments } = await import('../src/db/schema.ts');
const { getMonitorSummary } = await import('../src/services/monitor.ts');
const { getLogAccessCondition } = await import('../src/lib/log-access.ts');
const db = createDbClient('postgres://fixture:fixture@127.0.0.1:1/fixture');
const dialect = new PgDialect();
after(closeDb);

test('monitor summary scopes domains and totals to the signed-in user', async (t) => {
  const originalSelect = db.select.bind(db);
  const fixture = { id: 'allowed', name: 'allowed.example', status: 'active', monitorStatus: 'up', monitorResponseMs: 10, monitorLastCheckedAt: null };
  t.mock.method(db, 'select', (fields: Record<string, unknown>) => ({
    from(table: unknown) {
      if (table === domainAssignments) return originalSelect(fields).from(domainAssignments);
      assert.equal(table, domains);
      return { where(condition: SQL) {
        const query = dialect.sqlToQuery(condition);
        if (query.sql.includes('domain_assignments')) {
          assert.ok(query.params.includes('member-1'));
          return Promise.resolve([fixture]);
        }
        return Promise.resolve([fixture, { ...fixture, id: 'private', name: 'private.example' }]);
      } };
    },
  }));
  const member = await getMonitorSummary('member-1', 'user');
  assert.equal(member.monitored, 1);
  assert.deepEqual(member.domains.map((row) => row.id), ['allowed']);
  assert.equal((await getMonitorSummary('admin-1', 'admin')).monitored, 2);
});

test('partial-domain log access includes an actor restriction and full-domain grants include other actors', async (t) => {
  let assignments = [{ domainId: 'assigned', subdomainPattern: 'blog' }];
  t.mock.method(db, 'select', () => ({ from: () => ({ where: async () => assignments }) }));
  const partial = dialect.sqlToQuery((await getLogAccessCondition('member-1', 'user'))!);
  assert.match(partial.sql, /"operation_logs"\."user_id" =/);
  assert.deepEqual(partial.params, ['assigned', 'member-1']);
  assignments = [{ domainId: 'assigned', subdomainPattern: '*' }];
  const full = dialect.sqlToQuery((await getLogAccessCondition('member-1', 'user'))!);
  assert.match(full.sql, / or /);
  assert.deepEqual(full.params, ['assigned', 'assigned', 'member-1']);
  assignments = [];
  assert.equal(dialect.sqlToQuery((await getLogAccessCondition('member-1', 'user'))!).sql, 'false');
  assert.equal(await getLogAccessCondition('admin-1', 'admin'), undefined);
});


test('log export uses its documented 5000-row cap while interactive pages stay capped at 200', async (t) => {
  const { queryLogs, exportLogsCsv } = await import('../src/services/log.ts');
  const limits: number[] = [];
  t.mock.method(db, 'select', (fields: Record<string, unknown>) => ({ from() {
    if ('count' in fields) return { where: async () => [{ count: 201 }] };
    return { leftJoin() { return this; }, where() { return this; }, orderBy() { return this; },
      limit(limit: number) { limits.push(limit); return this; }, offset: async () => [] };
  } }));
  await queryLogs('admin-1', 'admin', { pageSize: 5000 });
  await exportLogsCsv('admin-1', 'admin', {});
  assert.deepEqual(limits, [200, 5000]);
});

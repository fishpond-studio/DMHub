import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';

process.env.DB_TYPE = 'postgresql';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
const { buildRecordAccessCondition } = await import('../src/lib/record-access.js');
const dialect = new PgDialect();
const whitespace = Array.from({ length: 0x10000 }, (_, code) => String.fromCharCode(code))
  .filter((character) => character.trim() === '').join('');

function withoutTrimCharacters(params: unknown[]) {
  return params.filter((value) => !(typeof value === 'string' && value.length > 1 && value.trim() === ''));
}

test('record aggregation grants admins all records and unassigned users none', () => {
  assert.equal(buildRecordAccessCondition('admin', []), undefined);
  assert.equal(dialect.sqlToQuery(buildRecordAccessCondition('user', [])!).sql, 'false');
});

test('full-domain aggregation grants do not restrict record names', () => {
  const query = dialect.sqlToQuery(buildRecordAccessCondition('user', [
    { domainId: 'assigned', subdomainPattern: '*' },
  ])!);
  assert.equal(query.sql, '"dns_records"."domain_id" = $1');
  assert.deepEqual(query.params, ['assigned']);
});

test('aggregation scopes normalize exact, apex and wildcard assignments without SQL wildcard expansion', () => {
  const query = dialect.sqlToQuery(buildRecordAccessCondition('user', [
    { domainId: 'exact', subdomainPattern: ' BLOG. ' },
    { domainId: 'apex', subdomainPattern: '@' },
    { domainId: 'wildcard', subdomainPattern: '*.DEV.' },
    { domainId: 'literal', subdomainPattern: '*._%!dev' },
  ])!);
  assert.deepEqual(withoutTrimCharacters(query.params), ['exact', 'blog', 'apex', '', 'wildcard', '%.dev', 'literal', '%.!_!%!!dev']);
  assert.match(query.sql, /LOWER\(BTRIM\("dns_records"\."name", \$\d+\)\)/);
  assert.match(query.sql, /WHEN.*IN \('', '@'\) THEN ''/);
  assert.match(query.sql, /RIGHT.* = '\.'/);
  assert.match(query.sql, /LIKE \$\d+ ESCAPE '!'/);
  assert.doesNotMatch(query.sql, /BINARY/);
  assert.doesNotMatch(query.sql, /BLOG|DEV|_%!dev/);
});

test('PostgreSQL record normalization trims the same whitespace set as JavaScript', () => {
  for (const pattern of ['\tBLOG.\n', '\u00a0@\u3000', '\ufeff*.DEV.\u2029']) {
    const query = dialect.sqlToQuery(buildRecordAccessCondition('user', [
      { domainId: 'assigned', subdomainPattern: pattern },
    ])!);
    assert.match(query.sql, /LOWER\(BTRIM\("dns_records"\."name", \$\d+\)\)/);
    const trimSets = query.params.filter((value): value is string => typeof value === 'string' && value.length > 1 && value.trim() === '');
    assert.ok(trimSets.length > 0);
    for (const characters of trimSets) {
      assert.deepEqual([...characters].sort(), [...whitespace].sort());
    }
  }
});

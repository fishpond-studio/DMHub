import { and, eq, or, sql } from 'drizzle-orm';
import { dnsRecords, isMysqlLike } from '../db/schema.js';
import { normalizeSubdomainName } from './subdomain-match.js';

type RecordAssignment = { domainId: string; subdomainPattern: string };

// Match String.trim(), including line terminators and Unicode whitespace.
// SQL TRIM() defaults to ordinary spaces, and database regex \s sets differ.
const SUBDOMAIN_WHITESPACE = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
const SUBDOMAIN_TRIM_PATTERN = `\\A[${SUBDOMAIN_WHITESPACE}]+|[${SUBDOMAIN_WHITESPACE}]+\\z`;

/** Apply record permissions before database aggregation, without loading every record. */
export function buildRecordAccessCondition(role: string, assignments: RecordAssignment[]) {
  if (role === 'admin') return undefined;
  if (assignments.length === 0) return sql`false`;

  // Absolute regex anchors keep MySQL/MariaDB server multiline flags from
  // stripping whitespace inside a stored record name.
  const trimmedName = isMysqlLike
    ? sql`LOWER(REGEXP_REPLACE(${dnsRecords.name}, ${SUBDOMAIN_TRIM_PATTERN}, ''))`
    : sql`LOWER(BTRIM(${dnsRecords.name}, ${SUBDOMAIN_WHITESPACE}))`;
  const normalizedName = sql`CASE
    WHEN ${trimmedName} IN ('', '@') THEN ''
    WHEN RIGHT(${trimmedName}, 1) = '.' THEN LEFT(${trimmedName}, CHAR_LENGTH(${trimmedName}) - 1)
    ELSE ${trimmedName} END`;
  // MySQL's default accent-insensitive collation must not broaden an assignment.
  const comparableName = isMysqlLike ? sql`BINARY (${normalizedName})` : normalizedName;

  return or(...assignments.map(({ domainId, subdomainPattern }) => {
    const pattern = normalizeSubdomainName(subdomainPattern);
    const domainCondition = eq(dnsRecords.domainId, domainId);
    if (pattern === '*') return domainCondition;
    if (pattern.startsWith('*.')) {
      if (pattern.length === 2) return and(domainCondition, sql`${comparableName} <> ''`);
      const suffix = pattern.slice(2).replace(/[!%_]/g, '!$&');
      return and(domainCondition, sql`${comparableName} LIKE ${`%.${suffix}`} ESCAPE '!'`);
    }
    return and(domainCondition, sql`${comparableName} = ${pattern}`);
  }));
}

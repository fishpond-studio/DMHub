import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domainAssignments, operationLogs } from '../db/schema.js';

type LogAssignment = { domainId: string; subdomainPattern: string };

export async function getLogAccessCondition(userId: string, role: string) {
  if (role === 'admin') return undefined;
  const assignments = await getDb().select({
    domainId: domainAssignments.domainId,
    subdomainPattern: domainAssignments.subdomainPattern,
  }).from(domainAssignments).where(eq(domainAssignments.userId, userId));
  return buildLogAccessCondition(userId, role, assignments);
}

export function buildLogAccessCondition(userId: string, role: string, assignments: LogAssignment[]) {
  if (role === 'admin') return undefined;
  const domainIds = [...new Set(assignments.map((row: { domainId: string }) => row.domainId))] as string[];
  if (!domainIds.length) return sql`false`;
  const fullDomainIds = assignments
    .filter((row: { subdomainPattern: string }) => row.subdomainPattern.trim() === '*')
    .map((row: { domainId: string }) => row.domainId) as string[];
  // Historical update and bulk logs do not always contain record names. Only
  // full-domain assignees can safely inspect another user's operation details.
  return and(
    inArray(operationLogs.domainId, domainIds),
    fullDomainIds.length
      ? or(inArray(operationLogs.domainId, fullDomainIds), eq(operationLogs.userId, userId))
      : eq(operationLogs.userId, userId),
  );
}

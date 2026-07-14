import { eq, sql, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { operationLogs, users, domainAssignments } from '../db/schema.js';

export interface LogQueryFilters {
  action?: string;
  userId?: string;
  domainId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface LogWithUser {
  id: string;
  userId: string;
  domainId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  username: string | null;
}

export async function queryLogs(
  currentUserId: string,
  role: string,
  filters: LogQueryFilters,
): Promise<{ logs: LogWithUser[]; total: number }> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (role !== 'admin') {
    const assignedDomainIds = await db
      .select({ domainId: domainAssignments.domainId })
      .from(domainAssignments)
      .where(eq(domainAssignments.userId, currentUserId));
    const allowedIds = assignedDomainIds.map((a: { domainId: string }) => a.domainId);

    if (allowedIds.length === 0) {
      return { logs: [], total: 0 };
    }

    conditions.push(
      sql`${operationLogs.domainId} IN (${sql.join(allowedIds.map((id: string) => sql`${id}`), sql`,`)})`,
    );
  }

  if (filters.action) {
    conditions.push(eq(operationLogs.action, filters.action));
  }
  if (filters.userId) {
    conditions.push(eq(operationLogs.userId, filters.userId));
  }
  if (filters.domainId) {
    conditions.push(eq(operationLogs.domainId, filters.domainId));
  }
  if (filters.startDate) {
    conditions.push(sql`${operationLogs.createdAt} >= CAST(${filters.startDate} AS TIMESTAMP)`);
  }
  if (filters.endDate) {
    conditions.push(sql`${operationLogs.createdAt} <= CAST(${filters.endDate} AS TIMESTAMP)`);
  }

  const whereClause =
    conditions.length > 0
      ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
      : undefined;

  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(operationLogs)
    .where(whereClause);

  const total = Number(countResult[0]?.count ?? 0);

  const rows = await db
    .select({
      id: operationLogs.id,
      userId: operationLogs.userId,
      domainId: operationLogs.domainId,
      action: operationLogs.action,
      targetType: operationLogs.targetType,
      targetId: operationLogs.targetId,
      detail: operationLogs.detail,
      ipAddress: operationLogs.ipAddress,
      userAgent: operationLogs.userAgent,
      createdAt: operationLogs.createdAt,
      username: users.username,
    })
    .from(operationLogs)
    .leftJoin(users, eq(operationLogs.userId, users.id))
    .where(whereClause)
    .orderBy(desc(operationLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { logs: rows as LogWithUser[], total };
}

import { eq, sql, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getLogAccessCondition } from '../lib/log-access.js';
import { operationLogs, users } from '../db/schema.js';

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

async function queryLogPage(
  currentUserId: string,
  role: string,
  filters: LogQueryFilters,
  maxPageSize = 200,
): Promise<{ logs: LogWithUser[]; total: number }> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];

  const accessCondition = await getLogAccessCondition(currentUserId, role);
  if (accessCondition) conditions.push(accessCondition);

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

export async function queryLogs(currentUserId: string, role: string, filters: LogQueryFilters) {
  return queryLogPage(currentUserId, role, filters);
}

/** 导出操作日志（CSV 文本），最多 5000 条 */
export async function exportLogsCsv(
  currentUserId: string,
  role: string,
  filters: Omit<LogQueryFilters, 'page' | 'pageSize'>,
): Promise<string> {
  const result = await queryLogPage(currentUserId, role, {
    ...filters,
    page: 1,
    pageSize: 5000,
  }, 5000);

  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = ['时间', '用户', '操作', '目标类型', '目标ID', '详情', 'IP', 'UA'].join(',');
  const lines = result.logs.map((log) =>
    [
      escape(log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt),
      escape(log.username || log.userId),
      escape(log.action),
      escape(log.targetType),
      escape(log.targetId),
      escape(log.detail ? JSON.stringify(log.detail) : ''),
      escape(log.ipAddress || ''),
      escape(log.userAgent || ''),
    ].join(','),
  );

  return [header, ...lines].join('\n');
}

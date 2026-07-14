import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, sql, desc, count, and, gte, lte, isNotNull, ne } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domains, dnsRecords, users, domainAssignments, operationLogs } from '../db/schema.js';
import { authenticate } from '../middleware/auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/stats', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const db = getDb();
    const userId = request.user!.userId;
    const role = request.user!.role;
    const isAdmin = role === 'admin';

    let domainIds: string[] | null = null;
    if (!isAdmin) {
      const assigned = await db
        .select({ domainId: domainAssignments.domainId })
        .from(domainAssignments)
        .where(eq(domainAssignments.userId, userId));
      domainIds = assigned.map((a: { domainId: string }) => a.domainId);
      if (domainIds!.length === 0) {
        return {
          totalDomains: 0,
          activeDomains: 0,
          expiringDomains: 0,
          expiredDomains: 0,
          totalRecords: 0,
          totalMembers: 0,
          recentChanges: 0,
          recordsByType: {},
        };
      }
    }

    const domainFilter = domainIds
      ? sql`${domains.id} IN (${sql.join(domainIds!.map((id: string) => sql`${id}`), sql`,`)})`
      : undefined;

    const [totalDomainsRow] = await db
      .select({ count: count() })
      .from(domains)
      .where(domainFilter);

    const [activeRow] = await db
      .select({ count: count() })
      .from(domains)
      .where(domainFilter
        ? sql`${domainFilter} AND ${domains.status} = 'active'`
        : eq(domains.status, 'active')
      );

    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringConditions = [
      isNotNull(domains.expiresAt),
      gte(domains.expiresAt, now),
      lte(domains.expiresAt, thirtyDaysLater),
      ne(domains.status, 'expired'),
    ];
    if (domainFilter) {
      expiringConditions.push(sql`${domainFilter}`);
    }
    const [expiringRow] = await db
      .select({ count: count() })
      .from(domains)
      .where(and(...expiringConditions));

    const [expiredRow] = await db
      .select({ count: count() })
      .from(domains)
      .where(domainFilter
        ? sql`${domainFilter} AND ${domains.status} = 'expired'`
        : eq(domains.status, 'expired')
      );

    const recordFilter = domainIds
      ? sql`${dnsRecords.domainId} IN (${sql.join(domainIds!.map((id: string) => sql`${id}`), sql`,`)})`
      : undefined;
    const [totalRecordsRow] = await db
      .select({ count: count() })
      .from(dnsRecords)
      .where(recordFilter);

    const [totalMembersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.status, 'active'));

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const logConditions = [gte(operationLogs.createdAt, sevenDaysAgo)];
    if (domainIds) {
      logConditions.push(sql`${operationLogs.domainId} IN (${sql.join(domainIds.map((id) => sql`${id}`), sql`,`)})`);
    }
    const [recentChangesRow] = await db
      .select({ count: count() })
      .from(operationLogs)
      .where(and(...logConditions));

    const typeWhereClause = domainIds
      ? sql` WHERE ${dnsRecords.domainId} IN (${sql.join(domainIds.map((id) => sql`${id}`), sql`,`)})`
      : sql``;
    const typeRows = await db.execute(
      sql`SELECT ${dnsRecords.recordType} as record_type, COUNT(*) as count FROM ${dnsRecords}${typeWhereClause} GROUP BY ${dnsRecords.recordType} ORDER BY count DESC`,
    );
    const recordsByType: Record<string, number> = {};
    const typeArray = Array.isArray(typeRows) ? typeRows : (typeRows as { rows: Array<{ record_type: string; count: string }> }).rows ?? [];
    for (const row of typeArray) {
      recordsByType[(row as { record_type: string; count: string }).record_type] = Number((row as { record_type: string; count: string }).count);
    }

    return {
      totalDomains: Number(totalDomainsRow.count),
      activeDomains: Number(activeRow.count),
      expiringDomains: Number(expiringRow.count),
      expiredDomains: Number(expiredRow.count),
      totalRecords: Number(totalRecordsRow.count),
      totalMembers: Number(totalMembersRow.count),
      recentChanges: Number(recentChangesRow.count),
      recordsByType,
    };
  });

  app.get('/expiring', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const db = getDb();
    const userId = request.user!.userId;
    const role = request.user!.role;

    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let domainIds: string[] | null = null;
    if (role !== 'admin') {
      const assigned = await db
        .select({ domainId: domainAssignments.domainId })
        .from(domainAssignments)
        .where(eq(domainAssignments.userId, userId));
      domainIds = assigned.map((a: { domainId: string }) => a.domainId);
    }

    const conditions = [
      isNotNull(domains.expiresAt),
      gte(domains.expiresAt, now),
      lte(domains.expiresAt, thirtyDaysLater),
      ne(domains.status, 'expired'),
    ];

    if (domainIds) {
      conditions.push(sql`${domains.id} IN (${sql.join(domainIds.map((id) => sql`${id}`), sql`,`)})`);
    }

    const rows = await db
      .select({
        id: domains.id,
        name: domains.name,
        expiresAt: domains.expiresAt,
        status: domains.status,
      })
      .from(domains)
      .where(and(...conditions))
      .orderBy(domains.expiresAt);

    return rows.map((r: { name: string; id: string; expiresAt: Date | null; status: string }) => ({
      domain: r.name,
      domainId: r.id,
      expiresAt: r.expiresAt,
      daysRemaining: Math.ceil((new Date(r.expiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      status: r.status,
    }));
  });

  app.get('/activity', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const db = getDb();
    const userId = request.user!.userId;
    const role = request.user!.role;

    let domainIds: string[] | null = null;
    if (role !== 'admin') {
      const assigned = await db
        .select({ domainId: domainAssignments.domainId })
        .from(domainAssignments)
        .where(eq(domainAssignments.userId, userId));
      domainIds = assigned.map((a: { domainId: string }) => a.domainId);
    }

    const conditions: any[] = [];
    if (domainIds) {
      conditions.push(sql`${operationLogs.domainId} IN (${sql.join(domainIds.map((id) => sql`${id}`), sql`,`)})`);
      conditions.push(isNotNull(operationLogs.domainId));
    }

    const whereClause = conditions.length > 0
      ? and(...conditions)
      : undefined;

    const rows = await db
      .select({
        id: operationLogs.id,
        action: operationLogs.action,
        targetType: operationLogs.targetType,
        targetId: operationLogs.targetId,
        detail: operationLogs.detail,
        userId: operationLogs.userId,
        createdAt: operationLogs.createdAt,
        username: users.username,
        displayName: users.displayName,
      })
      .from(operationLogs)
      .leftJoin(users, eq(operationLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(operationLogs.createdAt))
      .limit(20);

    return rows.map((r: { action: string; detail: Record<string, unknown> | null; targetId: string; displayName: string | null; username: string; createdAt: Date }) => ({
      action: r.action,
      targetName: (r.detail as Record<string, unknown>)?.name as string || r.targetId,
      userName: r.displayName || r.username || '未知用户',
      createdAt: r.createdAt,
    }));
  });

  app.get('/records-distribution', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const db = getDb();
    const userId = request.user!.userId;
    const role = request.user!.role;

    let domainIds: string[] | null = null;
    if (role !== 'admin') {
      const assigned = await db
        .select({ domainId: domainAssignments.domainId })
        .from(domainAssignments)
        .where(eq(domainAssignments.userId, userId));
      domainIds = assigned.map((a: { domainId: string }) => a.domainId);
      if (domainIds!.length === 0) {
        return { labels: [], data: [] };
      }
    }

    const typeWhereClause = domainIds
      ? sql` WHERE ${dnsRecords.domainId} IN (${sql.join(domainIds.map((id) => sql`${id}`), sql`,`)})`
      : sql``;
    const typeRows = await db.execute(
      sql`SELECT ${dnsRecords.recordType} as record_type, COUNT(*) as count FROM ${dnsRecords}${typeWhereClause} GROUP BY ${dnsRecords.recordType} ORDER BY count DESC`,
    );

    const labels: string[] = [];
    const data: number[] = [];
    const typeArray = Array.isArray(typeRows) ? typeRows : (typeRows as { rows: Array<{ record_type: string; count: string }> }).rows ?? [];
    for (const row of typeArray) {
      labels.push((row as { record_type: string; count: string }).record_type);
      data.push(Number((row as { record_type: string; count: string }).count));
    }

    return { labels, data };
  });
}

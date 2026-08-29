import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  domainAssignments,
  domainAssignmentRequests,
  domains,
  users,
  operationLogs,
} from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { notifyUser, notifyAdmins } from './notification.js';

function isWildcard(pattern: string): boolean {
  return pattern.includes('*');
}

function formatScopeHost(domainName: string, pattern: string): string {
  const pat = (pattern ?? '').trim().toLowerCase();
  if (!pat || pat === '@') return domainName;
  if (pat === '*') return `*.${domainName}`;
  if (pat.startsWith('*.')) return `${pat}.${domainName}`;
  return `${pat}.${domainName}`;
}

function permissionText(permission: string): string {
  return permission === 'dns_edit' ? '可编辑' : '只读';
}

export async function createAssignment(
  adminUserId: string,
  targetUserId: string,
  input: { domainId: string; subdomainPattern?: string; permission?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [target] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    throw new Error('目标用户不存在');
  }

  const [domain] = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.id, input.domainId))
    .limit(1);

  if (!domain) {
    throw new Error('域名不存在');
  }

  const subdomainPattern = input.subdomainPattern ?? '*';
  const permission = input.permission ?? 'dns_edit';

  const [existing] = await db
    .select({ id: domainAssignments.id })
    .from(domainAssignments)
    .where(
      and(
        eq(domainAssignments.userId, targetUserId),
        eq(domainAssignments.domainId, input.domainId),
        eq(domainAssignments.subdomainPattern, subdomainPattern),
      ),
    )
    .limit(1);

  if (existing) {
    throw new Error('该用户已存在相同的域名分配');
  }

  const assignment = await insertReturningOne(
    domainAssignments,
    {
      domainId: input.domainId,
      userId: targetUserId,
      subdomainPattern,
      permission,
      assignedBy: adminUserId,
    },
    {
      id: domainAssignments.id,
      domainId: domainAssignments.domainId,
      userId: domainAssignments.userId,
      subdomainPattern: domainAssignments.subdomainPattern,
      permission: domainAssignments.permission,
      assignedBy: domainAssignments.assignedBy,
      createdAt: domainAssignments.createdAt,
    },
  );

  await db.insert(operationLogs).values({
    userId: adminUserId,
    domainId: input.domainId,
    action: 'assignment.create',
    targetType: 'domain_assignment',
    targetId: assignment.id,
    detail: {
      targetUserId,
      targetUsername: target.username,
      domainId: input.domainId,
      domainName: domain.name,
      subdomainPattern,
      permission,
    },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  const host = formatScopeHost(domain.name, subdomainPattern);
  const perm = permissionText(permission);
  await notifyUser(targetUserId, 'assignment.create', {
    title: '你获得了新的域名权限',
    content: `管理员已为你分配 ${host}（所属域名 ${domain.name}），权限：${perm}。可在「我的域名」中查看。`,
    level: 'info',
    metadata: {
      type: 'assignment',
      action: 'create',
      domainId: domain.id,
      domainName: domain.name,
      subdomainPattern,
      permission,
      assignmentId: assignment.id,
      host,
    },
  });

  const result: Record<string, unknown> = { assignment };
  if (isWildcard(subdomainPattern)) {
    result.warning = '通配符子域名模式将授予该域名下所有子域名的访问权限。';
  }

  return result;
}

export async function deleteAssignment(
  adminUserId: string,
  assignmentId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [assignment] = await db
    .select({
      id: domainAssignments.id,
      domainId: domainAssignments.domainId,
      userId: domainAssignments.userId,
      subdomainPattern: domainAssignments.subdomainPattern,
      permission: domainAssignments.permission,
    })
    .from(domainAssignments)
    .where(eq(domainAssignments.id, assignmentId))
    .limit(1);

  if (!assignment) {
    throw new Error('分配记录不存在');
  }

  const [domain] = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.id, assignment.domainId))
    .limit(1);

  await db
    .delete(domainAssignments)
    .where(eq(domainAssignments.id, assignmentId));

  await db.insert(operationLogs).values({
    userId: adminUserId,
    domainId: assignment.domainId,
    action: 'assignment.delete',
    targetType: 'domain_assignment',
    targetId: assignmentId,
    detail: {
      targetUserId: assignment.userId,
      domainId: assignment.domainId,
      subdomainPattern: assignment.subdomainPattern,
      permission: assignment.permission,
    },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  const domainName = domain?.name || assignment.domainId;
  const host = formatScopeHost(domainName, assignment.subdomainPattern);
  await notifyUser(assignment.userId, 'assignment.delete', {
    title: '域名权限已移除',
    content: `管理员已移除你对 ${host}（所属域名 ${domainName}）的管理权限。`,
    level: 'warning',
    metadata: {
      type: 'assignment',
      action: 'delete',
      domainId: assignment.domainId,
      domainName,
      subdomainPattern: assignment.subdomainPattern,
      permission: assignment.permission,
      host,
    },
  });

  return { success: true };
}

export async function createAssignmentRequest(
  userId: string,
  input: { domainId: string; subdomainPattern?: string; permission?: string; reason: string },
) {
  const db = getDb();

  const [domain] = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.id, input.domainId))
    .limit(1);

  if (!domain) {
    throw new Error('域名不存在');
  }

  const subdomainPattern = input.subdomainPattern ?? '*';
  const permission = input.permission ?? 'dns_edit';

  const [existingPending] = await db
    .select({ id: domainAssignmentRequests.id })
    .from(domainAssignmentRequests)
    .where(
      and(
        eq(domainAssignmentRequests.userId, userId),
        eq(domainAssignmentRequests.domainId, input.domainId),
        eq(domainAssignmentRequests.subdomainPattern, subdomainPattern),
        eq(domainAssignmentRequests.status, 'pending'),
      ),
    )
    .limit(1);

  if (existingPending) {
    throw new Error('已存在相同的待审核申请');
  }

  const request = await insertReturningOne(
    domainAssignmentRequests,
    {
      domainId: input.domainId,
      userId,
      subdomainPattern,
      permission,
      reason: input.reason,
      status: 'pending',
    },
    {
      id: domainAssignmentRequests.id,
      domainId: domainAssignmentRequests.domainId,
      userId: domainAssignmentRequests.userId,
      subdomainPattern: domainAssignmentRequests.subdomainPattern,
      permission: domainAssignmentRequests.permission,
      reason: domainAssignmentRequests.reason,
      status: domainAssignmentRequests.status,
      reviewedBy: domainAssignmentRequests.reviewedBy,
      reviewComment: domainAssignmentRequests.reviewComment,
      createdAt: domainAssignmentRequests.createdAt,
      reviewedAt: domainAssignmentRequests.reviewedAt,
    },
  );

  const [requester] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const who = requester?.displayName || requester?.username || '成员';
  const host = formatScopeHost(domain.name, subdomainPattern);

  await notifyAdmins('assignment.request', {
    title: '新的域名权限申请',
    content: `${who} 申请管理 ${host}（${permissionText(permission)}）：${input.reason || '无备注'}`,
    level: 'info',
    metadata: {
      type: 'assignment_request',
      action: 'create',
      requestId: request.id,
      domainId: domain.id,
      domainName: domain.name,
      subdomainPattern,
      permission,
      userId,
      host,
    },
  });

  return { request };
}

export async function reviewAssignmentRequest(
  adminUserId: string,
  requestId: string,
  input: { action: 'approve' | 'reject'; reviewComment?: string; confirmed?: boolean },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [request] = await db
    .select()
    .from(domainAssignmentRequests)
    .where(eq(domainAssignmentRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error('申请记录不存在');
  }

  if (request.status !== 'pending') {
    throw new Error('该申请已被处理');
  }

  if (input.action === 'approve') {
    if (isWildcard(request.subdomainPattern) && !input.confirmed) {
      return {
        requiresConfirmation: true,
        warning: '通配符子域名模式将授予该域名下所有子域名的访问权限，请确认此操作。',
      };
    }

    const [existingAssignment] = await db
      .select({ id: domainAssignments.id })
      .from(domainAssignments)
      .where(and(
        eq(domainAssignments.domainId, request.domainId),
        eq(domainAssignments.userId, request.userId),
        eq(domainAssignments.subdomainPattern, request.subdomainPattern),
      ))
      .limit(1);

    if (existingAssignment) {
      throw new Error('该用户已有相同域名和子域名模式的指派');
    }

    const assignment = await insertReturningOne(
      domainAssignments,
      {
        domainId: request.domainId,
        userId: request.userId,
        subdomainPattern: request.subdomainPattern,
        permission: request.permission,
        assignedBy: adminUserId,
      },
      {
        id: domainAssignments.id,
        domainId: domainAssignments.domainId,
        userId: domainAssignments.userId,
        subdomainPattern: domainAssignments.subdomainPattern,
        permission: domainAssignments.permission,
        assignedBy: domainAssignments.assignedBy,
        createdAt: domainAssignments.createdAt,
      },
    );

    await db
      .update(domainAssignmentRequests)
      .set({
        status: 'approved',
        reviewedBy: adminUserId,
        reviewComment: input.reviewComment ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(domainAssignmentRequests.id, requestId));

    await db.insert(operationLogs).values({
      userId: adminUserId,
      domainId: request.domainId,
      action: 'assignment.approve',
      targetType: 'domain_assignment_request',
      targetId: requestId,
      detail: {
        targetUserId: request.userId,
        domainId: request.domainId,
        subdomainPattern: request.subdomainPattern,
        permission: request.permission,
      },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    const [domainRow] = await db
      .select({ name: domains.name })
      .from(domains)
      .where(eq(domains.id, request.domainId))
      .limit(1);
    const domainName = domainRow?.name || request.domainId;
    const host = formatScopeHost(domainName, request.subdomainPattern);
    await notifyUser(request.userId, 'assignment.approve', {
      title: '域名权限申请已通过',
      content: `你申请的 ${host}（所属域名 ${domainName}）已获批，权限：${permissionText(request.permission)}。${input.reviewComment ? `备注：${input.reviewComment}` : ''}`,
      level: 'info',
      metadata: {
        type: 'assignment',
        action: 'approve',
        domainId: request.domainId,
        domainName,
        subdomainPattern: request.subdomainPattern,
        permission: request.permission,
        assignmentId: assignment.id,
        host,
      },
    });

    return { assignment, request: { ...request, status: 'approved', reviewedBy: adminUserId, reviewComment: input.reviewComment ?? null } };
  }

  if (input.action === 'reject') {
    await db
      .update(domainAssignmentRequests)
      .set({
        status: 'rejected',
        reviewedBy: adminUserId,
        reviewComment: input.reviewComment ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(domainAssignmentRequests.id, requestId));

    await db.insert(operationLogs).values({
      userId: adminUserId,
      domainId: request.domainId,
      action: 'assignment.reject',
      targetType: 'domain_assignment_request',
      targetId: requestId,
      detail: {
        targetUserId: request.userId,
        domainId: request.domainId,
        reason: input.reviewComment,
      },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    const [domainRow] = await db
      .select({ name: domains.name })
      .from(domains)
      .where(eq(domains.id, request.domainId))
      .limit(1);
    const domainName = domainRow?.name || request.domainId;
    const host = formatScopeHost(domainName, request.subdomainPattern);
    await notifyUser(request.userId, 'assignment.reject', {
      title: '域名权限申请未通过',
      content: `你申请的 ${host}（所属域名 ${domainName}）未获批准。${input.reviewComment ? `原因：${input.reviewComment}` : ''}`,
      level: 'warning',
      metadata: {
        type: 'assignment_request',
        action: 'reject',
        domainId: request.domainId,
        domainName,
        subdomainPattern: request.subdomainPattern,
        host,
      },
    });

    return { request: { ...request, status: 'rejected', reviewedBy: adminUserId, reviewComment: input.reviewComment ?? null } };
  }

  throw new Error('无效的操作');
}

export async function getMyDomains(userId: string, role: string) {
  const db = getDb();

  if (role === 'admin') {
    const allDomains = await db
      .select({
        id: domains.id,
        name: domains.name,
        status: domains.status,
        groupName: domains.groupName,
        createdAt: domains.createdAt,
      })
      .from(domains);
    return {
      domains: allDomains.map((d: Record<string, unknown>) => ({
        ...d,
        permission: 'dns_edit' as const,
        assignmentId: null,
        subdomainPattern: '*',
        assignments: [{ id: null, subdomainPattern: '*', permission: 'dns_edit' as const }],
      })),
    };
  }

  const rows = await db
    .select({
      domainId: domainAssignments.domainId,
      assignmentId: domainAssignments.id,
      subdomainPattern: domainAssignments.subdomainPattern,
      permission: domainAssignments.permission,
      domainName: domains.name,
      domainStatus: domains.status,
      domainGroupName: domains.groupName,
      domainCreatedAt: domains.createdAt,
    })
    .from(domainAssignments)
    .innerJoin(domains, eq(domainAssignments.domainId, domains.id))
    .where(eq(domainAssignments.userId, userId));

  // 同一域名可能有多条指派（不同子域名模式），按域名聚合，避免前端只看到总域名
  type Row = {
    domainId: string;
    domainName: string;
    domainStatus: string;
    domainGroupName: string | null;
    domainCreatedAt: Date;
    permission: string;
    assignmentId: string;
    subdomainPattern: string;
  };

  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      status: string;
      groupName: string | null;
      createdAt: Date;
      assignments: Array<{ id: string; subdomainPattern: string; permission: string }>;
    }
  >();

  for (const r of rows as Row[]) {
    let entry = grouped.get(r.domainId);
    if (!entry) {
      entry = {
        id: r.domainId,
        name: r.domainName,
        status: r.domainStatus,
        groupName: r.domainGroupName,
        createdAt: r.domainCreatedAt,
        assignments: [],
      };
      grouped.set(r.domainId, entry);
    }
    entry.assignments.push({
      id: r.assignmentId,
      subdomainPattern: r.subdomainPattern,
      permission: r.permission,
    });
  }

  return {
    domains: Array.from(grouped.values()).map((d) => {
      const hasEdit = d.assignments.some((a) => a.permission === 'dns_edit');
      // 兼容旧字段：取第一条 + 合并后的最高权限
      const primary = d.assignments[0];
      return {
        id: d.id,
        name: d.name,
        status: d.status,
        groupName: d.groupName,
        createdAt: d.createdAt,
        permission: hasEdit ? ('dns_edit' as const) : ('dns_readonly' as const),
        assignmentId: primary?.id ?? null,
        subdomainPattern: primary?.subdomainPattern ?? '*',
        assignments: d.assignments,
      };
    }),
  };
}

export async function getMemberAssignments(memberId: string) {
  const db = getDb();

  const rows = await db
    .select({
      id: domainAssignments.id,
      domainId: domainAssignments.domainId,
      userId: domainAssignments.userId,
      subdomainPattern: domainAssignments.subdomainPattern,
      permission: domainAssignments.permission,
      assignedBy: domainAssignments.assignedBy,
      createdAt: domainAssignments.createdAt,
      domainName: domains.name,
    })
    .from(domainAssignments)
    .innerJoin(domains, eq(domainAssignments.domainId, domains.id))
    .where(eq(domainAssignments.userId, memberId));

  return { assignments: rows };
}

/**
 * 管理员：全部指派概览 + 子域名范围内 DNS 状态
 */
export async function getAssignmentsOverview() {
  const db = getDb();
  const { dnsRecords } = await import('../db/schema.js');
  const { matchesSubdomainPattern } = await import('../lib/subdomain-match.js');

  const rows = await db
    .select({
      id: domainAssignments.id,
      domainId: domainAssignments.domainId,
      userId: domainAssignments.userId,
      subdomainPattern: domainAssignments.subdomainPattern,
      permission: domainAssignments.permission,
      assignedBy: domainAssignments.assignedBy,
      createdAt: domainAssignments.createdAt,
      domainName: domains.name,
      domainStatus: domains.status,
      username: users.username,
      displayName: users.displayName,
      userStatus: users.status,
    })
    .from(domainAssignments)
    .innerJoin(domains, eq(domainAssignments.domainId, domains.id))
    .innerJoin(users, eq(domainAssignments.userId, users.id))
    .orderBy(domains.name);

  // 按域名批量拉记录，避免 N+1
  const domainIds = [...new Set(rows.map((r: { domainId: string }) => r.domainId))];
  const recordsByDomain = new Map<
    string,
    Array<{
      id: string;
      recordType: string;
      name: string;
      value: string;
      ttl: number;
      proxied: boolean;
      status: string;
      updatedAt: Date;
    }>
  >();

  if (domainIds.length > 0) {
    const allRecords = await db
      .select({
        id: dnsRecords.id,
        domainId: dnsRecords.domainId,
        recordType: dnsRecords.recordType,
        name: dnsRecords.name,
        value: dnsRecords.value,
        ttl: dnsRecords.ttl,
        proxied: dnsRecords.proxied,
        status: dnsRecords.status,
        updatedAt: dnsRecords.updatedAt,
      })
      .from(dnsRecords);

    for (const rec of allRecords) {
      if (!domainIds.includes(rec.domainId)) continue;
      const list = recordsByDomain.get(rec.domainId) || [];
      list.push(rec);
      recordsByDomain.set(rec.domainId, list);
    }
  }

  const assignments = rows.map((r: {
    id: string;
    domainId: string;
    userId: string;
    subdomainPattern: string;
    permission: string;
    assignedBy: string;
    createdAt: Date;
    domainName: string;
    domainStatus: string;
    username: string;
    displayName: string | null;
    userStatus: string;
  }) => {
    const domainRecords = recordsByDomain.get(r.domainId) || [];
    const matched = domainRecords.filter((rec) =>
      matchesSubdomainPattern(rec.name, r.subdomainPattern),
    );
    const typeCounts: Record<string, number> = {};
    let proxiedCount = 0;
    let lastUpdated: Date | null = null;
    for (const rec of matched) {
      typeCounts[rec.recordType] = (typeCounts[rec.recordType] || 0) + 1;
      if (rec.proxied) proxiedCount++;
      if (!lastUpdated || new Date(rec.updatedAt) > lastUpdated) {
        lastUpdated = new Date(rec.updatedAt);
      }
    }

    const host = formatScopeHost(r.domainName, r.subdomainPattern);
    // 状态：empty / active / stale(成员停用) / domain_expired
    let scopeStatus: 'empty' | 'active' | 'member_disabled' | 'domain_issue' = 'active';
    if (r.userStatus !== 'active') scopeStatus = 'member_disabled';
    else if (r.domainStatus === 'expired' || r.domainStatus === 'pending') scopeStatus = 'domain_issue';
    else if (matched.length === 0) scopeStatus = 'empty';

    return {
      id: r.id,
      domainId: r.domainId,
      domainName: r.domainName,
      domainStatus: r.domainStatus,
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      userStatus: r.userStatus,
      subdomainPattern: r.subdomainPattern,
      host,
      permission: r.permission,
      assignedBy: r.assignedBy,
      createdAt: r.createdAt,
      scopeStatus,
      recordCount: matched.length,
      proxiedCount,
      typeCounts,
      lastRecordUpdatedAt: lastUpdated,
      records: matched.slice(0, 50).map((rec) => ({
        id: rec.id,
        recordType: rec.recordType,
        name: rec.name,
        value: rec.value,
        ttl: rec.ttl,
        proxied: rec.proxied,
        status: rec.status,
        updatedAt: rec.updatedAt,
      })),
    };
  });

  const summary = {
    total: assignments.length,
    active: assignments.filter((a: any) => a.scopeStatus === 'active').length,
    empty: assignments.filter((a: any) => a.scopeStatus === 'empty').length,
    memberDisabled: assignments.filter((a: any) => a.scopeStatus === 'member_disabled').length,
    domainIssue: assignments.filter((a: any) => a.scopeStatus === 'domain_issue').length,
    totalRecords: assignments.reduce((s: number, a: any) => s + a.recordCount, 0),
  };

  return { summary, assignments };
}

export async function getPendingRequests() {
  const db = getDb();

  const rows = await db
    .select({
      id: domainAssignmentRequests.id,
      domainId: domainAssignmentRequests.domainId,
      userId: domainAssignmentRequests.userId,
      subdomainPattern: domainAssignmentRequests.subdomainPattern,
      permission: domainAssignmentRequests.permission,
      reason: domainAssignmentRequests.reason,
      status: domainAssignmentRequests.status,
      reviewedBy: domainAssignmentRequests.reviewedBy,
      reviewComment: domainAssignmentRequests.reviewComment,
      createdAt: domainAssignmentRequests.createdAt,
      reviewedAt: domainAssignmentRequests.reviewedAt,
      domainName: domains.name,
      username: users.username,
      displayName: users.displayName,
    })
    .from(domainAssignmentRequests)
    .innerJoin(domains, eq(domainAssignmentRequests.domainId, domains.id))
    .innerJoin(users, eq(domainAssignmentRequests.userId, users.id))
    .where(eq(domainAssignmentRequests.status, 'pending'));

  return { requests: rows };
}

export async function getMyRequests(userId: string) {
  const db = getDb();

  const rows = await db
    .select({
      id: domainAssignmentRequests.id,
      domainId: domainAssignmentRequests.domainId,
      subdomainPattern: domainAssignmentRequests.subdomainPattern,
      permission: domainAssignmentRequests.permission,
      reason: domainAssignmentRequests.reason,
      status: domainAssignmentRequests.status,
      reviewComment: domainAssignmentRequests.reviewComment,
      createdAt: domainAssignmentRequests.createdAt,
      reviewedAt: domainAssignmentRequests.reviewedAt,
      domainName: domains.name,
    })
    .from(domainAssignmentRequests)
    .innerJoin(domains, eq(domainAssignmentRequests.domainId, domains.id))
    .where(eq(domainAssignmentRequests.userId, userId));

  return { requests: rows };
}

export async function getAllDomains() {
  const db = getDb();
  const rows = await db
    .select({
      id: domains.id,
      name: domains.name,
      status: domains.status,
      groupName: domains.groupName,
    })
    .from(domains);
  return { domains: rows };
}

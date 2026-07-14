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

function isWildcard(pattern: string): boolean {
  return pattern.includes('*');
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
    return { domains: allDomains.map((d: Record<string, unknown>) => ({ ...d, permission: 'dns_edit' as const, assignmentId: null })) };
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

  return {
    domains: rows.map((r: { domainId: string; domainName: string; domainStatus: string; domainGroupName: string | null; domainCreatedAt: Date; permission: string; assignmentId: string }) => ({
      id: r.domainId,
      name: r.domainName,
      status: r.domainStatus,
      groupName: r.domainGroupName,
      createdAt: r.domainCreatedAt,
      permission: r.permission,
      assignmentId: r.assignmentId,
    })),
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

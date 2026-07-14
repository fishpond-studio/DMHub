import { getDb } from '../db/index.js';
import { operationLogs } from '../db/schema.js';

export interface LogOperationInput {
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown> | null;
  domainId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logOperation(input: LogOperationInput): Promise<void> {
  const db = getDb();
  await db.insert(operationLogs).values({
    userId: input.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    detail: input.detail ?? null,
    domainId: input.domainId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

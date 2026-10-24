/**
 * 刷新令牌轮换的数据库操作。
 *
 * 轮换不再删除旧令牌，而是把它标记为已消费（rotated_at）并记下后继令牌哈希，
 * 这样「查不到令牌」才能和「刚被并发请求消费」区分开：只有后者能证明自己
 * 是多标签页竞态，可以安全地让客户端重试。
 */
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { isMysqlLike } from '../db/schema.js';
import { refreshTokens } from '../db/schema.js';
import { REFRESH_TOKEN_ROTATED_RETENTION_MS } from './refresh-token.js';

type Executor = ReturnType<typeof getDb>;

/** 沿 replaced_by_hash 链撤销时最多走这么多代，防止脏数据造成死循环 */
const MAX_ROTATION_CHAIN = 64;

/**
 * 读取「条件更新」的结果，两种方言返回形状不同：
 * - MySQL/MariaDB：`[ResultSetHeader, FieldPacket[]]`，看 affectedRows
 * - PostgreSQL：`.returning()` 返回受影响行数组
 */
export function claimSucceeded(isMysqlLikeDialect: boolean, result: unknown): boolean {
  if (isMysqlLikeDialect) {
    if (!Array.isArray(result)) return false;
    const [header] = result as Array<{ affectedRows?: number }>;
    return (header?.affectedRows ?? 0) > 0;
  }
  return Array.isArray(result) && result.length > 0;
}

/**
 * 原子地把当前令牌标记为已轮换。
 *
 * `WHERE id = ? AND rotated_at IS NULL` 让两个并发请求里只有一个能把
 * rotated_at 从 NULL 改掉；另一个拿到 0 行，按竞态处理。
 * 这一步取代了此前「删除旧行 + 数删除行数」的方言分流，语义在两种方言下一致。
 */
export async function claimRefreshToken(
  executor: Executor,
  tokenId: string,
  replacedByHash: string,
  rotatedAt: Date,
): Promise<boolean> {
  const where = and(eq(refreshTokens.id, tokenId), isNull(refreshTokens.rotatedAt));

  if (isMysqlLike) {
    const result = await executor.update(refreshTokens)
      .set({ rotatedAt, replacedByHash })
      .where(where);
    return claimSucceeded(true, result);
  }

  const result = await executor.update(refreshTokens)
    .set({ rotatedAt, replacedByHash })
    .where(where)
    .returning({ id: refreshTokens.id });
  return claimSucceeded(false, result);
}

/**
 * 撤销一条轮换链上的所有令牌。
 *
 * 旧令牌在宽限期之后被重放，说明它可能已经泄露；继续保留同一条链上的
 * 后继令牌等于让攻击者维持登录态。这里沿 replaced_by_hash 把链上所有行删掉。
 */
export async function revokeRefreshTokenFamily(
  executor: Executor,
  token: { id: string; replacedByHash: string | null },
): Promise<void> {
  let nextHash = token.replacedByHash;

  for (let depth = 0; nextHash && depth < MAX_ROTATION_CHAIN; depth += 1) {
    const [successor] = await executor
      .select({ id: refreshTokens.id, replacedByHash: refreshTokens.replacedByHash })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, nextHash))
      .limit(1);

    if (!successor) break;

    await executor.delete(refreshTokens).where(eq(refreshTokens.id, successor.id));
    nextHash = successor.replacedByHash;
  }

  await executor.delete(refreshTokens).where(eq(refreshTokens.id, token.id));
}

/**
 * 清理过期令牌与过了保留期的已轮换令牌。
 *
 * 已轮换行需要留一段时间供重用检测沿链撤销；过期行没有任何用途。
 */
export async function cleanupRefreshTokens(now = new Date()): Promise<void> {
  const db = getDb();
  const rotatedBefore = new Date(now.getTime() - REFRESH_TOKEN_ROTATED_RETENTION_MS);

  await db.delete(refreshTokens).where(
    or(
      lt(refreshTokens.expiresAt, now),
      and(isNotNull(refreshTokens.rotatedAt), lt(refreshTokens.rotatedAt, rotatedBefore)),
    ),
  );
}

/**
 * 跨方言的 DB 帮手。
 *
 * 主要解决 PG 和 MySQL 的两个不兼容点：
 *   1. .returning() —— PG 原生支持；MySQL drizzle 不支持，要走 insert + select 二步
 *   2. .onConflictDoNothing() —— PG 用此；MySQL 用 .ignore() 或忽略 duplicate key 错误
 *
 * 业务代码统一调用这些 helper，内部根据 dbType 分流。
 */
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { isMysqlLike } from './schema.js';
import { getDb } from './index.js';

/**
 * 插入一行并返回插入后的字段。跨方言兼容。
 *
 * - PG: 直接走 .returning(selectCols)
 * - MySQL: insert（若未提供 id 则自动生成 UUID）+ select where id = <生成的id>
 *
 * @param table         目标表对象（schema 表）
 * @param values        要插入的字段值（如果想自定义 id 可在此传入 id）
 * @param selectCols    要返回的字段映射，形如 { id: table.id, name: table.name }
 * @returns             单行结果（字段按 selectCols 形态）
 */
export async function insertReturningOne<T extends Record<string, any>>(
  table: any,
  values: Record<string, unknown>,
  selectCols: Record<string, any>,
): Promise<T> {
  const db = getDb();
  if (isMysqlLike) {
    const id = (values.id as string | undefined) ?? randomUUID();
    const valuesWithId = { ...values, id };
    await db.insert(table).values(valuesWithId);
    const [row] = await db.select(selectCols).from(table).where(eq(table.id, id));
    return row as T;
  }
  const [row] = await db.insert(table).values(values).returning(selectCols);
  return row as T;
}

/**
 * 插入一行并仅返回整行所有字段（等价于 .returning()）。
 */
export async function insertReturningAll<T extends Record<string, any>>(
  table: any,
  values: Record<string, unknown>,
): Promise<T> {
  const db = getDb();
  if (isMysqlLike) {
    const id = (values.id as string | undefined) ?? randomUUID();
    const valuesWithId = { ...values, id };
    await db.insert(table).values(valuesWithId);
    const [row] = await db.select().from(table).where(eq(table.id, id));
    return row as T;
  }
  const [row] = await db.insert(table).values(values).returning();
  return row as T;
}

/**
 * 插入一行；若违反唯一约束则忽略。
 */
export async function insertIgnore(table: any, values: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (isMysqlLike) {
    try {
      await db.insert(table).values(values);
    } catch (e: any) {
      const msg = String(e?.message ?? '').toLowerCase();
      if (msg.includes('duplicate') || e?.code === 'ER_DUP_ENTRY') return;
      throw e;
    }
    return;
  }
  await db.insert(table).values(values).onConflictDoNothing();
}

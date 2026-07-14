/**
 * 数据库客户端层。
 *
 * 同时支持 PostgreSQL 和 MySQL/MariaDB。运行时根据 dbType 选择对应驱动：
 *   - postgresql → drizzle-orm/postgres-js + postgres
 *   - mysql/mariadb → drizzle-orm/mysql2 + mysql2/promise
 *
 * 调用方仍可继续 `import { getDb } from './db/index.js'`，db.select() 之类的 API
 * 在两种方言间形态一致。需要执行原生 SQL 时改用 `runRawSql()`，会自动适配方言。
 */
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import postgres from 'postgres';
import mysql from 'mysql2/promise';
import * as pgSchema from './schema-pg.js';
import * as mysqlSchema from './schema-mysql.js';
import { activeDbType, isMysqlLike } from './schema.js';

type AnyDb = any;

let pgDb: AnyDb = null;
let pgSql: postgres.Sql | null = null;

let mysqlDb: AnyDb = null;
let mysqlPool: mysql.Pool | null = null;

export function createDbClient(databaseUrl: string, dbType?: string) {
  const type = (dbType ?? activeDbType).toLowerCase();
  if (type === 'mysql' || type === 'mariadb') {
    mysqlPool = mysql.createPool(databaseUrl);
    mysqlDb = drizzleMysql(mysqlPool, { schema: mysqlSchema, mode: 'default' });
    return mysqlDb;
  }
  pgSql = postgres(databaseUrl);
  pgDb = drizzlePg(pgSql, { schema: pgSchema });
  return pgDb;
}

export function getDb(): AnyDb {
  if (isMysqlLike) {
    if (!mysqlDb) {
      throw new Error('Database not initialized. Run setup first.');
    }
    return mysqlDb;
  }
  if (!pgDb) {
    throw new Error('Database not initialized. Run setup first.');
  }
  return pgDb;
}

export function getSql(): postgres.Sql | null {
  return pgSql;
}

export function getMysqlPool(): mysql.Pool | null {
  return mysqlPool;
}

/**
 * 执行原生 SQL（在 PG 上用 postgres-js，在 MySQL 上用 mysql2）。
 * 返回 void —— 仅用于 DDL/migration 场景，不返回查询结果。
 * SQL 通过分号分隔的多条语句，会逐条执行（mysql2.query 不允许 multipleStatements 默认关闭）。
 */
export async function runRawSql(sqlText: string): Promise<void> {
  if (isMysqlLike) {
    if (!mysqlPool) throw new Error('Database not initialized');
    const statements = sqlText
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      await mysqlPool.query(stmt);
    }
  } else {
    if (!pgSql) throw new Error('Database not initialized');
    await pgSql.unsafe(sqlText);
  }
}

export async function closeDb() {
  if (pgSql) {
    try { await pgSql.end(); } catch {}
    pgSql = null;
    pgDb = null;
  }
  if (mysqlPool) {
    try { await mysqlPool.end(); } catch {}
    mysqlPool = null;
    mysqlDb = null;
  }
}

export const schema = isMysqlLike ? mysqlSchema : pgSchema;

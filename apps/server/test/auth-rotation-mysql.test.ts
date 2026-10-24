/**
 * MySQL/MariaDB 方言下的并发轮换集成测试。
 *
 * 默认跳过；设置 TEST_MYSQL_URL 指向一个可丢弃的测试数据库后运行：
 *   TEST_MYSQL_URL='mysql://root:pass@127.0.0.1:3306/dmhub_test' \
 *     pnpm --filter @dmhub/server test
 *
 * 测试只允许库名包含 test 的数据库，避免误连真实环境。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import mysql from 'mysql2/promise';

const TEST_URL = process.env.TEST_MYSQL_URL;
const SKIP_REASON = TEST_URL ? false : 'set TEST_MYSQL_URL to a disposable MySQL/MariaDB database';

function assertDisposableDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name)) {
    throw new Error(`TEST_MYSQL_URL must point at a disposable test database (name containing "test"), got "${name}"`);
  }
}

test('two concurrent claims on MySQL/MariaDB leave exactly one winner', { skip: SKIP_REASON }, async () => {
  assertDisposableDatabase(TEST_URL!);

  // claimRefreshToken 在模块加载时读取 DB_TYPE，必须在 import 之前设置
  process.env.DB_TYPE = 'mysql';

  const pool = mysql.createPool(TEST_URL!);
  try {
    await pool.query('DROP TABLE IF EXISTS `refresh_tokens`');
    await pool.query(`CREATE TABLE \`refresh_tokens\` (
      \`id\` varchar(36) PRIMARY KEY,
      \`user_id\` varchar(36) NOT NULL,
      \`token_hash\` varchar(255) NOT NULL,
      \`device_info\` varchar(255),
      \`expires_at\` timestamp(3) NOT NULL,
      \`rotated_at\` timestamp(3) NULL,
      \`replaced_by_hash\` varchar(255) NULL,
      \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )`);

    await pool.query(
      'INSERT INTO `refresh_tokens` (`id`, `user_id`, `token_hash`, `expires_at`) VALUES (?, ?, ?, ?)',
      ['token-1', 'user-1', 'hash-old', new Date(Date.now() + 60 * 60 * 1000)],
    );

    const { drizzle } = await import('drizzle-orm/mysql2');
    const mysqlSchema = await import('../src/db/schema-mysql.ts');
    const { claimRefreshToken } = await import('../src/lib/refresh-rotation.ts');

    const db = drizzle(pool, { schema: mysqlSchema, mode: 'default' }) as any;
    const now = new Date();
    const results = await Promise.all([
      claimRefreshToken(db, 'token-1', 'hash-new-a', now),
      claimRefreshToken(db, 'token-1', 'hash-new-b', now),
    ]);

    assert.equal(results.filter(Boolean).length, 1, 'exactly one concurrent claim may win');

    const [rows] = await pool.query(
      'SELECT `rotated_at`, `replaced_by_hash` FROM `refresh_tokens` WHERE `id` = ?',
      ['token-1'],
    );
    const [row] = rows as Array<{ rotated_at: Date | null; replaced_by_hash: string | null }>;
    assert.notEqual(row.rotated_at, null);
    assert.match(row.replaced_by_hash ?? '', /^hash-new-[ab]$/);
  } finally {
    await pool.query('DROP TABLE IF EXISTS `refresh_tokens`').catch(() => {});
    await pool.end();
  }
});

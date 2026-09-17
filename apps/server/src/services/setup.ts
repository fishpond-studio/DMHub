import postgres from 'postgres';
import mysql from 'mysql2/promise';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { createDbClient, getDb, getSql, getMysqlPool, closeDb, runRawSql } from '../db/index.js';
import { teamSettings, users, activeDbType } from '../db/schema.js';
import { insertReturningOne, insertIgnore } from '../db/helpers.js';
import { readSetupState, updateSetupState, isDbConfigured } from '../lib/setup-state.js';
import { sendMail, type SmtpConfig } from '../lib/smtp.js';
import { encrypt, decrypt } from '../lib/crypto.js';

let verificationCode: string | null = null;

function isMysqlDbType(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'mysql' || t === 'mariadb';
}

/** 是否已有可用 DB 连接（PG 或 MySQL） */
function hasDbConnection(): boolean {
  return !!(getSql() || getMysqlPool());
}

/**
 * 确保数据库客户端可用：
 * 1. 已有连接
 * 2. ~/.dmhub-setup.json 中的引导配置
 * 3. 环境变量 DATABASE_URL（Docker / 生产常见）
 */
async function ensureDbClient(): Promise<void> {
  if (hasDbConnection()) return;

  const state = readSetupState();
  if (state.dbConfig) {
    try {
      await initializeDatabaseClient(state.dbConfig);
      if (hasDbConnection()) return;
    } catch (err) {
      console.warn('[setup] ensureDbClient from setup-state failed:', err);
    }
  }

  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    try {
      const dbType = (process.env.DB_TYPE || state.dbConfig?.dbType || 'postgresql').toLowerCase();
      createDbClient(envUrl, dbType);
    } catch (err) {
      console.warn('[setup] ensureDbClient from DATABASE_URL failed:', err);
    }
  }
}

/** 将系统标记为已初始化（幂等） */
async function markSystemInitialized(): Promise<void> {
  updateSetupState({ initialized: true, adminRegistered: true, dbConfigured: true });
  try {
    if (!hasDbConnection()) await ensureDbClient();
    const db = getDb();
    await db.update(teamSettings).set({ initialized: true }).where(eq(teamSettings.id, 1));
  } catch {
    // DB 不可写时至少文件状态已更新
  }
}

interface DatabaseConfigInput {
  dbType: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  redisUrl?: string;
}

async function ensureDatabaseExists(config: DatabaseConfigInput): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(config.database)) {
    throw new Error('数据库名称不合法：仅支持英文字母、数字和下划线');
  }

  if (isMysqlDbType(config.dbType)) {
    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        connectTimeout: 10000,
      });
      await conn.query(
        `CREATE DATABASE IF NOT EXISTS \`${config.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
    return;
  }

  let sql: postgres.Sql | null = null;
  try {
    sql = postgres({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      database: 'postgres',
      connect_timeout: 10,
    });
    const result = await sql`SELECT 1 FROM pg_database WHERE datname = ${config.database}`;
    if (result.length === 0) {
      await sql.unsafe(`CREATE DATABASE "${config.database}"`);
    }
  } finally {
    if (sql) {
      try { await sql.end(); } catch {}
    }
  }
}

interface ClassifiedError {
  kind: 'connection_refused' | 'auth_failed' | 'database_missing' | 'host_unreachable' | 'timeout' | 'unknown';
  message: string;
  hint: string;
}

function classifyDbError(err: any): ClassifiedError {
  const code = err?.code ?? '';
  const raw = String(err?.message ?? err ?? '').toLowerCase();

  if (code === 'ECONNREFUSED' || raw.includes('connection refused') || raw.includes('econnrefused')) {
    return {
      kind: 'connection_refused',
      message: '无法连接数据库：连接被拒绝',
      hint: '请确认数据库服务正在运行，主机和端口填写正确，且防火墙允许从本机访问该端口。',
    };
  }
  if (code === 'ENOTFOUND' || raw.includes('getaddrinfo') || raw.includes('enotfound')) {
    return {
      kind: 'host_unreachable',
      message: '无法连接数据库：主机不可达',
      hint: '请检查主机名拼写。若使用 Docker，确认主机名与服务名一致；若为远程地址，确认网络可达。',
    };
  }
  if (code === 'ETIMEDOUT' || raw.includes('timeout') || raw.includes('etimedout')) {
    return {
      kind: 'timeout',
      message: '无法连接数据库：连接超时',
      hint: '请检查网络连通性以及数据库端口是否开放（默认 PostgreSQL 5432、MySQL/MariaDB 3306）。',
    };
  }
  if (raw.includes('password authentication failed') || raw.includes('access denied') || code === '28P01' || code === '28000') {
    return {
      kind: 'auth_failed',
      message: '无法连接数据库：用户名或密码错误',
      hint: '请确认用户名、密码以及该用户对目标数据库的访问权限。',
    };
  }
  if (raw.includes('does not exist') || raw.includes('unknown database') || code === '3D000' || code === '42000') {
    return {
      kind: 'database_missing',
      message: '无法连接数据库：目标数据库不存在',
      hint: 'DMHub 会尝试自动创建数据库；若仍失败请手动创建（PostgreSQL: CREATE DATABASE dmhub; MySQL/MariaDB: CREATE DATABASE dmhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;）。',
    };
  }
  return {
    kind: 'unknown',
    message: err?.message || '数据库连接失败',
    hint: '请检查数据库服务状态及连接信息。完整错误：' + (err?.message ?? ''),
  };
}

export async function testDatabaseConnection(config: DatabaseConfigInput): Promise<{ success: boolean; error?: string; errorKind?: string; hint?: string }> {
  if (isMysqlDbType(config.dbType)) {
    let conn: mysql.Connection | null = null;
    try {
      await ensureDatabaseExists(config);
      conn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        connectTimeout: 10000,
      });
      await conn.query('SELECT 1');
      await conn.end();
      return { success: true };
    } catch (err: any) {
      if (conn) {
        try { await conn.end(); } catch {}
      }
      const classified = classifyDbError(err);
      return {
        success: false,
        error: classified.message,
        errorKind: classified.kind,
        hint: classified.hint,
      };
    }
  }

  let sql: postgres.Sql | null = null;
  try {
    await ensureDatabaseExists(config);
    sql = postgres({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      database: config.database,
      connect_timeout: 10,
    });
    await sql`SELECT 1`;
    await sql.end();
    return { success: true };
  } catch (err: any) {
    if (sql) {
      try { await sql.end(); } catch {}
    }
    const classified = classifyDbError(err);
    return {
      success: false,
      error: classified.message,
      errorKind: classified.kind,
      hint: classified.hint,
    };
  }
}

function buildDatabaseUrl(config: DatabaseConfigInput): string {
  if (isMysqlDbType(config.dbType)) {
    return `mysql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
  }
  return `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
}

export async function saveDatabaseConfig(config: DatabaseConfigInput): Promise<{ restartRequired?: boolean }> {
  const selectedType = config.dbType.toLowerCase();
  const currentType = activeDbType;
  const mismatch =
    (selectedType === 'mysql' || selectedType === 'mariadb') !== (currentType === 'mysql' || currentType === 'mariadb');

  if (mismatch) {
    // schema.ts 在 module load 时已绑定到 currentType；用户选了不同方言时，仅保存配置，
    // 不初始化 client（用旧 schema 对新方言 client 做查询会撞方言不匹配）。
    // 前端会显示"请重启服务"提示。
    updateSetupState({ dbConfigured: true, dbConfig: config });
    return { restartRequired: true };
  }

  if (isDbConfigured()) {
    try {
      const db = getDb();
      await db.update(teamSettings).set({
        dbType: config.dbType,
        dbHost: config.host,
        dbPort: config.port,
        dbUsername: config.username,
        dbPassword: encrypt(config.password),
        dbName: config.database,
        redisUrl: config.redisUrl || null,
      }).where(eq(teamSettings.id, 1));
    } catch {
      updateSetupState({
        dbConfigured: true,
        dbConfig: config,
      });
    }
  } else {
    updateSetupState({
      dbConfigured: true,
      dbConfig: config,
    });
  }
  return {};
}

export async function initializeDatabaseClient(config: DatabaseConfigInput): Promise<void> {
  await ensureDatabaseExists(config);
  const url = buildDatabaseUrl(config);
  process.env.DATABASE_URL = url;
  process.env.DB_TYPE = config.dbType;
  await closeDb();
  createDbClient(url, config.dbType);
}

export async function saveTablePrefix(prefix: string): Promise<string> {
  let finalPrefix = prefix || '';
  if (finalPrefix && !finalPrefix.endsWith('_')) {
    finalPrefix += '_';
  }
  if (isDbConfigured()) {
    try {
      const db = getDb();
      await db.update(teamSettings).set({ tablePrefix: finalPrefix }).where(eq(teamSettings.id, 1));
    } catch {
      updateSetupState({ tablePrefix: finalPrefix });
    }
  } else {
    updateSetupState({ tablePrefix: finalPrefix });
  }
  return finalPrefix;
}

export async function runMigration(): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureDbClient();
    const state = readSetupState();
    const dbType = state.dbConfig?.dbType ?? 'postgresql';
    const sqlText = isMysqlDbType(dbType) ? MYSQL_MIGRATION_SQL : PG_MIGRATION_SQL;
    await runRawSql(sqlText);

    // MySQL 无 IF NOT EXISTS 的 ADD COLUMN，单独兜底
    if (isMysqlDbType(dbType)) {
      try {
        await runRawSql(
          'ALTER TABLE `users` ADD COLUMN `email_notifications_enabled` boolean NOT NULL DEFAULT false',
        );
      } catch {
        // column already exists
      }
    }

    const db = getDb();
    if (isMysqlDbType(dbType)) {
      try {
        await db.insert(teamSettings).values({
          id: 1,
          name: 'DMHub Team',
          initialized: false,
        });
      } catch (e: any) {
        if (!String(e?.message ?? '').toLowerCase().includes('duplicate')) throw e;
      }
    } else {
      await insertIgnore(teamSettings, {
        id: 1,
        name: 'DMHub Team',
        initialized: false,
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Migration failed' };
  }
}

/**
 * 已初始化实例启动时补齐 schema 增量字段（幂等）。
 */
export async function ensureSchemaPatches(): Promise<void> {
  try {
    await ensureDbClient();
    if (!getSql() && !getMysqlPool()) return;
    const state = readSetupState();
    if (!state.dbConfigured) return;
    const dbType = state.dbConfig?.dbType ?? 'postgresql';
    if (isMysqlDbType(dbType)) {
      for (const sql of [
        'ALTER TABLE `users` ADD COLUMN `email_notifications_enabled` boolean NOT NULL DEFAULT false',
        'ALTER TABLE `oauth_providers` ADD COLUMN `well_known_url` varchar(512) NULL',
        'ALTER TABLE `domains` ADD COLUMN `notes` text NULL',
        'ALTER TABLE `domains` ADD COLUMN `ssl_expires_at` datetime NULL',
        'ALTER TABLE `domains` ADD COLUMN `ssl_last_checked_at` datetime NULL',
        'ALTER TABLE `domains` ADD COLUMN `ssl_issuer` varchar(255) NULL',
        'ALTER TABLE `dns_records` ADD COLUMN `notes` text NULL',
        'ALTER TABLE `domains` ADD COLUMN `monitor_enabled` boolean NOT NULL DEFAULT false',
        'ALTER TABLE `domains` ADD COLUMN `monitor_status` varchar(16) NULL',
        'ALTER TABLE `domains` ADD COLUMN `monitor_response_ms` int NULL',
        'ALTER TABLE `domains` ADD COLUMN `monitor_last_checked_at` datetime NULL',
        'ALTER TABLE `team_settings` ADD COLUMN `log_retention_days` int NULL',
        'CREATE TABLE IF NOT EXISTS `monitor_checks` (`id` varchar(36) NOT NULL, `domain_id` varchar(36) NOT NULL, `check_type` varchar(16) NOT NULL DEFAULT \'http\', `status` varchar(8) NOT NULL, `status_code` int NULL, `response_ms` int NULL, `error` text NULL, `checked_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`))',
        'CREATE INDEX IF NOT EXISTS `idx_monitor_checks_domain_time` ON `monitor_checks` (`domain_id`, `checked_at`)',
      ]) {
        try {
          await runRawSql(sql);
        } catch {
          // column/index/table exists
        }
      }
    } else {
      await runRawSql(`
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "oauth_providers" ADD COLUMN IF NOT EXISTS "well_known_url" varchar(512);
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "ssl_expires_at" timestamptz;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "ssl_last_checked_at" timestamptz;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "ssl_issuer" varchar(255);
ALTER TABLE "dns_records" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_status" varchar(16);
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_response_ms" integer;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_last_checked_at" timestamptz;
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "log_retention_days" integer;
CREATE TABLE IF NOT EXISTS "monitor_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL,
  "check_type" varchar(16) NOT NULL DEFAULT 'http',
  "status" varchar(8) NOT NULL,
  "status_code" integer,
  "response_ms" integer,
  "error" text,
  "checked_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_monitor_checks_domain_time" ON "monitor_checks" ("domain_id", "checked_at");
`);
    }
  } catch (err) {
    console.warn('[setup] ensureSchemaPatches failed:', err);
  }
}

export async function registerAdmin(
  username: string,
  password: string,
): Promise<{ user: { id: string; username: string; role: string } }> {
  await ensureDbClient();
  const db = getDb();

  const [existingAdmin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);

  const passwordHash = await bcrypt.hash(password, 12);

  if (existingAdmin) {
    await db
      .update(users)
      .set({ passwordHash, username })
      .where(eq(users.id, existingAdmin.id));
    // 已有管理员 = 系统可登录使用，标记完成初始化
    await markSystemInitialized();
    return { user: { id: existingAdmin.id, username, role: 'admin' } };
  }
  const user = await insertReturningOne<{ id: string; username: string; role: string }>(
    users,
    {
      username,
      passwordHash,
      role: 'admin',
      emailVerified: false,
    },
    {
      id: users.id,
      username: users.username,
      role: users.role,
    },
  );

  // 管理员创建成功即视为安装完成；站点 URL / SMTP / 邮箱验证均为可选后续配置
  await markSystemInitialized();

  return { user: { id: user.id, username: user.username, role: user.role } };
}

export async function saveSiteUrl(siteUrl: string): Promise<void> {
  if (isDbConfigured()) {
    try {
      const db = getDb();
      await db.update(teamSettings).set({ siteUrl }).where(eq(teamSettings.id, 1));
    } catch {
      updateSetupState({ siteUrl, siteUrlConfigured: true });
    }
  } else {
    updateSetupState({ siteUrl, siteUrlConfigured: true });
  }
}

export async function saveSmtpConfig(config: SmtpConfig): Promise<void> {
  if (isDbConfigured()) {
    try {
      const db = getDb();
      await db.update(teamSettings).set({
        smtpHost: config.host,
        smtpPort: config.port,
        smtpUser: config.user,
        smtpPassword: encrypt(config.password),
        smtpFrom: config.from,
        smtpSecure: config.secure ?? false,
      }).where(eq(teamSettings.id, 1));
    } catch {
      updateSetupState({
        smtpConfigured: true,
        smtpConfig: config,
      });
    }
  } else {
    updateSetupState({
      smtpConfigured: true,
      smtpConfig: config,
    });
  }
}

export async function sendTestEmail(
  email: string | undefined,
  smtpOverride?: SmtpConfig,
): Promise<{ success: boolean; error?: string }> {
  let smtpConfig: SmtpConfig;
  let targetEmail = email || '';

  if (smtpOverride) {
    smtpConfig = smtpOverride;
  } else if (isDbConfigured()) {
    const db = getDb();
    const [settings] = await db.select().from(teamSettings).where(eq(teamSettings.id, 1));
    if (!settings) {
      return { success: false, error: 'Team settings not found' };
    }
    smtpConfig = {
      host: settings.smtpHost!,
      port: settings.smtpPort!,
      user: settings.smtpUser!,
      password: decrypt(settings.smtpPassword!),
      from: settings.smtpFrom!,
      secure: settings.smtpSecure ?? false,
    };
    if (!targetEmail) {
      const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
      if (admin?.email) {
        targetEmail = admin.email;
      }
    }
  } else {
    const state = readSetupState();
    if (!state.smtpConfig) {
      return { success: false, error: 'SMTP not configured' };
    }
    smtpConfig = state.smtpConfig;
  }

  if (!targetEmail) {
    return { success: false, error: 'No email address to send test to' };
  }

  verificationCode = String(randomInt(100000, 1000000));

  const result = await sendMail(
    smtpConfig,
    targetEmail,
    'DMHub - Email Verification Code',
    `<p>Your verification code is: <strong>${verificationCode}</strong></p>`,
  );

  return result;
}

export async function verifyEmail(code: string): Promise<{ success: boolean; error?: string }> {
  if (!verificationCode) {
    return { success: false, error: 'No verification code was sent' };
  }
  if (code !== verificationCode) {
    return { success: false, error: 'Invalid verification code' };
  }

  verificationCode = null;

  try {
    await ensureDbClient();
    const db = getDb();
    const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    if (admin) {
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, admin.id));
    }
  } catch {}

  // 邮箱验证不再作为「能否进入系统」的门槛，只做邮箱确认
  await markSystemInitialized();

  return { success: true };
}

/**
 * 跳过可选步骤、显式完成引导（需已有管理员）
 */
export async function completeSetup(): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureDbClient();
    const db = getDb();
    const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
    if (adminRows.length === 0) {
      return { success: false, error: '请先注册管理员账户' };
    }
    await markSystemInitialized();
    return { success: true };
  } catch (err: any) {
    // 文件态也可能已有 adminRegistered
    const state = readSetupState();
    if (state.adminRegistered) {
      updateSetupState({ initialized: true });
      return { success: true };
    }
    return { success: false, error: err?.message || '完成初始化失败' };
  }
}

export async function getSetupStatus(): Promise<{
  initialized: boolean;
  dbConfigured: boolean;
  tablesMigrated: boolean;
  adminRegistered: boolean;
  smtpConfigured: boolean;
  siteUrlConfigured: boolean;
}> {
  const fileState = readSetupState();

  try {
    await ensureDbClient();
    if (!hasDbConnection()) {
      return {
        initialized: fileState.initialized,
        dbConfigured: fileState.dbConfigured,
        tablesMigrated: false,
        adminRegistered: fileState.adminRegistered,
        smtpConfigured: fileState.smtpConfigured,
        siteUrlConfigured: fileState.siteUrlConfigured,
      };
    }

    const db = getDb();

    // 探测表是否已迁移
    let settings: {
      initialized: boolean;
      smtpHost: string | null;
      smtpPort: number | null;
      siteUrl: string | null;
    } | null = null;
    let tablesMigrated = false;
    try {
      const rows = await db.select().from(teamSettings).where(eq(teamSettings.id, 1)).limit(1);
      settings = rows[0] ?? null;
      tablesMigrated = true;
    } catch {
      // 表不存在
      tablesMigrated = false;
    }

    let adminRegistered = false;
    if (tablesMigrated) {
      try {
        const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
        adminRegistered = adminRows.length > 0;
      } catch {
        adminRegistered = false;
      }
    }

    // 核心判定：只要已有管理员，系统即视为已安装（可登录使用）
    // 自动修复历史数据：曾卡在「邮箱验证」导致 initialized 一直为 false
    let initialized = !!(settings?.initialized || fileState.initialized);
    if (adminRegistered) {
      initialized = true;
      if (!settings?.initialized) {
        try {
          await db.update(teamSettings).set({ initialized: true }).where(eq(teamSettings.id, 1));
        } catch {}
      }
      updateSetupState({
        initialized: true,
        dbConfigured: true,
        adminRegistered: true,
        smtpConfigured: !!(settings?.smtpHost && settings?.smtpPort) || fileState.smtpConfigured,
        siteUrlConfigured: !!settings?.siteUrl || fileState.siteUrlConfigured,
      });
    } else if (settings) {
      // 同步 DB 标志到文件，但不把「仅文件 true、DB 无管理员」误判为已安装
      updateSetupState({
        initialized: !!settings.initialized,
        dbConfigured: true,
      });
      initialized = !!settings.initialized;
    }

    return {
      initialized,
      dbConfigured: true,
      tablesMigrated,
      adminRegistered,
      smtpConfigured: !!(settings?.smtpHost && settings?.smtpPort),
      siteUrlConfigured: !!settings?.siteUrl,
    };
  } catch {
    return {
      initialized: fileState.initialized && fileState.adminRegistered,
      dbConfigured: fileState.dbConfigured,
      tablesMigrated: fileState.adminRegistered || fileState.initialized,
      adminRegistered: fileState.adminRegistered,
      smtpConfigured: fileState.smtpConfigured,
      siteUrlConfigured: fileState.siteUrlConfigured,
    };
  }
}

const PG_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" varchar(64) NOT NULL UNIQUE,
  "email" varchar(255) UNIQUE,
  "password_hash" varchar(255),
  "display_name" varchar(128),
  "nickname" varchar(64),
  "avatar_url" varchar(512),
  "role" varchar(16) NOT NULL DEFAULT 'member',
  "two_factor_enabled" boolean NOT NULL DEFAULT false,
  "two_factor_methods" varchar(64)[] NOT NULL DEFAULT '{}',
  "email_verified" boolean NOT NULL DEFAULT false,
  "notifications_enabled" boolean NOT NULL DEFAULT true,
  "email_notifications_enabled" boolean NOT NULL DEFAULT false,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "team_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "name" varchar(128),
  "description" text,
  "logo_url" varchar(512),
  "default_role" varchar(16) NOT NULL DEFAULT 'member',
  "initialized" boolean NOT NULL DEFAULT false,
  "site_url" varchar(512),
  "smtp_host" varchar(255),
  "smtp_port" integer,
  "smtp_user" varchar(255),
  "smtp_password" varchar(255),
  "smtp_from" varchar(255),
  "smtp_secure" boolean DEFAULT false,
  "db_type" varchar(32),
  "db_host" varchar(255),
  "db_port" integer,
  "db_username" varchar(255),
  "db_password" varchar(255),
  "db_name" varchar(255),
  "table_prefix" varchar(16),
  "redis_url" varchar(512),
  "uptime_push_url" varchar(512),
  "invite_code_enabled" boolean NOT NULL DEFAULT true,
  "registration_enabled" boolean NOT NULL DEFAULT true,
  "announcement" text,
  "announcement_format" varchar(16) DEFAULT 'markdown',
  "landing_subtitle" varchar(512),
  "landing_background_url" varchar(512),
  "footer_content" text,
  "footer_format" varchar(16) DEFAULT 'markdown',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "invite_code_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "announcement" text;
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "announcement_format" varchar(16) DEFAULT 'markdown';
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "landing_subtitle" varchar(512);
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "landing_background_url" varchar(512);
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "footer_content" text;
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "footer_format" varchar(16) DEFAULT 'markdown';
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "registration_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "team_settings" ADD COLUMN IF NOT EXISTS "log_retention_days" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "provider_id" varchar(32),
  "provider_domain_id" varchar(255),
  "provider_config_id" uuid,
  "expires_at" timestamptz,
  "tags" varchar(32)[] DEFAULT '{}',
  "group_name" varchar(64),
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "auto_check_expiry" boolean NOT NULL DEFAULT true,
  "expiry_remind_days" integer[] NOT NULL DEFAULT '{30,14,7,3,1,0}',
  "last_checked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "ssl_expires_at" timestamptz;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "ssl_last_checked_at" timestamptz;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "ssl_issuer" varchar(255);
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_status" varchar(16);
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_response_ms" integer;
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "monitor_last_checked_at" timestamptz;

CREATE TABLE IF NOT EXISTS "monitor_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL,
  "check_type" varchar(16) NOT NULL DEFAULT 'http',
  "status" varchar(8) NOT NULL,
  "status_code" integer,
  "response_ms" integer,
  "error" text,
  "checked_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_monitor_checks_domain_time" ON "monitor_checks" ("domain_id", "checked_at");

CREATE TABLE IF NOT EXISTS "dns_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL,
  "record_type" varchar(16) NOT NULL,
  "name" varchar(255) NOT NULL,
  "value" text NOT NULL,
  "ttl" integer NOT NULL DEFAULT 3600,
  "priority" integer,
  "proxied" boolean NOT NULL DEFAULT false,
  "provider_record_id" varchar(255),
  "snapshot_version" integer NOT NULL DEFAULT 0,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "operation_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "domain_id" uuid,
  "action" varchar(64) NOT NULL,
  "target_type" varchar(32) NOT NULL,
  "target_id" varchar(255) NOT NULL,
  "detail" jsonb,
  "ip_address" varchar(45),
  "user_agent" varchar(512),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "notification_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel" varchar(32) NOT NULL,
  "name" varchar(128) NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}',
  "events" varchar(32)[] NOT NULL DEFAULT '{}',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "provider_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_id" varchar(32) NOT NULL,
  "name" varchar(128) NOT NULL,
  "credentials" jsonb NOT NULL DEFAULT '{}',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_oauth_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "provider_id" varchar(32) NOT NULL,
  "provider_user_id" varchar(255) NOT NULL,
  "provider_email" varchar(255),
  "provider_name" varchar(128),
  "provider_avatar" varchar(512),
  "raw_data" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_totp_seeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE,
  "secret_encrypted" text NOT NULL,
  "verified" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_passkeys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "credential_id" bytea NOT NULL UNIQUE,
  "public_key" bytea NOT NULL,
  "counter" integer NOT NULL DEFAULT 0,
  "device_type" varchar(32),
  "backed_up" boolean DEFAULT false,
  "transports" varchar(16)[] DEFAULT '{}',
  "device_name" varchar(128),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "backup_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "code_hash" varchar(255) NOT NULL,
  "code_index" integer NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(16) NOT NULL UNIQUE,
  "max_uses" integer NOT NULL DEFAULT 0,
  "current_uses" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz,
  "created_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "domain_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "subdomain_pattern" varchar(255) NOT NULL DEFAULT '*',
  "permission" varchar(16) NOT NULL DEFAULT 'dns_edit',
  "assigned_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "domain_assignment_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "subdomain_pattern" varchar(255) NOT NULL DEFAULT '*',
  "permission" varchar(16) NOT NULL DEFAULT 'dns_edit',
  "reason" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid,
  "review_comment" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "dns_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "records" jsonb NOT NULL DEFAULT '[]',
  "trigger" varchar(32) NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token_hash" varchar(255) NOT NULL,
  "device_info" varchar(255),
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "oauth_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_id" varchar(32) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "client_id" varchar(512) NOT NULL,
  "client_secret" varchar(512) NOT NULL,
  "scope" varchar(256),
  "well_known_url" varchar(512),
  "custom_authorize_url" varchar(512),
  "custom_token_url" varchar(512),
  "custom_user_info_url" varchar(512),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(128) NOT NULL,
  "key_hash" varchar(255) NOT NULL,
  "key_prefix" varchar(16) NOT NULL,
  "permissions" varchar(64)[] NOT NULL,
  "last_used_at" timestamptz,
  "expires_at" timestamptz,
  "created_by_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(128) NOT NULL,
  "token_hash" varchar(255) NOT NULL,
  "token_prefix" varchar(16) NOT NULL,
  "permissions" varchar(64)[] NOT NULL,
  "user_id" uuid NOT NULL,
  "last_used_at" timestamptz,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_dns_records_domain_id" ON "dns_records" ("domain_id");
CREATE INDEX IF NOT EXISTS "idx_dns_records_provider_record_id" ON "dns_records" ("provider_record_id");
CREATE INDEX IF NOT EXISTS "idx_operation_logs_domain_id" ON "operation_logs" ("domain_id");
CREATE INDEX IF NOT EXISTS "idx_operation_logs_user_id" ON "operation_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_operation_logs_created_at" ON "operation_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_domain_assignments_user_id" ON "domain_assignments" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_domain_assignments_domain_id" ON "domain_assignments" ("domain_id");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "idx_backup_codes_user_id" ON "backup_codes" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_api_keys_key_prefix" ON "api_keys" ("key_prefix");
CREATE INDEX IF NOT EXISTS "idx_user_tokens_token_prefix" ON "user_tokens" ("token_prefix");
CREATE INDEX IF NOT EXISTS "idx_user_tokens_user_id" ON "user_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_dns_snapshots_domain_id" ON "dns_snapshots" ("domain_id");
CREATE INDEX IF NOT EXISTS "idx_domain_assignment_requests_user_id" ON "domain_assignment_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_domain_assignment_requests_domain_id" ON "domain_assignment_requests" ("domain_id");
CREATE INDEX IF NOT EXISTS "idx_domain_assignment_requests_status" ON "domain_assignment_requests" ("status");
CREATE INDEX IF NOT EXISTS "idx_user_passkeys_user_id" ON "user_passkeys" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_invite_codes_code" ON "invite_codes" ("code");
CREATE INDEX IF NOT EXISTS "idx_user_oauth_bindings_user_id" ON "user_oauth_bindings" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_oauth_bindings_provider_id_user_id" ON "user_oauth_bindings" ("provider_id", "user_id");
`;

const MYSQL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`username\` varchar(64) NOT NULL UNIQUE,
  \`email\` varchar(255) UNIQUE,
  \`password_hash\` varchar(255),
  \`display_name\` varchar(128),
  \`nickname\` varchar(64),
  \`avatar_url\` varchar(512),
  \`role\` varchar(16) NOT NULL DEFAULT 'member',
  \`two_factor_enabled\` boolean NOT NULL DEFAULT false,
  \`two_factor_methods\` json NOT NULL DEFAULT (JSON_ARRAY()),
  \`email_verified\` boolean NOT NULL DEFAULT false,
  \`notifications_enabled\` boolean NOT NULL DEFAULT true,
  \`email_notifications_enabled\` boolean NOT NULL DEFAULT false,
  \`status\` varchar(16) NOT NULL DEFAULT 'active',
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`team_settings\` (
  \`id\` int PRIMARY KEY DEFAULT 1,
  \`name\` varchar(128),
  \`description\` text,
  \`logo_url\` varchar(512),
  \`default_role\` varchar(16) NOT NULL DEFAULT 'member',
  \`initialized\` boolean NOT NULL DEFAULT false,
  \`site_url\` varchar(512),
  \`smtp_host\` varchar(255),
  \`smtp_port\` int,
  \`smtp_user\` varchar(255),
  \`smtp_password\` varchar(255),
  \`smtp_from\` varchar(255),
  \`smtp_secure\` boolean DEFAULT false,
  \`db_type\` varchar(32),
  \`db_host\` varchar(255),
  \`db_port\` int,
  \`db_username\` varchar(255),
  \`db_password\` varchar(255),
  \`db_name\` varchar(255),
  \`table_prefix\` varchar(16),
  \`redis_url\` varchar(512),
  \`uptime_push_url\` varchar(512),
  \`invite_code_enabled\` boolean NOT NULL DEFAULT true,
  \`registration_enabled\` boolean NOT NULL DEFAULT true,
  \`announcement\` text,
  \`announcement_format\` varchar(16) DEFAULT 'markdown',
  \`landing_subtitle\` varchar(512),
  \`landing_background_url\` varchar(512),
  \`footer_content\` text,
  \`footer_format\` varchar(16) DEFAULT 'markdown',
  \`log_retention_days\` int NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`domains\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`name\` varchar(255) NOT NULL,
  \`provider_id\` varchar(32),
  \`provider_domain_id\` varchar(255),
  \`provider_config_id\` varchar(36),
  \`expires_at\` timestamp(3) NULL,
  \`tags\` json,
  \`group_name\` varchar(64),
  \`status\` varchar(16) NOT NULL DEFAULT 'active',
  \`auto_check_expiry\` boolean NOT NULL DEFAULT true,
  \`expiry_remind_days\` json NOT NULL DEFAULT (JSON_ARRAY(30, 14, 7, 3, 1, 0)),
  \`last_checked_at\` timestamp(3) NULL,
  \`monitor_enabled\` boolean NOT NULL DEFAULT false,
  \`monitor_status\` varchar(16) NULL,
  \`monitor_response_ms\` int NULL,
  \`monitor_last_checked_at\` timestamp(3) NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`monitor_checks\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`domain_id\` varchar(36) NOT NULL,
  \`check_type\` varchar(16) NOT NULL DEFAULT 'http',
  \`status\` varchar(8) NOT NULL,
  \`status_code\` int NULL,
  \`response_ms\` int NULL,
  \`error\` text NULL,
  \`checked_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS \`idx_monitor_checks_domain_time\` ON \`monitor_checks\` (\`domain_id\`, \`checked_at\`);

CREATE TABLE IF NOT EXISTS \`dns_records\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`domain_id\` varchar(36) NOT NULL,
  \`record_type\` varchar(16) NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`value\` text NOT NULL,
  \`ttl\` int NOT NULL DEFAULT 3600,
  \`priority\` int,
  \`proxied\` boolean NOT NULL DEFAULT false,
  \`provider_record_id\` varchar(255),
  \`snapshot_version\` int NOT NULL DEFAULT 0,
  \`status\` varchar(16) NOT NULL DEFAULT 'active',
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`operation_logs\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`user_id\` varchar(36) NOT NULL,
  \`domain_id\` varchar(36),
  \`action\` varchar(64) NOT NULL,
  \`target_type\` varchar(32) NOT NULL,
  \`target_id\` varchar(255) NOT NULL,
  \`detail\` json,
  \`ip_address\` varchar(45),
  \`user_agent\` varchar(512),
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`notification_configs\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`channel\` varchar(32) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`config\` json NOT NULL DEFAULT (JSON_OBJECT()),
  \`events\` json NOT NULL DEFAULT (JSON_ARRAY()),
  \`enabled\` boolean NOT NULL DEFAULT true,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`provider_configs\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`provider_id\` varchar(32) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`credentials\` json NOT NULL DEFAULT (JSON_OBJECT()),
  \`enabled\` boolean NOT NULL DEFAULT true,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`user_oauth_bindings\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`user_id\` varchar(36) NOT NULL,
  \`provider_id\` varchar(32) NOT NULL,
  \`provider_user_id\` varchar(255) NOT NULL,
  \`provider_email\` varchar(255),
  \`provider_name\` varchar(128),
  \`provider_avatar\` varchar(512),
  \`raw_data\` json,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`user_totp_seeds\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`user_id\` varchar(36) NOT NULL UNIQUE,
  \`secret_encrypted\` text NOT NULL,
  \`verified\` boolean NOT NULL DEFAULT false,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`user_passkeys\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`user_id\` varchar(36) NOT NULL,
  \`credential_id\` varbinary(1024) NOT NULL UNIQUE,
  \`public_key\` varbinary(2048) NOT NULL,
  \`counter\` int NOT NULL DEFAULT 0,
  \`device_type\` varchar(32),
  \`backed_up\` boolean DEFAULT false,
  \`transports\` json,
  \`device_name\` varchar(128),
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`last_used_at\` timestamp(3) NULL
);

CREATE TABLE IF NOT EXISTS \`backup_codes\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`user_id\` varchar(36) NOT NULL,
  \`code_hash\` varchar(255) NOT NULL,
  \`code_index\` int NOT NULL,
  \`used\` boolean NOT NULL DEFAULT false,
  \`used_at\` timestamp(3) NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`invite_codes\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`code\` varchar(16) NOT NULL UNIQUE,
  \`max_uses\` int NOT NULL DEFAULT 0,
  \`current_uses\` int NOT NULL DEFAULT 0,
  \`expires_at\` timestamp(3) NULL,
  \`created_by\` varchar(36) NOT NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`domain_assignments\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`domain_id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`subdomain_pattern\` varchar(255) NOT NULL DEFAULT '*',
  \`permission\` varchar(16) NOT NULL DEFAULT 'dns_edit',
  \`assigned_by\` varchar(36) NOT NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`domain_assignment_requests\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`domain_id\` varchar(36) NOT NULL,
  \`user_id\` varchar(36) NOT NULL,
  \`subdomain_pattern\` varchar(255) NOT NULL DEFAULT '*',
  \`permission\` varchar(16) NOT NULL DEFAULT 'dns_edit',
  \`reason\` text NOT NULL,
  \`status\` varchar(16) NOT NULL DEFAULT 'pending',
  \`reviewed_by\` varchar(36),
  \`review_comment\` text,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`reviewed_at\` timestamp(3) NULL
);

CREATE TABLE IF NOT EXISTS \`dns_snapshots\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`domain_id\` varchar(36) NOT NULL,
  \`version\` int NOT NULL,
  \`records\` json NOT NULL DEFAULT (JSON_ARRAY()),
  \`trigger\` varchar(32) NOT NULL,
  \`created_by\` varchar(36),
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`user_id\` varchar(36) NOT NULL,
  \`token_hash\` varchar(255) NOT NULL,
  \`device_info\` varchar(255),
  \`expires_at\` timestamp(3) NOT NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`oauth_providers\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`provider_id\` varchar(32) NOT NULL,
  \`enabled\` boolean NOT NULL DEFAULT true,
  \`client_id\` varchar(512) NOT NULL,
  \`client_secret\` varchar(512) NOT NULL,
  \`scope\` varchar(256),
  \`well_known_url\` varchar(512),
  \`custom_authorize_url\` varchar(512),
  \`custom_token_url\` varchar(512),
  \`custom_user_info_url\` varchar(512),
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`api_keys\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`name\` varchar(128) NOT NULL,
  \`key_hash\` varchar(255) NOT NULL,
  \`key_prefix\` varchar(16) NOT NULL,
  \`permissions\` json NOT NULL DEFAULT (JSON_ARRAY()),
  \`last_used_at\` timestamp(3) NULL,
  \`expires_at\` timestamp(3) NULL,
  \`created_by_id\` varchar(36) NOT NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS \`user_tokens\` (
  \`id\` varchar(36) PRIMARY KEY,
  \`name\` varchar(128) NOT NULL,
  \`token_hash\` varchar(255) NOT NULL,
  \`token_prefix\` varchar(16) NOT NULL,
  \`permissions\` json NOT NULL DEFAULT (JSON_ARRAY()),
  \`user_id\` varchar(36) NOT NULL,
  \`last_used_at\` timestamp(3) NULL,
  \`expires_at\` timestamp(3) NULL,
  \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS \`idx_dns_records_domain_id\` ON \`dns_records\` (\`domain_id\`);
CREATE INDEX IF NOT EXISTS \`idx_dns_records_provider_record_id\` ON \`dns_records\` (\`provider_record_id\`);
CREATE INDEX IF NOT EXISTS \`idx_operation_logs_domain_id\` ON \`operation_logs\` (\`domain_id\`);
CREATE INDEX IF NOT EXISTS \`idx_operation_logs_user_id\` ON \`operation_logs\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_operation_logs_created_at\` ON \`operation_logs\` (\`created_at\`);
CREATE INDEX IF NOT EXISTS \`idx_domain_assignments_user_id\` ON \`domain_assignments\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_domain_assignments_domain_id\` ON \`domain_assignments\` (\`domain_id\`);
CREATE INDEX IF NOT EXISTS \`idx_refresh_tokens_token_hash\` ON \`refresh_tokens\` (\`token_hash\`);
CREATE INDEX IF NOT EXISTS \`idx_backup_codes_user_id\` ON \`backup_codes\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_api_keys_key_prefix\` ON \`api_keys\` (\`key_prefix\`);
CREATE INDEX IF NOT EXISTS \`idx_user_tokens_token_prefix\` ON \`user_tokens\` (\`token_prefix\`);
CREATE INDEX IF NOT EXISTS \`idx_user_tokens_user_id\` ON \`user_tokens\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_dns_snapshots_domain_id\` ON \`dns_snapshots\` (\`domain_id\`);
CREATE INDEX IF NOT EXISTS \`idx_domain_assignment_requests_user_id\` ON \`domain_assignment_requests\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_domain_assignment_requests_domain_id\` ON \`domain_assignment_requests\` (\`domain_id\`);
CREATE INDEX IF NOT EXISTS \`idx_domain_assignment_requests_status\` ON \`domain_assignment_requests\` (\`status\`);
CREATE INDEX IF NOT EXISTS \`idx_user_passkeys_user_id\` ON \`user_passkeys\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_invite_codes_code\` ON \`invite_codes\` (\`code\`);
CREATE INDEX IF NOT EXISTS \`idx_user_oauth_bindings_user_id\` ON \`user_oauth_bindings\` (\`user_id\`);
CREATE INDEX IF NOT EXISTS \`idx_user_oauth_bindings_provider_id_user_id\` ON \`user_oauth_bindings\` (\`provider_id\`, \`user_id\`);
`;

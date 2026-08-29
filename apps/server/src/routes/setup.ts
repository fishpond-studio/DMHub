import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import dns from 'node:dns/promises';
import {
  testDatabaseConnection,
  saveDatabaseConfig,
  initializeDatabaseClient,
  saveTablePrefix,
  runMigration,
  registerAdmin,
  saveSiteUrl,
  saveSmtpConfig,
  sendTestEmail,
  verifyEmail,
  getSetupStatus,
  completeSetup,
} from '../services/setup.js';
import type { SmtpConfig } from '../lib/smtp.js';
import { testSmtpConnection } from '../lib/smtp.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { readSetupState } from '../lib/setup-state.js';

/**
 * 核心安装步骤保护：已有管理员后禁止重跑数据库/迁移/注册。
 * 注意：与「前端是否离开引导」不完全同一概念——有管理员即可登录，
 * 但站点 URL / SMTP 等可选步骤在引导完成前仍可能调用。
 */
async function guardCoreSetup(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const status = await getSetupStatus();
    if (status.adminRegistered || status.initialized) {
      return reply.status(403).send({ error: '系统已初始化，此接口不可用' });
    }
  } catch {
    // DB 尚未配置时放行
  }
}

/** 可选配置：仅在完全未安装时通过 setup 接口写入；已初始化请走登录后设置页 */
async function guardOptionalSetup(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const status = await getSetupStatus();
    // 允许：未初始化，或已有管理员但仍在引导收尾（文件/库标志尚未全部同步时）
    // 若已有管理员且 DB 明确 initialized，仍允许 complete / 邮箱验证收尾，禁止被滥用改 SMTP 的风险用 complete 后关闭
    if (status.initialized && status.adminRegistered && status.smtpConfigured && status.siteUrlConfigured) {
      return reply.status(403).send({ error: '系统已初始化，请登录后在设置中修改' });
    }
  } catch {
    // allow
  }
}

async function ensureDb(): Promise<void> {
  try {
    getDb();
  } catch {
    const state = readSetupState();
    if (state.dbConfig) {
      await initializeDatabaseClient(state.dbConfig);
    }
  }
}

const databaseConfigSchema = z.object({
  dbType: z.enum(['postgresql', 'mariadb', 'mysql']),
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
  redisUrl: z.string().optional().or(z.literal('')),
});

const tablePrefixSchema = z.object({
  prefix: z.string().regex(/^[a-zA-Z_]*$/, 'Prefix must contain only English letters and underscores').optional(),
});

const registerSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

const siteUrlSchema = z.object({
  siteUrl: z.string().url('Invalid URL format'),
});

const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  user: z.string().min(1),
  password: z.string().min(1),
  from: z.string().min(1),
  secure: z.boolean().optional(),
});

const smtpTestSchema = z.object({
  email: z.string().email().optional(),
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().optional(),
  user: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  secure: z.boolean().optional(),
});

const verifyEmailSchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

export async function setupRoutes(app: FastifyInstance) {
  app.get('/status', async () => {
    return getSetupStatus();
  });

  app.post('/database', { preHandler: [guardCoreSetup] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = databaseConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    const config = parsed.data;
    const testResult = await testDatabaseConnection(config);
    if (!testResult.success) {
      return reply.status(400).send({ error: testResult.error, hint: testResult.hint, errorKind: testResult.errorKind });
    }
    const { restartRequired } = await saveDatabaseConfig(config);
    if (restartRequired) {
      return { success: true, restartRequired: true };
    }
    await initializeDatabaseClient(config);
    return { success: true };
  });

  app.post('/database/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = databaseConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    const result = await testDatabaseConnection(parsed.data);
    return result;
  });

  app.post('/table-prefix', { preHandler: [guardCoreSetup] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = tablePrefixSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    const prefix = await saveTablePrefix(parsed.data.prefix || '');
    return { prefix };
  });

  app.post('/database/migrate', { preHandler: [guardCoreSetup] }, async () => {
    const result = await runMigration();
    if (!result.success) {
      throw new Error(result.error);
    }
    return { success: true };
  });

  app.post('/register', { preHandler: [guardCoreSetup] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    await ensureDb();
    const result = await registerAdmin(parsed.data.username, parsed.data.password);
    return result;
  });

  app.post('/site-url', { preHandler: [guardOptionalSetup] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = siteUrlSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    await saveSiteUrl(parsed.data.siteUrl);
    return { siteUrl: parsed.data.siteUrl };
  });

  app.post('/site-url/check-dns', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = siteUrlSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    try {
      const url = new URL(parsed.data.siteUrl);
      const hostname = url.hostname;
      const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
      const v6Addresses = await dns.resolve6(hostname).catch(() => [] as string[]);
      const allAddresses = [...addresses, ...v6Addresses];
      if (allAddresses.length === 0) {
        return { success: false, error: `域名 ${hostname} 无法解析到任何 IP 地址` };
      }
      const os = await import('node:os');
      const localInterfaces = os.networkInterfaces();
      const localAddresses = new Set<string>();
      for (const ifs of Object.values(localInterfaces)) {
        if (!ifs) continue;
        for (const addr of ifs) {
          localAddresses.add(addr.address);
        }
      }
      localAddresses.add('127.0.0.1');
      localAddresses.add('::1');
      const matches = allAddresses.some((a) => localAddresses.has(a));
      return { success: true, hostname, addresses: allAddresses, matchesServer: matches };
    } catch (err: any) {
      return { success: false, error: err.message || 'DNS 解析失败' };
    }
  });

  app.post('/smtp', { preHandler: [guardOptionalSetup] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = smtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    const config: SmtpConfig = {
      host: parsed.data.host,
      port: parsed.data.port,
      user: parsed.data.user,
      password: parsed.data.password,
      from: parsed.data.from,
      secure: parsed.data.secure ?? false,
    };
    await saveSmtpConfig(config);
    return { success: true };
  });

  app.post('/smtp/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = smtpTestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    const data = parsed.data;
    let smtpOverride: SmtpConfig | undefined;
    if (data.host && data.port && data.user && data.password && data.from) {
      smtpOverride = {
        host: data.host,
        port: data.port,
        user: data.user,
        password: data.password,
        from: data.from,
        secure: data.secure ?? false,
      };
    }
    if (smtpOverride && !data.email) {
      const result = await testSmtpConnection(smtpOverride);
      if (!result.success) {
        return reply.status(500).send({ success: false, error: result.error });
      }
      return { success: true };
    }
    const result = await sendTestEmail(data.email, smtpOverride);
    if (!result.success) {
      return reply.status(500).send({ success: false, error: result.error });
    }
    return { success: true };
  });

  app.post('/verify-email', { preHandler: [guardOptionalSetup] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    await ensureDb();
    const result = await verifyEmail(parsed.data.code);
    if (!result.success) {
      return reply.status(400).send({ success: false, error: result.error });
    }
    return { success: true };
  });

  app.post('/admin/email', { preHandler: [guardOptionalSetup] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }
    await ensureDb();
    const db = getDb();
    const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    if (!admin) {
      return reply.status(400).send({ error: 'Admin not found' });
    }
    await db.update(users).set({ email: parsed.data.email }).where(eq(users.id, admin.id));
    return { success: true };
  });

  app.post('/verify-email/send', { preHandler: [guardOptionalSetup] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    await ensureDb();
    const result = await sendTestEmail(undefined);
    if (!result.success) {
      return reply.status(500).send({ success: false, error: result.error });
    }
    return { success: true };
  });

  /** 跳过可选步骤，显式完成初始化（需已有管理员） */
  app.post('/complete', async (_request: FastifyRequest, reply: FastifyReply) => {
    await ensureDb();
    const result = await completeSetup();
    if (!result.success) {
      return reply.status(400).send({ error: result.error || '完成初始化失败' });
    }
    return { success: true, initialized: true };
  });
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { config } from './config/index.js';
import { setupRoutes } from './routes/setup.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { twofaRoutes } from './routes/twofa.js';
import { teamRoutes, publicTeamRoutes } from './routes/team.js';
import { assignmentRoutes } from './routes/assignments.js';
import { providerRoutes } from './routes/providers.js';
import { domainRoutes } from './routes/domains.js';
import { snapshotRoutes } from './routes/snapshots.js';
import { logRoutes } from './routes/logs.js';
import { notificationRoutes } from './routes/notifications.js';
import { oauthRoutes } from './routes/oauth.js';
import { oauthConfigRoutes } from './routes/oauth-config.js';
import { importRoutes } from './routes/import.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { uptimeRoutes } from './routes/uptime.js';
import { speedtestRoutes } from './routes/speedtest.js';
import { monitorRoutes } from './routes/monitor.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { openApiRoutes } from './routes/open-api.js';
import { exportRoutes } from './routes/export.js';
import { backupRoutes } from './routes/backup.js';
import { healthCheck } from './routes/health.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { startExpiryCheckCron, startBackgroundJobs } from './lib/cron.js';
import { loadProviders } from './lib/oauth/providers/index.js';
import { ensureSchemaPatches } from './services/setup.js';
import { processOidcShortCallback } from './routes/oauth.js';
import { configureCache, initCacheFromEnv } from './lib/cache.js';
import { getTeamSettings } from './services/team.js';

const isProduction = config.NODE_ENV === 'production';

const app = Fastify({
  logger: true,
  bodyLimit: 5 * 1024 * 1024, // 5MB
});

// 安全响应头
await app.register(helmet, {
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  } : false,
});

// 全局速率限制
await app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
});

await app.register(cors, {
  origin: isProduction
    ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : false)
    : true,
  credentials: true,
});

await app.register(cookie, {
  secret: config.ENCRYPTION_KEY,
  parseOptions: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  },
});

await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

await app.register(fastifyStatic, {
  root: path.join(process.cwd(), 'uploads'),
  prefix: '/uploads/',
  decorateReply: false,
});

app.register(healthCheck);
app.register(setupRoutes, { prefix: '/api/setup' });
app.register(authRoutes, { prefix: '/api/auth' });
app.register(meRoutes, { prefix: '/api/auth' });
app.register(twofaRoutes, { prefix: '/api/2fa' });
app.register(teamRoutes, { prefix: '/api/team' });
app.register(publicTeamRoutes, { prefix: '/api/public' });
app.register(assignmentRoutes, { prefix: '/api/assignments' });
app.register(providerRoutes, { prefix: '/api/providers' });
app.register(domainRoutes, { prefix: '/api/domains' });
app.register(snapshotRoutes, { prefix: '/api/domains/:id/snapshots' });
app.register(logRoutes, { prefix: '/api/logs' });
app.register(notificationRoutes, { prefix: '/api/notifications' });
app.register(oauthRoutes, { prefix: '/api/auth/oauth' });
app.register(oauthConfigRoutes, { prefix: '/api/oauth' });
app.register(importRoutes, { prefix: '/api/import' });
app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  app.register(uptimeRoutes, { prefix: '/api/uptime' });
  app.register(speedtestRoutes, { prefix: '/api/speedtest' });
  app.register(monitorRoutes, { prefix: '/api/monitor' });
app.register(apiKeyRoutes, { prefix: '/api/api-keys' });
  app.register(openApiRoutes, { prefix: '/api/v1' });
  app.register(exportRoutes, { prefix: '/api/export' });
  app.register(backupRoutes, { prefix: '/api/backup' });

// OIDC 简洁重定向 URL：https://your-domain/oauth/oidc
app.get('/oauth/oidc', processOidcShortCallback);

// 全局错误处理
registerErrorHandler(app);

await loadProviders();

app.addHook('onReady', async () => {
  initCacheFromEnv();
  startExpiryCheckCron();
  // 已初始化实例补齐增量字段（如邮件通知开关）
  await ensureSchemaPatches();
  // 从团队设置中读取 Redis URL，若存在则启用 Redis 缓存
  try {
    const settings = await getTeamSettings();
    if (settings?.redisUrl) configureCache(settings.redisUrl);
  } catch {}
  startBackgroundJobs();
});

try {
  const host = isProduction ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ port: config.PORT, host });
  console.log(`DMHub server running on port ${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

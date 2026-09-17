import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { isRedisConnected } from '../lib/cache.js';

export async function healthCheck(app: FastifyInstance) {
  /**
   * 基础存活探针（Liveness Probe）
   * 供 Docker/K8s/负载均衡心跳检测，轻量极速
   */
  app.get('/api/health', async () => {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * 就绪探针（Readiness Probe）
   * 验证数据库实际可用性，数据库正常连通返回 200，否则返回 503
   */
  app.get('/api/health/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const db = getDb();
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      const latency = Date.now() - start;

      return {
        status: 'ready',
        database: {
          connected: true,
          latencyMs: latency,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      reply.status(503);
      return {
        status: 'unhealthy',
        database: {
          connected: false,
          error: err instanceof Error ? err.message : 'Database check failed',
        },
        timestamp: new Date().toISOString(),
      };
    }
  });

  /**
   * 安全与系统诊断接口（仅限管理员访问）
   * 提供系统负载、内存用量、缓存状态与安全基线检查
   */
  app.get(
    '/api/health/diagnostics',
    { preHandler: [authenticate, requireRole('admin')] },
    async () => {
      const memory = process.memoryUsage();
      const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

      let dbHealthy = false;
      let dbLatencyMs = 0;
      try {
        const db = getDb();
        const start = Date.now();
        await db.execute(sql`SELECT 1`);
        dbLatencyMs = Date.now() - start;
        dbHealthy = true;
      } catch {
        dbHealthy = false;
      }

      const redisActive = isRedisConnected();

      return {
        status: dbHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptimeSeconds: Math.floor(process.uptime()),
          memory: {
            rssMb: toMb(memory.rss),
            heapTotalMb: toMb(memory.heapTotal),
            heapUsedMb: toMb(memory.heapUsed),
            externalMb: toMb(memory.external),
          },
        },
        services: {
          database: {
            status: dbHealthy ? 'up' : 'down',
            latencyMs: dbLatencyMs,
          },
          cache: {
            backend: redisActive ? 'redis' : 'memory',
            connected: redisActive ? true : 'fallback-memory',
          },
        },
        securityPosture: {
          environment: config.NODE_ENV,
          isProduction: config.NODE_ENV === 'production',
          rateLimiting: 'enabled',
          securityHeaders: 'enabled',
          encryptionKeyConfigured: !!config.ENCRYPTION_KEY && config.ENCRYPTION_KEY !== 'default-key',
          jwtSecretConfigured: !!config.JWT_SECRET && config.JWT_SECRET !== 'default-secret',
        },
      };
    },
  );
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireDomainAccess } from '../middleware/domain-permission.js';
import {
  runMonitorCheck,
  getMonitorHistory,
  getMonitorSummary,
  setMonitorEnabled,
} from '../services/monitor.js';

export async function monitorRoutes(app: FastifyInstance) {
  // 全局监控概览（已登录用户）
  app.get('/summary', { preHandler: [authenticate] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const summary = await getMonitorSummary();
      return summary;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || '获取监控概览失败' });
    }
  });

  // 单域名监控历史
  app.get(
    '/:domainId/history',
    { preHandler: [authenticate, requireDomainAccess('domainId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { domainId } = request.params as { domainId: string };
      const { hours } = request.query as { hours?: string };
      const h = Math.min(Math.max(parseInt(hours || '24', 10) || 24, 1), 168);
      try {
        const history = await getMonitorHistory(domainId, h);
        return { history };
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || '获取监控历史失败' });
      }
    },
  );

  // 手动触发一次探测
  app.post(
    '/:domainId/check',
    { preHandler: [authenticate, requireDomainAccess('domainId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { domainId } = request.params as { domainId: string };
      try {
        const row = await runMonitorCheck(domainId);
        return row;
      } catch (err: any) {
        return reply.status(400).send({ error: err.message || '探测失败' });
      }
    },
  );

  // 开关监控（管理员）
  app.put(
    '/:domainId/enabled',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { domainId } = request.params as { domainId: string };
      const { enabled } = request.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        return reply.status(400).send({ error: '缺少 enabled 参数' });
      }
      try {
        await setMonitorEnabled(domainId, enabled);
        return { enabled };
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || '更新失败' });
      }
    },
  );
}

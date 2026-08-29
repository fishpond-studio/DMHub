import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { queryLogs, exportLogsCsv } from '../services/log.js';

export async function logRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const query = request.query as {
      action?: string;
      userId?: string;
      domainId?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      pageSize?: string;
    };

    const result = await queryLogs(request.user!.userId, request.user!.role, {
      action: query.action,
      userId: query.userId,
      domainId: query.domainId,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });

    return result;
  });

  /** 导出 CSV（最多 5000 条，沿用筛选条件） */
  app.get('/export', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      action?: string;
      userId?: string;
      domainId?: string;
      startDate?: string;
      endDate?: string;
    };

    const csv = await exportLogsCsv(request.user!.userId, request.user!.role, {
      action: query.action,
      userId: query.userId,
      domainId: query.domainId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const bom = '\uFEFF';
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="operation-logs-${Date.now()}.csv"`)
      .send(bom + csv);
  });
}

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { queryLogs } from '../services/log.js';

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
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  createAssignment,
  deleteAssignment,
  createAssignmentRequest,
  reviewAssignmentRequest,
  getMyDomains,
  getMemberAssignments,
  getAssignmentsOverview,
  getPendingRequests,
  getMyRequests,
  getAllDomains,
} from '../services/assignment.js';
import { createAssignmentSchema, createAssignmentRequestSchema } from '@dmhub/shared';

export async function assignmentRoutes(app: FastifyInstance) {
  app.post('/team/members/:id/assignments', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const parsed = createAssignmentSchema.safeParse({
      userId: id,
      domainId: body?.domainId,
      subdomainPattern: body?.subdomainPattern,
      permission: body?.permission,
    });
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    try {
      const result = await createAssignment(
        request.user!.userId,
        id,
        parsed.data,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/team/members/:id/assignments/:assignmentId', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { assignmentId } = request.params as { assignmentId: string };

    try {
      const result = await deleteAssignment(
        request.user!.userId,
        assignmentId,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/requests', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;

    const parsed = createAssignmentRequestSchema.safeParse({
      domainId: body?.domainId,
      subdomainPattern: body?.subdomainPattern,
      permission: body?.permission,
      reason: body?.reason,
    });
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join(', ') });
    }

    try {
      const result = await createAssignmentRequest(request.user!.userId, parsed.data);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/requests/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    if (!body?.action || !['approve', 'reject'].includes(body.action)) {
      return reply.status(400).send({ error: '操作必须是 approve 或 reject' });
    }

    try {
      const result = await reviewAssignmentRequest(
        request.user!.userId,
        id,
        {
          action: body.action,
          reviewComment: body.reviewComment,
          confirmed: body.confirmed,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/my/domains', { preHandler: [authenticate] }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const result = await getMyDomains(request.user!.userId, request.user!.role);
    return result;
  });

  app.get('/team/members/:id/assignments', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await getMemberAssignments(id);
    return result;
  });

  /** 管理员：全部指派 + 子域 DNS 状态总览 */
  app.get('/overview', { preHandler: [authenticate, requireRole('admin')] }, async () => {
    return getAssignmentsOverview();
  });

  app.get('/requests/pending', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const result = await getPendingRequests();
    return result;
  });

  app.get('/requests/mine', { preHandler: [authenticate] }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const result = await getMyRequests(request.user!.userId);
    return result;
  });

  app.get('/domains', { preHandler: [authenticate] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const result = await getAllDomains();
    return result;
  });
}

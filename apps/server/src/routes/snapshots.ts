import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireDomainAccess, requireDomainWriteAccess } from '../middleware/domain-permission.js';
import { createSnapshot, listSnapshots, getSnapshot, rollbackSnapshot, diffSnapshots } from '../services/snapshot.js';

export async function snapshotRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [authenticate, requireDomainWriteAccess('id')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { trigger?: string } | undefined;
    const trigger = (body?.trigger === 'scheduled' || body?.trigger === 'on_change') ? body.trigger : 'manual';
    try {
      const snapshot = await createSnapshot(id, request.user!.userId, trigger);
      return snapshot;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/diff', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to) {
      return reply.status(400).send({ error: '缺少 from 或 to 版本参数' });
    }
    const patterns = request.user!.role === 'admin'
      ? undefined
      : (request.domainAssignments ?? []).map((a) => a.subdomainPattern);
    try {
      const diff = await diffSnapshots(id, parseInt(query.from, 10), parseInt(query.to, 10), patterns);
      return diff;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const snapshots = await listSnapshots(id);
    return { snapshots };
  });

  app.get('/:snapshotId', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, snapshotId } = request.params as { id: string; snapshotId: string };
    const patterns = request.user!.role === 'admin'
      ? undefined
      : (request.domainAssignments ?? []).map((a) => a.subdomainPattern);
    const snapshot = await getSnapshot(id, snapshotId, patterns);
    if (!snapshot) {
      return reply.status(404).send({ error: '快照不存在' });
    }
    return snapshot;
  });

  app.post('/:snapshotId/rollback', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, snapshotId } = request.params as { id: string; snapshotId: string };
    try {
      const result = await rollbackSnapshot(request.user!.userId, id, snapshotId, request.ip, request.headers['user-agent']);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}

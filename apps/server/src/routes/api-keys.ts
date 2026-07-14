import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { generateApiKey, listApiKeys, revokeApiKey } from '../services/api-key.js';

export async function apiKeyRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { name?: string; permissions?: string[] };
    if (!body?.name) {
      return reply.status(400).send({ error: '缺少 name 参数' });
    }
    if (!body.permissions || !Array.isArray(body.permissions)) {
      return reply.status(400).send({ error: '缺少 permissions 参数' });
    }
    const validPermissions = ['domains:read', 'records:read', 'records:write', '*'];
    const invalid = body.permissions.filter((p: string) => !validPermissions.includes(p));
    if (invalid.length > 0) {
      return reply.status(400).send({ error: `无效的权限: ${invalid.join(', ')}` });
    }
    try {
      const result = await generateApiKey(request.user!.userId, body.name, body.permissions);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const keys = await listApiKeys();
    return { keys };
  });

  app.delete('/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await revokeApiKey(id);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}

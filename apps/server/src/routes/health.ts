import type { FastifyInstance } from 'fastify';

export async function healthCheck(app: FastifyInstance) {
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}

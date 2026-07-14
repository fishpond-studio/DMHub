import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import dns from 'dns';
import { authenticate } from '../middleware/auth.js';
import { requireDomainAccess } from '../middleware/domain-permission.js';
import { getDb } from '../db/index.js';
import { domains } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { isValidDomain } from '../lib/ssrf-guard.js';

export async function speedtestRoutes(app: FastifyInstance) {
  app.post('/dns/:domainId', { preHandler: [authenticate, requireDomainAccess('domainId')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const db = getDb();
    const [domain] = await db
      .select({ name: domains.name })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }

    const domainName = domain.name;
    const dnsServers = [
      { server: '8.8.8.8', label: 'Google DNS (8.8.8.8)' },
      { server: '1.1.1.1', label: 'Cloudflare DNS (1.1.1.1)' },
      { server: '223.5.5.5', label: '阿里 DNS (223.5.5.5)' },
    ];

    const results = await Promise.all(
      dnsServers.map(
        (entry) =>
          new Promise<{ server: string; label: string; time: number; answers: string[]; error?: string }>((resolve) => {
            const resolver = new dns.Resolver();
            resolver.setServers([entry.server]);
            const start = Date.now();
            resolver.resolve4(domainName, (err, addresses) => {
              const elapsed = Date.now() - start;
              if (err) {
                resolve({
                  server: entry.server,
                  label: entry.label,
                  time: elapsed,
                  answers: [],
                  error: err.message,
                });
              } else {
                resolve({
                  server: entry.server,
                  label: entry.label,
                  time: elapsed,
                  answers: addresses || [],
                });
              }
            });
          }),
      ),
    );

    return { results };
  });

  app.post('/http/:domainId', { preHandler: [authenticate, requireDomainAccess('domainId')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const db = getDb();
    const [domain] = await db
      .select({ name: domains.name })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }

    if (!isValidDomain(domain.name)) {
      return reply.status(400).send({ error: '域名格式无效' });
    }

    const url = `https://${domain.name}`;
    const start = Date.now();
    let ttfb = 0;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });

      ttfb = Date.now() - start;

      await response.arrayBuffer();
      clearTimeout(timeout);

      const totalTime = Date.now() - start;
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        ttfb,
        totalTime,
        statusCode: response.status,
        headers,
      };
    } catch {
      const totalTime = Date.now() - start;
      return {
        ttfb: ttfb || totalTime,
        totalTime,
        statusCode: 0,
        error: '连接失败',
      };
    }
  });
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * DMHub 生产级安全响应头与敏感接口防缓存中间件
 */
export function registerSecurityHeaders(app: FastifyInstance) {
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    // 移除潜在指纹信息
    reply.header('X-Powered-By', 'DMHub-Secure');
    reply.header('Server', 'DMHub');

    // 核心安全防护响应头
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

    // 针对 API 接口与鉴权路由禁用客户端与反向代理敏感数据缓存
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }
  });
}

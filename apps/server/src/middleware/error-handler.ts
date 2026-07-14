import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Zod 验证错误
    if (err instanceof ZodError) {
      const firstIssue = err.issues[0];
      return reply.status(400).send({
        error: firstIssue?.message || '参数验证失败',
        code: 1007,
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    // AppError
    if (err instanceof AppError) {
      return reply.status(err.httpStatus).send({
        error: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    // Fastify schema 验证错误
    if (err.validation) {
      return reply.status(400).send({
        error: err.message || '参数验证失败',
        code: 1007,
      });
    }

    // 速率限制
    if (err.statusCode === 429) {
      return reply.status(429).send({
        error: '请求过于频繁，请稍后再试',
        code: 1006,
      });
    }

    // 默认 500
    request.log.error(err);
    return reply.status(500).send({
      error: '服务器内部错误',
      code: 1000,
    });
  });

  // 404 处理
  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({
      error: '资源不存在',
      code: 1004,
    });
  });
}

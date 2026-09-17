import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth.js';
import { importDomainsCsv, importRecordsCsv, getDomainTemplate, getRecordTemplate, parseExcelToCsv } from '../services/import.js';
import { getDb } from '../db/index.js';
import { domains, domainAssignments } from '../db/schema.js';

export async function importRoutes(app: FastifyInstance) {
  app.post('/domains/csv', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: '请上传CSV文件' });
    }

    if (data.file && data.file.bytesRead > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'CSV文件不能超过10MB' });
    }

    const buffer = await data.toBuffer();
    const csvText = buffer.toString('utf-8');
    const result = await importDomainsCsv(
      request.user!.userId,
      csvText,
      request.ip,
      request.headers['user-agent'],
    );
    return result;
  });

  app.post('/records/csv', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { domainId?: string };
    const domainId = query.domainId;
    if (!domainId) {
      return reply.status(400).send({ error: '缺少 domainId' });
    }

    const db = getDb();

    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);
    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }

    if (request.user!.role !== 'admin') {
      const [assignment] = await db
        .select({ id: domainAssignments.id, permission: domainAssignments.permission })
        .from(domainAssignments)
        .where(and(eq(domainAssignments.userId, request.user!.userId), eq(domainAssignments.domainId, domainId)))
        .limit(1);
      if (!assignment || assignment.permission !== 'dns_edit') {
        return reply.status(403).send({ error: '无权操作该域名的DNS记录' });
      }
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: '请上传CSV文件' });
    }

    const buffer = await data.toBuffer();
    const csvText = buffer.toString('utf-8');
    const result = await importRecordsCsv(
      request.user!.userId,
      domainId,
      csvText,
      request.ip,
      request.headers['user-agent'],
      request.user!.role,
    );
    return result;
  });

  app.get('/template/domains', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="domains_template.csv"');
    return getDomainTemplate();
  });

  app.get('/template/records', { preHandler: [authenticate] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="records_template.csv"');
    return getRecordTemplate();
  });

  // Excel（.xlsx）导入域名
  app.post('/domains/excel', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: '请上传 Excel 文件' });
    }
    const buffer = await data.toBuffer();
    try {
      const csvText = await parseExcelToCsv(buffer);
      const result = await importDomainsCsv(request.user!.userId, csvText, request.ip, request.headers['user-agent']);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: 'Excel 解析失败：' + (err.message || '未知错误') });
    }
  });

  // Excel（.xlsx）导入解析记录
  app.post('/records/excel', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { domainId?: string };
    const domainId = query.domainId;
    if (!domainId) {
      return reply.status(400).send({ error: '缺少 domainId' });
    }
    const db = getDb();
    const [domain] = await db.select({ id: domains.id }).from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }
    if (request.user!.role !== 'admin') {
      const [assignment] = await db
        .select({ id: domainAssignments.id, permission: domainAssignments.permission })
        .from(domainAssignments)
        .where(and(eq(domainAssignments.userId, request.user!.userId), eq(domainAssignments.domainId, domainId)))
        .limit(1);
      if (!assignment || assignment.permission !== 'dns_edit') {
        return reply.status(403).send({ error: '无权操作该域名的DNS记录' });
      }
    }
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: '请上传 Excel 文件' });
    }
    const buffer = await data.toBuffer();
    try {
      const csvText = await parseExcelToCsv(buffer);
      const result = await importRecordsCsv(
        request.user!.userId,
        domainId,
        csvText,
        request.ip,
        request.headers['user-agent'],
        request.user!.role,
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: 'Excel 解析失败：' + (err.message || '未知错误') });
    }
  });
}

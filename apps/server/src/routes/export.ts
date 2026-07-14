import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireDomainAccess } from '../middleware/domain-permission.js';
import { getDb } from '../db/index.js';
import { domains, dnsRecords } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * RFC 5987 编码 Content-Disposition 文件名，防止中文文件名注入
 */
function encodeContentDisposition(filename: string): string {
  const safe = filename.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

function domainsToCsv(rows: any[]): string {
  const headers = ['name', 'provider_id', 'status', 'group_name', 'tags', 'expires_at', 'created_at'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((h) => {
      let v: any;
      if (h === 'group_name') v = row.groupName;
      else if (h === 'provider_id') v = row.providerId;
      else if (h === 'tags') v = Array.isArray(row.tags) ? row.tags.join(';') : '';
      else v = (row as any)[h];
      const s = v == null ? '' : String(v);
      let cell = s;
      // Prevent CSV formula injection
      if (/^[=+\-@\t\r]/.test(cell)) {
        cell = "'" + cell;
      }
      // CSV 转义：包含逗号/引号/换行时用双引号包裹
      if (/["\n,]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
      return cell;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

function recordsToCsv(rows: any[]): string {
  const headers = ['domain_id', 'record_type', 'name', 'value', 'ttl', 'priority', 'proxied', 'status', 'created_at'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((h) => {
      const v = (row as any)[h === 'domain_id' ? 'domainId' : h === 'record_type' ? 'recordType' : h];
      const s = v == null ? '' : String(v);
      if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

export async function exportRoutes(app: FastifyInstance) {
  // 导出域名列表（仅管理员）
  app.get('/domains', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { format?: string };
    const format = query.format ?? 'csv';
    const db = getDb();
    const rows = await db.select().from(domains);

    if (format === 'json') {
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', encodeContentDisposition('domains.json'));
      return reply.send(rows);
    }

    const csv = domainsToCsv(rows);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', encodeContentDisposition('domains.csv'));
    return reply.send(csv);
  });

  // 导出指定域名的 DNS 记录
  app.get('/dns-records/:domainId', { preHandler: [authenticate, requireDomainAccess('domainId')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    const query = request.query as { format?: string };
    const format = query.format ?? 'csv';
    const db = getDb();
    const rows = await db.select().from(dnsRecords).where(eq(dnsRecords.domainId, domainId));

    if (format === 'json') {
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', encodeContentDisposition('dns-records.json'));
      return reply.send(rows);
    }

    const csv = recordsToCsv(rows);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', encodeContentDisposition('dns-records.csv'));
    return reply.send(csv);
  });

  // 导出所有 DNS 记录（仅管理员）
  app.get('/dns-records', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { format?: string };
    const format = query.format ?? 'csv';
    const db = getDb();
    const rows = await db.select().from(dnsRecords);

    if (format === 'json') {
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', encodeContentDisposition('all-dns-records.json'));
      return reply.send(rows);
    }

    const csv = recordsToCsv(rows);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', encodeContentDisposition('all-dns-records.csv'));
    return reply.send(csv);
  });
}

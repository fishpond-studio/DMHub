import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { exportBackup, importBackup, type BackupPayload } from '../services/backup.js';
import { notifyAdmins } from '../services/notification.js';

export async function backupRoutes(app: FastifyInstance) {
  // 导出完整备份（JSON）
  app.get('/export', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await exportBackup(request.user!.userId);
      const filename = `dmhub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return payload;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || '备份导出失败' });
    }
  });

  // 导入备份（JSON 文件上传）
  app.post('/import', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: '请上传 JSON 备份文件' });
    }
    const buffer = await data.toBuffer();
    let payload: BackupPayload;
    try {
      payload = JSON.parse(buffer.toString('utf-8'));
    } catch {
      return reply.status(400).send({ error: '无效的 JSON 文件' });
    }
    if (payload.app !== 'dmhub' || !Array.isArray(payload.domains)) {
      return reply.status(400).send({ error: '备份文件格式不正确' });
    }
    try {
      const result = await importBackup(request.user!.userId, payload, request.ip, request.headers['user-agent']);
      await notifyAdmins('backup.restore', {
        title: '备份已恢复',
        content: `管理员恢复了一份备份：导入 ${result.domainsImported} 个域名、${result.recordsImported} 条记录。`,
        level: 'info',
        metadata: result,
      });
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || '备份恢复失败' });
    }
  });
}

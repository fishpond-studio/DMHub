import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domains, dnsRecords, providerConfigs } from '../db/schema.js';
import { createDomain } from './domain.js';
import { createRecord } from './dns-record.js';
import { logOperation } from '../lib/log.js';

interface CsvError {
  row: number;
  message: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: CsvError[];
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map(parseCsvLine);
}

export async function importDomainsCsv(
  userId: string,
  csvText: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<ImportResult> {
  const db = getDb();
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { imported: 0, skipped: 0, errors: [{ row: 0, message: 'CSV文件为空或缺少数据行' }] };
  }

  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const nameIdx = header.indexOf('domain_name');
  if (nameIdx === -1) {
    return { imported: 0, skipped: 0, errors: [{ row: 1, message: '缺少 domain_name 列' }] };
  }

  const providerConfigIdx = header.indexOf('provider_config_id');
  const expiresAtIdx = header.indexOf('expires_at');
  const tagsIdx = header.indexOf('tags');
  const groupNameIdx = header.indexOf('group_name');

  let imported = 0;
  let skipped = 0;
  const errors: CsvError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const name = row[nameIdx];

    if (!name) {
      errors.push({ row: rowNum, message: 'domain_name 不能为空' });
      continue;
    }

    try {
      const [existing] = await db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.name, name))
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      const input: {
        name: string;
        providerConfigId?: string;
        expiresAt?: string;
        tags?: string[];
        groupName?: string;
      } = { name };

      if (providerConfigIdx !== -1 && row[providerConfigIdx]) {
        const configId = row[providerConfigIdx];
        const [config] = await db
          .select({ id: providerConfigs.id })
          .from(providerConfigs)
          .where(eq(providerConfigs.id, configId))
          .limit(1);
        if (!config) {
          errors.push({ row: rowNum, message: `provider_config_id "${configId}" 不存在` });
          continue;
        }
        input.providerConfigId = configId;
      }

      if (expiresAtIdx !== -1 && row[expiresAtIdx]) {
        const dateVal = row[expiresAtIdx];
        const parsed = new Date(dateVal);
        if (isNaN(parsed.getTime())) {
          errors.push({ row: rowNum, message: `expires_at "${dateVal}" 格式无效` });
          continue;
        }
        input.expiresAt = dateVal;
      }

      if (tagsIdx !== -1 && row[tagsIdx]) {
        input.tags = row[tagsIdx].split(';').map((t) => t.trim()).filter(Boolean);
      }

      if (groupNameIdx !== -1 && row[groupNameIdx]) {
        input.groupName = row[groupNameIdx];
      }

      await createDomain(userId, input, ipAddress, userAgent);
      imported++;
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || '导入失败' });
    }
  }

  await logOperation({
    userId,
    action: 'import.domains',
    targetType: 'import',
    targetId: 'csv',
    detail: { imported, skipped, errorCount: errors.length },
    ipAddress,
    userAgent,
  });

  return { imported, skipped, errors };
}

export async function importRecordsCsv(
  userId: string,
  domainId: string,
  csvText: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<ImportResult> {
  const db = getDb();

  const [domain] = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);

  if (!domain) {
    return { imported: 0, skipped: 0, errors: [{ row: 0, message: '域名不存在' }] };
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { imported: 0, skipped: 0, errors: [{ row: 0, message: 'CSV文件为空或缺少数据行' }] };
  }

  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const typeIdx = header.indexOf('type');
  const nameIdx = header.indexOf('name');
  const valueIdx = header.indexOf('value');

  if (typeIdx === -1 || nameIdx === -1 || valueIdx === -1) {
    return { imported: 0, skipped: 0, errors: [{ row: 1, message: '缺少必要列: type, name, value' }] };
  }

  const ttlIdx = header.indexOf('ttl');
  const priorityIdx = header.indexOf('priority');
  const proxiedIdx = header.indexOf('proxied');

  const existingRecords = await db
    .select({ recordType: dnsRecords.recordType, name: dnsRecords.name })
    .from(dnsRecords)
    .where(eq(dnsRecords.domainId, domainId));

  const existingSet = new Set(existingRecords.map((r: { recordType: string; name: string }) => `${r.recordType}:${r.name}`));

  let imported = 0;
  let skipped = 0;
  const errors: CsvError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const type = typeIdx !== -1 ? row[typeIdx] : '';
    const name = nameIdx !== -1 ? row[nameIdx] : '';
    const value = valueIdx !== -1 ? row[valueIdx] : '';

    if (!type || !name || !value) {
      errors.push({ row: rowNum, message: 'type, name, value 不能为空' });
      continue;
    }

    const recordKey = `${type}:${name}`;
    if (existingSet.has(recordKey)) {
      skipped++;
      continue;
    }

    try {
      const input: {
        recordType: string;
        name: string;
        value: string;
        ttl?: number;
        priority?: number;
        proxied?: boolean;
      } = { recordType: type, name, value };

      if (ttlIdx !== -1 && row[ttlIdx]) {
        const ttlVal = parseInt(row[ttlIdx], 10);
        if (isNaN(ttlVal)) {
          errors.push({ row: rowNum, message: `ttl "${row[ttlIdx]}" 不是有效数字` });
          continue;
        }
        input.ttl = ttlVal;
      }

      if (priorityIdx !== -1 && row[priorityIdx]) {
        const priVal = parseInt(row[priorityIdx], 10);
        if (isNaN(priVal)) {
          errors.push({ row: rowNum, message: `priority "${row[priorityIdx]}" 不是有效数字` });
          continue;
        }
        input.priority = priVal;
      }

      if (proxiedIdx !== -1 && row[proxiedIdx]) {
        input.proxied = row[proxiedIdx].toLowerCase() === 'true' || row[proxiedIdx] === '1';
      }

      await createRecord(userId, domainId, input, ipAddress, userAgent);
      existingSet.add(recordKey);
      imported++;
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || '导入失败' });
    }
  }

  await logOperation({
    userId,
    domainId,
    action: 'import.records',
    targetType: 'import',
    targetId: 'csv',
    detail: { domainId, domainName: domain.name, imported, skipped, errorCount: errors.length },
    ipAddress,
    userAgent,
  });

  return { imported, skipped, errors };
}

export function getDomainTemplate(): string {
  return 'domain_name,provider_config_id,expires_at,tags,group_name\nexample.com,,2026-12-31,production;important,main\n';
}

export function getRecordTemplate(): string {
  return 'type,name,value,ttl,priority,proxied\nA,www,192.168.1.1,3600,,false\nCNAME,blog,example.com,3600,,false\nMX,@,mail.example.com,3600,10,false\nTXT,@,v=spf1 include:example.com ~all,3600,,false\n';
}

/** 将 Excel（.xlsx）第一个工作表解析为 CSV 文本，复用现有 CSV 导入管线 */
export async function parseExcelToCsv(buffer: Buffer): Promise<string> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return '';
  const lines: string[] = [];
  sheet.eachRow((row) => {
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value === null || cell.value === undefined ? '' : String(cell.value);
      const needsQuote = v.includes(',') || v.includes('"') || v.includes('\n');
      vals.push(needsQuote ? `"${v.replace(/"/g, '""')}"` : v);
    });
    lines.push(vals.join(','));
  });
  return lines.join('\n');
}

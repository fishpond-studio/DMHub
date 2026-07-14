import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名或邮箱'),
  password: z.string().min(1, '请输入密码'),
  rememberMe: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, '用户名至少3个字符')
      .max(64, '用户名最多64个字符')
      .regex(/^[a-zA-Z0-9_-]+$/, '用户名仅允许字母、数字、下划线和连字符'),
    email: z.string().email('邮箱格式不正确').optional().or(z.literal('')),
    password: z
      .string()
      .min(8, '密码至少8个字符')
      .max(128, '密码最多128个字符')
      .regex(/[a-z]/, '密码必须包含小写字母')
      .regex(/[A-Z]/, '密码必须包含大写字母')
      .regex(/[0-9]/, '密码必须包含数字'),
    confirmPassword: z.string().min(1, '请确认密码'),
    inviteCode: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const setupDatabaseSchema = z.object({
  dbType: z.enum(['postgresql', 'mariadb', 'mysql']),
  host: z.string().min(1, '请输入主机地址'),
  port: z.coerce.number().int().positive('端口必须为正整数'),
  username: z.string().min(1, '请输入用户名'),
  password: z.string(),
  database: z.string().min(1, '请输入数据库名'),
  redisUrl: z.string().optional().or(z.literal('')),
});

export type SetupDatabaseInput = z.infer<typeof setupDatabaseSchema>;

/** @deprecated 已废弃，保留兼容 */
export const setupTablePrefixSchema = z.object({
  prefix: z
    .string()
    .regex(/^[a-zA-Z]*$/, '前缀仅允许英文字母')
    .max(16, '前缀最多16个字符')
    .optional()
    .or(z.literal('')),
});

export type SetupTablePrefixInput = z.infer<typeof setupTablePrefixSchema>;

export const setupRegisterSchema = z
  .object({
    username: z
      .string()
      .min(3, '用户名至少3个字符')
      .max(64, '用户名最多64个字符')
      .regex(/^[a-zA-Z0-9_-]+$/, '用户名仅允许字母、数字、下划线和连字符'),
    password: z
      .string()
      .min(8, '密码至少8个字符')
      .max(128, '密码最多128个字符')
      .regex(/[a-z]/, '密码必须包含小写字母')
      .regex(/[A-Z]/, '密码必须包含大写字母')
      .regex(/[0-9]/, '密码必须包含数字'),
    confirmPassword: z.string().min(1, '请确认密码'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

export type SetupRegisterInput = z.infer<typeof setupRegisterSchema>;

export const setupSiteUrlSchema = z.object({
  siteUrl: z.string().url('请输入有效的URL').regex(/^https?:\/\//, 'URL必须以 http:// 或 https:// 开头'),
});

export type SetupSiteUrlInput = z.infer<typeof setupSiteUrlSchema>;

export const setupSmtpSchema = z.object({
  host: z.string().min(1, '请输入SMTP主机'),
  port: z.coerce.number().int().positive('端口必须为正整数'),
  user: z.string().min(1, '请输入SMTP用户名'),
  password: z.string().min(1, '请输入SMTP密码'),
  from: z.string().email('请输入有效的发件邮箱'),
  secure: z.boolean().optional(),
});

export type SetupSmtpInput = z.infer<typeof setupSmtpSchema>;

export const createDomainSchema = z.object({
  name: z.string().min(1, '请输入域名'),
  providerConfigId: z.string().uuid().optional(),
  expiresAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  groupName: z.string().optional(),
});

export type CreateDomainInput = z.infer<typeof createDomainSchema>;

const dnsRecordBaseSchema = z.object({
  recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']),
  name: z.string().min(1, '请输入主机记录'),
  value: z.string().min(1, '请输入记录值'),
  ttl: z.coerce.number().int().positive().default(3600),
  priority: z.number().int().optional(),
  proxied: z.boolean().optional(),
});

export const createDnsRecordSchema = dnsRecordBaseSchema.superRefine((data, ctx) => {
  const { recordType, value } = data;

  switch (recordType) {
    case 'A': {
      const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const match = value.match(ipv4Regex);
      if (!match) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A记录的值必须是有效的IPv4地址', path: ['value'] });
        break;
      }
      const octets = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
      if (octets.some((o) => o > 255)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'IPv4地址的每个段必须在0-255之间', path: ['value'] });
      }
      break;
    }
    case 'AAAA': {
      const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^([0-9a-fA-F]{1,4}:)*:([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
      if (!ipv6Regex.test(value) && value !== '::') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AAAA记录的值必须是有效的IPv6地址', path: ['value'] });
      }
      break;
    }
    case 'CNAME':
    case 'NS': {
      const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\.?$/;
      if (!domainRegex.test(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${recordType}记录的值必须是有效的域名`, path: ['value'] });
      }
      break;
    }
    case 'MX': {
      const parts = value.split(/\s+/);
      if (parts.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MX记录格式：优先级 域名（如 10 mail.example.com）', path: ['value'] });
      } else {
        const priority = parseInt(parts[0]);
        if (isNaN(priority) || priority < 0 || priority > 65535) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MX优先级必须是0-65535之间的整数', path: ['value'] });
        }
      }
      break;
    }
    case 'TXT': {
      if (value.length > 2048) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'TXT记录值不能超过2048个字符', path: ['value'] });
      }
      break;
    }
    case 'SRV': {
      const parts = value.split(/\s+/);
      if (parts.length < 4) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SRV记录格式：优先级 权重 端口 目标', path: ['value'] });
      } else {
        const weight = parseInt(parts[1]);
        const port = parseInt(parts[2]);
        if (isNaN(weight) || weight < 0 || weight > 65535) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SRV权重必须是0-65535之间的整数', path: ['value'] });
        }
        if (isNaN(port) || port < 1 || port > 65535) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SRV端口必须是1-65535之间的整数', path: ['value'] });
        }
      }
      break;
    }
    case 'CAA': {
      const parts = value.split(/\s+/);
      if (parts.length < 3) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CAA记录格式：flag tag value（如 0 issue "ca.example.com"）', path: ['value'] });
      } else {
        const flag = parseInt(parts[0]);
        if (isNaN(flag) || flag < 0 || flag > 255) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CAA flag必须是0-255之间的整数', path: ['value'] });
        }
      }
      break;
    }
  }
});

export type CreateDnsRecordInput = z.infer<typeof createDnsRecordSchema>;

export const updateDnsRecordSchema = dnsRecordBaseSchema.partial();

export type UpdateDnsRecordInput = z.infer<typeof updateDnsRecordSchema>;

export const createInviteCodeSchema = z.object({
  maxUses: z.coerce.number().int().min(0).default(0),
  expiresAt: z.string().optional(),
});

export type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>;

export const createAssignmentSchema = z.object({
  userId: z.string().uuid(),
  domainId: z.string().uuid(),
  subdomainPattern: z.string().default('*'),
  permission: z.enum(['dns_edit', 'dns_readonly']).default('dns_edit'),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const createAssignmentRequestSchema = z.object({
  domainId: z.string().uuid(),
  subdomainPattern: z.string().default('*'),
  permission: z.enum(['dns_edit', 'dns_readonly']).default('dns_edit'),
  reason: z.string().min(1, '请填写申请理由'),
});

export type CreateAssignmentRequestInput = z.infer<typeof createAssignmentRequestSchema>;

export const providerConfigSchema = z.object({
  providerId: z.enum(['cloudflare', 'aliyun', 'tencent']),
  name: z.string().min(1, '请输入配置名称'),
  credentials: z.record(z.string()),
});

export type ProviderConfigInput = z.infer<typeof providerConfigSchema>;

export const notificationConfigSchema = z.object({
  channel: z.enum(['web', 'dingtalk', 'feishu', 'email', 'webhook']),
  name: z.string().min(1, '请输入配置名称'),
  config: z.record(z.unknown()),
  events: z.array(z.string()).min(1, '请选择至少一个事件'),
  enabled: z.boolean().default(true),
});

export type NotificationConfigInput = z.infer<typeof notificationConfigSchema>;

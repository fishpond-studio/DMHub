export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY = '7d';
export const JWT_2FA_EXPIRY = '5m';

export const BACKUP_CODE_COUNT = 8;
export const BACKUP_CODE_FORMAT = 'XXXX-XXXX';

export const INVITE_CODE_LENGTH_MIN = 6;
export const INVITE_CODE_LENGTH_MAX = 8;

export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_EXPIRY_MINUTES = 5;

export const DEFAULT_EXPIRY_REMIND_DAYS = [30, 14, 7, 3, 1, 0];

export const LOGO_MAX_SIZE_BYTES = 1024 * 1024;
export const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

export const DNS_RECORD_TYPES = [
  { type: 'A', label: 'A', description: '将域名指向 IPv4 地址', example: '192.168.1.1' },
  { type: 'AAAA', label: 'AAAA', description: '将域名指向 IPv6 地址', example: '2001:db8::1' },
  { type: 'CNAME', label: 'CNAME', description: '将域名指向另一个域名', example: 'example.com' },
  { type: 'MX', label: 'MX', description: '邮件交换记录，指向邮件服务器', example: 'mail.example.com' },
  { type: 'TXT', label: 'TXT', description: '文本记录，常用于域名验证、SPF', example: 'v=spf1 include:...' },
  { type: 'NS', label: 'NS', description: '域名服务器记录', example: 'ns1.example.com' },
  { type: 'SRV', label: 'SRV', description: '服务记录，指定服务的端口', example: '10 60 5060 sip.example.com' },
  { type: 'CAA', label: 'CAA', description: '证书颁发机构授权', example: '0 issue "letsencrypt.org"' },
] as const;

export const SMTP_PRESETS = [
  { name: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, note: '需使用授权码' },
  { name: '163 邮箱', host: 'smtp.163.com', port: 465, note: '需使用授权码' },
  { name: '网易企业邮箱', host: 'smtphz.qiye.163.com', port: 465, note: '需在 WebMail 设置-邮箱设置-客户端授权密码中生成授权码' },
  { name: '阿里云邮箱（个人）', host: 'smtp.aliyun.com', port: 465, note: '2018年已停止个人邮箱新用户注册，需使用授权码' },
  { name: '阿里云邮箱（企业）', host: 'smtp.qiye.aliyun.com', port: 465, note: '企业版邮箱，也可使用 smtp.您的域名' },
  { name: '飞书邮箱', host: 'smtp.feishu.cn', port: 465, note: '需在飞书客户端生成第三方专用密码：设置 > 邮箱 > 第三方邮箱客户端登录' },
  { name: 'iCloud', host: 'smtp.mail.me.com', port: 587, note: '需在 appleid.apple.com 生成 App 专用密码，适用于 @icloud.com/@me.com/@mac.com' },
  { name: 'Gmail', host: 'smtp.gmail.com', port: 587, note: '需开启应用专用密码，可能需要特殊网络环境' },
  { name: 'Outlook/Office365', host: 'smtp.office365.com', port: 587, note: '' },
] as const;

export const TOAST_AUTO_CLOSE_MS = 120_000;

export const EXPIRY_CHECK_CRON = '0 8 * * *';

/** 通知事件枚举：前后端共用，确保订阅配置项一致 */
export interface NotificationEventDef {
  event: string;
  label: string;
  level: 'info' | 'warning' | 'critical';
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  { event: 'domain.expiring', label: '域名即将到期', level: 'warning' },
  { event: 'domain.expired', label: '域名已过期', level: 'critical' },
  { event: 'ssl.expiring', label: '证书即将过期', level: 'warning' },
  { event: 'ssl.expired', label: '证书已过期', level: 'critical' },
  { event: 'monitor.down', label: '域名不可用', level: 'critical' },
  { event: 'monitor.up', label: '域名已恢复', level: 'info' },
  { event: 'record.created', label: '解析记录创建', level: 'info' },
  { event: 'record.updated', label: '解析记录修改', level: 'info' },
  { event: 'record.deleted', label: '解析记录删除', level: 'info' },
  { event: 'member.joined', label: '新成员加入', level: 'info' },
  { event: 'member.removed', label: '成员移除', level: 'warning' },
  { event: 'member.role_changed', label: '角色变更', level: 'info' },
  { event: 'member.status_changed', label: '成员状态变更', level: 'info' },
  { event: 'assignment.requested', label: '指派申请提交', level: 'info' },
  { event: 'assignment.approved', label: '指派申请通过', level: 'info' },
  { event: 'assignment.rejected', label: '指派申请拒绝', level: 'warning' },
  { event: 'login.suspicious', label: '异常登录', level: 'warning' },
  { event: 'team_settings.updated', label: '团队设置变更', level: 'info' },
  { event: 'oauth_provider.deleted', label: 'OAuth 提供商删除', level: 'warning' },
  { event: 'dns_provider.deleted', label: 'DNS 服务商删除', level: 'warning' },
  { event: 'admin_reset.requested', label: '备用码重置请求', level: 'warning' },
  { event: 'notification.update', label: '通知配置变更', level: 'info' },
];

export const NOTIFICATION_EVENT_VALUES = NOTIFICATION_EVENTS.map((e) => e.event);

export * from './error-codes.js';
export * from './dns-templates.js';

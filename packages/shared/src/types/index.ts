export type UserRole = 'admin' | 'member' | 'guest';

export type UserStatus = 'active' | 'disabled';

export type TwoFactorMethod = 'totp' | 'passkey' | 'email';

export type DomainStatus = 'active' | 'expired' | 'transferred';

export type DnsRecordStatus = 'active';

export type DnsRecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'NS'
  | 'SRV'
  | 'CAA';

export type AssignmentPermission = 'dns_edit' | 'dns_readonly';

export type AssignmentRequestStatus = 'pending' | 'approved' | 'rejected';

export type NotificationChannel = 'web' | 'dingtalk' | 'feishu' | 'email' | 'webhook';

export type NotificationLevel = 'info' | 'warning' | 'critical';

export type OperationAction =
  | 'domain.add'
  | 'domain.delete'
  | 'record.create'
  | 'record.update'
  | 'record.delete'
  | 'member.invite'
  | 'member.remove'
  | 'member.role_change'
  | 'team_settings.update'
  | 'provider.config'
  | 'notification.update'
  | 'login'
  | 'login_2fa';

export type SnapshotTrigger = 'scheduled' | 'manual' | 'on_change';

export type DatabaseType = 'postgresql' | 'mariadb' | 'mysql';

export type DnsProviderId = 'cloudflare' | 'aliyun' | 'tencent';

export interface User {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string | null;
  displayName: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  role: UserRole;
  twoFactorEnabled: boolean;
  twoFactorMethods: TwoFactorMethod[];
  emailVerified: boolean;
  notificationsEnabled: boolean;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamSettings {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  defaultRole: UserRole;
  initialized: boolean;
  siteUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean | null;
  inviteCodeEnabled: boolean;
  registrationEnabled: boolean;
  announcement: string | null;
  announcementFormat: string | null;
  landingSubtitle: string | null;
  landingBackgroundUrl: string | null;
  footerContent: string | null;
  footerFormat: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Domain {
  id: string;
  name: string;
  providerId: DnsProviderId | null;
  providerDomainId: string | null;
  providerConfigId: string | null;
  expiresAt: Date | null;
  tags: string[];
  groupName: string | null;
  status: DomainStatus;
  autoCheckExpiry: boolean;
  expiryRemindDays: number[];
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DnsRecord {
  id: string;
  domainId: string;
  recordType: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  proxied: boolean;
  providerRecordId: string | null;
  snapshotVersion: number;
  status: DnsRecordStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationLog {
  id: string;
  userId: string;
  domainId: string | null;
  action: OperationAction;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface NotificationConfig {
  id: string;
  channel: NotificationChannel;
  name: string;
  config: Record<string, unknown>;
  events: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderConfig {
  id: string;
  providerId: DnsProviderId;
  name: string;
  credentials: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainAssignment {
  id: string;
  domainId: string;
  userId: string;
  subdomainPattern: string;
  permission: AssignmentPermission;
  assignedBy: string;
  createdAt: Date;
}

export interface DomainAssignmentRequest {
  id: string;
  domainId: string;
  userId: string;
  subdomainPattern: string;
  permission: AssignmentPermission;
  reason: string;
  status: AssignmentRequestStatus;
  reviewedBy: string | null;
  reviewComment: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface InviteCode {
  id: string;
  code: string;
  maxUses: number;
  currentUses: number;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export interface BackupCode {
  id: string;
  userId: string;
  codeHash: string;
  codeIndex: number;
  used: boolean;
  usedAt: Date | null;
  createdAt: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  deviceInfo: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface SetupStatus {
  initialized: boolean;
  step?: number;
}

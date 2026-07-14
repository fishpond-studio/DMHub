import { mysqlTable, varchar, boolean, int, text, timestamp, json, varbinary } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const uuidPk = () =>
  varchar('id', { length: 36 }).primaryKey().$defaultFn(() => randomUUID());

const uuidCol = (name: string) => varchar(name, { length: 36 });

const ts = (name: string) => timestamp(name, { fsp: 3 });

const tsNow = (name: string) =>
  timestamp(name, { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);

export const users = mysqlTable('users', {
  id: uuidPk(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  displayName: varchar('display_name', { length: 128 }),
  nickname: varchar('nickname', { length: 64 }),
  avatarUrl: varchar('avatar_url', { length: 512 }),
  role: varchar('role', { length: 16 }).notNull().default('member'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorMethods: json('two_factor_methods').$type<string[]>().notNull().default([]),
  emailVerified: boolean('email_verified').notNull().default(false),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const teamSettings = mysqlTable('team_settings', {
  id: int('id').primaryKey().default(1),
  name: varchar('name', { length: 128 }),
  description: text('description'),
  logoUrl: varchar('logo_url', { length: 512 }),
  defaultRole: varchar('default_role', { length: 16 }).notNull().default('member'),
  initialized: boolean('initialized').notNull().default(false),
  siteUrl: varchar('site_url', { length: 512 }),
  smtpHost: varchar('smtp_host', { length: 255 }),
  smtpPort: int('smtp_port'),
  smtpUser: varchar('smtp_user', { length: 255 }),
  smtpPassword: varchar('smtp_password', { length: 255 }),
  smtpFrom: varchar('smtp_from', { length: 255 }),
  smtpSecure: boolean('smtp_secure').default(false),
  dbType: varchar('db_type', { length: 32 }),
  dbHost: varchar('db_host', { length: 255 }),
  dbPort: int('db_port'),
  dbUsername: varchar('db_username', { length: 255 }),
  dbPassword: varchar('db_password', { length: 255 }),
  dbName: varchar('db_name', { length: 255 }),
  tablePrefix: varchar('table_prefix', { length: 16 }),
  redisUrl: varchar('redis_url', { length: 512 }),
  uptimePushUrl: varchar('uptime_push_url', { length: 512 }),
  inviteCodeEnabled: boolean('invite_code_enabled').notNull().default(true),
  registrationEnabled: boolean('registration_enabled').notNull().default(true),
  announcement: text('announcement'),
  announcementFormat: varchar('announcement_format', { length: 16 }).default('markdown'),
  landingSubtitle: varchar('landing_subtitle', { length: 512 }),
  landingBackgroundUrl: varchar('landing_background_url', { length: 512 }),
  footerContent: text('footer_content'),
  footerFormat: varchar('footer_format', { length: 16 }).default('markdown'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const domains = mysqlTable('domains', {
  id: uuidPk(),
  name: varchar('name', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 32 }),
  providerDomainId: varchar('provider_domain_id', { length: 255 }),
  providerConfigId: uuidCol('provider_config_id'),
  expiresAt: ts('expires_at'),
  tags: json('tags').$type<string[]>().default([]),
  groupName: varchar('group_name', { length: 64 }),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  autoCheckExpiry: boolean('auto_check_expiry').notNull().default(true),
  expiryRemindDays: json('expiry_remind_days').$type<number[]>().notNull().default([30, 14, 7, 3, 1, 0]),
  lastCheckedAt: ts('last_checked_at'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const dnsRecords = mysqlTable('dns_records', {
  id: uuidPk(),
  domainId: uuidCol('domain_id').notNull(),
  recordType: varchar('record_type', { length: 16 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  value: text('value').notNull(),
  ttl: int('ttl').notNull().default(3600),
  priority: int('priority'),
  proxied: boolean('proxied').notNull().default(false),
  providerRecordId: varchar('provider_record_id', { length: 255 }),
  snapshotVersion: int('snapshot_version').notNull().default(0),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const operationLogs = mysqlTable('operation_logs', {
  id: uuidPk(),
  userId: uuidCol('user_id').notNull(),
  domainId: uuidCol('domain_id'),
  action: varchar('action', { length: 64 }).notNull(),
  targetType: varchar('target_type', { length: 32 }).notNull(),
  targetId: varchar('target_id', { length: 255 }).notNull(),
  detail: json('detail'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  createdAt: tsNow('created_at'),
});

export const notificationConfigs = mysqlTable('notification_configs', {
  id: uuidPk(),
  channel: varchar('channel', { length: 32 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  config: json('config').notNull().default({}),
  events: json('events').$type<string[]>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const providerConfigs = mysqlTable('provider_configs', {
  id: uuidPk(),
  providerId: varchar('provider_id', { length: 32 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  credentials: json('credentials').notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const userOauthBindings = mysqlTable('user_oauth_bindings', {
  id: uuidPk(),
  userId: uuidCol('user_id').notNull(),
  providerId: varchar('provider_id', { length: 32 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  providerName: varchar('provider_name', { length: 128 }),
  providerAvatar: varchar('provider_avatar', { length: 512 }),
  rawData: json('raw_data'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const userTotpSeeds = mysqlTable('user_totp_seeds', {
  id: uuidPk(),
  userId: uuidCol('user_id').notNull().unique(),
  secretEncrypted: text('secret_encrypted').notNull(),
  verified: boolean('verified').notNull().default(false),
  createdAt: tsNow('created_at'),
});

export const userPasskeys = mysqlTable('user_passkeys', {
  id: uuidPk(),
  userId: uuidCol('user_id').notNull(),
  credentialId: varbinary('credential_id', { length: 1024 }).notNull().unique(),
  publicKey: varbinary('public_key', { length: 2048 }).notNull(),
  counter: int('counter').notNull().default(0),
  deviceType: varchar('device_type', { length: 32 }),
  backedUp: boolean('backed_up').default(false),
  transports: json('transports').$type<string[]>().default([]),
  deviceName: varchar('device_name', { length: 128 }),
  createdAt: tsNow('created_at'),
  lastUsedAt: ts('last_used_at'),
});

export const backupCodes = mysqlTable('backup_codes', {
  id: uuidPk(),
  userId: uuidCol('user_id').notNull(),
  codeHash: varchar('code_hash', { length: 255 }).notNull(),
  codeIndex: int('code_index').notNull(),
  used: boolean('used').notNull().default(false),
  usedAt: ts('used_at'),
  createdAt: tsNow('created_at'),
});

export const inviteCodes = mysqlTable('invite_codes', {
  id: uuidPk(),
  code: varchar('code', { length: 16 }).notNull().unique(),
  maxUses: int('max_uses').notNull().default(0),
  currentUses: int('current_uses').notNull().default(0),
  expiresAt: ts('expires_at'),
  createdBy: uuidCol('created_by').notNull(),
  createdAt: tsNow('created_at'),
});

export const domainAssignments = mysqlTable('domain_assignments', {
  id: uuidPk(),
  domainId: uuidCol('domain_id').notNull(),
  userId: uuidCol('user_id').notNull(),
  subdomainPattern: varchar('subdomain_pattern', { length: 255 }).notNull().default('*'),
  permission: varchar('permission', { length: 16 }).notNull().default('dns_edit'),
  assignedBy: uuidCol('assigned_by').notNull(),
  createdAt: tsNow('created_at'),
});

export const domainAssignmentRequests = mysqlTable('domain_assignment_requests', {
  id: uuidPk(),
  domainId: uuidCol('domain_id').notNull(),
  userId: uuidCol('user_id').notNull(),
  subdomainPattern: varchar('subdomain_pattern', { length: 255 }).notNull().default('*'),
  permission: varchar('permission', { length: 16 }).notNull().default('dns_edit'),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  reviewedBy: uuidCol('reviewed_by'),
  reviewComment: text('review_comment'),
  createdAt: tsNow('created_at'),
  reviewedAt: ts('reviewed_at'),
});

export const dnsSnapshots = mysqlTable('dns_snapshots', {
  id: uuidPk(),
  domainId: uuidCol('domain_id').notNull(),
  version: int('version').notNull(),
  records: json('records').notNull().default([]),
  trigger: varchar('trigger', { length: 32 }).notNull(),
  createdBy: uuidCol('created_by'),
  createdAt: tsNow('created_at'),
});

export const oauthProviders = mysqlTable('oauth_providers', {
  id: uuidPk(),
  providerId: varchar('provider_id', { length: 32 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  clientId: varchar('client_id', { length: 512 }).notNull(),
  clientSecret: varchar('client_secret', { length: 512 }).notNull(),
  scope: varchar('scope', { length: 256 }),
  customAuthorizeUrl: varchar('custom_authorize_url', { length: 512 }),
  customTokenUrl: varchar('custom_token_url', { length: 512 }),
  customUserInfoUrl: varchar('custom_user_info_url', { length: 512 }),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const apiKeys = mysqlTable('api_keys', {
  id: uuidPk(),
  name: varchar('name', { length: 128 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
  permissions: json('permissions').$type<string[]>().notNull(),
  lastUsedAt: ts('last_used_at'),
  expiresAt: ts('expires_at'),
  createdById: uuidCol('created_by_id').notNull(),
  createdAt: tsNow('created_at'),
});

export const refreshTokens = mysqlTable('refresh_tokens', {
  id: uuidPk(),
  userId: uuidCol('user_id').notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  deviceInfo: varchar('device_info', { length: 255 }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: tsNow('created_at'),
});

export const userTokens = mysqlTable('user_tokens', {
  id: uuidPk(),
  name: varchar('name', { length: 128 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
  permissions: json('permissions').$type<string[]>().notNull(),
  userId: uuidCol('user_id').notNull(),
  lastUsedAt: ts('last_used_at'),
  expiresAt: ts('expires_at'),
  createdAt: tsNow('created_at'),
});

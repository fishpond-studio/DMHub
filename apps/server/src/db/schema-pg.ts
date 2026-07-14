import { pgTable, uuid, varchar, boolean, integer, text, timestamp, jsonb, customType } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: Buffer) {
    return value;
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  displayName: varchar('display_name', { length: 128 }),
  nickname: varchar('nickname', { length: 64 }),
  avatarUrl: varchar('avatar_url', { length: 512 }),
  role: varchar('role', { length: 16 }).notNull().default('member'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorMethods: varchar('two_factor_methods', { length: 64 }).array().notNull().default([]),
  emailVerified: boolean('email_verified').notNull().default(false),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamSettings = pgTable('team_settings', {
  id: integer('id').primaryKey().default(1),
  name: varchar('name', { length: 128 }),
  description: text('description'),
  logoUrl: varchar('logo_url', { length: 512 }),
  defaultRole: varchar('default_role', { length: 16 }).notNull().default('member'),
  initialized: boolean('initialized').notNull().default(false),
  siteUrl: varchar('site_url', { length: 512 }),
  smtpHost: varchar('smtp_host', { length: 255 }),
  smtpPort: integer('smtp_port'),
  smtpUser: varchar('smtp_user', { length: 255 }),
  smtpPassword: varchar('smtp_password', { length: 255 }),
  smtpFrom: varchar('smtp_from', { length: 255 }),
  smtpSecure: boolean('smtp_secure').default(false),
  dbType: varchar('db_type', { length: 32 }),
  dbHost: varchar('db_host', { length: 255 }),
  dbPort: integer('db_port'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 32 }),
  providerDomainId: varchar('provider_domain_id', { length: 255 }),
  providerConfigId: uuid('provider_config_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  tags: varchar('tags', { length: 32 }).array().default([]),
  groupName: varchar('group_name', { length: 64 }),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  autoCheckExpiry: boolean('auto_check_expiry').notNull().default(true),
  expiryRemindDays: integer('expiry_remind_days').array().notNull().default([30, 14, 7, 3, 1, 0]),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dnsRecords = pgTable('dns_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id').notNull(),
  recordType: varchar('record_type', { length: 16 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  value: text('value').notNull(),
  ttl: integer('ttl').notNull().default(3600),
  priority: integer('priority'),
  proxied: boolean('proxied').notNull().default(false),
  providerRecordId: varchar('provider_record_id', { length: 255 }),
  snapshotVersion: integer('snapshot_version').notNull().default(0),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const operationLogs = pgTable('operation_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  domainId: uuid('domain_id'),
  action: varchar('action', { length: 64 }).notNull(),
  targetType: varchar('target_type', { length: 32 }).notNull(),
  targetId: varchar('target_id', { length: 255 }).notNull(),
  detail: jsonb('detail'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 512 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationConfigs = pgTable('notification_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: varchar('channel', { length: 32 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  config: jsonb('config').notNull().default({}),
  events: varchar('events', { length: 32 }).array().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const providerConfigs = pgTable('provider_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: varchar('provider_id', { length: 32 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  credentials: jsonb('credentials').notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userOauthBindings = pgTable('user_oauth_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  providerId: varchar('provider_id', { length: 32 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  providerName: varchar('provider_name', { length: 128 }),
  providerAvatar: varchar('provider_avatar', { length: 512 }),
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userTotpSeeds = pgTable('user_totp_seeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(),
  secretEncrypted: text('secret_encrypted').notNull(),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userPasskeys = pgTable('user_passkeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  credentialId: bytea('credential_id').notNull().unique(),
  publicKey: bytea('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  deviceType: varchar('device_type', { length: 32 }),
  backedUp: boolean('backed_up').default(false),
  transports: varchar('transports', { length: 16 }).array().default([]),
  deviceName: varchar('device_name', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export const backupCodes = pgTable('backup_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  codeHash: varchar('code_hash', { length: 255 }).notNull(),
  codeIndex: integer('code_index').notNull(),
  used: boolean('used').notNull().default(false),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inviteCodes = pgTable('invite_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 16 }).notNull().unique(),
  maxUses: integer('max_uses').notNull().default(0),
  currentUses: integer('current_uses').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const domainAssignments = pgTable('domain_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id').notNull(),
  userId: uuid('user_id').notNull(),
  subdomainPattern: varchar('subdomain_pattern', { length: 255 }).notNull().default('*'),
  permission: varchar('permission', { length: 16 }).notNull().default('dns_edit'),
  assignedBy: uuid('assigned_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const domainAssignmentRequests = pgTable('domain_assignment_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id').notNull(),
  userId: uuid('user_id').notNull(),
  subdomainPattern: varchar('subdomain_pattern', { length: 255 }).notNull().default('*'),
  permission: varchar('permission', { length: 16 }).notNull().default('dns_edit'),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  reviewedBy: uuid('reviewed_by'),
  reviewComment: text('review_comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
});

export const dnsSnapshots = pgTable('dns_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id').notNull(),
  version: integer('version').notNull(),
  records: jsonb('records').notNull().default([]),
  trigger: varchar('trigger', { length: 32 }).notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthProviders = pgTable('oauth_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  providerId: varchar('provider_id', { length: 32 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  clientId: varchar('client_id', { length: 512 }).notNull(),
  clientSecret: varchar('client_secret', { length: 512 }).notNull(),
  scope: varchar('scope', { length: 256 }),
  customAuthorizeUrl: varchar('custom_authorize_url', { length: 512 }),
  customTokenUrl: varchar('custom_token_url', { length: 512 }),
  customUserInfoUrl: varchar('custom_user_info_url', { length: 512 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
  permissions: varchar('permissions', { length: 64 }).array().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdById: uuid('created_by_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  deviceInfo: varchar('device_info', { length: 255 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userTokens = pgTable('user_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
  permissions: varchar('permissions', { length: 64 }).array().notNull(),
  userId: uuid('user_id').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

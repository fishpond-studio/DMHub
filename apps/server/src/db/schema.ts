/**
 * Schema 动态选择层。
 *
 * 根据环境变量 DB_TYPE 在 module 加载时决定使用 PostgreSQL 还是 MySQL/MariaDB schema。
 * 业务代码无需改动 import 路径；类型签名以 PG schema 为基准，运行时切到对应方言对象。
 *
 * 注意：dbType 切换后**必须重启 server**，因为 schema 在 module 加载时确定，不可热切换。
 * 引导流程中切换 dbType 会在 setup-state.json 标记，下次启动时生效。
 */
import * as pgSchema from './schema-pg.js';
import * as mysqlSchema from './schema-mysql.js';
import { readSetupState } from '../lib/setup-state.js';

function resolveDbType(): 'postgresql' | 'mysql' | 'mariadb' {
  const env = (process.env.DB_TYPE || '').toLowerCase();
  if (env === 'mysql' || env === 'mariadb' || env === 'postgresql') {
    return env;
  }
  try {
    const state = readSetupState();
    const fromState = state.dbConfig?.dbType?.toLowerCase();
    if (fromState === 'mysql' || fromState === 'mariadb') return fromState;
  } catch {}
  return 'postgresql';
}

export const activeDbType = resolveDbType();
export const isMysqlLike = activeDbType === 'mysql' || activeDbType === 'mariadb';

const active: any = isMysqlLike ? mysqlSchema : pgSchema;

export const users: typeof pgSchema.users = active.users;
export const teamSettings: typeof pgSchema.teamSettings = active.teamSettings;
export const domains: typeof pgSchema.domains = active.domains;
export const dnsRecords: typeof pgSchema.dnsRecords = active.dnsRecords;
export const operationLogs: typeof pgSchema.operationLogs = active.operationLogs;
export const notificationConfigs: typeof pgSchema.notificationConfigs = active.notificationConfigs;
export const providerConfigs: typeof pgSchema.providerConfigs = active.providerConfigs;
export const userOauthBindings: typeof pgSchema.userOauthBindings = active.userOauthBindings;
export const userTotpSeeds: typeof pgSchema.userTotpSeeds = active.userTotpSeeds;
export const userPasskeys: typeof pgSchema.userPasskeys = active.userPasskeys;
export const backupCodes: typeof pgSchema.backupCodes = active.backupCodes;
export const inviteCodes: typeof pgSchema.inviteCodes = active.inviteCodes;
export const domainAssignments: typeof pgSchema.domainAssignments = active.domainAssignments;
export const domainAssignmentRequests: typeof pgSchema.domainAssignmentRequests = active.domainAssignmentRequests;
export const dnsSnapshots: typeof pgSchema.dnsSnapshots = active.dnsSnapshots;
export const oauthProviders: typeof pgSchema.oauthProviders = active.oauthProviders;
export const apiKeys: typeof pgSchema.apiKeys = active.apiKeys;
export const refreshTokens: typeof pgSchema.refreshTokens = active.refreshTokens;
export const userTokens: typeof pgSchema.userTokens = active.userTokens;
export const monitorChecks: typeof pgSchema.monitorChecks = active.monitorChecks;

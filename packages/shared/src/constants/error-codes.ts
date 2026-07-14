/**
 * DMHub 统一错误码体系
 * 按业务域分段，便于前端精准处理
 */

// --- 通用 (1000-1999) ---
export const ERR_INTERNAL = 1000;
export const ERR_BAD_REQUEST = 1001;
export const ERR_UNAUTHORIZED = 1002;
export const ERR_FORBIDDEN = 1003;
export const ERR_NOT_FOUND = 1004;
export const ERR_CONFLICT = 1005;
export const ERR_RATE_LIMITED = 1006;
export const ERR_VALIDATION = 1007;
export const ERR_SERVICE_UNAVAILABLE = 1008;

// --- 认证 (2000-2999) ---
export const ERR_AUTH_INVALID_CREDENTIALS = 2000;
export const ERR_AUTH_TOKEN_EXPIRED = 2001;
export const ERR_AUTH_TOKEN_INVALID = 2002;
export const ERR_AUTH_REFRESH_EXPIRED = 2003;
export const ERR_AUTH_REFRESH_INVALID = 2004;
export const ERR_AUTH_ACCOUNT_DISABLED = 2005;
export const ERR_AUTH_2FA_REQUIRED = 2006;
export const ERR_AUTH_2FA_CODE_INVALID = 2007;
export const ERR_AUTH_2FA_CODE_EXPIRED = 2008;
export const ERR_AUTH_EMAIL_CODE_INVALID = 2009;
export const ERR_AUTH_EMAIL_CODE_EXPIRED = 2010;
export const ERR_AUTH_EMAIL_CODE_RATE_LIMIT = 2011;
export const ERR_AUTH_INVITE_CODE_INVALID = 2012;
export const ERR_AUTH_INVITE_CODE_EXPIRED = 2013;
export const ERR_AUTH_INVITE_CODE_USED_UP = 2014;
export const ERR_AUTH_USERNAME_EXISTS = 2015;
export const ERR_AUTH_EMAIL_EXISTS = 2016;
export const ERR_AUTH_RESET_CODE_INVALID = 2017;
export const ERR_AUTH_RESET_CODE_EXPIRED = 2018;
export const ERR_AUTH_RESET_ATTEMPTS_EXCEEDED = 2019;
export const ERR_AUTH_PASSKEY_INVALID = 2020;
export const ERR_AUTH_BACKUP_CODE_INVALID = 2021;

// --- 用户 (3000-3999) ---
export const ERR_USER_NOT_FOUND = 3000;
export const ERR_USER_NO_PASSWORD = 3001;
export const ERR_USER_PASSWORD_TOO_SHORT = 3002;
export const ERR_USER_PASSWORD_NOT_COMPLEX = 3003;
export const ERR_USER_LAST_ADMIN = 3004;
export const ERR_USER_ALREADY_ADMIN = 3005;

// --- 域名 (4000-4999) ---
export const ERR_DOMAIN_NOT_FOUND = 4000;
export const ERR_DOMAIN_ALREADY_EXISTS = 4001;
export const ERR_DOMAIN_PROVIDER_NOT_CONFIGURED = 4002;
export const ERR_DOMAIN_PROVIDER_ERROR = 4003;
export const ERR_DOMAIN_DNS_RECORD_NOT_FOUND = 4004;
export const ERR_DOMAIN_DNS_RECORD_INVALID = 4005;
export const ERR_DOMAIN_DNS_PROVIDER_MISMATCH = 4006;
export const ERR_DOMAIN_SNAPSHOT_NOT_FOUND = 4007;
export const ERR_DOMAIN_INVALID_NAME = 4008;

// --- DNS Provider (5000-5999) ---
export const ERR_PROVIDER_NOT_FOUND = 5000;
export const ERR_PROVIDER_CONFIG_NOT_FOUND = 5001;
export const ERR_PROVIDER_CREDENTIALS_INVALID = 5002;
export const ERR_PROVIDER_API_ERROR = 5003;
export const ERR_PROVIDER_RATE_LIMITED = 5004;

// --- 团队/设置 (6000-6999) ---
export const ERR_TEAM_NOT_INITIALIZED = 6000;
export const ERR_TEAM_SETTINGS_NOT_FOUND = 6001;
export const ERR_TEAM_SMTP_NOT_CONFIGURED = 6002;
export const ERR_TEAM_DB_NOT_CONFIGURED = 6003;

// --- OAuth (7000-7999) ---
export const ERR_OAUTH_PROVIDER_NOT_ENABLED = 7000;
export const ERR_OAUTH_STATE_INVALID = 7001;
export const ERR_OAUTH_CODE_EXCHANGE_FAILED = 7002;
export const ERR_OAUTH_USER_INFO_FAILED = 7003;
export const ERR_OAUTH_ALREADY_BOUND = 7004;
export const ERR_OAUTH_BINDING_NOT_FOUND = 7005;

// --- 导出 (8000-8999) ---
export const ERR_EXPORT_NO_DATA = 8000;
export const ERR_EXPORT_FORMAT_UNSUPPORTED = 8001;

// --- 通知 (9000-9999) ---
export const ERR_NOTIFICATION_CONFIG_NOT_FOUND = 9000;
export const ERR_NOTIFICATION_SSE_LIMIT = 9001;

// --- API Key (10000-10999) ---
export const ERR_API_KEY_NOT_FOUND = 10000;
export const ERR_API_KEY_INVALID = 10001;
export const ERR_API_KEY_EXPIRED = 10002;

/** 错误码到默认消息的映射 */
export const ERROR_MESSAGES: Record<number, string> = {
  [ERR_INTERNAL]: '服务器内部错误',
  [ERR_BAD_REQUEST]: '请求参数错误',
  [ERR_UNAUTHORIZED]: '未认证',
  [ERR_FORBIDDEN]: '无权限',
  [ERR_NOT_FOUND]: '资源不存在',
  [ERR_CONFLICT]: '资源冲突',
  [ERR_RATE_LIMITED]: '请求过于频繁',
  [ERR_VALIDATION]: '参数验证失败',
  [ERR_SERVICE_UNAVAILABLE]: '服务暂不可用',

  [ERR_AUTH_INVALID_CREDENTIALS]: '用户名或密码错误',
  [ERR_AUTH_TOKEN_EXPIRED]: '令牌已过期',
  [ERR_AUTH_TOKEN_INVALID]: '令牌无效',
  [ERR_AUTH_REFRESH_EXPIRED]: '刷新令牌已过期',
  [ERR_AUTH_REFRESH_INVALID]: '刷新令牌无效',
  [ERR_AUTH_ACCOUNT_DISABLED]: '账号已被禁用',
  [ERR_AUTH_2FA_REQUIRED]: '需要两步验证',
  [ERR_AUTH_2FA_CODE_INVALID]: '两步验证码错误',
  [ERR_AUTH_2FA_CODE_EXPIRED]: '两步验证码已过期',
  [ERR_AUTH_EMAIL_CODE_INVALID]: '邮箱验证码错误',
  [ERR_AUTH_EMAIL_CODE_EXPIRED]: '邮箱验证码已过期',
  [ERR_AUTH_EMAIL_CODE_RATE_LIMIT]: '验证码发送过于频繁',
  [ERR_AUTH_INVITE_CODE_INVALID]: '邀请码不存在',
  [ERR_AUTH_INVITE_CODE_EXPIRED]: '邀请码已过期',
  [ERR_AUTH_INVITE_CODE_USED_UP]: '邀请码已达到使用上限',
  [ERR_AUTH_USERNAME_EXISTS]: '用户名已存在',
  [ERR_AUTH_EMAIL_EXISTS]: '邮箱已被使用',
  [ERR_AUTH_RESET_CODE_INVALID]: '重置码无效',
  [ERR_AUTH_RESET_CODE_EXPIRED]: '重置码已过期',
  [ERR_AUTH_RESET_ATTEMPTS_EXCEEDED]: '重置尝试次数过多',
  [ERR_AUTH_PASSKEY_INVALID]: 'Passkey 验证失败',
  [ERR_AUTH_BACKUP_CODE_INVALID]: '备用码无效',

  [ERR_USER_NOT_FOUND]: '用户不存在',
  [ERR_USER_NO_PASSWORD]: '用户未设置密码',
  [ERR_USER_PASSWORD_TOO_SHORT]: '密码至少8个字符',
  [ERR_USER_PASSWORD_NOT_COMPLEX]: '密码必须包含大小写字母和数字',
  [ERR_USER_LAST_ADMIN]: '不能降级最后一个管理员',
  [ERR_USER_ALREADY_ADMIN]: '用户已经是管理员',

  [ERR_DOMAIN_NOT_FOUND]: '域名不存在',
  [ERR_DOMAIN_ALREADY_EXISTS]: '域名已存在',
  [ERR_DOMAIN_PROVIDER_NOT_CONFIGURED]: '域名未配置DNS服务商',
  [ERR_DOMAIN_PROVIDER_ERROR]: 'DNS服务商返回错误',
  [ERR_DOMAIN_DNS_RECORD_NOT_FOUND]: 'DNS记录不存在',
  [ERR_DOMAIN_DNS_RECORD_INVALID]: 'DNS记录参数无效',
  [ERR_DOMAIN_DNS_PROVIDER_MISMATCH]: 'DNS记录与服务商不匹配',
  [ERR_DOMAIN_SNAPSHOT_NOT_FOUND]: 'DNS快照不存在',
  [ERR_DOMAIN_INVALID_NAME]: '域名格式无效',

  [ERR_PROVIDER_NOT_FOUND]: 'DNS服务商不存在',
  [ERR_PROVIDER_CONFIG_NOT_FOUND]: '服务商配置不存在',
  [ERR_PROVIDER_CREDENTIALS_INVALID]: '服务商凭据无效',
  [ERR_PROVIDER_API_ERROR]: '服务商API错误',
  [ERR_PROVIDER_RATE_LIMITED]: '服务商API限流',

  [ERR_TEAM_NOT_INITIALIZED]: '系统未初始化',
  [ERR_TEAM_SETTINGS_NOT_FOUND]: '团队设置不存在',
  [ERR_TEAM_SMTP_NOT_CONFIGURED]: 'SMTP未配置',
  [ERR_TEAM_DB_NOT_CONFIGURED]: '数据库未配置',

  [ERR_OAUTH_PROVIDER_NOT_ENABLED]: 'OAuth服务商未启用',
  [ERR_OAUTH_STATE_INVALID]: 'OAuth state验证失败',
  [ERR_OAUTH_CODE_EXCHANGE_FAILED]: 'OAuth授权码交换失败',
  [ERR_OAUTH_USER_INFO_FAILED]: '获取OAuth用户信息失败',
  [ERR_OAUTH_ALREADY_BOUND]: '该OAuth账号已被其他用户绑定',
  [ERR_OAUTH_BINDING_NOT_FOUND]: 'OAuth绑定不存在',

  [ERR_EXPORT_NO_DATA]: '没有可导出的数据',
  [ERR_EXPORT_FORMAT_UNSUPPORTED]: '不支持的导出格式',

  [ERR_NOTIFICATION_CONFIG_NOT_FOUND]: '通知配置不存在',
  [ERR_NOTIFICATION_SSE_LIMIT]: 'SSE连接数已达上限',

  [ERR_API_KEY_NOT_FOUND]: 'API Key不存在',
  [ERR_API_KEY_INVALID]: 'API Key无效',
  [ERR_API_KEY_EXPIRED]: 'API Key已过期',
};

/** HTTP 状态码映射 */
export function errorCodeToHttpStatus(code: number): number {
  if (code >= 1000 && code <= 1999) {
    if (code === ERR_INTERNAL) return 500;
    if (code === ERR_SERVICE_UNAVAILABLE) return 503;
    if (code === ERR_RATE_LIMITED) return 429;
    if (code === ERR_BAD_REQUEST || code === ERR_VALIDATION) return 400;
    if (code === ERR_UNAUTHORIZED) return 401;
    if (code === ERR_FORBIDDEN) return 403;
    if (code === ERR_NOT_FOUND) return 404;
    if (code === ERR_CONFLICT) return 409;
  }
  // 认证错误一般 401/403
  if (code >= 2000 && code <= 2999) {
    if (code === ERR_AUTH_ACCOUNT_DISABLED) return 403;
    if (code === ERR_AUTH_EMAIL_CODE_RATE_LIMIT) return 429;
    return 401;
  }
  if (code >= 3000 && code <= 3999) return 400;
  if (code >= 4000 && code <= 4999) return 400;
  if (code >= 5000 && code <= 5999) return 400;
  if (code >= 6000 && code <= 6999) return 400;
  if (code >= 7000 && code <= 7999) return 400;
  if (code >= 8000 && code <= 8999) return 400;
  if (code >= 9000 && code <= 9999) return 400;
  if (code >= 10000) return 401;
  return 500;
}

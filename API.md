# DMHub API 文档

所有 API 端点前缀为 `/api`。需认证的接口在请求头携带 `Authorization: Bearer <access_token>`。

认证令牌类型：

| 类型 | 前缀 | 用途 |
|------|------|------|
| Access Token | - | 常规 API 认证，15 分钟有效 |
| 2FA Temp Token | - | 2FA 验证流程，5 分钟有效，scope=`2fa` |
| API Key | `dmhub_` | Open API 认证，管理员创建 |
| User Token | `dmhub_pt_` | Open API 认证，用户个人令牌 |

---

## 健康检查

### GET /api/health

无需认证。返回服务健康状态。

**Response:**
```json
{ "status": "ok", "timestamp": "2026-01-01T00:00:00.000Z" }
```

---

## 初始化引导 `/api/setup`

所有接口无需认证。初始化完成后这些接口将不可用。

### GET /setup/status

获取初始化状态。

**Response:**
```json
{
  "initialized": true,
  "dbConfigured": true,
  "adminRegistered": true,
  "smtpConfigured": true,
  "siteUrlConfigured": true
}
```

### POST /setup/database

保存数据库配置并初始化连接。如所选方言（`postgresql` / `mysql` / `mariadb`）与当前运行方言不同，返回 `restartRequired: true`，需重启服务让 schema 加载到对应方言。

**Body:**
```json
{
  "dbType": "postgresql",
  "host": "localhost",
  "port": 5432,
  "username": "dmhub",
  "password": "password",
  "database": "dmhub",
  "redisUrl": "redis://localhost:6379"
}
```

**Response:** `{ "success": true }` 或 `{ "success": true, "restartRequired": true }`

### POST /setup/database/test

测试数据库连接，参数同上。

**Response:**
```json
// 成功
{ "success": true }

// 失败
{
  "success": false,
  "error": "Access denied for user 'dmhub'@'localhost'",
  "errorKind": "auth_failed",
  "hint": "用户名或密码错误，请确认凭证"
}
```

`errorKind` 取值：`connection_refused` / `auth_failed` / `host_unreachable` / `timeout` / `database_missing` / `unknown`。

### POST /setup/table-prefix（已废弃）

> 历史接口，引导流程已不再使用。仍保留以兼容已部署实例。

**Body:** `{ "prefix": "fp_" }`

**Response:** `{ "prefix": "fp_" }`

### POST /setup/database/migrate

创建数据表。

**Response:** `{ "success": true }`

### POST /setup/register

注册管理员。

**Body:**
```json
{
  "username": "admin",
  "password": "password123",
  "confirmPassword": "password123"
}
```

**Response:** `{ "user": { "id": "uuid", "username": "admin", "role": "admin" } }`

### POST /setup/site-url

**Body:** `{ "siteUrl": "https://dmhub.example.com" }`

**Response:** `{ "siteUrl": "https://dmhub.example.com" }`

### POST /setup/site-url/check-dns

检查域名 DNS 解析。

**Body:** `{ "siteUrl": "https://dmhub.example.com" }`

**Response:**
```json
{
  "success": true,
  "hostname": "dmhub.example.com",
  "addresses": ["1.2.3.4"],
  "matchesServer": true
}
```

### POST /setup/smtp

**Body:**
```json
{
  "host": "smtp.qq.com",
  "port": 465,
  "user": "your@qq.com",
  "password": "authorization_code",
  "from": "your@qq.com",
  "secure": true
}
```

**Response:** `{ "success": true }`

### POST /setup/smtp/test

测试 SMTP 连接。支持覆盖当前 SMTP 配置进行测试。

**Body:**
```json
{
  "email": "test@example.com",
  "host": "smtp.qq.com",
  "port": 465,
  "user": "your@qq.com",
  "password": "authorization_code",
  "from": "your@qq.com",
  "secure": true
}
```

**Response:** `{ "success": true }` 或 `{ "success": false, "error": "..." }`

### POST /setup/verify-email

**Body:** `{ "code": "123456" }`

**Response:** `{ "success": true }`

### POST /setup/admin/email

设置管理员邮箱。

**Body:** `{ "email": "admin@example.com" }`

**Response:** `{ "success": true }`

### POST /setup/verify-email/send

重发验证邮件。

**Response:** `{ "success": true }`

---

## 认证 `/api/auth`

### POST /auth/register

注册新用户。邀请码开启时必填 `inviteCode`。

**Body:**
```json
{
  "username": "string (3-64字符)",
  "email": "string (可选)",
  "password": "string (≥8字符)",
  "confirmPassword": "string",
  "inviteCode": "string (邀请码开启时必填)"
}
```

**Response:** 设置 `refresh_token` HttpOnly Cookie，返回 `{ user, accessToken, refreshToken }`

### POST /auth/login

登录，支持用户名或邮箱。

**Body:**
```json
{
  "username": "string",
  "password": "string",
  "rememberMe": false
}
```

**Response（无 2FA）：** 设置 Cookie，返回 `{ accessToken, refreshToken, user }`

**Response（有 2FA）：** 返回 `{ requires2FA: true, tempToken }` — 需携带 tempToken 完成 2FA 验证

**错误码：** 401 用户名或密码错误 | 403 账号已被禁用

### POST /auth/refresh

刷新 Access Token。Refresh Token 通过 HttpOnly Cookie 自动携带，也可在 body 中传入。

**Response:** `{ accessToken, refreshToken }`

### POST /auth/logout

登出，使当前 Refresh Token 失效，清除 Cookie。

**Response:** `{ success: true }`

---

## 用户信息 `/api/auth`

### GET /auth/me 🔒

获取当前用户信息。

**Response:** `{ user: { id, username, email, role, displayName, nickname, avatarUrl, twoFactorEnabled, twoFactorMethods, emailVerified, notificationsEnabled, status } }`

### PUT /auth/me/password 🔒

修改密码。

**Body:**
```json
{
  "oldPassword": "string",
  "newPassword": "string (≥8字符)"
}
```

**Response:** `{ success: true }`

### PUT /auth/me/profile 🔒

更新用户资料。

**Body:**
```json
{
  "displayName": "string (可选)",
  "nickname": "string (可选)",
  "avatarUrl": "string (可选)",
  "notificationsEnabled": true
}
```

**Response:** `{ user }`

### PUT /auth/me/email 🔒

修改邮箱，需密码验证。

**Body:**
```json
{
  "email": "new@example.com",
  "password": "current_password"
}
```

**Response:** `{ user }`

---

## 用户个人令牌 `/api/auth`

### POST /auth/me/tokens 🔒

生成个人访问令牌（`dmhub_pt_` 前缀），用于 Open API 认证。

**Body:**
```json
{
  "name": "CI/CD Token",
  "permissions": ["domains:read", "records:read", "records:write"]
}
```

**Response:** `{ token, name, permissions }` — token 只显示一次

### GET /auth/me/tokens 🔒

获取当前用户的令牌列表。

**Response:** `{ tokens: [{ id, name, tokenPrefix, permissions, lastUsedAt, expiresAt, createdAt }] }`

### DELETE /auth/me/tokens/:id 🔒

吊销个人令牌。

**Response:** `{ success: true }`

---

## 双因素认证 `/api/2fa`

### GET /2fa/methods

获取用户已启用的 2FA 方式。支持 Access Token 和 2FA Temp Token。

**Headers:** `Authorization: Bearer <token>`

**Response:** `{ twoFactorMethods: ["totp", "passkey", "email"] }`

### TOTP

| 接口 | 方法 | 认证 | Body | 说明 |
|------|------|------|------|------|
| `/2fa/totp/setup` | POST | Access Token | - | 生成 TOTP 密钥，返回 `{ otpauthUri, secret }` |
| `/2fa/totp/verify` | POST | Access Token | `{ code }` | 验证码校验并启用 TOTP，返回 `{ verified, backupCodes }` |

### 2FA 验证登录

| 接口 | 方法 | 认证 | Body | 说明 |
|------|------|------|------|------|
| `/2fa/verify` | POST | 2FA Token | `{ method: "totp"\|"backup"\|"email", code }` | 完成二次验证登录，设置 refresh cookie，返回 `{ accessToken, refreshToken, user, backupCodesWarning? }` |

### Passkey

| 接口 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/2fa/passkeys` | GET | Access Token | 获取已注册的通行密钥 |
| `/2fa/passkey/register-options` | POST | Access Token | 获取 WebAuthn 注册选项 |
| `/2fa/passkey/register-verify` | POST | Access Token | 提交注册验证 `{ response, deviceName? }` |
| `/2fa/passkey/auth-options` | POST | 2FA Token | 获取认证选项 |
| `/2fa/passkey/auth-verify` | POST | 2FA Token | 提交认证验证 `{ response }`，返回 token |
| `/2fa/passkey/:id` | DELETE | Access Token | 删除通行密钥 |

### 邮箱验证码

| 接口 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/2fa/email/send` | POST | Access / 2FA Token | 发送邮箱验证码 |
| `/2fa/email/setup-verify` | POST | Access Token | 验证并启用邮箱 2FA `{ code }` |

### 备用代码

| 接口 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/2fa/backup-codes/download` | GET | Access Token | 重新生成并下载备用码 ZIP |
| `/2fa/backup-codes/regenerate` | POST | Access Token | 重新生成备用码，返回 `{ backupCodes }` |

> 下载 ZIP 会重新生成备用码，当前码将全部失效。

### 管理员帮助重置

| 接口 | 方法 | 认证 | Body | 说明 |
|------|------|------|------|------|
| `/2fa/backup-codes/admin-reset/admins` | GET | 2FA Token | - | 获取管理员列表 |
| `/2fa/backup-codes/admin-reset/request` | POST | 2FA Token | `{ adminId, alternateEmail }` | 提交重置请求 |
| `/2fa/backup-codes/admin-reset/verify-email` | POST | 2FA Token | `{ requestId, code }` | 验证备用邮箱 |
| `/2fa/backup-codes/admin-reset/pending` | GET | Access Token + admin | - | 获取待审批请求 |
| `/2fa/backup-codes/admin-reset/:requestId/approve` | POST | Access Token + admin | - | 批准 |
| `/2fa/backup-codes/admin-reset/:requestId/reject` | POST | Access Token + admin | `{ reason? }` | 拒绝 |
| `/2fa/backup-codes/admin-reset/apply` | POST | 2FA Token | `{ resetCode }` | 使用重置码，返回 `{ backupCodes }` |

---

## OAuth 登录 `/api/auth/oauth`

| 接口 | 方法 | 认证 | Body | 说明 |
|------|------|------|------|------|
| `/auth/oauth/providers` | GET | 无 | - | 获取已启用的 OAuth Provider 列表 |
| `/auth/oauth/:providerId/authorize` | GET | 无 | - | 跳转到 OAuth 授权页（302） |
| `/auth/oauth/:providerId/callback` | GET | 无 | - | OAuth 回调（302 到前端） |
| `/auth/oauth/:providerId/register` | POST | 无 | `{ pendingToken, code }` | OAuth 首次登录完成注册 |
| `/auth/oauth/bind` | POST | Access Token | `{ providerId, code, redirectUri? }` | 绑定 OAuth |
| `/auth/oauth/unbind/:providerId` | DELETE | Access Token | - | 解绑 OAuth |
| `/auth/oauth/bindings` | GET | Access Token | - | 获取已绑定列表 |

---

## 团队管理 `/api/team`

### 团队设置

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/team/settings` | GET | 认证用户 | 获取团队设置 |
| `/team/settings` | PUT | admin | 更新团队设置 |
| `/team/logo` | POST | admin | 上传团队 Logo（multipart，≤1MB，PNG/JPG/SVG） |
| `/team/background` | POST | admin | 上传主页背景图（multipart，≤5MB） |

**PUT /team/settings Body:**
```json
{
  "name": "团队名称",
  "description": "描述",
  "siteUrl": "https://example.com",
  "smtpHost": "smtp.qq.com",
  "smtpPort": 465,
  "smtpUser": "your@qq.com",
  "smtpPassword": "***",
  "smtpFrom": "your@qq.com",
  "smtpSecure": true,
  "inviteCodeEnabled": true,
  "registrationEnabled": true,
  "announcement": "公告内容",
  "announcementFormat": "markdown",
  "landingSubtitle": "副标题",
  "footerContent": "底栏",
  "footerFormat": "markdown"
}
```

### 邀请码

| 接口 | 方法 | 权限 | Body | 说明 |
|------|------|------|------|------|
| `/team/invite-codes` | GET | admin | - | 获取邀请码列表 |
| `/team/invite-codes` | POST | admin | `{ maxUses?, expiresAt? }` | 生成邀请码 |
| `/team/invite-codes/regenerate` | POST | admin | `{ confirmed: true }` | 重新生成（旧码全部失效） |

### 成员管理

| 接口 | 方法 | 权限 | Body | 说明 |
|------|------|------|------|------|
| `/team/members` | GET | admin | - | 获取成员列表 |
| `/team/members/:id/role` | PUT | admin | `{ role: "admin"\|"member"\|"guest" }` | 修改角色 |
| `/team/members/:id` | DELETE | admin | - | 移除成员 |
| `/team/members/:id/status` | PUT | admin | `{ status: "active"\|"disabled" }` | 启用/禁用成员（禁用时清除其 refresh token） |

---

## 公开接口 `/api/public`

| 接口 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/public/landing` | GET | 无 | 获取主页数据 |

**Response:**
```json
{
  "name": "团队名称",
  "subtitle": "副标题",
  "logoUrl": "/uploads/logo/xxx.png",
  "backgroundUrl": "/uploads/background/xxx.jpg",
  "footerContent": "底栏内容",
  "footerFormat": "markdown",
  "announcement": "公告内容",
  "announcementFormat": "markdown",
  "inviteCodeEnabled": true,
  "registrationEnabled": true
}
```

---

## 域名管理 `/api/domains`

### 列表与 CRUD

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/domains` | GET | 认证用户 | 域名列表（admin 全部，member 指派范围） |
| `/domains` | POST | admin | 添加域名 |
| `/domains/:id` | GET | 域名访问权限 | 域名详情（含 recordCount 和 assignment） |
| `/domains/:id` | DELETE | admin | 删除域名 |
| `/domains/groups` | GET | 认证用户 | 获取分组列表 `{ groups: [{ name, count }] }` |
| `/domains/tags` | GET | 认证用户 | 获取标签列表 `{ tags: [{ name, count }] }` |
| `/domains/:id/tags` | PUT | admin | 更新域名标签 `{ tags: string[] }` |
| `/domains/:id/group` | PUT | admin | 更新域名分组 `{ groupName }` |

**GET /domains Query:** `search`, `status`, `group`

**POST /domains Body:**
```json
{
  "name": "example.com",
  "providerConfigId": "uuid",
  "expiresAt": "2027-01-01T00:00:00Z",
  "tags": ["生产环境"],
  "groupName": "主站"
}
```

### 解析记录

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/domains/:id/records` | GET | 域名访问权限 | 记录列表（Query: `type`, `search`） |
| `/domains/:id/records` | POST | 域名写权限 | 创建记录 |
| `/domains/:id/records/bulk` | POST | 域名写权限 | 批量创建记录（最多100条） |
| `/domains/:id/records/:recordId` | PUT | 域名写权限 | 更新记录 |
| `/domains/:id/records/:recordId` | DELETE | 域名写权限 | 删除记录 |
| `/domains/:id/sync` | POST | admin | 从服务商同步记录 |

**创建/更新记录 Body:**
```json
{
  "recordType": "A",
  "name": "www",
  "value": "1.2.3.4",
  "ttl": 3600,
  "priority": 10,
  "proxied": false
}
```

**批量创建 Body:**
```json
{
  "records": [
    { "recordType": "A", "name": "www", "value": "1.2.3.4", "ttl": 600 },
    { "recordType": "CNAME", "name": "blog", "value": "example.com", "ttl": 3600 },
    { "recordType": "MX", "name": "@", "value": "10 mail.example.com", "priority": 10 }
  ]
}
```

**Response:**
```json
{
  "results": [
    { "success": true, "recordType": "A", "name": "www" },
    { "success": false, "recordType": "CNAME", "name": "blog", "error": "CNAME记录的值必须是有效的域名" }
  ],
  "total": 2,
  "succeeded": 1
}
```

> 批量创建每条记录独立校验，失败不影响其他记录。单次最多100条。

**创建/更新记录 Body:**
```json
{
  "recordType": "A",
  "name": "www",
  "value": "1.2.3.4",
  "ttl": 3600,
  "priority": 10,
  "proxied": false
}
```

### 到期管理

| 接口 | 方法 | 权限 | Body | 说明 |
|------|------|------|------|------|
| `/domains/:id/expiry-remind` | PUT | admin | `{ expiryRemindDays?, autoCheckExpiry? }` | 更新提醒配置 |
| `/domains/:id/check-expiry` | POST | admin | - | WHOIS/RDAP 查询到期时间 |
| `/domains/:id/expiry` | PUT | admin | `{ expiresAt }` | 手动设置到期时间 |
| `/domains/check-expiry-preview` | POST | admin | `{ domain }` | 预览 WHOIS 查询结果 |

---

## DNS 快照 `/api/domains/:id/snapshots`

| 接口 | 方法 | 权限 | Body | 说明 |
|------|------|------|------|------|
| `/domains/:id/snapshots` | GET | 域名访问权限 | - | 快照列表 |
| `/domains/:id/snapshots` | POST | 域名写权限 | `{ trigger? }` | 创建快照 |
| `/domains/:id/snapshots/:snapshotId` | GET | 域名访问权限 | - | 快照详情含完整记录 |
| `/domains/:id/snapshots/:snapshotId/rollback` | POST | admin | - | 回滚到指定快照 |
| `/domains/:id/snapshots/diff` | GET | 域名访问权限 | Query: `from`, `to` | 两个版本差异 `{ added, removed, modified }` |

---

## 服务商配置 `/api/providers`

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/providers` | GET | 认证用户 | 服务商列表（凭证已脱敏） |
| `/providers` | POST | admin | 创建服务商配置 |
| `/providers/:id` | GET | 认证用户 | 获取单个配置（凭证已脱敏） |
| `/providers/:id` | PUT | admin | 更新配置 |
| `/providers/:id` | DELETE | admin | 删除配置（需 Header `x-confirm-delete: true`） |
| `/providers/:id/test` | POST | admin | 测试连接 |
| `/providers/:id/sync` | POST | admin | 从服务商同步域名 |

**创建 Body:**
```json
{
  "name": "My Cloudflare",
  "providerId": "cloudflare",
  "credentials": {
    "token": "your_cloudflare_api_token"
  }
}
```

| providerId | 凭证字段 |
|-----------|----------|
| `cloudflare` | `token` |
| `aliyun` | `accessKeyId`, `accessKeySecret` |
| `tencent` | `secretId`, `secretKey` |

---

## 域名指派 `/api/assignments`

| 接口 | 方法 | 权限 | Body | 说明 |
|------|------|------|------|------|
| `/assignments/team/members/:id/assignments` | GET | admin | - | 成员指派列表 |
| `/assignments/team/members/:id/assignments` | POST | admin | `{ domainId, subdomainPattern?, permission? }` | 直接指派 |
| `/assignments/team/members/:id/assignments/:assignmentId` | DELETE | admin | - | 删除指派 |
| `/assignments/requests` | POST | 认证用户 | `{ domainId, subdomainPattern?, permission?, reason }` | 提交申请 |
| `/assignments/requests/:id` | PUT | admin | `{ action: "approve"\|"reject", reviewComment?, confirmed? }` | 审批 |
| `/assignments/requests/pending` | GET | admin | - | 待审批列表 |
| `/assignments/requests/mine` | GET | 认证用户 | - | 我的申请 |
| `/assignments/my/domains` | GET | 认证用户 | - | 我的指派域名 |
| `/assignments/domains` | GET | 认证用户 | - | 可指派的域名列表 |

**子域名匹配模式：** `*` = 整个域名 | `blog` = 仅 blog.example.com | `*.dev` = 所有 *.dev.example.com

---

## 操作日志 `/api/logs`

### GET /logs 🔒

**Query 参数：** `action`, `userId`, `domainId`, `startDate`, `endDate`, `page` (默认 1), `pageSize` (默认 20)

**Response:** `{ logs, total }`

admin 查看全部，member 仅查看指派范围域名。

---

## 通知 `/api/notifications`

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/notifications/stream` | GET | Query `token` 或 Bearer | SSE 通知流（`text/event-stream`） |
| `/notifications` | GET | 认证用户 | 获取已存储的通知 |
| `/notifications` | POST | admin | 创建通知配置 |
| `/notifications/configs` | GET | admin | 获取通知配置列表 |
| `/notifications/configs/:id` | GET | admin | 获取单个配置 |
| `/notifications/configs/:id` | PUT | admin | 更新配置 |
| `/notifications/configs/:id` | DELETE | admin | 删除配置 |

**创建通知配置 Body:**
```json
{
  "channel": "dingtalk",
  "name": "运维群钉钉",
  "config": {
    "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    "secret": "SEC..."
  },
  "events": ["domain.expiring", "team_settings.updated"],
  "enabled": true
}
```

**channel 可选值：** `web`, `dingtalk`, `feishu`, `email`, `webhook`

**events 可选值：** `domain.expiring`, `domain.expired`, `team_settings.updated`, `member.role_changed`, `member.removed`, `member.status_changed`, `notification.update`, `dns_provider.deleted`, `oauth_provider.deleted`, `admin_reset.requested` 等

---

## OAuth Provider 配置 `/api/oauth`

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/oauth/providers` | GET | 认证用户 | 获取列表和可用 Provider，返回 `{ providers, availableProviders }` |
| `/oauth/providers` | POST | admin | 创建 |
| `/oauth/providers/:id` | PUT | admin | 更新 |
| `/oauth/providers/:id` | DELETE | admin | 删除（需 Header `x-confirm-delete: true`） |

**创建 Body:**
```json
{
  "providerId": "github",
  "clientId": "xxx",
  "clientSecret": "xxx",
  "scope": "user:email",
  "enabled": true,
  "customAuthorizeUrl": null,
  "customTokenUrl": null,
  "customUserInfoUrl": null
}
```

**可用 providerId：** `github`, `gitlab`, `google`, `dingtalk`, `feishu`, `custom`

---

## 批量导入 `/api/import`

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/import/domains/csv` | POST | admin | 上传 CSV 导入域名（multipart） |
| `/import/records/csv` | POST | 认证用户 | 上传 CSV 导入解析记录（multipart + Query `domainId`） |
| `/import/template/domains` | GET | admin | 下载域名导入模板 |
| `/import/template/records` | GET | 认证用户 | 下载记录导入模板 |

**Response:** `{ imported, skipped, errors }`

---

## 仪表盘 `/api/dashboard`

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/dashboard/stats` | GET | 认证用户 | 统计数据 |
| `/dashboard/expiring` | GET | 认证用户 | 即将过期域名 |
| `/dashboard/activity` | GET | 认证用户 | 最近活动 |
| `/dashboard/records-distribution` | GET | 认证用户 | DNS 记录类型分布 |

**stats Response:**
```json
{
  "totalDomains": 10,
  "activeDomains": 8,
  "expiringDomains": 1,
  "expiredDomains": 1,
  "totalRecords": 56,
  "totalMembers": 3,
  "recentChanges": 12,
  "recordsByType": { "A": 20, "CNAME": 15, "MX": 5, "TXT": 10, "AAAA": 6 }
}
```

**expiring Response:**
```json
[
  { "domain": "example.com", "domainId": "uuid", "expiresAt": "2026-02-01", "daysRemaining": 15, "status": "expiring" }
]
```

**activity Response:**
```json
[
  { "action": "record_created", "targetName": "www.example.com", "userName": "admin", "createdAt": "2026-01-01T00:00:00Z" }
]
```

---

## 监控 `/api/uptime` `/api/speedtest`

### Uptime

| 接口 | 方法 | 权限 | Body | 说明 |
|------|------|------|------|------|
| `/uptime/configure` | GET | admin | - | 获取 UptimeKuma Push URL 配置 |
| `/uptime/configure` | POST | admin | `{ pushUrl }` | 配置 Push URL |
| `/uptime/configure` | DELETE | admin | - | 移除配置 |
| `/uptime/status/:domainId` | GET | 域名访问权限 | - | 获取监控状态 `{ up, responseTime, lastChecked, history }` |
| `/uptime/check/:domainId` | POST | 域名访问权限 | - | 手动健康检查 |

### Speedtest

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/speedtest/dns/:domainId` | POST | 域名访问权限 | DNS 解析测速 |
| `/speedtest/http/:domainId` | POST | 域名访问权限 | HTTP 可用性检测 |

---

## API Key `/api/api-keys`

管理员创建的 API Key，前缀 `dmhub_`，用于 Open API 认证。

| 接口 | 方法 | 权限 | Body | 说明 |
|------|------|------|------|------|
| `/api-keys` | GET | admin | - | 获取 Key 列表 |
| `/api-keys` | POST | admin | `{ name, permissions: string[] }` | 创建 Key |
| `/api-keys/:id` | DELETE | admin | - | 吊销 Key |

**permissions 可选值：** `domains:read`, `records:read`, `records:write`, `*`

**Response (POST):** `{ key, name, permissions }` — key 只显示一次

---

## 批量导出 `/api/export`

| 接口 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/export/domains` | GET | admin | 导出域名列表（Query: `format=csv\|json`） |
| `/export/dns-records/:domainId` | GET | 域名访问权限 | 导出指定域名 DNS 记录 |
| `/export/dns-records` | GET | admin | 导出所有 DNS 记录 |

**Response:** 文件下载（`Content-Disposition: attachment`），支持 CSV（默认）和 JSON 格式。

---

## 开放 API `/api/v1`

通过 API Key（`dmhub_`）或用户令牌（`dmhub_pt_`）认证：`Authorization: Bearer <key>`

| 接口 | 方法 | 所需权限 | 说明 |
|------|------|---------|------|
| `/v1/domains` | GET | `domains:read` | 域名列表 |
| `/v1/domains/:id` | GET | `domains:read` | 域名详情 |
| `/v1/domains/:id/records` | GET | `records:read` | 解析记录列表 |
| `/v1/domains/:id/records` | POST | `records:write` | 创建记录 |
| `/v1/domains/:id/records/:recordId` | PUT | `records:write` | 更新记录 |
| `/v1/domains/:id/records/:recordId` | DELETE | `records:write` | 删除记录 |

频率限制：100 请求 / 分钟 / Key

---

## 错误响应格式

所有接口错误返回统一格式：

```json
{ "error": "错误描述" }
```

结构化错误码（通过 `AppError` 抛出时）：

```json
{
  "error": "错误描述",
  "code": 2000,
  "detail": null
}
```

常见 HTTP 状态码：

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未认证或令牌无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名已存在） |
| 429 | 请求频率超限 |

---

## 认证流程

### 普通登录

```
POST /auth/login → { accessToken, refreshToken, user }
→ 后续请求携带 Authorization: Bearer <accessToken>
→ Access Token 过期后 POST /auth/refresh 获取新 Token
```

### 2FA 登录

```
POST /auth/login → { requires2FA: true, tempToken }
POST /2fa/verify (Bearer tempToken) → { accessToken, refreshToken, user }
→ 后续正常流程
```

### API Key 认证

```
Authorization: Bearer dmhub_xxxxxxxx
→ 直接访问 /api/v1/* 端点
```

### 用户令牌认证

```
Authorization: Bearer dmhub_pt_xxxxxxxx
→ 直接访问 /api/v1/* 端点
```

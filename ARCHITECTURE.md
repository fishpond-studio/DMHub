# DMHub 架构说明

## 整体架构

DMHub 采用 pnpm workspace monorepo 结构，前后端分离部署。

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│   Caddy     │────▶│  Nginx                                   │
│ (HTTPS/443) │     │  ├── /              → Vue SPA (80)      │
│             │     │  ├── /api/*         → Node.js (3000)    │
│             │     │  ├── /oauth/oidc    → Node.js (3000)    │
│             │     │  └── /uploads/*     → Node.js (3000)    │
└─────────────┘     └──────────────────────────────────────────┘
                                          │
                                    ┌─────┴─────┐
                                    │  Fastify   │
                                    │  Server    │
                                    └─────┬─────┘
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                        ┌─────┴──┐  ┌─────┴──┐  ┌────┴───┐
                        │PostgreSQL│  │ Redis  │  │ DNS    │
                        │   (DB)  │  │(可选)  │  │Provider│
                        └────────┘  └────────┘  └────────┘
```

OIDC 重定向 URL 固定为 `{站点URL}/oauth/oidc`，须代理到后端。

## 项目结构

```
dmhub/
├── apps/
│   ├── web/                  # Vue 3 前端
│   │   ├── src/
│   │   │   ├── views/        # 页面组件
│   │   │   ├── components/   # 通用组件 + UI 组件库
│   │   │   ├── stores/       # Pinia 状态管理
│   │   │   ├── router/       # Vue Router 路由
│   │   │   └── lib/          # 工具函数（axios 封装等）
│   │   └── tailwind.config.js
│   └── server/               # Fastify 后端
│       └── src/
│           ├── routes/       # 路由处理
│           ├── services/     # 业务逻辑
│           ├── middleware/    # 中间件（认证、权限）
│           ├── db/           # Drizzle ORM schema 和连接
│           ├── lib/          # 工具库（JWT、cron、WHOIS、通知等）
│           └── config/       # 环境变量配置
├── packages/
│   ├── shared/               # 共享类型 + Zod schema + 常量
│   └── dns-providers/        # DNS 服务商适配器
│       └── src/adapters/     # Cloudflare / Aliyun / Tencent
├── docker/                   # Docker 构建文件
└── Caddyfile
```

## 数据流

### 请求处理流程

```
Client → Caddy → Nginx → Fastify Router → Middleware → Route Handler → Service → Drizzle ORM → PostgreSQL
                                                         ↓
                                                   DNS Provider API
                                                         ↓
                                                   Notification Dispatch
```

### 认证流程

```
┌──────────┐     POST /api/auth/login    ┌──────────┐
│  Client  │ ─────────────────────────▶│  Server  │
│          │◀───────────────────────── │          │
│          │   { requires2FA,          │          │
│          │     tempToken }           │          │
│          │                           │          │
│          │  POST /api/2fa/verify      │          │
│          │  Bearer: tempToken        │          │
│          │──────────────────────────▶│          │
│          │◀───────────────────────── │          │
│          │   { accessToken,          │          │
│          │     refreshToken,         │          │
│          │     user }                │          │
│          │                           │          │
│          │  GET /api/domains         │          │
│          │  Bearer: accessToken      │          │
│          │──────────────────────────▶│          │
│          │◀───────────────────────── │          │
└──────────┘                           └──────────┘
```

令牌体系：

| 令牌 | 有效期 | 用途 |
|------|--------|------|
| Access Token | 15 分钟 | API 请求认证 |
| Refresh Token | 7 天 | 刷新 Access Token，HttpOnly Cookie |
| 2FA Temp Token | 5 分钟 | 2FA 验证流程，scope=`2fa` |

### Token 刷新机制

前端 axios 拦截器在收到 401 时自动尝试 Refresh：

1. 用 HttpOnly Cookie 中的 refresh_token 调用 `/api/auth/refresh`
2. 成功 → 用新 Access Token 重试原请求
3. 失败 → 清除认证状态，跳转登录页

2FA 页面的请求携带 `X-2FA-Auth` header，401 时不触发自动 refresh，避免干扰 2FA 流程。

## 数据库设计

### 多方言 Schema 层

DMHub 同时支持 PostgreSQL 和 MariaDB/MySQL。Drizzle ORM 的 `pg-core` 和 `mysql-core` 类型不兼容，因此采用**双 schema 文件 + 动态 re-export** 模式：

```
db/
├── schema-pg.ts      # pg-core 定义，19 张表（推荐使用）
├── schema-mysql.ts   # mysql-core 定义，19 张表（与 PG 一一对应）
├── schema.ts         # 启动时根据 DB_TYPE 选择并 re-export
├── helpers.ts        # 跨方言帮手（insertReturningOne 等）
└── index.ts          # 维护 pgDb / mysqlDb 双实例，getDb() 返回当前活跃实例
```

`schema.ts` 在模块加载时（`activeDbType = resolveDbType()`）决定 re-export 哪一份：

- 优先读 `process.env.DB_TYPE`
- 否则读 `setup-state.json` 中的 `dbConfig.dbType`
- 默认 `postgresql`

re-export 使用 `as typeof pgSchema.X` 类型断言，让业务代码以 PG 类型签名编程，运行时实际为 MySQL 对象。

> **重要**：schema 在模块加载时确定，不可热切换。引导流程切换方言后保存接口返回 `restartRequired: true`，前端提示重启。

### 跨方言写入

PG 与 MySQL 在 Drizzle 上的两个主要差异：

| 操作 | PostgreSQL | MySQL/MariaDB |
|------|------------|---------------|
| `.returning()` | 原生支持 | 不支持，需 insert + select |
| `.onConflictDoNothing()` | 原生支持 | 捕获 duplicate key 错误 |
| JSON 列默认值 | `DEFAULT '[]'::jsonb` | 需 `DEFAULT (JSON_ARRAY())`（MySQL 8.0.13+ / MariaDB 10.2.7+） |
| `count(*)` 类型 | 返回 string，需 `::int` | 返回 number | 统一用 JS `Number()` 包装 |

业务代码统一调用 `db/helpers.ts` 内的 helper，内部按 `isMysqlLike` 分流：

```ts
// 替代 db.insert(users).values(v).returning({ id: users.id })
const row = await insertReturningOne(users, v, { id: users.id });

// 替代 db.insert(t).values(v).onConflictDoNothing()
await insertIgnore(t, v);
```

### DDL 执行

`db/index.ts` 暴露 `runRawSql(sql)` 跨方言执行原始 SQL（迁移用）：

- PG：直接 `pg.unsafe(sql)`
- MySQL：按 `;\s*\n` 切语句、逐条 `query()`

`services/setup.ts` 内 `PG_MIGRATION_SQL` 和 `MYSQL_MIGRATION_SQL` 各持一份建表语句，引导时根据所选方言选择。

### 核心 Schema

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│    users     │     │     domains      │     │  dns_records  │
├──────────────┤     ├──────────────────┤     ├───────────────┤
│ id (PK)      │     │ id (PK)          │     │ id (PK)       │
│ username     │     │ name             │     │ domainId (FK) │
│ email        │     │ providerId       │     │ recordType    │
│ passwordHash │     │ providerConfigId │     │ name          │
│ role         │     │ expiresAt        │     │ value         │
│ status       │     │ tags             │     │ ttl           │
│ 2FA fields   │     │ groupName        │     │ priority      │
└──────┬───────┘     │ status           │     │ proxied       │
       │             └──────┬───────────┘     └───────────────┘
       │                    │
       │     ┌──────────────┴──────────────┐
       │     │                             │
       │     ▼                             ▼
┌──────┴───────────┐     ┌─────────────────────────┐
│ domain_assignments│     │ dns_snapshots           │
├──────────────────┤     ├─────────────────────────┤
│ id (PK)          │     │ id (PK)                 │
│ domainId (FK)    │     │ domainId (FK)           │
│ userId (FK)      │     │ version                 │
│ subdomainPattern │     │ records (JSON)          │
│ permission       │     │ trigger                 │
│ assignedBy (FK)  │     └─────────────────────────┘
└──────────────────┘
```

### 用户认证相关

```
users
 ├── user_totp_seeds     (1:1, TOTP 密钥，加密存储)
 ├── user_passkeys       (1:N, WebAuthn 凭证)
 ├── backup_codes        (1:N, hash 存储，使用后标记)
 ├── refresh_tokens      (1:N, 设备 refresh token)
 ├── user_tokens         (1:N, 个人访问令牌，dmhub_pt_ 前缀)
 ├── user_oauth_bindings (1:N, OAuth 绑定)
 └── api_keys            (1:N, 管理员创建，dmhub_ 前缀)
```

## 权限模型

### 角色权限矩阵

| 资源 | admin | member | guest |
|------|-------|--------|-------|
| 域名 | 读写删 | 指派范围内读写/只读（由 permission 决定） | 无权限 |
| DNS 记录 | 读写删 | 指派范围内读写/只读（由 permission 决定） | 无权限 |
| 团队设置 | 读写 | 只读 | 只读 |
| 成员管理 | 读写 | - | - |
| 操作日志 | 全部 | 指派范围 | - |

### 域名级权限

`domain_assignments` 表控制 member 对特定域名的访问：

- **subdomainPattern** — `*` 全域名 / `''`（空串）/ `@` 匹配 apex 自身 / `blog` 单子域 / `*.dev` 通配子域（仅匹配子级，不包含 `dev` 自身）
- **permission** — `dns_edit`（读写）/ `dns_readonly`（只读）

中间件分层校验：

| 中间件 | 校验粒度 | 说明 |
|--------|----------|------|
| `requireDomainAccess` | 域名级 | 验证用户对该 domainId 至少有一条 assignment（读权限） |
| `requireDomainWriteAccess` | 域名级 | 进一步要求 `dns_edit` 权限 |
| `requireRecordWriteAccess` | 记录级 | 取出该 record 的 name，逐一比对用户所有 assignment 的 pattern，命中即放行 |

`lib/subdomain-match.ts` 实现 pattern 匹配规则：

```ts
matchesSubdomainPattern('blog', '*');        // true（全通配）
matchesSubdomainPattern('blog', 'blog');     // true（精确）
matchesSubdomainPattern('api.dev', '*.dev'); // true（子级）
matchesSubdomainPattern('dev', '*.dev');     // false（仅子级，不含自身）
matchesSubdomainPattern('', '@');            // true（apex）
```

> 域名元数据（标签、分组、状态）修改限定 admin，按规约 §7.2 设计；member 即使有 `dns_edit` 也不可改这些字段。

## DNS 服务商适配器

```
DNSProviderAdapter (interface)
 ├── CloudflareAdapter   → api.cloudflare.com REST API
 ├── AliyunAdapter       → alidns.aliyuncs.com HMAC-SHA1 签名
 └── TencentAdapter      → dnspod.tencentcloudapi.com TC3-HMAC-SHA256 签名
```

每个适配器统一实现：

| 方法 | 说明 |
|------|------|
| `testConnection()` | 测试凭证有效性 |
| `listDomains()` | 列出服务商下的域名 |
| `getDomainInfo()` | 获取域名信息 |
| `listRecords()` | 列出解析记录 |
| `createRecord()` | 创建记录 |
| `updateRecord()` | 更新记录 |
| `deleteRecord()` | 删除记录 |
| `getDomainExpiry()` | 获取到期时间 |

添加新服务商只需在 `packages/dns-providers/src/adapters/` 新增适配器类并注册。

## 通知系统

```
业务事件
  ├─ notifyUser / notifyAdmins
  │     → 内存站内信 + SSE（铃铛 / Toast）
  │     → 用户开启 emailNotificationsEnabled 时 SMTP 个人邮件
  └─ triggerNotification(event)
        → 匹配 notification_configs
        → dispatch：钉钉 / 飞书 / 邮件列表 / Webhook
```

- SSE：`GET /api/notifications/stream?token=xxx`
- 站内信存进程内存，重启清空；支持已读 / 清空 API
- `notificationsEnabled` 控制站内；`emailNotificationsEnabled` 控制个人邮件（默认关）
- 域名指派创建/删除/审批会 `notifyUser` 对应成员
- 到期检查 cron 默认每天 08:00

## OIDC / OAuth2

- 配置表 `oauth_providers`：`well_known_url` + 可选端点覆盖
- `state` 加密携带 `redirectUri`、`intent`（login|bind）
- 登录成功发一次性 `ticket`，前端 `POST /api/auth/oauth/exchange-ticket`
- 绑定：`POST /api/auth/oauth/:id/bind/start` 后再跳转 IdP

## WHOIS / RDAP 查询

```
lookupDomainExpiry(domain)
 │
 ├─ 1. RDAP 查询 (https://rdap.org/domain/xxx)
 │     └─ 成功 → 提取 expiryDate
 │
 ├─ 2. TLD WHOIS 服务器查询 (net.connect)
 │     └─ 支持 20+ TLD 专用服务器
 │     └─ 成功 → 正则提取 expiry
 │
 └─ 3. {tld}.whois-servers.net WHOIS 回退
       └─ 成功 → 正则提取 expiry
```

WHOIS / RDAP 查询逻辑纯 Node.js 实现（`net` + `https`），不依赖外部 WHOIS npm 包。

## 快照系统

快照触发时机：

| 触发方式 | trigger 值 |
|----------|------------|
| 手动创建 | `manual` |
| 解析变更 | `on_change` |

快照存储完整记录副本（JSONB），支持：

- 版本间 diff（新增 / 删除 / 修改）
- 回滚到任意版本

## 安全设计

### 密码安全

- bcrypt 哈希存储
- 修改密码需验证旧密码

### JWT 安全

- Access Token 短有效期（15 分钟）
- Refresh Token HttpOnly Cookie，不可被 JS 读取
- 2FA Temp Token 独立 scope，不可用于常规 API
- Refresh Token 存储在数据库，可被服务端吊销

### API Key 安全

- Key 本身只显示一次，数据库存 hash
- `dmhub_` 前缀标记管理员 Key，`dmhub_pt_` 标记用户令牌
- 粒度权限控制（`domains:read` / `records:write` / `*`）
- 100 req/min 频率限制（进程内存实现，多实例部署不共享计数）

### 2FA 安全

- TOTP 密钥加密存储（AES-256）
- 备用码 hash 存储，使用后标记已用
- 管理员帮助重置流程需验证备用邮箱
- 禁用用户时自动吊销所有 refresh token

### 数据隔离

- admin 查看全部数据，member 仅查看指派范围
- 中间件层统一校验，不依赖前端控制

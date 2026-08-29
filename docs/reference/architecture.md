# 系统架构

DMHub 采用 pnpm workspace monorepo 结构，前后端分离部署。

## 整体架构

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

> OIDC 重定向 URL 为 `{站点URL}/oauth/oidc`，必须由反向代理转发到后端，不能落到前端 SPA。

## 请求处理流程

```
Client → Caddy → Nginx → Fastify Router → Middleware → Route Handler → Service → Drizzle ORM → PostgreSQL
                                                         ↓
                                                   DNS Provider API
                                                         ↓
                                                   Notification Dispatch
```

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
│   │   │   └── lib/          # 工具函数
│   │   └── tailwind.config.js
│   └── server/               # Fastify 后端
│       └── src/
│           ├── routes/       # 路由处理
│           ├── services/     # 业务逻辑（含 oauth、notification、assignment）
│           ├── middleware/    # 认证、域名/记录权限
│           ├── db/           # 双方言 schema + helpers
│           ├── lib/          # JWT、cron、WHOIS、oauth/、notifications/
│           └── config/
├── packages/
│   ├── shared/               # 类型 + Zod + DNS 模板常量
│   └── dns-providers/        # Cloudflare / 阿里云 / 腾讯云
├── docs/                     # VitePress 文档
├── docker/
└── Caddyfile
```

## 关键子系统

### OIDC / OAuth2

```
authorize → IdP → callback (/oauth/oidc 或 /api/auth/oauth/:id/callback)
  → 校验 state（含 redirect_uri + intent）
  → token 交换（原样 redirect_uri）
  → login: 一次性 ticket → 前端 exchange-ticket
  → bind: 写入 user_oauth_bindings
```

配置存 `oauth_providers`（含 `well_known_url` 与可选端点覆盖）。详见 [OIDC 指南](/guide/oauth)。

### 站内信与通知

```
notifyUser / notifyAdmins
  → 内存 NOTIFICATION_STORE + SSE
  → emailNotificationsEnabled 时 SMTP 发信

triggerNotification(event)
  → 匹配 notification_configs → 钉钉/飞书/邮件列表/Webhook
```

### 域名指派

`domain_assignments.subdomainPattern` + 三层中间件；成员 API 返回 `assignments[]` 供前端展示可管范围。

## 分层设计

### 前端

| 层 | 职责 |
|---|---|
| **Views** | 页面组件，对应路由 |
| **Stores** | Pinia 状态管理，API 调用封装 |
| **Components** | 通用 UI（shadcn-vue / Radix Vue）+ 业务组件 |
| **Lib** | axios、copy/toast、subdomain-scope 等 |
| **Composables** | 主题、确认框、请求竞态等 |

### 后端

| 层 | 职责 |
|---|---|
| **Routes** | 参数校验、调用 Service |
| **Services** | 业务逻辑、数据库操作 |
| **Middleware** | 认证、权限校验 |
| **DB** | Drizzle ORM schema、连接池 |
| **Lib** | JWT、cron、WHOIS、通知等工具 |

## 认证流程

### 令牌体系

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

## 安全设计

### 密码安全

- bcrypt 哈希存储
- 修改密码需验证旧密码

### JWT 安全

- Access Token 短有效期（15 分钟）
- Refresh Token HttpOnly Cookie，不可被 JS 读取
- 2FA Temp Token 独立 scope，不可用于常规 API
- Refresh Token 存储在数据库，可被服务端吊销

### 数据隔离

- admin 查看全部数据，member 仅查看指派范围
- 中间件层统一校验，不依赖前端控制

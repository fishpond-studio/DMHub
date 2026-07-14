# 系统架构

DMHub 采用 pnpm workspace monorepo 结构，前后端分离部署。

## 整体架构

```
┌─────────────┐     ┌──────────────────────────────────────┐
│   Caddy     │────▶│  Nginx                              │
│ (HTTPS/443) │     │  ├── /           → Vue SPA (80)     │
│             │     │  ├── /api/*      → Node.js (3000)   │
│             │     │  └── /uploads/*  → Node.js (3000)   │
└─────────────┘     └──────────────────────────────────────┘
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

## 分层设计

### 前端

| 层 | 职责 |
|---|---|
| **Views** | 页面组件，对应路由 |
| **Stores** | Pinia 状态管理，API 调用封装 |
| **Components** | 通用 UI 组件（Radix Vue） |
| **Lib** | axios 封装、工具函数 |

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

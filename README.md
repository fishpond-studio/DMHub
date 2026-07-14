# DMHub

Domain Management Hub — 面向小型团队的开源域名协作管理平台。

解决域名分散在个人账号、到期无人管理、解析变更无通知、出问题互相推诿等痛点。

## 功能概览

### 系统初始化引导

首次访问自动进入引导流程，无需预配置数据库（6 步）：

1. **配置数据库** — PostgreSQL（推荐）/ MariaDB / MySQL 8+，支持连接测试，数据库不存在时自动创建
2. **创建数据表** — 一键建表（根据所选方言自动选用 PG / MySQL 迁移脚本）
3. **注册管理员** — 首个用户自动成为管理员
4. **绑定站点 URL** — OAuth 回调、Cookie 域名、Caddy HTTPS，可跳过
5. **配置 SMTP** — 常见邮箱预设（QQ / 163 / 阿里云 / 飞书 / iCloud / Gmail / Outlook）
6. **验证邮箱** — 确认 SMTP 配置正确

> 数据库方言（PostgreSQL ↔ MariaDB/MySQL）切换会让保存接口返回 `restartRequired: true`，需重启服务（Docker：`docker compose restart app`；本地：Ctrl+C 后重新 `pnpm dev:server`）才能让 schema 加载到对应方言。

### 认证体系

- **账号密码登录** — 用户名或邮箱 + 密码，bcryptjs 哈希存储
- **OIDC / OAuth2 登录** — GitHub / GitLab / Google / 钉钉 / 飞书 / 自定义 OIDC
- **双因素认证（2FA）** — TOTP / Passkey (WebAuthn) / 邮箱验证码，三选一或组合
- **备用代码** — 启用 2FA 时生成 8 个备用代码（XXXX-XXXX），可下载 ZIP
- **管理员帮助重置** — 忘记 2FA 时请求管理员帮助

### 权限与团队

- **单团队模式** — `team_settings` 单行表
- **邀请码制度** — 默认开启，管理员可随时关闭
- **三角色模型** — admin / member / guest
- **域名指派** — 管理员为 member 指派域名及子域名管理权限（`dns_edit` / `dns_readonly`）
- **指派申请** — member 可主动申请，管理员审批
- **用户令牌** — 个人访问令牌（`dmhub_pt_` 前缀），用于 Open API 认证

### 域名与解析

- **域名管理** — 添加 / 删除域名，关联 DNS 服务商，查看到期状态
- **解析记录 CRUD** — A / AAAA / CNAME / MX / TXT / NS / SRV / CAA，变更同步到服务商
- **批量 DNS 记录创建** — 单次最多100条，自动按类型校验记录值格式
- **DNS 记录模板** — 9 个预设场景（Google Workspace、Microsoft 365、Cloudflare CDN 等），一键批量添加
- **DNS 服务商** — Cloudflare / 阿里云 / 腾讯云，连接测试
- **WHOIS / RDAP 到期查询** — 三级回退（RDAP → WHOIS → whois-servers.net），纯 Node.js 实现
- **解析快照** — 手动 / 变更时自动备份，支持回滚
- **批量导入/导出** — CSV 批量导入域名和解析记录，支持 CSV/JSON 导出
- **域名分组与标签**

### 通知与提醒

- **多渠道通知** — 网页 Toast / 钉钉 / 飞书 / 邮件 / Webhook
- **到期提醒** — 每天 08:00 定时检查，提醒节点可配置（30 / 14 / 7 / 3 / 1 / 0 天）
- **操作通知** — 解析变更、成员变动、指派申请等事件触发

### 操作审计

- **操作日志** — 所有关键操作留痕
- **角色隔离** — admin 查看全部，member 仅查看指派范围

### 主页与公告

- **站外主页** (`/`) — 团队名称、副标题、Logo、自定义背景图、底栏
- **站外公告** — 登录页展示公告，支持 Markdown / HTML
- **团队 Logo** — PNG / JPG / SVG，≤ 1MB

### 监控与 API

- **UptimeKuma 集成** — 对接 Push URL
- **本地测速** — DNS 解析测速、HTTP 可用性检测
- **开放 API** — REST API，支持 API Key（`dmhub_` 前缀）和用户令牌（`dmhub_pt_` 前缀）认证

### 仪表盘 (`/dashboard`)

域名总数 / 活跃 / 过期统计、DNS 记录数与类型分布、团队成员数、近 7 天变更数、到期日历、即将过期域名、最近操作活动

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + Vite + Radix Vue + Tailwind CSS + Pinia |
| 后端 | Fastify + TypeScript + Drizzle ORM |
| 数据库 | PostgreSQL（推荐）/ MariaDB / MySQL 8+（双方言 schema，启动时自动选择） |
| 缓存 | Redis（可选，当前未实现） |
| 认证 | JWT（Access 15min + Refresh 7d）+ bcryptjs |
| DNS SDK | Cloudflare REST API / 阿里云 REST API / 腾讯云 REST API |
| 2FA | TOTP (otpauth) + WebAuthn (Passkey) + 邮箱验证码 |
| 部署 | Docker Compose + Caddy（自动 HTTPS） |

## 快速开始

### Docker Compose（推荐）

```bash
git clone https://github.com/FishpondStu/dmhub.git
cd dmhub
cp .env.example .env
# 编辑 .env，填入 JWT_SECRET 和 ENCRYPTION_KEY
#   JWT_SECRET:      openssl rand -hex 32
#   ENCRYPTION_KEY:  openssl rand -hex 32
docker compose -f docker/docker-compose.yml --env-file .env up -d
# 访问 https://your-domain.com 进入初始化引导
```

### 本地开发

```bash
# 需要 Node.js ≥ 20 和 pnpm ≥ 9
pnpm install
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build
pnpm dev:web     # 前端 :5173
pnpm dev:server  # 后端 :8088
# http://localhost:5173
```

## 项目结构

```
dmhub/
├── apps/
│   ├── web/                # Vue 3 前端（Vite + Radix Vue + Tailwind）
│   └── server/             # Fastify 后端（TypeScript + Drizzle ORM）
├── packages/
│   ├── shared/             # 共享类型、Zod schema、常量
│   └── dns-providers/      # DNS 服务商适配器（Cloudflare / 阿里云 / 腾讯云）
├── docker/                 # Docker 构建文件
│   ├── Dockerfile.server
│   ├── Dockerfile.web
│   ├── docker-compose.yml
│   └── nginx.conf
├── Caddyfile               # Caddy 反向代理配置
├── start.bat               # Windows 开发/生产启动脚本
├── .env.example            # 环境变量模板
├── API.md                  # API 文档
├── TUTORIAL.md             # 使用教程
└── ARCHITECTURE.md         # 架构说明
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `8088` | 后端监听端口（Docker 使用 `3000`） |
| `NODE_ENV` | 否 | `development` | 运行环境 |
| `JWT_SECRET` | **是** | - | JWT 签名密钥（`openssl rand -hex 32`） |
| `ENCRYPTION_KEY` | **是** | - | 数据加密密钥（`openssl rand -hex 32`） |
| `DB_TYPE` | 否 | `postgresql` | 数据库方言：`postgresql` / `mysql` / `mariadb`。决定 schema 加载和迁移脚本选择，切换后**必须重启**服务 |
| `DATABASE_URL` | 否 | - | 数据库连接串（可选预填，首次启动通过引导界面配置）。PG 示例：`postgresql://dmhub:dmhub@postgres:5432/dmhub`；MySQL/MariaDB 示例：`mysql://dmhub:dmhub@mysql:3306/dmhub` |
| `REDIS_URL` | 否 | - | Redis 连接串（保留字段，当前未实现） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | 否 | - | SMTP 配置（保留字段，通过引导界面或团队设置配置） |
| `DOMAIN` | 否 | `dmhub.example.com` | Caddy 自动 HTTPS 用，对外访问域名（Docker 部署需修改为实际域名） |

> 引导界面保存的数据库 / SMTP 配置会写入 `team_settings` 表；若两者同时存在，启动时以数据库中的配置为准。SMTP 和 OAuth 等环境变量为保留字段，实际配置通过引导界面或团队设置页面完成。

## 文档

- [API 文档](./API.md) — 完整 REST API 参考
- [使用教程](./TUTORIAL.md) — 从部署到日常使用
- [架构说明](./ARCHITECTURE.md) — 系统设计与数据流
- [贡献指南](./CONTRIBUTING.md) — 开发环境搭建与代码规范

## 开源协议

AGPL-3.0

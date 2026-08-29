# DMHub

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-AGPL--3.0-green.svg)](./LICENSE)

Domain Management Hub �?面向小型团队的开源域名协作管理平台�?

解决域名分散在个人账号、到期无人管理、解析变更无通知、出问题互相推诿等痛点�?

**当前版本�?.2.0** �?详见 [更新日志](./CHANGELOG.md) �?[0.2.0 新特性](./docs/guide/whats-new.md)�?

## 功能概览

### 系统初始化引�?

首次访问自动进入引导流程，无需预配置数据库�? 步）�?

1. **配置数据�?* �?PostgreSQL（推荐）/ MariaDB / MySQL 8+，支持连接测试，数据库不存在时自动创�?
2. **创建数据�?* �?一键建表（根据所选方言自动选用 PG / MySQL 迁移脚本�?
3. **注册管理�?* �?首个用户自动成为管理�?
4. **绑定站点 URL** �?OAuth 回调、Cookie 域名、Caddy HTTPS，可跳过
5. **配置 SMTP** �?常见邮箱预设（QQ / 163 / 阿里�?/ 飞书 / iCloud / Gmail / Outlook�?
6. **验证邮箱** �?确认 SMTP 配置正确

> 数据库方言（PostgreSQL �?MariaDB/MySQL）切换会让保存接口返�?`restartRequired: true`，需重启服务（Docker：`docker compose restart app`；本地：Ctrl+C 后重�?`pnpm dev:server`）才能让 schema 加载到对应方言�?

### 认证体系

- **账号密码登录** �?用户名或邮箱 + 密码，bcryptjs 哈希存储
- **OIDC / OAuth2 登录** �?GitHub / GitLab / Google / 钉钉 / 飞书 / **标准 OIDC**（Well-Known 自动发现�?
- **OIDC 简洁回�?* �?重定�?URL 固定�?`{站点URL}/oauth/oidc`，配置页可复制主�?URL / 重定�?URL
- **账号绑定** �?登录后绑定外部身份；绑定流程与登�?state 分离（intent=bind�?
- **双因素认证（2FA�?* �?TOTP / Passkey (WebAuthn) / 邮箱验证码，三选一或组�?
- **备用代码** �?启用 2FA 时生�?8 个备用代码（XXXX-XXXX），可下�?ZIP
- **管理员帮助重�?* �?忘记 2FA 时请求管理员帮助

### 权限与团�?

- **单团队模�?* �?`team_settings` 单行�?
- **邀请码制度** �?默认开启，管理员可随时关闭
- **三角色模�?* �?admin / member / guest
- **域名指派** �?管理员为 member 指派域名及子域名管理权限（`dns_edit` / `dns_readonly`�?
- **范围可见** �?成员在「我的域�?/ 域名详情」直接看到可管理主机（如 `blog.example.com`），无需试错
- **指派申请** �?member 可主动申请，管理员审批；分配/审批会发站内信（可选邮件）
- **用户令牌** �?个人访问令牌（`dmhub_pt_` 前缀），用于 Open API 认证

### 域名与解�?

- **域名管理** �?添加 / 删除域名，关�?DNS 服务商，查看到期状�?
- **解析记录 CRUD** �?A / AAAA / CNAME / MX / TXT / NS / SRV / CAA，变更同步到服务�?
- **批量 DNS 记录创建** �?单次最�?00条，自动按类型校验记录值格�?
- **DNS 记录模板** �?9 个预设场景（Google Workspace、Microsoft 365、Cloudflare CDN 等），一键批量添�?
- **DNS 服务�?* �?Cloudflare / 阿里�?/ 腾讯云，连接测试
- **WHOIS / RDAP 到期查询** �?三级回退（RDAP �?WHOIS �?whois-servers.net），�?Node.js 实现
- **解析快照** �?手动 / 变更时自动备份，支持回滚
- **批量导入/导出** �?CSV / Excel�?xlsx）批量导入域名和解析记录，支�?CSV/JSON 导出
- **域名分组与标�?*

### 通知与提�?

- **站内�?* �?顶栏铃铛收件�?+ SSE 实时推�?+ Toast；支持已�?/ 清空
- **可选邮件通知** �?个人资料开启后，域名分配等事件发到绑定邮箱（需 SMTP�?
- **多渠道通知** �?钉钉 / 飞书 / 邮件列表 / Webhook（管理员配置事件订阅，支�?HMAC 签名�?
- **到期提醒** �?每天 08:00 定时检查，提醒节点可配置（30 / 14 / 7 / 3 / 1 / 0 天）
- **操作通知** �?解析变更、成员变动、指派申请等事件触发；事件清单前后端共享枚举

### 操作审计与会�?

- **操作日志** �?所有关键操作留痕；admin 查看全部，member 仅查看指派范�?
- **日志保留策略** �?可配置保留天数，每日定时清理过期日志与监控历�?
- **登录会话管理** �?个人资料页查�?注销登录设备；管理员可强制注销任意用户全部会话
- **登录失败留痕** �?密码错误记录 `login_failed` 日志（含 IP / UA�?

### 主页与公�?

- **站外主页** (`/`) �?团队名称、副标题、Logo、自定义背景图、底�?
- **站外公告** �?登录页展示公告，支持 Markdown / HTML
- **团队 Logo** �?PNG / JPG / SVG，≤ 1MB

### 监控�?API

- **可用性监�?* �?�?15 分钟定时 HTTP 探测、状态变更告警、可用率与响应趋势、历史持久化�?0 天）
- **UptimeKuma 集成** �?对接 Push URL
- **本地测�?* �?DNS 解析测速、HTTP 可用性检�?
- **开�?API** �?REST API，支�?API Key（`dmhub_` 前缀）和用户令牌（`dmhub_pt_` 前缀）认�?

### 备份恢复

- **全量备份** �?JSON 导出/恢复域名与解析记录（不含服务商凭据），恢复时跳过已存在项

### 缓存（可选）

- **Redis** �?团队设置�?`REDIS_URL` 配置后启用；验证�?/ 限流 / 登录票据等临时状态共享化，断连自动回退进程内存

### 仪表�?(`/dashboard`)

域名总数 / 活跃 / 过期统计、DNS 记录数与类型分布、团队成员数、近 7 天变更数、到期日历、即将过期域名、最近操作活动、快捷入�?

### 交互体验

- **命令面板** �?`Ctrl/�?+ K` 搜索页面、域名与快捷操作
- **DNS 模板** �?域名详情一键应用常见场景并批量创建记录
- **导出** �?域名列表 / 单域 DNS 记录 CSV
- **复制** �?域名、记录值一键复�?
- **多语言** �?简体中�?/ English 切换（顶栏语言开关）
- **暗色模式** �?浅色 / 深色 / 跟随系统，防首屏闪烁

## 技术栈

| �?| 选型 |
|---|---|
| 前端 | Vue 3 + Vite + shadcn-vue（Radix Vue�? Tailwind CSS + Pinia |
| 后端 | Fastify + TypeScript + Drizzle ORM |
| 数据�?| PostgreSQL（推荐）/ MariaDB / MySQL 8+（双方言 schema，启动时自动选择�?|
| 缓存 | Redis（可选，启用后验证码/限流共享化，否则内存回退�?|
| 认证 | JWT（Access 15min + Refresh 7d�? bcryptjs |
| DNS SDK | Cloudflare REST API / 阿里�?REST API / 腾讯�?REST API |
| 2FA | TOTP (otpauth) + WebAuthn (Passkey) + 邮箱验证�?|
| 部署 | Docker Compose + Caddy（自�?HTTPS�?|

## 快速开�?

### Docker Compose（推荐）

```bash
git clone https://github.com/fishpond-studio/dmhub.git
cd dmhub
cp .env.example .env
# 编辑 .env，填�?JWT_SECRET �?ENCRYPTION_KEY
#   JWT_SECRET:      openssl rand -hex 32
#   ENCRYPTION_KEY:  openssl rand -hex 32
docker compose -f docker/docker-compose.yml --env-file .env up -d
# 访问 https://your-domain.com 进入初始化引�?
```

### 本地开�?

```bash
# 需�?Node.js �?20 �?pnpm �?9
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
�?  ├── web/                # Vue 3 前端（Vite + Radix Vue + Tailwind�?
�?  └── server/             # Fastify 后端（TypeScript + Drizzle ORM�?
├── packages/
�?  ├── shared/             # 共享类型、Zod schema、常�?
�?  └── dns-providers/      # DNS 服务商适配器（Cloudflare / 阿里�?/ 腾讯云）
├── docker/                 # Docker 构建文件
�?  ├── Dockerfile.server
�?  ├── Dockerfile.web
�?  ├── docker-compose.yml
�?  └── nginx.conf
├── Caddyfile               # Caddy 反向代理配置
├── start.bat               # Windows 开�?生产启动脚本
├── .env.example            # 环境变量模板
├── API.md                  # API 文档
├── TUTORIAL.md             # 使用教程
└── ARCHITECTURE.md         # 架构说明
```

## 环境变量

| 变量 | 必填 | 默认�?| 说明 |
|------|------|--------|------|
| `PORT` | �?| `8088` | 后端监听端口（Docker 使用 `3000`�?|
| `NODE_ENV` | �?| `development` | 运行环境 |
| `JWT_SECRET` | **�?* | - | JWT 签名密钥（`openssl rand -hex 32`�?|
| `ENCRYPTION_KEY` | **�?* | - | 数据加密密钥（`openssl rand -hex 32`�?|
| `DB_TYPE` | �?| `postgresql` | 数据库方言：`postgresql` / `mysql` / `mariadb`。决�?schema 加载和迁移脚本选择，切换后**必须重启**服务 |
| `DATABASE_URL` | �?| - | 数据库连接串（可选预填，首次启动通过引导界面配置）。PG 示例：`postgresql://dmhub:dmhub@postgres:5432/dmhub`；MySQL/MariaDB 示例：`mysql://dmhub:dmhub@mysql:3306/dmhub` |
| `REDIS_URL` | �?| - | Redis 连接串（可选；启用后验证码/限流/票据共享化。也可在团队设置中配置后重启生效）。示例：`redis://redis:6379` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | �?| - | SMTP 配置（保留字段，通过引导界面或团队设置配置） |
| `DOMAIN` | �?| `dmhub.example.com` | Caddy 自动 HTTPS 用，对外访问域名（Docker 部署需修改为实际域名） |

> 引导界面保存的数据库 / SMTP 配置会写�?`team_settings` 表；若两者同时存在，启动时以数据库中的配置为准。SMTP �?OAuth 等环境变量为保留字段，实际配置通过引导界面或团队设置页面完成�?

## 文档

| 文档 | 说明 |
|------|------|
| [VitePress 文档站](./docs/) | 指南 + API + 架构（`pnpm docs:dev`�?|
| [API.md](./API.md) | 完整 REST API 参考（仓库根目录） |
| [使用教程](./TUTORIAL.md) | 从部署到日常使用 |
| [架构说明](./ARCHITECTURE.md) | 系统设计与数据流 |
| [贡献指南](./CONTRIBUTING.md) | 开发环境与代码规范 |
| [更新日志](./CHANGELOG.md) | 版本变更 |

### 常用指南（docs�?

- [OIDC / OAuth2 登录](./docs/guide/oauth.md) �?Well-Known、主�?URL / 重定�?URL `/oauth/oidc`
- [通知配置](./docs/guide/notifications.md) �?站内信、可选邮件、外部渠�?
- [域名指派](./docs/guide/assignments.md) �?子域名范围展示与权限
- [API：OAuth](./docs/api/oauth.md) · [API：通知](./docs/api/notifications.md)

### 本地预览文档�?

```bash
pnpm docs:dev
# 默认 http://localhost:5173（以终端输出为准�?
```

## 开源协�?

AGPL-3.0

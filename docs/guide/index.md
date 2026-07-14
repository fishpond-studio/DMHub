# DMHub 简介

DMHub 是面向小型团队的开源域名协作管理平台，解决域名分散、到期无人管理、解析变更无通知等问题。

## 为什么需要 DMHub

| 痛点 | DMHub 方案 |
|------|-----------|
| 域名分散在个人账号，管理混乱 | 统一管理，多人协作，分组标签一目了然 |
| 域名过期了才发现，造成损失 | WHOIS 自动查询 + 多渠道到期提醒 |
| 解析被改了没人知道，出问题才发现 | 所有变更留痕 + 多渠道实时通知 |
| 出问题不知道谁负责，互相甩锅 | 角色隔离，权限分级，操作可追溯 |

## 功能概览

### 初始化引导

首次访问自动进入 6 步引导流程：

1. **配置数据库** — PostgreSQL / MariaDB / MySQL 8+，支持连接测试
2. **创建数据表** — 一键建表，按所选方言自动选用迁移脚本
3. **注册管理员** — 首个用户自动成为管理员
4. **绑定站点 URL** — OAuth 回调、Cookie 域名、Caddy HTTPS
5. **配置 SMTP** — 常见邮箱预设（QQ / 163 / 阿里云 / Gmail 等）
6. **验证邮箱** — 确认 SMTP 配置正确

### 认证体系

| 方式 | 说明 |
|------|------|
| 账号密码 | 用户名或邮箱 + 密码，bcryptjs 哈希存储 |
| OAuth2 / OIDC | GitHub / GitLab / Google / 钉钉 / 飞书 / 自定义 OIDC |
| 双因素认证 | TOTP / Passkey / 邮箱验证码 / 备用代码，可多选 |

### 权限与团队

- **三角色模型** — admin / member / guest
- **域名指派** — 管理员为 member 指派域名及子域名管理权限
- **指派申请** — member 可主动申请，管理员审批
- **邀请码制度** — 默认开启，管理员可随时关闭

### 域名与 DNS

- 域名管理（添加 / 删除 / 分组 / 标签 / 状态）
- 解析记录 CRUD（A / AAAA / CNAME / MX / TXT / NS / SRV / CAA），自动校验记录值格式
- 批量 DNS 记录创建（单次最多100条）
- [DNS 记录模板](/guide/dns-templates) — 9 个预设场景，快速填充，支持批量添加
- DNS 服务商：Cloudflare / 阿里云 / 腾讯云
- WHOIS / RDAP 到期查询（三级回退，纯 Node.js 实现）
- [批量导出](/api/#导出端点) — 域名列表和 DNS 记录导出 CSV / JSON
- 解析快照（手动 / 变更触发），支持 diff 和回滚
- 批量导入域名和解析记录（CSV）

### 通知与监控

- 多渠道通知：网页 Toast / 钉钉 / 飞书 / 邮件 / Webhook
- 到期提醒：每天 08:00 检查，可配置提醒节点
- SSE 实时推送
- UptimeKuma Push URL 集成
- DNS 测速 / HTTP 可用性检测

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + Vite + Radix Vue + Tailwind CSS + Pinia |
| 后端 | Fastify + TypeScript + Drizzle ORM |
| 数据库 | PostgreSQL（推荐）/ MariaDB / MySQL 8+ |
| 认证 | JWT（Access 15min + Refresh 7d）+ bcryptjs |
| DNS | Cloudflare / 阿里云 / 腾讯云 REST API |
| 部署 | Docker Compose + Caddy（自动 HTTPS） |

## 项目结构

```
dmhub/
├── apps/
│   ├── web/                # Vue 3 前端
│   └── server/             # Fastify 后端
├── packages/
│   ├── shared/             # 共享类型、Zod schema、常量
│   └── dns-providers/      # DNS 服务商适配器
├── docker/                 # Docker 构建文件
├── docs/                   # VitePress 文档（本站）
├── Caddyfile               # Caddy 反向代理
└── .env.example            # 环境变量模板
```

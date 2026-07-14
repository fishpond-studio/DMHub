# 环境变量

完整环境变量参考。复制 `.env.example` 为 `.env` 并填写。

## 必填变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `JWT_SECRET` | JWT 签名密钥 | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 数据加密密钥（AES-256） | `openssl rand -hex 32` |

## 数据库

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DB_TYPE` | 否 | `postgresql` | 数据库方言：`postgresql` / `mysql` / `mariadb`。切换后**必须重启**服务 |
| `DATABASE_URL` | 否 | - | 数据库连接串。可选预填，首次启动通过引导界面配置 |
| `POSTGRES_USER` | 否 | `dmhub` | PostgreSQL 用户名（仅 Docker Compose 内部用） |
| `POSTGRES_PASSWORD` | 否 | `dmhub` | PostgreSQL 密码 |
| `POSTGRES_DB` | 否 | `dmhub` | PostgreSQL 数据库名 |

连接串示例：

```
# PostgreSQL
postgresql://dmhub:dmhub@postgres:5432/dmhub

# MySQL / MariaDB
mysql://dmhub:dmhub@mysql:3306/dmhub
```

## Redis

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `REDIS_URL` | 否 | - | Redis 连接串（保留字段，当前未实现） |

## SMTP

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `SMTP_HOST` | 否 | - | SMTP 服务器地址 |
| `SMTP_PORT` | 否 | `587` | SMTP 端口（465 = SSL / 587 = TLS） |
| `SMTP_USER` | 否 | - | SMTP 用户名 |
| `SMTP_PASSWORD` | 否 | - | SMTP 密码或授权码 |
| `SMTP_FROM` | 否 | - | 发件人地址 |

> SMTP 也可在首次启动引导中配置。引导界面保存的 SMTP 配置会写入 `team_settings` 表。

## OAuth Providers

| 变量 | 说明 |
|------|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `GITLAB_CLIENT_ID` | GitLab Application ID |
| `GITLAB_CLIENT_SECRET` | GitLab Secret |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `DINGTALK_CLIENT_ID` | 钉钉应用 Key |
| `DINGTALK_CLIENT_SECRET` | 钉钉应用 Secret |
| `FEISHU_CLIENT_ID` | 飞书应用 ID |
| `FEISHU_CLIENT_SECRET` | 飞书应用 Secret |

## 自定义 OIDC

| 变量 | 说明 |
|------|------|
| `CUSTOM_OIDC_NAME` | 显示名称 |
| `CUSTOM_OIDC_ISSUER` | OIDC Provider 的 Issuer URL |
| `CUSTOM_OIDC_CLIENT_ID` | Client ID |
| `CUSTOM_OIDC_CLIENT_SECRET` | Client Secret |

## 部署

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | `8088` | 后端监听端口（Docker 使用 `3000`） |
| `NODE_ENV` | 否 | `development` | 运行环境：`development` / `production` |
| `DOMAIN` | 否 | `dmhub.example.com` | Caddy 自动 HTTPS 用，对外访问域名 |
| `TABLE_PREFIX` | 否 | （空） | 已废弃，保留兼容 |

## 配置优先级

引导界面保存的配置（数据库 / SMTP 等）会写入 `team_settings` 表。若环境变量和数据库配置同时存在：

- 数据库连接：以引导界面配置为准（首次启动后环境变量失效）
- SMTP：引导界面配置优先

> 建议首次启动后移步「设置 → 团队设置」管理这些配置，而非依赖环境变量。

## .env.example 完整模板

```bash
# ============================================================
# DMHub 环境变量配置
# ============================================================

# ----- 必填 -----
JWT_SECRET=
ENCRYPTION_KEY=

# ----- 数据库 -----
DB_TYPE=postgresql
DATABASE_URL=postgresql://dmhub:dmhub@postgres:5432/dmhub

# ----- PostgreSQL 容器配置 -----
POSTGRES_USER=dmhub
POSTGRES_PASSWORD=dmhub
POSTGRES_DB=dmhub

# ----- Redis（可选） -----
REDIS_URL=

# ----- 邮件 -----
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# ----- OAuth Providers（按需） -----
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# GITLAB_CLIENT_ID=
# GITLAB_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# DINGTALK_CLIENT_ID=
# DINGTALK_CLIENT_SECRET=
# FEISHU_CLIENT_ID=
# FEISHU_CLIENT_SECRET=

# ----- 自定义 OIDC -----
# CUSTOM_OIDC_NAME=
# CUSTOM_OIDC_ISSUER=
# CUSTOM_OIDC_CLIENT_ID=
# CUSTOM_OIDC_CLIENT_SECRET=

# ----- 域名 -----
DOMAIN=dmhub.example.com
```

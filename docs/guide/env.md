# 环境变量

DMHub 通过 `.env` 加载运行时密钥与部署参数。**OAuth/OIDC、SMTP、站点 URL 等业务配置以引导界面 / 团队设置为准**，不依赖下列 OAuth 环境变量。

## 必填

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥，建议 `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 敏感字段加密密钥，建议 `openssl rand -hex 32` |

## 数据库

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `DB_TYPE` | 否 | `postgresql` | `postgresql` / `mysql` / `mariadb`。切换后**必须重启** |
| `DATABASE_URL` | 否 | - | 连接串；也可在首次引导中配置并写入 `team_settings` |

示例：

```bash
# PostgreSQL
DATABASE_URL=postgresql://dmhub:dmhub@localhost:5432/dmhub

# MySQL / MariaDB
DB_TYPE=mysql
DATABASE_URL=mysql://dmhub:dmhub@localhost:3306/dmhub
```

## 邮件（可选预填）

| 变量 | 说明 |
|------|------|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | 历史/预填字段 |

实际 SMTP 在 **初始化引导** 或 **设置 → 团队设置** 中配置，保存到 `team_settings`。

个人「邮件通知」开关见 [通知配置](/guide/notifications)。

## 部署

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `PORT` | 否 | `8088` | 后端端口（Docker 内多为 `3000`） |
| `NODE_ENV` | 否 | `development` | `development` / `production` |
| `DOMAIN` | 否 | `dmhub.example.com` | Caddy 自动 HTTPS 域名 |
| `ALLOWED_ORIGINS` | 否 | - | 生产 CORS 白名单（逗号分隔） |
| `REDIS_URL` | 否 | - | 预留，当前未实现 |
| `TABLE_PREFIX` | 否 | - | 已废弃 |

## OAuth / OIDC（勿依赖环境变量）

提供商在 **设置 → OIDC / OAuth2** 配置，写入表 `oauth_providers`：

| UI 字段 | 说明 |
|---------|------|
| Client ID / Secret | 必填 |
| Well-Known URL | OIDC 必填（或手填授权+Token 端点） |
| 授权 / Token / 用户信息端点 | 可选覆盖 |

登记到 IdP：

| 名称 | 值 |
|------|-----|
| 主页 URL | `{站点URL}`（团队设置中的 site URL） |
| OIDC 重定向 URL | `{站点URL}/oauth/oidc` |

详见 [OIDC / OAuth2 登录](/guide/oauth)。

> 仓库 `.env.example` 中若仍有 `GITHUB_*` / `CUSTOM_OIDC_*` 等注释项，仅为历史预留，**运行时不会读取**。

## 配置优先级

| 项 | 优先级 |
|----|--------|
| 数据库连接 | 引导保存的配置 > 启动时 `DATABASE_URL` |
| SMTP | `team_settings` > 环境变量预填 |
| OAuth | 仅 `oauth_providers` 表 |
| 站点 URL | `team_settings.site_url`（生成 OAuth 回调必需） |

## .env 最小模板

```bash
JWT_SECRET=
ENCRYPTION_KEY=

DB_TYPE=postgresql
# DATABASE_URL=postgresql://dmhub:dmhub@localhost:5432/dmhub

# Docker / Caddy
# DOMAIN=dmhub.example.com
# NODE_ENV=production
```

完整示例见仓库根目录 `.env.example`。

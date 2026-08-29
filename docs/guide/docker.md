# Docker Compose 部署

生产推荐使用 Docker Compose 部署，包含四个容器。

## 架构

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

## 目录结构

```
dmhub/
├── docker/
│   ├── Dockerfile.server    # 后端多阶段构建
│   ├── Dockerfile.web       # 前端构建 + Nginx
│   ├── docker-compose.yml   # 服务编排
│   └── nginx.conf           # Nginx 配置
├── Caddyfile               # Caddy 反向代理
└── .env                     # 环境变量
```

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
# 必填 — 生成命令: openssl rand -hex 32
JWT_SECRET=
ENCRYPTION_KEY=

# 对外域名（Caddy 自动 HTTPS 用）
DOMAIN=dmhub.your-domain.com

# 数据库
DB_TYPE=postgresql
DATABASE_URL=postgresql://dmhub:dmhub@postgres:5432/dmhub
POSTGRES_USER=dmhub
POSTGRES_PASSWORD=dmhub
POSTGRES_DB=dmhub

# SMTP（可选，也可在引导页面配置）
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
# SMTP_FROM=
```

## 启动命令

```bash
# 启动所有服务
docker compose -f docker/docker-compose.yml --env-file .env up -d

# 查看日志
docker compose -f docker/docker-compose.yml logs -f app

# 重启后端（切换数据库方言后）
docker compose restart app

# 停止所有服务
docker compose down
```

## 构建过程

### 后端 (`Dockerfile.server`)

多阶段构建：
1. **builder** — Node 20 Alpine，pnpm install → 构建 shared / dns-providers / server
2. **runner** — Node 20 Alpine，仅复制 dist + node_modules，镜像 ~150MB

### 前端 (`Dockerfile.web`)

多阶段构建：
1. **builder** — Node 20 Alpine，构建 Vue SPA
2. **runner** — Nginx Alpine，静态文件服务

## Caddy 配置

`Caddyfile` 提供：

- 自动 HTTPS（Let's Encrypt）
- 静态资源缓存（1 年）
- API 不缓存
- SSE 长连接支持
- 上传文件代理
- **OIDC 回调** `/oauth/oidc` 转发到后端（勿落到前端 SPA）

```text
{$DOMAIN} {
    reverse_proxy web:80

    @static path *.js *.css *.png *.jpg *.svg *.ico *.woff2
    header @static Cache-Control "public, max-age=31536000, immutable"

    @api path /api/*
    header @api Cache-Control "no-store"

    handle /uploads/* {
        reverse_proxy app:3000
    }

    handle /oauth/oidc {
        reverse_proxy app:3000
    }

    handle /api/notifications/stream {
        reverse_proxy app:3000 {
            flush_interval -1
        }
    }
}
```

Nginx（`docker/nginx.conf`）同样将 `location = /oauth/oidc` 代理到 `app:3000`。

> 修改 `DOMAIN` 环境变量即可更换域名，Caddy 会自动申请证书。

## 数据持久化

Docker Compose 定义了三个 volume：

| Volume | 内容 |
|--------|------|
| `pgdata` | PostgreSQL 数据文件 |
| `uploads` | 用户上传的文件（Logo、背景图等） |
| `caddy_data` | Caddy 证书和配置 |

## 切换数据库方言

1. 修改 `.env` 中的 `DB_TYPE`（`postgresql` / `mysql` / `mariadb`）
2. 修改 `DATABASE_URL` 为对应连接串
3. 运行 `docker compose restart app`

> Schema 在服务启动时确定，不可热切换。切换后必须重启。

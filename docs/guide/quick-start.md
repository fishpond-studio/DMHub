# 快速开�?

DMHub 提供两种部署方式：Docker Compose（推荐）和本地开发�?

## Docker Compose（推荐）

一键部署，包含后端、前端、数据库和反向代理�?

### 前置要求

- Docker 20+
- Docker Compose v2+

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/fishpond-studio/dmhub.git
cd dmhub

# 2. 创建环境变量文件
cp .env.example .env
```

编辑 `.env`，填入必填项�?

```bash
# 生成命令: openssl rand -hex 32
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# 对外访问域名（Caddy 自动 HTTPS 用）
DOMAIN=dmhub.your-domain.com

# 数据库配置（使用容器默认值即可）
DB_TYPE=postgresql
DATABASE_URL=postgresql://dmhub:dmhub@postgres:5432/dmhub
POSTGRES_USER=dmhub
POSTGRES_PASSWORD=dmhub
POSTGRES_DB=dmhub
```

```bash
# 3. 启动服务
docker compose -f docker/docker-compose.yml --env-file .env up -d

# 4. 访问 https://your-domain.com 进入初始化引�?
```

启动后包含四个服务：

| 服务 | 说明 | 端口 |
|------|------|------|
| `app` | Node.js 后端 | 3000 |
| `web` | Nginx 前端 | 8080 |
| `postgres` | PostgreSQL 16 | 5432 |
| `caddy` | 反向代理 + HTTPS | 80 / 443 |

## 本地开�?

适合二次开发和调试�?

### 前置要求

- Node.js �?20
- pnpm �?9
- PostgreSQL 16（推荐）�?MariaDB / MySQL

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/fishpond-studio/dmhub.git
cd dmhub

# 2. 安装依赖
pnpm install

# 3. 构建依赖�?
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build

# 4. 创建 .env
cp .env.example .env
# 编辑 .env，填�?JWT_SECRET �?ENCRYPTION_KEY

# 5. 启动后端（终�?1�?
pnpm dev:server
# 后端运行�?http://127.0.0.1:8088

# 6. 启动前端（终�?2�?
pnpm dev:web
# 前端运行�?http://127.0.0.1:5173
```

前端开发模式自动代�?`/api` �?`/uploads` 到后端，无需额外配置�?

访问 `http://localhost:5173` 进入初始化引导�?

## 下一�?

- [初始化引导](./setup) �?完成数据库配置和初始设置
- [Docker 部署详解](./docker) �?生产环境配置细节
- [环境变量](./env) �?完整配置参�?

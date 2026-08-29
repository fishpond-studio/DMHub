# 本地开发

适合二次开发、调试和贡献代码。

## 前置要求

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **PostgreSQL 16**（推荐）或 MariaDB 10.2.7+ / MySQL 8.0.13+

## 搭建步骤

```bash
# 1. 克隆仓库
git clone https://github.com/fishpond-studio/dmhub.git
cd dmhub

# 2. 安装依赖
pnpm install

# 3. 构建依赖包
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build

# 4. 复制环境变量
cp .env.example .env
# 编辑 .env，填写:
#   JWT_SECRET=<openssl rand -hex 32>
#   ENCRYPTION_KEY=<openssl rand -hex 32>
#   DATABASE_URL=postgresql://dmhub:dmhub@localhost:5432/dmhub

# 5. 启动后端（终端 1）
pnpm dev:server
# 后端运行在 http://127.0.0.1:8088

# 6. 启动前端（终端 2）
pnpm dev:web
# 前端运行在 http://127.0.0.1:5173
```

访问 `http://localhost:5173` 进入初始化引导。

## 数据库

### 使用 Docker 启动数据库

**PostgreSQL：**

```bash
docker run -d --name dmhub-postgres \
  -e POSTGRES_USER=dmhub \
  -e POSTGRES_PASSWORD=dmhub \
  -e POSTGRES_DB=dmhub \
  -p 5432:5432 \
  postgres:16-alpine
```

**MariaDB：**

```bash
docker run -d --name dmhub-mariadb \
  -e MARIADB_ROOT_PASSWORD=dmhub \
  -e MARIADB_DATABASE=dmhub \
  -e MARIADB_USER=dmhub \
  -e MARIADB_PASSWORD=dmhub \
  -p 3306:3306 \
  mariadb:11
```

### 切换数据库方言

修改 `.env` 中的 `DB_TYPE` 和 `DATABASE_URL`，然后重启后端：

```bash
# 停止后端（Ctrl+C），重新启动：
pnpm dev:server
```

> Schema 在模块加载时确定，切换方言必须重启服务。

## Vite 代理

前端开发模式自动代理以下路径到后端：

| 路径 | 目标 |
|------|------|
| `/api` | `http://127.0.0.1:8088` |
| `/uploads` | `http://127.0.0.1:8088` |

无需额外配置 CORS 或代理。

## 项目结构

```
dmhub/
├── apps/
│   ├── web/                  # Vue 3 前端
│   │   └── src/
│   │       ├── views/        # 页面组件
│   │       ├── components/   # 通用 + UI 组件（Radix Vue）
│   │       ├── stores/       # Pinia 状态管理
│   │       ├── router/       # 路由配置
│   │       └── lib/          # 工具函数
│   └── server/               # Fastify 后端
│       └── src/
│           ├── routes/       # 路由处理
│           ├── services/     # 业务逻辑
│           ├── middleware/    # 中间件
│           ├── db/           # Drizzle ORM schema 和连接
│           ├── lib/          # 工具库
│           └── config/       # 环境变量配置
├── packages/
│   ├── shared/               # 共享类型 + Zod schema
│   └── dns-providers/        # DNS 服务商适配器
└── docs/                     # VitePress 文档
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev:web` | 启动前端开发服务器 |
| `pnpm dev:server` | 启动后端开发服务器 |
| `pnpm build` | 构建所有包 |
| `pnpm build:web` | 构建前端 |
| `pnpm build:server` | 构建后端 |
| `pnpm lint` | 代码检查 |
| `pnpm format` | 代码格式化 |

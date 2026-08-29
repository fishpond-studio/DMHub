# 贡献指南

欢迎参与 DMHub 的开发！

## 开发环�?

### 前置要求

- **Node.js** �?20
- **pnpm** �?9
- **PostgreSQL 16**（推荐）�?MariaDB 10.2.7+ / MySQL 8.0.13+

### 搭建步骤

```bash
# 1. 克隆仓库
git clone https://github.com/fishpond-studio/dmhub.git
cd dmhub

# 2. Fork 后克隆你自己�?fork
# git clone https://github.com/<你的用户�?/dmhub.git

# 3. 安装依赖
pnpm install

# 4. 构建依赖�?
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build

# 5. 启动开发服务器
pnpm dev:server  # 后端 :8088
pnpm dev:web     # 前端 :5173

# 6. 访问 http://localhost:5173 进入初始化引�?
```

### 文档

```bash
pnpm docs:dev
```

| 目录 | 内容 |
|------|------|
| `docs/guide/` | 用户指南（OAuth、通知、指派等�?|
| `docs/api/` | API 专题 |
| `docs/reference/` | 架构 / 数据�?/ 权限 |
| 根目�?`API.md` `README.md` | 仓库入口文档，请�?docs 同步 |

### 环境变量

复制 `.env.example` �?`.env`�?

```bash
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
PORT=8088
```

### 数据�?

开发环境可通过 Docker 快速启动：

```bash
# PostgreSQL（推荐）
docker run -d --name dmhub-postgres \
  -e POSTGRES_USER=dmhub \
  -e POSTGRES_PASSWORD=dmhub \
  -e POSTGRES_DB=dmhub \
  -p 5432:5432 \
  postgres:16-alpine

# MariaDB
docker run -d --name dmhub-mariadb \
  -e MARIADB_ROOT_PASSWORD=dmhub \
  -e MARIADB_DATABASE=dmhub \
  -e MARIADB_USER=dmhub \
  -e MARIADB_PASSWORD=dmhub \
  -p 3306:3306 \
  mariadb:11
```

## 代码结构

### Monorepo 结构

```
dmhub/
├── apps/web/          # 前端（Vue 3 + Vite�?
├── apps/server/       # 后端（Fastify + TypeScript�?
├── packages/shared/   # 共享类型、Schema、常�?
└── packages/dns-providers/  # DNS 适配�?
```

### 后端约定

```
apps/server/src/
├── routes/       # 路由处理，仅做参数校验和调用 service
├── services/     # 业务逻辑，所有数据库操作在此
├── middleware/    # 中间件（authenticate, requireRole, requireDomainAccess 等）
├── db/
�?  ├── schema-pg.ts    # PostgreSQL schema（pg-core�?0 张表�?
�?  ├── schema-mysql.ts # MySQL/MariaDB schema（mysql-core�?0 张表�?
�?  ├── schema.ts       # 启动时根�?DB_TYPE 动�?re-export
�?  ├── helpers.ts      # 跨方言 DB 帮手（insertReturningOne 等）
�?  └── index.ts        # 维护 pgDb / mysqlDb 双实�?
├── lib/          # 工具库（JWT, cron, WHOIS, 通知等）
└── config/       # Zod 校验的环境变�?
```

**新增功能的流程：**

1. �?`db/schema-pg.ts` 添加表定�?
2. �?`db/schema-mysql.ts` 添加对应�?MySQL 版本
3. �?`db/schema.ts` �?re-export 列表中导�?
4. �?`services/setup.ts` 的迁移脚本中添加建表语句
5. �?`services/` 添加业务逻辑（使�?helpers 的跨方言写法�?
6. �?`routes/` 添加路由
7. �?`index.ts` 注册路由

### 前端约定

```
apps/web/src/
├── views/         # 页面组件（对应路由）
├── components/    # 通用组件
�?  └── ui/        # Radix Vue 组件�?
├── stores/        # Pinia 状态管�?
├── router/        # 路由配置
└── lib/           # 工具函数
```

## 代码规范

### TypeScript

- 严格模式（`strict: true`�?
- 禁止未使用的变量和参�?
- 使用 ESM 模块（`module: "ESNext"`�?

### 后端

- 路由文件只做参数校验�?service 调用，不写业务逻辑
- Service 文件包含所有业务逻辑和数据库操作
- 使用 Drizzle ORM 链式调用，注�?`.where()` 返回新对�?
- 错误通过 `throw new Error('...')` 抛出

### 前端

- 使用 Vue 3 Composition API（`<script setup lang="ts">`�?
- 使用 Pinia composition store 风格
- UI 组件使用 Radix Vue，不要引入其�?UI �?
- 样式使用 Tailwind CSS 工具�?

### 通用

- 缩进�? 空格
- 不添加多余注�?
- 中文作为 UI 文案和错误提示语言

## 跨方言注意事项

DMHub 同时支持 PG �?MySQL，业务代码必须跨方言兼容�?

```typescript
// 错：MySQL 不支�?.returning()
const [row] = await db.insert(users).values(v).returning({ id: users.id });

// 对：�?helpers
import { insertReturningOne, insertIgnore } from '../db/helpers.js';
const row = await insertReturningOne(users, v, { id: users.id });

// 错：MySQL 不支�?.onConflictDoNothing()
await db.insert(t).values(v).onConflictDoNothing();

// �?
await insertIgnore(t, v);
```

**JSON 列默认�?*：MySQL 8.0.13+ / MariaDB 10.2.7+ 之前不支�?JSON 列默认值。迁移脚本需显式�?`DEFAULT (JSON_ARRAY())`�?

## 构建与部�?

```bash
# 构建所有包
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build

# 构建后端
cd apps/server && npm run build   # tsc �?dist/

# 构建前端
cd apps/web && npm run build      # vite build �?dist/

# Docker 构建
docker compose up -d --build
```

## 提交规范

- Fork 仓库，从 `main` 创建功能分支
- 提交信息简洁明�?
- 一�?PR 解决一个问�?
- 确保 `pnpm lint` 通过
- 确保 TypeScript 编译无错�?

## 关键注意事项

### Drizzle ORM

`.where()` 返回新的查询对象�?*不会修改原对�?*�?

```typescript
// 错误
const q = db.select().from(table);
q.where(eq(table.id, id));
return q;

// 正确
return db.select().from(table).where(eq(table.id, id));
```

### JWT Token

- Access Token: `{ userId, role }` �?15 分钟
- Refresh Token: `{ userId, scope: 'refresh' }` �?7 �?
- 2FA Token: `{ userId, scope: '2fa' }` �?5 分钟

### 文件上传

开发模式需确保 `vite.config.ts` 代理�?`/uploads` 路径。Nginx `client_max_body_size` 设为 6M�?

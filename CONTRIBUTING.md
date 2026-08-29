# 贡献指南

## 开发环境

### 前置要求

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL 16（推荐）或 MariaDB 10.2.7+ / MySQL 8.0.13+（通过 Docker 启动）

### 搭建步骤

```bash
# 1. 克隆仓库
git clone https://github.com/fishpond-studio/dmhub.git
cd dmhub

# 2. 安装依赖
pnpm install

# 3. 构建依赖包
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build

# 4. 启动开发服务器
pnpm dev:server  # 后端 :8088
pnpm dev:web     # 前端 :5173

# 5. 访问 http://localhost:5173 进入初始化引导
```

### 环境变量

复制 `.env.example` 为 `.env`，填写：

```env
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
PORT=8088
```

### 数据库

开发环境可通过 Docker 快速启动：

**PostgreSQL（推荐）：**

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

切换数据库方言需重启 server（schema 在模块加载时确定）。详见 [ARCHITECTURE.md - 多方言 Schema 层](./ARCHITECTURE.md#多方言-schema-层)。

首次访问应用时通过引导页面配置数据库连接。

## 代码结构

### Monorepo 结构

```
dmhub/
├── apps/web/          # 前端（Vue 3 + Vite）
├── apps/server/       # 后端（Fastify + TypeScript）
├── packages/shared/   # 共享类型、Schema、常量
└── packages/dns-providers/  # DNS 适配器
```

### 后端约定

```
apps/server/src/
├── routes/       # 路由处理，仅做参数校验和调用 service
├── services/     # 业务逻辑，所有数据库操作在此
├── middleware/    # 中间件（authenticate, requireRole, requireDomainAccess 等）
├── db/
│   ├── schema-pg.ts    # PostgreSQL schema（pg-core，19 张表）
│   ├── schema-mysql.ts # MySQL/MariaDB schema（mysql-core，19 张表，与 PG 对应）
│   ├── schema.ts       # 启动时根据 DB_TYPE 动态 re-export
│   ├── helpers.ts      # 跨方言 DB 帮手（insertReturningOne 等）
│   └── index.ts        # 维护 pgDb / mysqlDb 双实例
├── lib/          # 工具库（JWT, cron, WHOIS, 通知, subdomain-match 等）
└── config/       # Zod 校验的环境变量
```

**新增功能的流程：**

1. 在 `db/schema-pg.ts` 添加表定义（首选）
2. 在 `db/schema-mysql.ts` 添加**对应的** MySQL 版本（必须，否则 MySQL 用户跑不通）
3. 在 `db/schema.ts` 的 re-export 列表中导出（`export const xxx: typeof pgSchema.xxx = active.xxx;`）
4. 在 `services/setup.ts` 的 `PG_MIGRATION_SQL` 和 `MYSQL_MIGRATION_SQL` 中各加一份 CREATE TABLE
5. 在 `services/` 添加业务逻辑（使用 `helpers.ts` 的 `insertReturningOne` / `insertIgnore` 替代 `.returning()` / `.onConflictDoNothing()`）
6. 在 `routes/` 添加路由
7. 在 `index.ts` 注册路由

### 前端约定

```
apps/web/src/
├── views/         # 页面组件（对应路由）
├── components/    # 通用组件
│   └── ui/        # Radix Vue 组件库（shadcn-vue 风格）
├── stores/        # Pinia 状态管理
├── router/        # 路由配置
└── lib/           # 工具函数（axios 封装等）
```

### 共享包 `@dmhub/shared`

```
packages/shared/src/
├── types/      # TypeScript 类型定义
├── schemas/    # Zod 校验 schema
└── constants/  # 常量
```

前后端和共享包之间通过 workspace 协议引用：

```json
{ "@dmhub/shared": "workspace:*" }
```

## 代码规范

### TypeScript

- 严格模式（`strict: true`）
- 禁止未使用的变量和参数（`noUnusedLocals`, `noUnusedParameters`）
- 使用 ESM 模块（`module: "ESNext"`）

### 后端

- 路由文件只做参数校验和 service 调用，不写业务逻辑
- Service 文件包含所有业务逻辑和数据库操作
- 使用 Drizzle ORM 链式调用，注意 `.where()` 返回新对象，不修改变量
- 错误通过 `throw new Error('...')` 抛出，路由层 catch 并返回对应状态码

### 前端

- 使用 Vue 3 Composition API（`<script setup lang="ts">`）
- 使用 Pinia composition store 风格（`defineStore('name', () => { ... })`）
- UI 组件使用 Radix Vue（shadcn-vue 风格），不要引入其他 UI 库
- 样式使用 Tailwind CSS 工具类
- 动画使用 `tailwindcss-animate` 和自定义 keyframes

### 通用

- 缩进：2 空格
- 不添加多余注释
- 中文作为 UI 文案和错误提示语言

## 构建与部署

### 构建

```bash
# 构建所有包
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build

# 构建后端
cd apps/server && npm run build   # tsc → dist/

# 构建前端
cd apps/web && npm run build      # vite build → dist/
```

### Docker

```bash
docker compose up -d --build
```

多阶段构建：
- `Dockerfile.server`：Node 20 Alpine → 构建产物 → 运行时镜像
- `Dockerfile.web`：Node 20 Alpine 构建 → Nginx Alpine 运行

### Windows 开发

使用 `start.bat` 启动：

```bash
start.bat              # 开发模式
start.bat --no-install # 跳过 pnpm install
start.bat --no-build   # 跳过构建
```

## 关键注意事项

### Drizzle ORM

`.where()` 返回新的查询对象，**不会修改原对象**：

```typescript
// 错误
const q = db.select().from(table);
q.where(eq(table.id, id));
return q;

// 正确
return db.select().from(table).where(eq(table.id, id));
```

### 跨方言（PostgreSQL / MySQL）写法

DMHub 同时支持 PG 和 MySQL，业务代码必须跨方言兼容：

```typescript
// 错：MySQL 不支持 .returning()
const [row] = await db.insert(users).values(v).returning({ id: users.id });

// 对：用 helpers
import { insertReturningOne, insertIgnore } from '../db/helpers.js';

const row = await insertReturningOne(users, v, { id: users.id });

// 错：MySQL 不支持 .onConflictDoNothing()
await db.insert(t).values(v).onConflictDoNothing();

// 对
await insertIgnore(t, v);

// 错：count(*)::int 是 PG 专有语法
const c = await db.select({ n: sql<number>`count(*)::int` }).from(t);

// 对
const [r] = await db.select({ n: sql<number>`count(*)` }).from(t);
const n = Number(r.n);
```

**JSON 列默认值**：MySQL 8.0.13+ / MariaDB 10.2.7+ 之前不支持 JSON 列默认值。`MYSQL_MIGRATION_SQL` 显式写 `DEFAULT (JSON_ARRAY())` / `DEFAULT (JSON_OBJECT())`，新增表时也照此写。

**类型断言**：`db/schema.ts` 用 `as typeof pgSchema.X` re-export，业务代码以 PG 类型签名编程。新增表后必须在两份 schema 中保持字段名、类型对齐。

### JWT Token

- Access Token: `{ userId, role }` — 15 分钟
- Refresh Token: `{ userId, scope: 'refresh' }` — 7 天
- 2FA Token: `{ userId, scope: '2fa' }` — 5 分钟

`authenticate` 中间件拒绝 `scope: '2fa'` 的 token，`require2FA` 中间件只接受它。

### axios 拦截器

2FA 页面的请求携带 `X-2FA-Auth: true` header，401 时不触发自动 refresh 和重定向。

### 文件上传

开发模式需确保 `vite.config.ts` 代理了 `/uploads` 路径。Nginx `client_max_body_size` 设为 6M。

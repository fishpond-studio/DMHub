# 数据库设计

DMHub 同时支持 PostgreSQL 和 MariaDB/MySQL，采用双 schema 文件 + 动态 re-export 模式。

## 多方言 Schema 层

```
db/
├── schema-pg.ts      # pg-core 定义，20 张表（推荐使用）
├── schema-mysql.ts   # mysql-core 定义，20 张表（与 PG 一一对应）
├── schema.ts         # 启动时根据 DB_TYPE 选择并 re-export
├── helpers.ts        # 跨方言帮手（insertReturningOne 等）
└── index.ts          # 维护 pgDb / mysqlDb 双实例，getDb() 返回当前活跃实例
```

`schema.ts` 在模块加载时决定 re-export 哪一份：

- 优先读 `process.env.DB_TYPE`
- 否则读 `setup-state.json` 中的 `dbConfig.dbType`
- 默认 `postgresql`

> **重要**：schema 在模块加载时确定，不可热切换。切换方言后保存接口返回 `restartRequired: true`，前端提示重启。

## 跨方言写入

### 差异对照

| 操作 | PostgreSQL | MySQL/MariaDB |
|------|------------|---------------|
| `.returning()` | 原生支持 | 不支持，需 insert + select |
| `.onConflictDoNothing()` | 原生支持 | 捕获 duplicate key 错误 |
| JSON 列默认值 | `DEFAULT '[]'::jsonb` | 需 `DEFAULT (JSON_ARRAY())` |
| `count(*)` 类型 | 返回 string，需 `::int` | 返回 number | 统一用 JS `Number()` 包装 |

### Helper 函数

```typescript
// 替代 db.insert(users).values(v).returning({ id: users.id })
const row = await insertReturningOne(users, v, { id: users.id });

// 替代 db.insert(t).values(v).onConflictDoNothing()
await insertIgnore(t, v);
```

## DDL 执行

`db/index.ts` 暴露 `runRawSql(sql)` 跨方言执行原始 SQL（迁移用）：

- PG：直接 `pg.unsafe(sql)`
- MySQL：按 `;\s*\n` 切语句、逐条 `query()`

`services/setup.ts` 内 `PG_MIGRATION_SQL` 和 `MYSQL_MIGRATION_SQL` 各持一份建表语句，引导时根据所选方言选择。

## 核心 Schema

### 用户与认证

```
users
 ├── user_totp_seeds     (1:1, TOTP 密钥，加密存储)
 ├── user_passkeys       (1:N, WebAuthn 凭证)
 ├── backup_codes        (1:N, hash 存储，使用后标记)
 ├── refresh_tokens      (1:N, 设备 refresh token)
 ├── user_tokens         (1:N, 个人访问令牌，dmhub_pt_ 前缀)
 ├── user_oauth_bindings (1:N, OAuth 绑定)
 └── api_keys            (1:N, 管理员创建，dmhub_ 前缀)
```

### 域名与 DNS

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│    users     │     │     domains      │     │  dns_records  │
├──────────────┤     ├──────────────────┤     ├───────────────┤
│ id (PK)      │     │ id (PK)          │     │ id (PK)       │
│ username     │     │ name             │     │ domainId (FK) │
│ email        │     │ providerId       │     │ recordType    │
│ passwordHash │     │ providerConfigId │     │ name          │
│ role         │     │ expiresAt        │     │ value         │
│ status       │     │ tags             │     │ ttl           │
│ 2FA fields   │     │ groupName        │     │ priority      │
└──────┬───────┘     │ status           │     │ proxied       │
       │             │ expiryRemindDays  │     └───────────────┘
       │             └──────┬───────────┘
       │                    │
       │     ┌──────────────┴──────────────┐
       │     │                             │
       │     ▼                             ▼
┌──────┴───────────┐     ┌─────────────────────────┐
│ domain_assignments│     │ dns_snapshots           │
├──────────────────┤     ├─────────────────────────┤
│ id (PK)          │     │ id (PK)                 │
│ domainId (FK)    │     │ domainId (FK)           │
│ userId (FK)      │     │ version                 │
│ subdomainPattern │     │ records (JSON)          │
│ permission       │     │ trigger                 │
│ assignedBy (FK)  │     └─────────────────────────┘
└──────────────────┘
```

### 团队与权限

```
team_settings (单行表)
dns_providers (服务商配置)
oauth_providers (OAuth 配置)
domain_assignments (域名指派)
domain_assignment_requests (指派申请审批)
operation_logs (操作日志)
notification_configs (通知配置)
```

## 快照系统

快照存储完整记录副本（JSONB），支持：

- 版本间 diff（新增 / 删除 / 修改）
- 回滚到任意版本

| 触发方式 | trigger 值 |
|----------|------------|
| 手动创建 | `manual` |
| 解析变更 | `on_change` |

## 表清单

共 **20 张表**：

1. `users`
2. `user_totp_seeds`
3. `user_passkeys`
4. `backup_codes`
5. `refresh_tokens`
6. `user_tokens`
7. `user_oauth_bindings`
8. `api_keys`
9. `team_settings`
10. `domains`
11. `dns_records`
12. `dns_snapshots`
13. `dns_providers`
14. `oauth_providers`
15. `domain_assignments`
16. `domain_assignment_requests`
17. `operation_logs`
18. `notification_configs`
19. `invite_codes`
20. `setup_states`
